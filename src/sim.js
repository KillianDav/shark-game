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
  player: {
    accY: 1400, dampY: 7.5, maxVy: 300, rx: 20, ry: 15,
    // Lives are configured per-round on the setup screen (config.lives), default 1.
    invulnDur: 1.5   // seconds of i-frames after losing a life
  },
  shark: {
    minSpeed: 175, maxSpeed: 285,
    // Sharks arrive noticeably later than the other hazards so the early
    // round is a gentle warm-up with rays, octopuses, lionfish, and eels.
    // Fewer sharks overall - other hazards carry more of the load.
    earliestT: 14,     // no sharks until this many seconds in
    spawnStart: 5.5,   // seconds between spawns once the earliestT gate opens
    spawnMin: 0.9,     // fastest spawn interval late-game
    rampTime: 26,      // seconds to reach peak difficulty (steep, front-loaded)
    rampEase: 0.6,     // <1 front-loads the ramp so it gets hard fast
    minY: 120, maxY: 678,   // reaches the full swimmer range - no safe top/bottom corner
    aimAtSwimmer: true,     // on entry, aim at a swimmer's current y (locked, dodgeable)
    scaleMin: 1.55, scaleMax: 1.95,   // base sprite scale
    sizeStepPerTier: 0.18,  // sharks grow slightly bigger every tierSeconds
    tierSeconds: 15,        // a new, larger size tier arrives on this cadence
    scaleCap: 3.4,          // upper bound on shark size
    // Only the TEETH kill - a tight circle at the front of the head. The rest
    // of the body (side, back, tail) is safe to touch, so grazing a shark
    // that's passing through the lane doesn't count as a bite.
    teethOffsetX: 22,       // teeth centre this far ahead of the shark's centre (* scale)
    teethR: 7,              // teeth kill radius (* scale) - combined with player.rx via ellipse test
    // vertical swimming (sharks weave up/down as they cross)
    waveAmpMin: 55, waveAmpMax: 165, waveFreqMin: 0.7, waveFreqMax: 1.8,
    laserChance: 0.55,           // chance a shark decides to fire when off cooldown
    laserCooldownMin: 1.2, laserCooldownMax: 3.0,
    laserWindup: 0.5,            // eyes glow before firing (telegraph, harmless)
    laserActive: 0.5,            // beam is lethal this long
    // Laser: laserBand is the half-thickness of the KILL zone and must match
    // the visible beam's rendered half-width (drawSharkLaser uses lineWidth 5,
    // so the visible half is 2.5). Any bigger and the player dies with a
    // visible gap between beam and fish.
    laserRange: 1000, laserBand: 2.5,
    chomp: 0.42                  // seconds a shark holds its jaws open after a bite
  },
  stingray: {
    // Low-frequency hazard that glides through the lower third of the water
    // with a wavy motion and stings with a telegraphed tail whip. Rays have
    // their own spawn timer (not tied to sharks) so they arrive on a steady
    // cadence with a bit of jitter, and never more than a couple at once.
    earliestT: 1,                 // first ray shortly after round start (before sharks)
    spawnMin: 4.5, spawnMax: 7.0, // seconds between ray spawns (base cadence + randomness)
    maxOnScreen: 2,               // cap - keeps things from piling up
    minSpeed: 115, maxSpeed: 170, // slower than sharks (175-285), quicker than the hovering hazards
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
  coffin: {
    // Cartoon coffin dropped at the death spot when a life is lost. Stays
    // put at the death location for a couple of seconds then fades out - no
    // sinking, so the player can clearly see where they lost the life.
    fadeStart: 1.6,         // seconds from spawn before fading begins
    lifetime: 2.5           // seconds after spawn until the coffin is culled
  },
  octopus: {
    // Blue-ringed octopus: bulbous mantle at top with 8 tentacles hanging
    // DOWN in a fan. Only the small blue-ring circles at the tentacle tips
    // (at the bottom) kill; the mantle body is safe to touch. Slow drifter,
    // hovers mid-water.
    earliestT: 1,                          // appears from t=1s (before sharks)
    spawnMin: 8, spawnMax: 14,
    maxOnScreen: 2,
    // Speed must be greater than the seabed scroll (CFG.world.scrollSpeed = 60)
    // so the octopus visibly drifts LEFT relative to the moving ocean floor.
    // Slowest of the three "hovering" hazards - lionfish and eel are both quicker.
    minSpeed: 55, maxSpeed: 85,
    minY: 210, maxY: 490,                  // hovers mid-water (leaves tentacle room below)
    scaleMin: 0.95, scaleMax: 1.15,
    bodyR: 16,                             // mantle radius (compact)
    tentacleLen: 40,                       // vertical reach of the tentacle tips
    tentacles: 8,
    tipR: 10,                              // kill radius of each blue-ring stinger
    // Tentacles fan out in the DOWNWARD half circle: angle in [spreadMin, spreadMax]
    // where 0 = +X (right), pi/2 = +Y (down), pi = -X (left).
    spreadMin: Math.PI * 0.18,             // lower-right
    spreadMax: Math.PI * 0.82,             // lower-left
    swayAmp: 0.14,
    // Vertical drift path across the screen - a proper wavy line, big enough
    // to be obviously undulating rather than a subtle bob.
    pathAmpMin: 55, pathAmpMax: 90,
    pathFreqMin: 0.55, pathFreqMax: 1.0
  },
  lionfish: {
    // Lionfish: horizontal striped body with a fan of DORSAL SPIKES rising
    // from the top of the body. Only the small yellow hazard tips at the
    // top of each spike kill; the body is safe.
    earliestT: 3,                          // appears from t=3s (still before sharks)
    spawnMin: 9, spawnMax: 15,
    maxOnScreen: 2,
    // Middle of the three "hovering" hazards - faster than octopus, slower than eel.
    minSpeed: 95, maxSpeed: 130,
    // Lower part of the water - lionfish hug the lower third near the seabed.
    minY: 460, maxY: 645,
    scaleMin: 0.95, scaleMax: 1.2,
    bodyRX: 17, bodyRY: 8,                 // body ellipse (cosmetic, smaller)
    spikes: 7,                             // dorsal fin rays fanning up
    spikeLen: 22,                          // shorter than before, kept modest
    tipR: 7,                               // kill radius of each spike-top hazard
    // Spikes rise from the top of the body along its length. rootSpread is
    // the horizontal span (as a fraction of bodyRX) they cover.
    rootSpread: 1.4,
    // Slight outward lean of the outermost spikes (radians).
    tiltAmp: 0.32,
    swayAmp: 0.06,
    // Vertical drift path - hazards vary their depth as they cross.
    pathAmpMin: 40, pathAmpMax: 70,
    pathFreqMin: 0.55, pathFreqMax: 1.05
  },
  electricEel: {
    // Long slender eel that swims right-to-left, intermittently discharging
    // a bright electric BUZZ. The buzz is telegraphed with a windup then goes
    // lethal for a short window inside a circle around the body. Body itself
    // is safe to touch when not buzzing.
    earliestT: 5,                            // enters early, still before sharks
    spawnMin: 12, spawnMax: 20,
    maxOnScreen: 1,
    minSpeed: 140, maxSpeed: 205,            // fastest of the hovering hazards - clearly quicker than the lionfish and octopus
    minY: 220, maxY: 560,
    scaleMin: 1.0, scaleMax: 1.25,
    bodyLen: 90,                             // half-length of the body (eels are LONG - full length ~180)
    bodyR: 6,                                // body thickness (radius)
    segments: 12,                            // number of body segments for the sine undulation
    waveAmpMin: 8, waveAmpMax: 14,
    waveFreqMin: 0.5, waveFreqMax: 0.9,
    // Buzz state machine
    buzzCooldownMin: 3.2, buzzCooldownMax: 5.5,
    buzzWindup: 0.45,                        // telegraph (small sparks, harmless)
    buzzActive: 0.32,                        // shock crackles all around body - LETHAL
    buzzR: 46                                // kill circle radius during the buzz
  },
  anchor: {
    // Rare falling anchor, preceded by a boat visibly crossing the water
    // surface. The boat moors briefly at a mid-screen drop point, releases
    // the anchor, waits until it embeds in the seabed, then drifts off.
    // Lethal ONLY on direct body-overlap - a near-miss to the side passes
    // harmlessly.
    earliestT: 12,                // no anchors early game
    spawnMin: 8, spawnMax: 16,    // steady cadence with randomness
    minSpeed: 70, maxSpeed: 110,  // slower fall so the player has time to dodge
    dropMinX: 320, dropMaxX: 1000, // horizontal band where the boat drops
    bodyRadius: 20,                // effective anchor hitbox radius
    scaleMin: 1.8, scaleMax: 2.2,  // bigger, more menacing anchor
    // Once embedded: how deep below the seabed the crown sits, and how long
    // it lingers before it fades out.
    embedDepth: 8,
    embedLinger: 3.0
  },
  boat: {
    // A big hull crosses the top of the water and releases an anchor at its
    // targetX - the vessel is deliberately large so it reads as "an actual
    // boat" whose anchor makes sense.
    speed: 45,                    // px/s leftward drift (slower - it's a big ship)
    hullW: 200, hullH: 44,        // sprite footprint, drawn straddling waterTop
    // Only ONE boat on screen at a time.
    maxOnScreen: 1,
    moorDur: 4.0                  // seconds the boat sits still after dropping its anchor
  },
  // Gentle, shared speed-up applied to BOTH shark travel speed and player
  // vertical agility, so the tempo rises but dodging stays just as feasible.
  progression: { speedPerSec: 0.02, speedMax: 2.6 },
  fx: { vaporDur: 0.8, eatDur: 0.3, stingDur: 0.45, anchorDur: 0.55 },  // laser vaporise, eaten shrink, stung flicker, anchor squish
  fixedDt: 1 / 60
};

