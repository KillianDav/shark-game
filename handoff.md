# Handoff: Standup Shark

Read this first. It is the source of truth for continuing the project on another machine or with another agent.

## What this is

A **standup picker game**: a team swims in an ocean, dodges laser-eyed sharks, and the **last player still swimming runs the next standup**.

**End goal:** host it at a public URL so each person plays from their own browser, **in the same shared ocean at the same time**, live-synced. One room, one simulation, everyone sees the same sharks.

**Current state:** local single-player build. As of the 2026-08-31 refactor the four layers (Sim/Render/Input/Transport) are extracted into ES modules under `src/`, a Node-based test suite covers Sim, and the sim is `import`-able from any Node script. The 2026-08-31 hazards feature adds two extras alongside the sharks: **stingrays** that glide slowly with a wavy motion through the lower third of the water and strike with a wide, visible tail-sting circle (the glow IS the kill zone), and **anchors** that drop straight down from the surface and kill only on direct body-overlap. A `hazards: "sharks-only"` mode disables both, preserving the classic laser-sharks-only game bit-for-bit. Multiplayer is a `WebSocketTransport` + `server/` addition, not a rewrite.

Reference art / original shark sprite lives in the sibling project:

`C:\Users\killi\source\claude\epr\standup-lemmings\index-shark.html`

(functions `drawSharkSprite` / `drawSharkLasers` around lines 820–899). Do not edit that file; this project already has a port.

## Product decisions (already made — do not reopen unless asked)

| Decision | Choice |
|---|---|
| Who runs standup | **Winner** = last swimmer alive (or longest survivor if all die) |
| Multiplayer model | **Shared real-time arena** (same ocean, same sharks). Not independent rounds. Not phone-as-controller. |
| Finish line | **Removed.** Everyone swims at the same horizontal speed, so they hold a lane (`laneX`) and only dodge vertically. |
| First build | Local HTML first, structured for a later server-authoritative websocket arena. |
| Stack | Vanilla JS + Canvas + ES modules. No build step, no runtime dependencies. `npm test` uses Node's built-in test runner. Local play requires an HTTP server (`python -m http.server 8912`) - `file://` no longer works because browsers block ES module scripts on it. |

## How to run (today)

**Play:**
```
python -m http.server 8912 --bind 127.0.0.1   # or `npm run serve`
# open http://127.0.0.1:8912/
```
Double-clicking `index.html` does NOT work — browsers block ES modules on `file://`.

**Test:**
```
npm test
```
Runs 22 tests via Node's built-in `node:test` (needs Node ≥ 20). Zero dependencies. Tests live in `test/` and only `import` from `src/sim.js` — Render/Input/Transport are not tested (visual/browser-only).

**Modes:**
- **Party:** first name in the list is the human (↑/↓ or W/S). Other names + practice bots are AI. Last one swimming wins.
- **Solo survival:** you swim alone until death. HUD shows `Size tier`, `tempo xN`, and `sharks K • rays K` (or just `sharks K` in classic mode). Result is survival time. Use this to test the difficulty curve.

**Hazards toggle:** the setup checkbox `Include stingrays` maps to `config.hazards: "all" | "sharks-only"` on `Sim.createState`. Default `"all"` unlocks stingrays after `CFG.stingray.earliestT` seconds (4.5-7 s steady cadence, cap of `CFG.stingray.maxOnScreen`) and anchors after `CFG.anchor.earliestT` seconds (8-16 s cadence). `"sharks-only"` skips the ray + anchor spawn timers entirely, keeping the classic laser-sharks-only game.

**Git:** local repo has a `main` branch pushed to `github.com/KillianDav/shark-game`. Personal account, gmail-auth. Do not commit or push to work / EPR projects on this machine.

## Repo layout

| Path | Role |
|---|---|
| `index.html` | Markup + CSS + `<script type="module" src="src/main.js">` + result overlay. Everything else is under `src/`. |
| `src/sim.js` | Pure logic: `CFG`, `PLAYER_COLORS`, `makeRng`, `clamp`, `lerp`, `Sim`. No DOM, no canvas. Imported by client and tests (and by the eventual server). |
| `src/render.js` | Canvas 2D drawing. Reads state snapshots, never mutates. Imports from `sim.js`. |
| `src/input.js` | Keyboard → `{ up, down }` intent. Browser-only. |
| `src/transport-local.js` | `LocalTransport()` — runs `Sim` in-tab. Same interface a future `WebSocketTransport` will implement. |
| `src/main.js` | DOM wiring + fixed-timestep loop. Imports the four modules above. |
| `test/` | `node:test` files: determinism (self-consistency + golden fixture), collision, winner, difficulty, bots, physics. |
| `test/fixtures/golden-state.json` | Sim state snapshot captured from the pre-refactor code. Regenerate only when a *deliberate* gameplay change lands, and update the commit message to say what changed. |
| `package.json` | `"type": "module"`, `npm test` / `npm run serve`. No dependencies. |
| `history/index-v1.html`, `history/index-v2.html` | Older HTML snapshots kept for reference. Do not edit. |
| `README.md` | Player-facing + architecture overview. |
| `handoff.md` | This file. Agent-facing. Prefer this over README when continuing work. |

