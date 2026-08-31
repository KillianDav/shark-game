// standup-shark Sim: pure logic. No DOM, no canvas, no Date.now() in step.
// Deterministic given (seed, inputs). Runs identically in browser and Node.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// mulberry32 seeded PRNG - identical output on any JS engine (client/server).
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLAYER_COLORS = [
  "#ffd23f", "#ff6b6b", "#4ecdc4", "#c084fc", "#ff9f45",
  "#7ee787", "#f78fb3", "#57c7ff", "#ffe066", "#b388ff", "#00e5a8"
];

// --------------------------------------------------------------------------
// CONFIG - tunables shared by sim + render
// --------------------------------------------------------------------------
export const CFG = {
  // Players hold station in a lane and dodge vertically - everyone "swims" at
  // the same speed, so there is no finish line: last one swimming wins.
  world: { w: 1280, h: 720, waterTop: 96, waterBottom: 700, laneX: 250, scrollSpeed: 60 },
  player: { accY: 1400, dampY: 7.5, maxVy: 300, rx: 20, ry: 15 },
  shark: {
    minSpeed: 175, maxSpeed: 285,
    spawnStart: 2.0,   // seconds between spawns at t=0 (few sharks to start)
    spawnMin: 0.26,    // fastest spawn interval late-game (dense swarm)
    rampTime: 26,      // seconds to reach peak difficulty (steep, front-loaded)
    rampEase: 0.6,     // <1 front-loads the ramp so it gets hard fast
    minY: 120, maxY: 678,   // reaches the full swimmer range - no safe top/bottom corner
    aimAtSwimmer: true,     // on entry, aim at a swimmer's current y (locked, dodgeable)
    scaleMin: 1.55, scaleMax: 1.95,   // base sprite scale
    sizeStepPerTier: 0.18,  // sharks grow slightly bigger every tierSeconds
    tierSeconds: 15,        // a new, larger size tier arrives on this cadence
    scaleCap: 3.4,          // upper bound on shark size
    hitRX: 26, hitRY: 12,   // collision ellipse = these * the shark's sprite scale
    mouthStartX: 4,         // jaws begin this far ahead of center (* scale); behind it is safe
    // vertical swimming (sharks weave up/down as they cross)
    waveAmpMin: 55, waveAmpMax: 165, waveFreqMin: 0.7, waveFreqMax: 1.8,
    laserChance: 0.55,           // chance a shark decides to fire when off cooldown
    laserCooldownMin: 1.2, laserCooldownMax: 3.0,
    laserWindup: 0.5,            // eyes glow before firing (telegraph, harmless)
    laserActive: 0.5,            // beam is lethal this long
    laserRange: 1000, laserBand: 4,   // half the visible beam thickness (kill only on visual touch)
    chomp: 0.42                  // seconds a shark holds its jaws open after a bite
  },
  // Gentle, shared speed-up applied to BOTH shark travel speed and player
  // vertical agility, so the tempo rises but dodging stays just as feasible.
  progression: { speedPerSec: 0.02, speedMax: 2.6 },
  fx: { vaporDur: 0.8, eatDur: 0.3 },  // laser vaporise + eaten shrink durations
  fixedDt: 1 / 60
};