// --------------------------------------------------------------------------
// DIFFICULTY PRESETS
// --------------------------------------------------------------------------
// Each preset overrides a small, curated set of CFG knobs that shape the
// pacing (spawn cadence, ramp speed, tempo, hazard timings, laser aggression,
// size-tier growth). CFG itself is the medium tuning, so DIFFICULTIES.medium
// is intentionally empty. Sim.createState resolves the chosen preset into
// `state.diff` (a per-round override that Sim helpers read from), so the
// live game never has to consult CFG for these knobs.
//
// To tweak difficulty: add or edit the sparse override in the appropriate
// preset - do NOT edit CFG unless you mean to shift the medium baseline.
export const DIFFICULTIES = {
  easy: {
    label: "Easy",
    // Sharks arrive last, other hazards trickle in gently.
    shark: {
      earliestT: 22,
      spawnStart: 6.5, spawnMin: 1.3,
      rampTime: 36, rampEase: 0.75,
      laserChance: 0.32, laserCooldownMin: 2.0, laserCooldownMax: 4.5,
      sizeStepPerTier: 0.12, tierSeconds: 22, scaleCap: 3.0
    },
    stingray:    { earliestT: 3, spawnMin: 10, spawnMax: 15, maxOnScreen: 1 },
    octopus:     { earliestT: 5, spawnMin: 14, spawnMax: 20, maxOnScreen: 1 },
    lionfish:    { earliestT: 7, spawnMin: 16, spawnMax: 24, maxOnScreen: 1 },
    electricEel: { earliestT: 9, spawnMin: 18, spawnMax: 28, maxOnScreen: 1 },
    anchor:      { earliestT: 20, spawnMin: 16, spawnMax: 28 },
    progression: { speedPerSec: 0.011, speedMax: 1.9 }
  },
  medium: {
    label: "Medium"
    // (no overrides: CFG defaults are the medium tuning)
  },
  fiendish: {
    label: "Fiendish",
    // Sharks arrive sooner and heavier; other hazards still lead the round
    // by a couple of seconds.
    shark: {
      earliestT: 6,
      spawnStart: 3.0, spawnMin: 0.4,
      rampTime: 18, rampEase: 0.5,
      laserChance: 0.75, laserCooldownMin: 0.8, laserCooldownMax: 2.0,
      sizeStepPerTier: 0.22, tierSeconds: 10, scaleCap: 3.8
    },
    stingray:    { earliestT: 0.5, spawnMin: 3.0, spawnMax: 5.0, maxOnScreen: 3 },
    octopus:     { earliestT: 1,   spawnMin: 6,   spawnMax: 10,  maxOnScreen: 3 },
    lionfish:    { earliestT: 1.5, spawnMin: 6.5, spawnMax: 11,  maxOnScreen: 3 },
    electricEel: { earliestT: 2,   spawnMin: 6,   spawnMax: 10,  maxOnScreen: 2 },
    anchor:      { earliestT: 8,   spawnMin: 5,   spawnMax: 11 },
    progression: { speedPerSec: 0.028, speedMax: 3.0 }
  }
};