`CFG` (all tunables) is at the top of `src/sim.js`.

## Architecture (the multiplayer seam)

Four layers, one file each under `src/`. The boundary is enforced by `import` statements now — respect it.

```
Input  →  Transport  →  Sim        (Sim advances the world)
Render ←  Transport  ←  Sim        (Render draws a snapshot only)
```

- **Sim** — pure. `Sim.createState(config)` and `Sim.step(state, humanInputs, dt)`. No DOM, no canvas, no `Date.now()` inside `step`. RNG is seeded `mulberry32` (`makeRng(seed)`). Same seed + same inputs = same game on any JS engine. State carries three hazard collections: `state.sharks`, `state.stingrays`, `state.anchors`.
- **Render** — reads a snapshot, never mutates sim state. Draws ocean, seabed props, sharks, lasers, players, HUD, result overlay (result overlay is DOM, not canvas).
- **Input** — arrow keys / W S → `{ up, down }`.
- **Transport** — **the only thing that changes for online play.** Interface:
  - `start(config)`
  - `sendInput(playerId, intent)`
  - `tick(dt)`
  - `snapshot()` → state
  - `isOver()`

Today `LocalTransport` runs `Sim` in-tab. Main loop: gather input → `sendInput` → fixed timestep `1/60` ticks → `Render.drawState`.

`state.mode` is `"party"` or `"solo"`. Winner resolution: last alive if `players.length > 1`; if everyone is dead, longest `deathT` wins (also covers solo).

## Game rules (current sim)

- Logical world `1280×720`. Players stay near `world.laneX` (~250) and move only on Y.
- Sharks spawn off the right, swim left, **weave vertically**. On spawn they **aim at a living swimmer’s current Y** by solving `baseY` so the weave crosses the lane at that Y. They **do not home** after that — dodgeable if you move.
- **Bite:** only the **mouth** kills. Sharks face left. Bite if `p.x <= sh.x - mouthStartX * scale` **and** ellipse overlap. Touching the tail/back is safe.
- **Laser:** windup (glow, harmless) then a leftward beam. Kill only if the beam **visually overlaps** the fish: `abs(p.y - eye.y) <= laserBand(4) + player.ry`. `_eye(sh)` scales with `sh.scale` so beam origin matches the glowing eye.
- Death FX: laser = flash + shrink + vanish (`fx.vaporDur`); eaten = shrink into jaws (`fx.eatDur`). Shark `chomp` timer opens the mouth after a bite.
- Difficulty:
  - Front-loaded spawn ramp: `_difficulty(t) = (t/rampTime)^rampEase` (`rampTime` 26s, `rampEase` 0.6).
  - Shared tempo `_speedMul(t) = min(2.6, 1 + 0.02*t)` applied to **shark travel speed and player `accY`/`maxVy`** so dodging stays feasible.
  - Size tier every 15s: `scale += floor(t/15) * 0.18`, cap 3.4. Hitbox = `hitRX/hitRY * scale`.

Bots: dumb dodge (`Sim._botIntent`) — steer away from nearest shark / laser lane ahead.

## Art / polish status (latest session)

Still being iterated. Do not treat as finished.

- **Mouth / teeth (open):** rewritten to clip the opening to the body ellipse, body-coloured lips, small teeth on the inner lip, upper points down / lower points up, symmetric open. User was unhappy with earlier “teeth outside the body” and “asymmetric giant jaw”. Latest version is unconfirmed by the user — **verify visually when a shark actually bites** (mouth is closed until `chomp > 0`).
- **Kelp:** accepted (“green plant ok”). Keep.
- **Starfish:** flattened (heavy Y squash + shadow + rounded arms) so they lie on the sand. User still wanted better quality than the first star-icon version. Revisit if they still look like stickers.
- **Chests:** random tiny chests removed. **One** larger chest at `x≈980`, open lid + gold pile. Do not scatter more unless asked.
- Seabed is generated once (`Render._buildSeabed`, seeded `0x5eabed`) so it does not flicker. Draw order: rock → shell → starfish → coral → kelp → chest.

## Known pitfalls

- Background / unfocused tabs throttle `requestAnimationFrame`. Playtest in a focused window. "Skip to result" runs the sim synchronously and is good for catching JS errors.
- `Render._seabed` is cached on the module. If you change `_buildSeabed`, hard-reload the page.
- `Sim.createState` uses `Date.now()` **only** as a default seed when none is passed. For multiplayer the **server must pick the seed** and send it in `config`.
- **`state.rng` is a closure, not serialisable.** Deep-cloning or JSON-round-tripping the state loses it. Fine locally; when the server ships snapshots to clients, the server should send only the seed (or a resumable RNG state) and the client re-derives RNG from that. Not urgent — flag it before you first hand a Sim state across a wire.
- Signed zero in numeric fields: `vy` can end up as `-0` when damping hits exactly zero, then JSON round-trips it to `+0`. The determinism test's `scrub()` normalises this — copy that helper if you write another Sim-comparing test.