// ==========================================================================
//  SIM  - pure logic. Everything here is a function of (state, inputs, dt).
// ==========================================================================
export const Sim = {
  createState(config) {
    const seed = (config && config.seed) || (Date.now() & 0xffffffff);
    const rng = makeRng(seed);
    const W = CFG.world;
    const players = (config.players || []).map((p, i) => ({
      id: p.id != null ? p.id : i,
      name: p.name,
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      isBot: !!p.isBot,
      x: CFG.world.laneX + (i % 4) * 16,   // hold station, slight stagger
      y: lerp(CFG.world.waterTop + 60, CFG.world.waterBottom - 60, (i + 1) / ((config.players.length) + 1)),
      vy: 0,
      alive: true,
      deathT: null,
      deathKind: null,   // "eaten" | "laser"
      deathX: 0, deathY: 0,
      botBias: rng() * 0.6 - 0.3,      // per-bot steering personality
      botReact: 0.45 + rng() * 0.5     // per-bot detection range factor
    }));
    // Seabed decorations - generated once so they stay put (cosmetic only).
    const decor = [];
    let dx = 30;
    while (dx < W.w - 20) {
      const r = rng();
      let type;
      if (r < 0.5) type = "weed";
      else if (r < 0.68) type = "rock";
      else if (r < 0.82) type = "starfish";
      else if (r < 0.93) type = "shell";
      else type = "chest";
      decor.push({ type, x: dx, s: 0.8 + rng() * 0.7, seed: rng() });
      dx += 55 + rng() * 95;
    }

    return {
      seed, rng,
      mode: config.mode || "party",   // "party" | "solo"
      decor,
      t: 0, frame: 0,
      status: "playing",          // "playing" | "over"
      players,
      sharks: [],
      nextSharkId: 1,
      spawnTimer: 0.8,
      winnerId: null
    };
  },

  // 0..1 difficulty factor, eased so it climbs quickly early on.
  _difficulty(t) {
    const s = CFG.shark;
    return Math.pow(clamp(t / s.rampTime, 0, 1), s.rampEase);
  },

  // Shared tempo multiplier - gently ramps up over time. Applied to shark
  // travel speed AND player vertical agility so the game stays dodgeable.
  _speedMul(t) {
    const p = CFG.progression;
    return Math.min(p.speedMax, 1 + p.speedPerSec * t);
  },

  // Difficulty-scaled spawn interval.
  _spawnInterval(t) {
    const s = CFG.shark;
    return lerp(s.spawnStart, s.spawnMin, Sim._difficulty(t));
  },

  _spawnShark(state) {
    const s = CFG.shark, rng = state.rng, W = CFG.world;
    const k = Sim._difficulty(state.t);
    const speed = lerp(s.minSpeed, s.maxSpeed, rng()) * Sim._speedMul(state.t);  // gentle, mirrored by players
    const startX = W.w + 60;
    const swimT = rng() * 10;
    const waveAmp = lerp(s.waveAmpMin, s.waveAmpMax, rng()) * (0.7 + 0.5 * k);  // weave more late-game
    const waveFreq = lerp(s.waveFreqMin, s.waveFreqMax, rng());
    const wavePhase = rng() * Math.PI * 2;
    // Every tierSeconds a slightly larger size tier is introduced.
    const tier = Math.floor(state.t / s.tierSeconds);
    const scale = Math.min(s.scaleCap, lerp(s.scaleMin, s.scaleMax, rng()) + tier * s.sizeStepPerTier);

    // Lock onto a swimmer's CURRENT position at entry, then never re-adjust.
    // We solve baseY so the weaving path crosses the swimmer's lane exactly at
    // that swimmer's y-at-spawn - an aimed shot the swimmer can still dodge by
    // moving, since the shark commits to this trajectory and does not home.
    const alive = state.players.filter((p) => p.alive);
    let baseY;
    if (s.aimAtSwimmer && alive.length) {
      const target = alive[(rng() * alive.length) | 0];
      const ty = clamp(target.y, s.minY, s.maxY);
      const tHit = (startX - target.x) / speed;   // seconds until it reaches the lane
      baseY = ty - Math.sin((swimT + tHit) * waveFreq + wavePhase) * waveAmp;
    } else {
      baseY = lerp(s.minY, s.maxY, rng());
    }

    state.sharks.push({
      id: state.nextSharkId++,
      x: startX,
      y: clamp(baseY + Math.sin(swimT * waveFreq + wavePhase) * waveAmp, s.minY, s.maxY),
      baseY, swimT, waveAmp, waveFreq, wavePhase,
      vx: -speed,
      bob: rng() * Math.PI * 2,
      scale,
      rx: s.hitRX * scale, ry: s.hitRY * scale,   // hitbox grows with the art
      chomp: 0,   // >0 while jaws are open after biting
      laser: { state: "idle", timer: s.laserCooldownMin + rng() * (s.laserCooldownMax - s.laserCooldownMin) }
    });
  },

  // Eye position of a leftward-swimming shark (front of the head).
  _eye(sh) { const s = sh.scale || 1.7; return { x: sh.x - 16 * s, y: sh.y - 4 * s }; },

  // Compute a bot's {up, down} intent from the current world state.
  _botIntent(state, p) {
    const s = CFG.shark;
    const detect = 340 * p.botReact;
    let threatY = null, best = Infinity;
    for (const sh of state.sharks) {
      const dx = sh.x - p.x;
      if (dx < -40 || dx > detect) continue;         // only sharks ahead & near
      if (dx < best) { best = dx; threatY = sh.y; }
      // treat a charging/firing laser lane as a threat too
      if (sh.laser.state !== "idle") {
        const eye = Sim._eye(sh);
        if (p.x < eye.x && p.x > eye.x - s.laserRange && dx < detect + 200) {
          if (Math.abs(dx) < best) { best = Math.abs(dx); threatY = eye.y; }
        }
      }
    }
    if (threatY == null) {
      // drift gently toward vertical centre
      const mid = (CFG.world.waterTop + CFG.world.waterBottom) / 2;
      if (p.y < mid - 40) return { up: false, down: true };
      if (p.y > mid + 40) return { up: true, down: false };
      return { up: false, down: false };
    }
    const bias = p.botBias * 30;
    if (p.y < threatY + bias) return { up: true, down: false };
    return { up: false, down: true };
  },

  step(state, humanInputs, dt) {
    if (state.status === "over") return state;
    const W = CFG.world, P = CFG.player, S = CFG.shark;
    state.t += dt;
    state.frame++;
    const m = Sim._speedMul(state.t);   // shared tempo: players get faster with the sharks

    // --- spawn sharks ---
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      Sim._spawnShark(state);
      state.spawnTimer += Sim._spawnInterval(state.t);
    }

    // --- move sharks + drive their lasers ---
    for (const sh of state.sharks) {
      sh.x += sh.vx * dt;
      sh.bob += dt * 6;
      // weave vertically as it swims across
      sh.swimT += dt;
      sh.y = clamp(sh.baseY + Math.sin(sh.swimT * sh.waveFreq + sh.wavePhase) * sh.waveAmp, S.minY, S.maxY);
      if (sh.chomp > 0) sh.chomp = Math.max(0, sh.chomp - dt);
      const L = sh.laser;
      L.timer -= dt;
      if (L.state === "idle") {
        if (L.timer <= 0 && sh.x > 120 && sh.x < W.w - 40) {
          if (state.rng() < S.laserChance) { L.state = "windup"; L.timer = S.laserWindup; L.y = sh.y; }
          else { L.timer = S.laserCooldownMin + state.rng() * (S.laserCooldownMax - S.laserCooldownMin); }
        }
      } else if (L.state === "windup") {
        L.y = sh.y;
        if (L.timer <= 0) { L.state = "firing"; L.timer = S.laserActive; L.y = sh.y; }
      } else if (L.state === "firing") {
        if (L.timer <= 0) { L.state = "idle"; L.timer = S.laserCooldownMin + state.rng() * (S.laserCooldownMax - S.laserCooldownMin); }
      }
    }
    // cull off-screen sharks
    state.sharks = state.sharks.filter((sh) => sh.x > -80);

    // --- move players (vertical dodging only; they hold their lane) ---
    for (const p of state.players) {
      if (!p.alive) continue;
      const intent = p.isBot ? Sim._botIntent(state, p) : (humanInputs[p.id] || { up: false, down: false });
      let acc = 0;
      if (intent.up) acc -= P.accY * m;
      if (intent.down) acc += P.accY * m;
      p.vy += acc * dt;
      if (!intent.up && !intent.down) p.vy -= p.vy * clamp(P.dampY * dt, 0, 1);
      p.vy = clamp(p.vy, -P.maxVy * m, P.maxVy * m);
      p.y += p.vy * dt;
      if (p.y < W.waterTop + P.ry) { p.y = W.waterTop + P.ry; p.vy = 0; }
      if (p.y > W.waterBottom - P.ry) { p.y = W.waterBottom - P.ry; p.vy = 0; }
    }

    // --- collisions (eat + laser) ---
    for (const p of state.players) {
      if (!p.alive) continue;
      for (const sh of state.sharks) {
        // Only the MOUTH bites. Sharks face left, so the jaws are on the left
        // (front) side; a swimmer only dies if they're at/ahead of where the
        // mouth starts. Touching the back half (tail side) is harmless.
        const mouthStart = sh.x - S.mouthStartX * sh.scale;   // world x where the jaws begin
        if (p.x <= mouthStart) {
          const dx = (p.x - sh.x) / (sh.rx + P.rx);
          const dy = (p.y - sh.y) / (sh.ry + P.ry);
          if (dx * dx + dy * dy <= 1) { sh.chomp = S.chomp; Sim._kill(state, p, "eaten", sh.x, sh.y); break; }
        }
        // laser lane
        if (sh.laser.state === "firing") {
          const eye = Sim._eye(sh);
          // Only kill when the visible beam actually overlaps the fish body:
          // beam half-thickness + the fish's body radius.
          if (p.x <= eye.x && p.x >= eye.x - S.laserRange && Math.abs(p.y - eye.y) <= S.laserBand + P.ry) {
            Sim._kill(state, p, "laser", p.x, p.y); break;
          }
        }
      }
    }

    Sim._resolveWinner(state);
    return state;
  },

  _kill(state, p, kind, x, y) {
    p.alive = false;
    p.deathT = state.t;
    p.deathKind = kind;
    p.deathX = x; p.deathY = y;
  },

  _resolveWinner(state) {
    if (state.status === "over" || !state.players.length) return;
    const alive = state.players.filter((p) => p.alive);
    // With multiple swimmers, the last one still swimming wins.
    if (state.players.length > 1 && alive.length === 1) {
      state.winnerId = alive[0].id;
      state.status = "over";
      return;
    }
    // Everyone is out -> whoever survived longest wins (also covers solo play).
    if (alive.length === 0) {
      const survivors = state.players.slice().sort((a, b) => (b.deathT - a.deathT) || (a.id - b.id));
      state.winnerId = survivors[0].id;
      state.status = "over";
    }
  }
};