// Resolve a difficulty name into a fully-populated per-state override that
// Sim helpers can read from. Falls back to medium (i.e. CFG defaults) for
// any unknown difficulty name.
function _resolveDiff(name) {
  const preset = DIFFICULTIES[name] || DIFFICULTIES.medium;
  return {
    shark:       { ...CFG.shark,       ...(preset.shark        || {}) },
    stingray:    { ...CFG.stingray,    ...(preset.stingray     || {}) },
    octopus:     { ...CFG.octopus,     ...(preset.octopus      || {}) },
    lionfish:    { ...CFG.lionfish,    ...(preset.lionfish     || {}) },
    electricEel: { ...CFG.electricEel, ...(preset.electricEel  || {}) },
    anchor:      { ...CFG.anchor,      ...(preset.anchor       || {}) },
    progression: { ...CFG.progression, ...(preset.progression  || {}) }
  };
}

// ==========================================================================
//  SIM  - pure logic. Everything here is a function of (state, inputs, dt).
// ==========================================================================
export const Sim = {
  createState(config) {
    const seed = (config && config.seed) || (Date.now() & 0xffffffff);
    const rng = makeRng(seed);
    const W = CFG.world;
    const mode = config.mode || "party";
    // Lives are picked on the setup screen; default 1 (one-shot, the classic).
    // Applies to every player - human and bots - in both solo and party.
    const initialLives = Math.max(1, (config.lives | 0) || 1);
    const players = (config.players || []).map((p, i) => ({
      id: p.id != null ? p.id : i,
      name: p.name,
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      isBot: !!p.isBot,
      x: CFG.world.laneX + (i % 4) * 16,   // hold station, slight stagger
      y: lerp(CFG.world.waterTop + 60, CFG.world.waterBottom - 60, (i + 1) / ((config.players.length) + 1)),
      vy: 0,
      alive: true,
      lives: initialLives,          // remaining lives (final death sets alive=false)
      invuln: 0,                    // seconds of i-frames remaining after losing a life
      deathT: null,
      deathKind: null,              // "eaten" | "laser" | "stung" | "anchor"
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

    const difficulty = DIFFICULTIES[config.difficulty] ? config.difficulty : "medium";
    const diff = _resolveDiff(difficulty);
    return {
      seed, rng,
      mode,                                // "party" | "solo"
      hazards: config.hazards || "all",   // "all" (sharks + stingrays + anchors) | "sharks-only" (classic)
      difficulty,                          // "easy" | "medium" | "fiendish"
      diff,                                // resolved CFG-shaped overrides (see _resolveDiff); excluded from JSON snapshots
      decor,
      t: 0, frame: 0,
      status: "playing",          // "playing" | "over"
      initialLives,                         // remembered for the HUD hearts readout
      players,
      sharks: [],
      stingrays: [],
      octopuses: [],
      lionfish: [],
      eels: [],
      boats: [],
      anchors: [],
      coffins: [],
      nextSharkId: 1,
      nextStingrayId: 1,
      nextOctopusId: 1,
      nextLionfishId: 1,
      nextEelId: 1,
      nextBoatId: 1,
      nextAnchorId: 1,
      nextCoffinId: 1,
      // Every hazard's spawn timer starts at 0.5 s. Combined with the
      // per-hazard earliestT gate in step(), each hazard's FIRST appearance
      // lands at ~t=(earliestT + 0.5) rather than 2*earliestT (the old bug
      // that made the round feel too slow to get going).
      spawnTimer:         0.5,                            // sharks
      raySpawnTimer:      0.5,
      octopusSpawnTimer:  0.5,
      lionfishSpawnTimer: 0.5,
      eelSpawnTimer:      0.5,
      anchorSpawnTimer:   0.5,
      winnerId: null
    };
  },

  // 0..1 difficulty factor, eased so it climbs quickly early on. Reads the
  // per-round difficulty preset via state.diff.
  _difficulty(state, t) {
    const s = state.diff.shark;
    return Math.pow(clamp(t / s.rampTime, 0, 1), s.rampEase);
  },

  // Shared tempo multiplier - gently ramps up over time. Applied to shark
  // travel speed AND player vertical agility so the game stays dodgeable.
  _speedMul(state, t) {
    const p = state.diff.progression;
    return Math.min(p.speedMax, 1 + p.speedPerSec * t);
  },

  // Difficulty-scaled shark spawn interval.
  _spawnInterval(state, t) {
    const s = state.diff.shark;
    return lerp(s.spawnStart, s.spawnMin, Sim._difficulty(state, t));
  },

  _spawnShark(state) {
    const s = state.diff.shark, rng = state.rng, W = CFG.world;
    const k = Sim._difficulty(state, state.t);
    const speed = lerp(s.minSpeed, s.maxSpeed, rng()) * Sim._speedMul(state, state.t);  // gentle, mirrored by players
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
      chomp: 0,   // >0 while jaws are open after biting
      laser: { state: "idle", timer: s.laserCooldownMin + rng() * (s.laserCooldownMax - s.laserCooldownMin) }
    });
  },

  // Eye position of a leftward-swimming shark (front of the head).
  _eye(sh) { const s = sh.scale || 1.7; return { x: sh.x - 16 * s, y: sh.y - 4 * s }; },

  _spawnStingray(state) {
    const R = state.diff.stingray, rng = state.rng, W = CFG.world;
    const speed = lerp(R.minSpeed, R.maxSpeed, rng()) * Sim._speedMul(state, state.t);
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

  // Spawn a boat crossing the top of the water. When it reaches its targetX
  // it moors (stops) and releases an anchor beneath itself; after moorDur
  // seconds it drifts off. The boat is purely a visual telegraph so the
  // player sees the anchor coming.
  _spawnBoat(state) {
    const B = CFG.boat, A = state.diff.anchor, rng = state.rng, W = CFG.world;
    const targetX = lerp(A.dropMinX, A.dropMaxX, rng());
    state.boats.push({
      id: state.nextBoatId++,
      x: W.w + B.hullW * 0.5,          // enter from off-screen right
      y: W.waterTop,                    // hull straddles the surface
      vx: -B.speed,
      targetX,
      state: "approaching",             // "approaching" | "moored" | "leaving"
      moorTimer: 0,                     // seconds remaining while moored
      scale: 1.0
    });
  },

  _spawnOctopus(state) {
    const O = state.diff.octopus, rng = state.rng, W = CFG.world;
    const speed = lerp(O.minSpeed, O.maxSpeed, rng()) * Sim._speedMul(state, state.t);
    const scale = lerp(O.scaleMin, O.scaleMax, rng());
    // Roll the wave AMPLITUDE first, then choose baseY inside a band that
    // leaves room for the whole sine to swing without clipping the clamps.
    const pathAmp  = lerp(O.pathAmpMin,  O.pathAmpMax,  rng());
    const pathFreq = lerp(O.pathFreqMin, O.pathFreqMax, rng());
    const baseY = lerp(O.minY + pathAmp, O.maxY - pathAmp, rng());
    state.octopuses.push({
      id: state.nextOctopusId++,
      x: W.w + O.bodyR * scale + 20,
      y: baseY, baseY,
      vx: -speed,
      swimT: rng() * 10,
      wavePhase: rng() * Math.PI * 2,
      pathAmp, pathFreq,
      scale
    });
  },

  _spawnLionfish(state) {
    const L = state.diff.lionfish, rng = state.rng, W = CFG.world;
    const speed = lerp(L.minSpeed, L.maxSpeed, rng()) * Sim._speedMul(state, state.t);
    const scale = lerp(L.scaleMin, L.scaleMax, rng());
    // Roll the wave AMPLITUDE first, then choose baseY inside a band that
    // leaves room for the whole sine to swing without clipping the clamps.
    const pathAmp  = lerp(L.pathAmpMin,  L.pathAmpMax,  rng());
    const pathFreq = lerp(L.pathFreqMin, L.pathFreqMax, rng());
    const baseY = lerp(L.minY + pathAmp, L.maxY - pathAmp, rng());
    state.lionfish.push({
      id: state.nextLionfishId++,
      x: W.w + L.bodyRX * scale + 20,
      y: baseY, baseY,
      vx: -speed,
      swimT: rng() * 10,
      wavePhase: rng() * Math.PI * 2,
      pathAmp, pathFreq,
      scale
    });
  },

  // Blue-ring stinger position at tentacle i. Tentacles hang DOWN from the
  // octopus mantle in a fan (angles in the downward hemisphere). Used by both
  // collision and the renderer so they can't drift out of sync.
  _octopusTip(o, i) {
    const O = CFG.octopus;
    const t = O.tentacles > 1 ? i / (O.tentacles - 1) : 0.5;
    const base = O.spreadMin + t * (O.spreadMax - O.spreadMin);
    const angle = base + Math.sin(o.swimT * 1.6 + i * 0.7 + o.wavePhase) * O.swayAmp;
    const len = O.tentacleLen * o.scale;
    return { x: o.x + Math.cos(angle) * len, y: o.y + Math.sin(angle) * len };
  },

  // Root position (on the body edge) of octopus tentacle i - shared by
  // collision-adjacent maths and rendering.
  _octopusRoot(o, i) {
    const O = CFG.octopus;
    const t = O.tentacles > 1 ? i / (O.tentacles - 1) : 0.5;
    // Roots sit along the bottom edge of the mantle, spread horizontally.
    const spread = O.bodyR * 0.75 * o.scale;
    const rootX = ((t - 0.5) * 2) * spread;
    const rootY = O.bodyR * 0.55 * o.scale;
    return { x: o.x + rootX, y: o.y + rootY };
  },

  // Hazard-tip position at lionfish dorsal spike i. Spikes rise UP from the
  // top of the body, spread along its length with a slight outward lean.
  _lionfishTip(l, i) {
    const L = CFG.lionfish;
    const root = Sim._lionfishSpikeRoot(l, i);
    const t = L.spikes > 1 ? i / (L.spikes - 1) : 0.5;
    // Slight outward tilt: leftmost spike leans left, rightmost leans right.
    const tilt = (t - 0.5) * 2 * L.tiltAmp;
    const angle = -Math.PI / 2 + tilt
                + Math.sin(l.swimT * 1.4 + i * 0.5 + l.wavePhase) * L.swayAmp;
    const len = L.spikeLen * l.scale;
    return { x: root.x + Math.cos(angle) * len, y: root.y + Math.sin(angle) * len };
  },

  // Root of a lionfish spike (a point along the top edge of the body).
  _lionfishSpikeRoot(l, i) {
    const L = CFG.lionfish;
    const t = L.spikes > 1 ? i / (L.spikes - 1) : 0.5;
    // Roots span rootSpread * bodyRX horizontally along the top of the body.
    const halfSpan = (L.bodyRX * L.rootSpread * 0.5) * l.scale;
    const rootX = (t - 0.5) * 2 * halfSpan;
    const rootY = -L.bodyRY * l.scale;
    return { x: l.x + rootX, y: l.y + rootY };
  },

  _spawnEel(state) {
    const E = state.diff.electricEel, rng = state.rng, W = CFG.world;
    const speed = lerp(E.minSpeed, E.maxSpeed, rng()) * Sim._speedMul(state, state.t);
    const scale = lerp(E.scaleMin, E.scaleMax, rng());
    const baseY = lerp(E.minY, E.maxY, rng());
    state.eels.push({
      id: state.nextEelId++,
      x: W.w + E.bodyLen * scale + 20,     // enter from the right
      y: baseY, baseY,
      vx: -speed,                           // swim RIGHT -> LEFT
      swimT: rng() * 10,
      waveAmp: lerp(E.waveAmpMin, E.waveAmpMax, rng()),
      waveFreq: lerp(E.waveFreqMin, E.waveFreqMax, rng()),
      wavePhase: rng() * Math.PI * 2,
      scale,
      buzz: {
        state: "idle",
        timer: E.buzzCooldownMin + rng() * (E.buzzCooldownMax - E.buzzCooldownMin)
      }
    });
  },

  _spawnAnchor(state, x, y) {
    const A = state.diff.anchor, rng = state.rng;
    const vy = lerp(A.minSpeed, A.maxSpeed, rng()) * Sim._speedMul(state, state.t);
    const scale = lerp(A.scaleMin, A.scaleMax, rng());
    state.anchors.push({
      id: state.nextAnchorId++,
      x, y,
      vy,
      scale,
      splash: 0.35,              // seconds of surface splash on entry (visual only)
      embedded: false,           // becomes true when the crown touches the seabed
      embeddedT: 0               // timestamp when it embedded (for the linger + fade)
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
    // Octopus stingers: each blue-ring tip is a threat point. Use the nearest
    // tip in x that's within detect range as the y to steer away from.
    for (const o of state.octopuses) {
      const dxo = o.x - p.x;
      if (dxo < -40 || dxo > detect) continue;
      const oCfg = CFG.octopus;
      for (let i = 0; i < oCfg.tentacles; i++) {
        const tip = Sim._octopusTip(o, i);
        const dxt = Math.abs(tip.x - p.x);
        if (dxt < best) { best = dxt; threatY = tip.y; }
      }
    }
    // Lionfish spike tips: same treatment.
    for (const f of state.lionfish) {
      const dxf = f.x - p.x;
      if (dxf < -40 || dxf > detect) continue;
      const lCfg = CFG.lionfish;
      for (let i = 0; i < lCfg.spikes; i++) {
        const tip = Sim._lionfishTip(f, i);
        const dxt = Math.abs(tip.x - p.x);
        if (dxt < best) { best = dxt; threatY = tip.y; }
      }
    }
    // Electric eels: a winding-up or active buzz makes the WHOLE body position
    // a threat. Steer away from the eel's y.
    for (const el of state.eels) {
      const dxe = el.x - p.x;
      if (dxe < -40 || dxe > detect) continue;
      const menace = (el.buzz.state !== "idle") ? 0 : 40;   // idle eels are less urgent
      if (dxe + menace < best) { best = dxe + menace; threatY = el.y; }
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
    const W = CFG.world, P = CFG.player;
    const S = state.diff.shark, R = state.diff.stingray, A = state.diff.anchor;
    const O = state.diff.octopus, L = state.diff.lionfish, E = state.diff.electricEel;
    state.t += dt;
    state.frame++;
    const m = Sim._speedMul(state, state.t);   // shared tempo: players get faster with the sharks

    // --- spawn sharks (gated by earliestT so early game is other hazards) ---
    if (state.t >= S.earliestT) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        Sim._spawnShark(state);
        state.spawnTimer += Sim._spawnInterval(state, state.t);
      }
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

    // --- spawn blue-ringed octopuses on their own timer (cap on screen) ---
    if (state.hazards !== "sharks-only" && state.t >= O.earliestT) {
      state.octopusSpawnTimer -= dt;
      if (state.octopusSpawnTimer <= 0 && state.octopuses.length < O.maxOnScreen) {
        Sim._spawnOctopus(state);
        state.octopusSpawnTimer = lerp(O.spawnMin, O.spawnMax, state.rng());
      } else if (state.octopusSpawnTimer <= 0) {
        state.octopusSpawnTimer = 0.6;
      }
    }

    // --- spawn lionfish on their own timer (cap on screen) ---
    if (state.hazards !== "sharks-only" && state.t >= L.earliestT) {
      state.lionfishSpawnTimer -= dt;
      if (state.lionfishSpawnTimer <= 0 && state.lionfish.length < L.maxOnScreen) {
        Sim._spawnLionfish(state);
        state.lionfishSpawnTimer = lerp(L.spawnMin, L.spawnMax, state.rng());
      } else if (state.lionfishSpawnTimer <= 0) {
        state.lionfishSpawnTimer = 0.6;
      }
    }

    // --- spawn electric eels on their own timer (cap on screen) ---
    if (state.hazards !== "sharks-only" && state.t >= E.earliestT) {
      state.eelSpawnTimer -= dt;
      if (state.eelSpawnTimer <= 0 && state.eels.length < E.maxOnScreen) {
        Sim._spawnEel(state);
        state.eelSpawnTimer = lerp(E.spawnMin, E.spawnMax, state.rng());
      } else if (state.eelSpawnTimer <= 0) {
        state.eelSpawnTimer = 0.6;
      }
    }

    // --- spawn a BOAT on the anchor timer; boat drops the anchor later.
    //     Only ONE boat on screen at a time (CFG.boat.maxOnScreen). ---
    if (state.hazards !== "sharks-only" && state.t >= A.earliestT) {
      state.anchorSpawnTimer -= dt;
      if (state.anchorSpawnTimer <= 0 && state.boats.length < CFG.boat.maxOnScreen) {
        Sim._spawnBoat(state);
        state.anchorSpawnTimer = lerp(A.spawnMin, A.spawnMax, state.rng());
      } else if (state.anchorSpawnTimer <= 0) {
        // Boat still on screen - retry shortly so the cadence doesn't stall.
        state.anchorSpawnTimer = 0.6;
      }
    }

    // --- boats: approach targetX, MOOR (stop) while the anchor sinks, then
    //     drift off to the left. ---
    for (const b of state.boats) {
      if (b.state === "approaching") {
        b.x += b.vx * dt;
        if (b.x <= b.targetX) {
          b.x = b.targetX;
          b.state = "moored";
          b.moorTimer = CFG.boat.moorDur;
          Sim._spawnAnchor(state, b.x, CFG.world.waterTop - 6);
        }
      } else if (b.state === "moored") {
        b.moorTimer -= dt;
        if (b.moorTimer <= 0) b.state = "leaving";
      } else if (b.state === "leaving") {
        b.x += b.vx * dt;
      }
    }
    // Cull once fully off-screen left.
    state.boats = state.boats.filter((b) => b.x > -CFG.boat.hullW);

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

    // --- move octopuses (slow drift + clearly wavy vertical path) ---
    for (const o of state.octopuses) {
      o.x += o.vx * dt;
      o.swimT += dt;
      o.y = clamp(o.baseY + Math.sin(o.swimT * o.pathFreq + o.wavePhase) * o.pathAmp, O.minY, O.maxY);
    }
    state.octopuses = state.octopuses.filter((o) => o.x > -60);

    // --- move lionfish (drift + clearly wavy vertical path) ---
    for (const f of state.lionfish) {
      f.x += f.vx * dt;
      f.swimT += dt;
      f.y = clamp(f.baseY + Math.sin(f.swimT * f.pathFreq + f.wavePhase) * f.pathAmp, L.minY, L.maxY);
    }
    state.lionfish = state.lionfish.filter((f) => f.x > -60);

    // --- move eels + drive the buzz state machine ---
    for (const el of state.eels) {
      el.x += el.vx * dt;
      el.swimT += dt;
      el.y = clamp(el.baseY + Math.sin(el.swimT * el.waveFreq + el.wavePhase) * el.waveAmp, E.minY, E.maxY);
      const B = el.buzz;
      B.timer -= dt;
      if (B.state === "idle") {
        // Only start a buzz while on-screen so an off-screen eel isn't wasting shocks.
        if (B.timer <= 0 && el.x > 40 && el.x < W.w - 20) {
          B.state = "windup"; B.timer = E.buzzWindup;
        }
      } else if (B.state === "windup") {
        if (B.timer <= 0) { B.state = "active"; B.timer = E.buzzActive; }
      } else if (B.state === "active") {
        if (B.timer <= 0) { B.state = "idle"; B.timer = E.buzzCooldownMin + state.rng() * (E.buzzCooldownMax - E.buzzCooldownMin); }
      }
    }
    state.eels = state.eels.filter((el) => el.x > -80);

    // --- coffins stay put at the death spot and cull after their lifetime ---
    const C = CFG.coffin;
    state.coffins = state.coffins.filter((cf) => (state.t - cf.spawnT) < C.lifetime);

    // --- anchors fall; when the crown touches the seabed they EMBED and
    //     stay there for a couple of seconds before being culled. ---
    const embedY = W.waterBottom - A.embedDepth;
    for (const a of state.anchors) {
      if (a.splash > 0) a.splash = Math.max(0, a.splash - dt);
      if (!a.embedded) {
        a.y += a.vy * dt;
        if (a.y >= embedY) {
          a.y = embedY;
          a.vy = 0;
          a.embedded = true;
          a.embeddedT = state.t;
        }
      }
    }
    // Cull once the embedded linger is up. (Non-embedded anchors just above
    // the world floor keep falling until they embed - they don't leave.)
    state.anchors = state.anchors.filter((a) => !a.embedded || (state.t - a.embeddedT) < A.embedLinger);

    // --- move players (vertical dodging only; they hold their lane) ---
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
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

    // --- octopus blue-ring stingers: only the TIP circles kill (8 per octopus). ---
    for (const o of state.octopuses) {
      const tipRSq = O.tipR * O.tipR;
      for (let i = 0; i < O.tentacles; i++) {
        const tip = Sim._octopusTip(o, i);
        for (const p of state.players) {
          if (!p.alive) continue;
          // Same circle-vs-ellipse test used by the stingray strike.
          const dx = tip.x - p.x, dy = tip.y - p.y;
          const nx = dx / P.rx, ny = dy / P.ry;
          const d = Math.sqrt(nx * nx + ny * ny);
          if (d <= 1) { Sim._kill(state, p, "octopus", tip.x, tip.y); continue; }
          const bx = (nx / d) * P.rx, by = (ny / d) * P.ry;
          const ex = tip.x - (p.x + bx), ey = tip.y - (p.y + by);
          if (ex * ex + ey * ey <= tipRSq) Sim._kill(state, p, "octopus", tip.x, tip.y);
        }
      }
    }

    // --- lionfish spikes: only the small TIP hazards kill (one per spike). ---
    for (const f of state.lionfish) {
      const tipRSq = L.tipR * L.tipR;
      for (let i = 0; i < L.spikes; i++) {
        const tip = Sim._lionfishTip(f, i);
        for (const p of state.players) {
          if (!p.alive) continue;
          const dx = tip.x - p.x, dy = tip.y - p.y;
          const nx = dx / P.rx, ny = dy / P.ry;
          const d = Math.sqrt(nx * nx + ny * ny);
          if (d <= 1) { Sim._kill(state, p, "lionfish", tip.x, tip.y); continue; }
          const bx = (nx / d) * P.rx, by = (ny / d) * P.ry;
          const ex = tip.x - (p.x + bx), ey = tip.y - (p.y + by);
          if (ex * ex + ey * ey <= tipRSq) Sim._kill(state, p, "lionfish", tip.x, tip.y);
        }
      }
    }

    // --- electric eel buzz: only ACTIVE state kills, inside a circle around
    // the eel's body centre. Same circle-vs-ellipse test as the sting. ---
    for (const el of state.eels) {
      if (el.buzz.state !== "active") continue;
      const bRSq = E.buzzR * E.buzzR;
      for (const p of state.players) {
        if (!p.alive) continue;
        const dx = el.x - p.x, dy = el.y - p.y;
        const nx = dx / P.rx, ny = dy / P.ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d <= 1) { Sim._kill(state, p, "electric", el.x, el.y); continue; }
        const bx = (nx / d) * P.rx, by = (ny / d) * P.ry;
        const ex = el.x - (p.x + bx), ey = el.y - (p.y + by);
        if (ex * ex + ey * ey <= bRSq) Sim._kill(state, p, "electric", el.x, el.y);
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

    // --- collisions (teeth + laser). The shark BODY is safe to touch - only
    // a tight circle at the teeth (front of the head) kills, and only the
    // visible laser beam kills. This matches the "kill on the dangerous part
    // only" rule shared by all hazards. ---
    for (const p of state.players) {
      if (!p.alive) continue;
      for (const sh of state.sharks) {
        const teethX = sh.x - S.teethOffsetX * sh.scale;
        const teethY = sh.y;
        const tR = S.teethR * sh.scale;
        // Circle-vs-ellipse test: teeth circle radius tR against player ellipse.
        const dx = teethX - p.x, dy = teethY - p.y;
        const nx = dx / P.rx, ny = dy / P.ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        let bitten = false;
        if (d <= 1) bitten = true;
        else {
          const bx = (nx / d) * P.rx, by = (ny / d) * P.ry;
          const ex = teethX - (p.x + bx), ey = teethY - (p.y + by);
          if (ex * ex + ey * ey <= tR * tR) bitten = true;
        }
        if (bitten) { sh.chomp = S.chomp; Sim._kill(state, p, "eaten", teethX, teethY); break; }
        // Laser lane - only the visible beam kills.
        if (sh.laser.state === "firing") {
          const eye = Sim._eye(sh);
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
    // I-frames after a recent respawn absorb the hit outright.
    if (p.invuln > 0) return;
    // Every life lost drops a coffin at the player's position so there's a
    // clear visual record of where the death happened.
    Sim._dropCoffin(state, p);
    // Spend one life and keep playing from the same spot with a brief window
    // of invulnerability so the same hazard doesn't insta-kill again.
    if (p.lives > 1) {
      p.lives -= 1;
      p.invuln = CFG.player.invulnDur;
      p.vy = 0;                    // clean slate for dodging on respawn
      p.deathKind = kind;           // last hit kind, used by the renderer for flash colour
      return;
    }
    p.alive = false;
    p.lives = 0;
    p.deathT = state.t;
    p.deathKind = kind;
    p.deathX = x; p.deathY = y;
  },

  _dropCoffin(state, p) {
    state.coffins.push({
      id: state.nextCoffinId++,
      x: p.x, y: p.y,
      color: p.color,        // small colour flash on the lid so you can tell who died
      spawnT: state.t
    });
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