## Phase 2 — online multiplayer (not built)

This is the next real feature. Goal: each player opens a hosted URL, types a name, joins a room, and all swim in **one authoritative ocean**.

### Recommended build order

1. ~~Extract `sim.js`.~~ **Done** (2026-08-31). `src/sim.js` is already the shared module — `import` it verbatim in Node.
2. **`server/index.js`** — Node + [`ws`](https://github.com/websockets/ws), ESM (`import { Sim, CFG } from '../src/sim.js'`):
   - Rooms: host creates a room (short code) → others join by URL/`?room=XXXX` + name.
   - Lobby → countdown → `Sim.createState({ players, seed, mode: "party" })` on the server. **Server picks the seed** (see pitfalls).
   - Fixed tick (`CFG.fixedDt`). Collect latest `{ up, down }` per `playerId`. `Sim.step`. Broadcast snapshot (or a slim snapshot) to all clients.
   - When `state.status === "over"`, broadcast winner and freeze.
   - Sanitise the snapshot before sending: strip `state.rng`, prefer sending `state.seed` and let the client rebuild rng if it needs to.
3. **`src/transport-websocket.js`** — same interface as `LocalTransport` (`start` / `sendInput` / `tick` / `snapshot` / `isOver`). `sendInput` sends intent to the server. Incoming snapshots become `snapshot()`. Main loop and Render stay as-is. **Server-authoritative, no prediction at first.** Add interpolation only if lag is obvious.
4. **Client lobby UI** — replace/extend the setup screen: name, room code, player list, "ready", host Start. Keep Party win copy ("they run the next standup"). Solo mode can stay local-only.
5. **Deploy** — static files + a websocket-capable host (Fly.io, Render, small VM). Client needs a configurable server URL (query param or a small `config.js`).

### Suggested wire protocol (starting point)

Client → server:

- `{ type: "join", name, room }`
- `{ type: "input", up, down }` (or deltas)
- `{ type: "start" }` (host only)

Server → client:

- `{ type: "lobby", players: [...], youId }`
- `{ type: "start", config }` (seed, roster, ids)
- `{ type: "state", t, players, sharks, status, winnerId }` (trim fields Render does not need)
- `{ type: "over", winnerId }`

Do **not** let clients spawn sharks or decide deaths.

### What must stay identical on client and server

`Sim.step`, shark spawn / aim math, collision, winner rules, `CFG` combat numbers, `makeRng`. If you change these, change `sim.js` once.

Render-only things (seabed props, bubbles, mouth draw, vapor sparks) can stay client-only **if** they are derived from snapshot fields (`t`, `frame`, `chomp`, `deathKind`, `deathT`). Seabed uses a fixed seed today — keep it that way so every client draws the same floor without sending prop lists.

If you change `Sim` behaviour, `test/fixtures/golden-state.json` will fail. That's the point — regenerate it only when the change is intentional, and note the reason in the commit message. See `test/determinism.test.js` for the exact config that produces the fixture.

## Suggested next work (priority)

1. **Phase 2 multiplayer** (`server/` + `WebSocketTransport`) as above. Do not add a finish line, homing sharks, or a second game mode unless asked.
2. Optional later: `localStorage` best time for Solo; interpolate remote snapshots; host-kicks / reconnect.
3. Optional tooling: add ESLint/Prettier or a bundler only when the codebase feels too big to keep in your head. Not before.

## Agent conventions for this user

- Prefer small, targeted edits. Match existing style (ES modules, `CFG` knobs, no framework).
- `npm test` before committing any change to `src/sim.js`. If a test fails, verify whether the change is intentional (update the test / regenerate the golden fixture) or a regression (fix the sim).
- Save a snapshot in `history/` before large gameplay changes only if the user asks to "save a copy". Git history covers most cases.
- Verify UI in a browser when possible. A single screenshot is not enough for gameplay — click through setup → start → result.
- Do not commit or push unless explicitly asked. Pushes go to `github.com/KillianDav/shark-game` (personal, gmail-auth). Never push to work / EPR projects.
- Do not edit the plan file from the original Cursor plan session.

## Quick map (where to find things)

- **Tunables** — `CFG` at the top of `src/sim.js`.
- **Sim** — `src/sim.js`: `createState`, `step`, `_spawnShark`, `_spawnStingray`, `_spawnAnchor`, `_stingTip`, `_botIntent`, `_resolveWinner`, `_difficulty`, `_speedMul`, `_spawnInterval`, `_eye`, `_kill`.
- **Render** — `src/render.js`: `drawSharkSprite`, `drawSharkLaser`, `drawWindupCharge`, `drawStingray`, `drawAnchor`, `drawPlayer`, `_waterColorAt`, `_buildSeabed`, `drawSeabed`, `drawState`.
- **Input** — `src/input.js`: key map, `attach` / `detach` / `intent` / `reset`.
- **LocalTransport** — `src/transport-local.js`: in-tab sim.
- **Glue** — `src/main.js`: `startGame` / `loop` / `endGame` + setup UI + Party vs Solo result copy.
- **Tests** — `test/*.test.js`. Fixtures in `test/fixtures/`.
