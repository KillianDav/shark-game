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
  stingray: {
    // Low-frequency hazard that glides through the lower third of the water
    // with a wavy motion and stings with a telegraphed tail whip. Rays have
    // their own spawn timer (not tied to sharks) so they arrive on a steady
    // cadence with a bit of jitter, and never more than a couple at once.
    earliestT: 5,                 // no rays until this many seconds in (early game is pure sharks)
    spawnMin: 4.5, spawnMax: 7.0, // seconds between ray spawns (base cadence + randomness)
    maxOnScreen: 2,               // cap - keeps things from piling up
    minSpeed: 90, maxSpeed: 140,  // slower than sharks (175-285) but clearly moving, not stationary
    minY: 510, maxY: 675,         // lower third of the water (waterTop 96, waterBottom 700)
    scaleMin: 1.2, scaleMax: 1.55,
    bodyRX: 34, bodyRY: 6,        // flat body (cosmetic; the body itself does not kill)
    tailIdleLen: 60,              // length of the trailing tail when not striking
    waveAmpMin: 20, waveAmpMax: 34,       // visibly wavy glide, not a flat trajectory
    waveFreqMin: 0.35, waveFreqMax: 0.75,
    stingCooldownMin: 1.6, stingCooldownMax: 3.2,
    stingWindup: 0.35,            // tail rears back - telegraph, harmless
    stingActive: 0.22,            // tail whip lands - lethal
    stingReach: 55,               // radius of the strike hitbox at the tail tip (matches the visible glow)
    strikeUp: 44, strikeAhead: 18 // tail-tip offset relative to body during strike (up + slightly forward)
  },
  anchor: {
    // Rare falling anchor. Drops through the water from the surface at a
    // random x near the player lane. Lethal ONLY on direct body-overlap - a
    // near-miss to the left or right passes harmlessly.
    earliestT: 12,                // no anchors early game
    spawnMin: 8, spawnMax: 16,    // steady cadence with randomness
    minSpeed: 130, maxSpeed: 190, // downward fall speed
    spawnJitter: 60,              // half-width of the horizontal spawn band around the lane
    bodyRadius: 20,               // effective anchor hitbox radius (paired with player rx/ry)
    scaleMin: 1.15, scaleMax: 1.4
  },
  // Gentle, shared speed-up applied to BOTH shark travel speed and player
  // vertical agility, so the tempo rises but dodging stays just as feasible.
  progression: { speedPerSec: 0.02, speedMax: 2.6 },
  fx: { vaporDur: 0.8, eatDur: 0.3, stingDur: 0.45, anchorDur: 0.55 },  // laser vaporise, eaten shrink, stung flicker, anchor squish
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
      mode: config.mode || "party",       // "party" | "solo"
      hazards: config.hazards || "all",   // "all" (sharks + stingrays + anchors) | "sharks-only" (classic)
      decor,
      t: 0, frame: 0,
      status: "playing",          // "playing" | "over"
      players,
      sharks: [],
      stingrays: [],
      anchors: [],
      nextSharkId: 1,
      nextStingrayId: 1,
      nextAnchorId: 1,
      spawnTimer: 0.8,            // shark spawn cadence
      raySpawnTimer: CFG.stingray.earliestT,   // first ray no earlier than earliestT
      anchorSpawnTimer: CFG.anchor.earliestT,  // first anchor no earlier than earliestT
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

  _spawnStingray(state) {
    const R = CFG.stingray, rng = state.rng, W = CFG.world;
    const speed = lerp(R.minSpeed, R.maxSpeed, rng()) * Sim._speedMul(state.t);
    const startX = W.w + 60;
    const swimT = rng() * 10;
    const waveAmp = lerp(R.waveAmpMin, R.waveAmpMax, rng());
    const waveFreq = lerp(R.waveFreqMin, R.waveFreqMax, rng());
    const wavePhase = rng() * Math.PI * 2;
    const scale = lerp(R.scaleMin, R.scaleMax, rng());
    const baseY = lerp(R.minY, R.maxY, rng());
    state.stingrays.push({
      id: state.nextStingrayId++,
      x: startX,
      y: clamp(baseY + Math.sin(swimT * waveFreq + wavePhase) * waveAmp, R.minY, R.maxY),
      baseY, swimT, waveAmp, waveFreq, wavePhase,
      vx: -speed,
      scale,
      // Strike state machine + last strike position (used by both collision and Render).
      sting: {
        state: "idle",
        timer: R.stingCooldownMin + rng() * (R.stingCooldownMax - R.stingCooldownMin),
        x: 0, y: 0
      }
    });
  },

  // Point at the tail tip during a strike - used by both the collision test and
  // the renderer, so they can't drift out of sync.
  _stingTip(r) {
    const R = CFG.stingray;
    return { x: r.x + R.strikeAhead * r.scale, y: r.y - R.strikeUp * r.scale };
  },

  _spawnAnchor(state) {
    const A = CFG.anchor, rng = state.rng, W = CFG.world;
    const vy = lerp(A.minSpeed, A.maxSpeed, rng()) * Sim._speedMul(state.t);
    // Drop within a horizontal band around the player lane so anchors are
    // dodgeable in Y but actually threaten someone (an anchor over empty water
    // would just be scenery).
    const x = W.laneX + (rng() * 2 - 1) * A.spawnJitter;
    const scale = lerp(A.scaleMin, A.scaleMax, rng());
    state.anchors.push({
      id: state.nextAnchorId++,
      x, y: W.waterTop - 10,   // start just above the surface
      vy,
      scale,
      splash: 0.35              // seconds of surface splash on entry (visual only)
    });
  },

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
    // Stingrays: a windup or active tail-strike is a real threat at the tip
    // position; the ray body itself doesn't hurt but we still steer away from
    // its Y so we don't drift into an incoming strike.
    for (const r of state.stingrays) {
      const dx = r.x - p.x;
      if (dx < -40 || dx > detect) continue;
      if (r.sting.state === "windup" || r.sting.state === "active") {
        const tip = Sim._stingTip(r);
        if (Math.abs(tip.x - p.x) < best) { best = Math.abs(tip.x - p.x); threatY = tip.y; }
      } else if (dx < best) { best = dx; threatY = r.y; }
    }
    // Anchors: falling from above, dangerous only near this bot's x. Threat
    // point is where the anchor is right now; the bot moves away in Y.
    for (const a of state.anchors) {
      if (Math.abs(a.x - p.x) > 40) continue;   // will miss horizontally
      if (a.y > p.y + 60) continue;             // already past this bot
      const dxa = Math.abs(a.x - p.x);
      if (dxa < best) { best = dxa; threatY = a.y; }
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
    const W = CFG.world, P = CFG.player, S = CFG.shark, R = CFG.stingray, A = CFG.anchor;
    state.t += dt;
    state.frame++;
    const m = Sim._speedMul(state.t);   // shared tempo: players get faster with the sharks

    // --- spawn sharks (unchanged; sharks are the dominant hazard) ---
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      Sim._spawnShark(state);
      state.spawnTimer += Sim._spawnInterval(state.t);
    }

    // --- spawn stingrays on their own steady-with-jitter timer ---
    // Cap the number on screen so the seabed doesn't get crowded.
    if (state.hazards !== "sharks-only" && state.t >= R.earliestT) {
      state.raySpawnTimer -= dt;
      if (state.raySpawnTimer <= 0 && state.stingrays.length < R.maxOnScreen) {
        Sim._spawnStingray(state);
        state.raySpawnTimer = lerp(R.spawnMin, R.spawnMax, state.rng());
      } else if (state.raySpawnTimer <= 0) {
        // At the cap - retry soon so the timer doesn't stack up huge deficits.
        state.raySpawnTimer = 0.6;
      }
    }

    // --- spawn falling anchors on their own timer ---
    if (state.hazards !== "sharks-only" && state.t >= A.earliestT) {
      state.anchorSpawnTimer -= dt;
      if (state.anchorSpawnTimer <= 0) {
        Sim._spawnAnchor(state);
        state.anchorSpawnTimer = lerp(A.spawnMin, A.spawnMax, state.rng());
      }
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

    // --- move stingrays + drive their tail-strike state machine ---
    for (const r of state.stingrays) {
      r.x += r.vx * dt;
      r.swimT += dt;
      r.y = clamp(r.baseY + Math.sin(r.swimT * r.waveFreq + r.wavePhase) * r.waveAmp, R.minY, R.maxY);
      const T = r.sting;
      T.timer -= dt;
      if (T.state === "idle") {
        // Only strike while on-screen so an off-screen ray isn't wasting swings.
        if (T.timer <= 0 && r.x > 60 && r.x < W.w - 40) {
          T.state = "windup"; T.timer = R.stingWindup;
        }
      } else if (T.state === "windup") {
        if (T.timer <= 0) { T.state = "active"; T.timer = R.stingActive; }
      } else if (T.state === "active") {
        if (T.timer <= 0) { T.state = "idle"; T.timer = R.stingCooldownMin + state.rng() * (R.stingCooldownMax - R.stingCooldownMin); }
      }
      // Snapshot the strike position each tick so Sim + Render agree on where it is.
      if (T.state !== "idle") { const tip = Sim._stingTip(r); T.x = tip.x; T.y = tip.y; }
    }
    state.stingrays = state.stingrays.filter((r) => r.x > -80);

    // --- move anchors (straight-down drop) ---
    for (const a of state.anchors) {
      a.y += a.vy * dt;
      if (a.splash > 0) a.splash = Math.max(0, a.splash - dt);
    }
    state.anchors = state.anchors.filter((a) => a.y < W.h + 40);

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

    // --- stingray tail-strike (only during the active phase). The visible
    // glow circle IS the kill zone: a player dies only when the sting circle
    // actually overlaps their body ellipse. We test as circle-vs-ellipse by
    // scaling the delta into the ellipse's normalised space and inflating the
    // radius by the sting reach - a fair, easy-to-see rule. ---
    for (const r of state.stingrays) {
      if (r.sting.state !== "active") continue;
      const tip = r.sting;
      for (const p of state.players) {
        if (!p.alive) continue;
        // Nearest point on the player's body ellipse to the sting centre.
        const dx = tip.x - p.x, dy = tip.y - p.y;
        // Normalise dx/dy by the player's radii; if the resulting distance is
        // <= 1, the sting centre is INSIDE the body (dead). Otherwise the sting
        // circle overlaps the ellipse when the nearest point along that
        // direction is within stingReach of the centre.
        const nx = dx / P.rx, ny = dy / P.ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d <= 1) { Sim._kill(state, p, "stung", tip.x, tip.y); continue; }
        // Approximate the closest point on the ellipse along the delta.
        const bx = (nx / d) * P.rx, by = (ny / d) * P.ry;   // ellipse-surface delta
        const ex = tip.x - (p.x + bx), ey = tip.y - (p.y + by);
        if (ex * ex + ey * ey <= R.stingReach * R.stingReach) {
          Sim._kill(state, p, "stung", tip.x, tip.y);
        }
      }
    }

    // --- anchors kill on direct body-overlap only (near-misses pass). ---
    for (const a of state.anchors) {
      const hitR = A.bodyRadius * a.scale;
      for (const p of state.players) {
        if (!p.alive) continue;
        // Same circle-vs-ellipse test as the sting - the anchor "body radius"
        // stands in for the sting reach.
        const dx = a.x - p.x, dy = a.y - p.y;
        const nx = dx / P.rx, ny = dy / P.ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d <= 1) { Sim._kill(state, p, "anchor", a.x, a.y); continue; }
        const bx = (nx / d) * P.rx, by = (ny / d) * P.ry;
        const ex = a.x - (p.x + bx), ey = a.y - (p.y + by);
        if (ex * ex + ey * ey <= hitR * hitR) Sim._kill(state, p, "anchor", a.x, a.y);
      }
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
