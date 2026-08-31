# Standup Shark

A stand-up picker game. Your team of **scuba divers** dodges the laser-eyed
sharks, the tail-whipping stingrays, and the occasional anchor a passing
boat drops through the water — the **winner runs the next standup**. Only
the **dangerous parts** kill: shark **teeth**, the **laser beam**, the
**stingray sting circle** (the visible glow), and a direct **anchor** body
hit. Control your diver with the **up / down arrow keys** (W / S also work).

The shark art (and the laser-eye rendering) is ported from the reference
`standup-lemmings/index-shark.html` game.

## Run it

A local HTTP server is required (browsers block ES module scripts on `file://`):

```bash
python -m http.server 8912 --bind 127.0.0.1
# then open http://127.0.0.1:8912/
```

Or use `npm run serve` (same thing).

Pick a mode on the setup screen:

- **Party** — the **first name** in the team list is you (keyboard-controlled)
  and every other name becomes an AI bot swimmer. "Practice bots" adds extra AI
  swimmers. The last one still swimming wins and runs the next standup.
- **Solo survival** — you swim alone. HUD shows size tier, tempo multiplier,
  and the current shark/ray/anchor counts. The result reports total survival
  time — ideal for testing the difficulty curve.

The **Lives** number on the setup screen (default **1**) applies to every
swimmer — solo and party. With more than one life, each hit spends one and
respawns you in place with a brief invulnerability flash. A little **coffin**
drops at the death spot and sinks toward the seabed as a clear visual record
of where the death happened.

**Difficulty** on the setup screen picks a preset — Easy, Medium (default),
or Fiendish — that shifts the spawn cadence, tempo ramp, shark size growth,
laser aggression, and stingray/anchor timings together. See
`DIFFICULTIES` in `src/sim.js` to tweak or add a preset; the medium tuning
is `CFG`'s defaults, so easy and fiendish are sparse overrides on top.

Uncheck **Include stingrays** on the setup screen for classic laser-sharks-only
play. In the default mode: rays start after ~5 s (steady 4.5-7 s cadence, cap of
2 on screen), anchors start after ~12 s (8-16 s cadence). Sharks-only mode
disables both — the classic laser-sharks-only game.

## Test it

Node 20+ built-in test runner, zero dependencies:

```bash
npm test
```

The suite covers determinism (same seed + inputs → same state, plus a golden
fixture pinning current gameplay), shark collision, stingray tail-strike +
sharks-only mode, winner resolution, difficulty curve, bot dodge, and player
physics.

## Repo layout

```
index.html              # markup + CSS + <script type="module" src="src/main.js">
src/
  sim.js                # CFG, PLAYER_COLORS, makeRng, Sim (pure — runs in Node too)
  render.js             # canvas 2D drawing; reads snapshots, never mutates
  input.js              # keyboard → {up, down} intent
  transport-local.js    # LocalTransport — runs Sim in-tab
  main.js               # DOM wiring + fixed-timestep game loop
test/                   # node:test suite
history/                # older HTML snapshots kept for reference
handoff.md              # agent-facing notes; prefer over README when continuing work
package.json
```

`CFG` (all tunables) lives at the top of `src/sim.js`.

## Architecture

Four layers with a hard boundary. The single-player build already has the split
that the multiplayer arena will need — only Transport changes.

```
Input  ->  Transport  ->  Sim        (Sim advances the world)
Render <-  Transport  <-  Sim        (Render draws a state snapshot)
```

- **Sim** — pure game logic. `Sim.createState(config)` and
  `Sim.step(state, humanInputs, dt)`. No DOM, no canvas, no `Date.now()` inside
  the step. Randomness comes from a seeded `mulberry32` PRNG, so the same seed +
  same inputs always produce the same game on any machine (client or server).
- **Render** — reads a state snapshot and draws it to the canvas. Never mutates
  state. Contains the ported `drawSharkSprite` / `drawSharkLaser`.
- **Input** — maps arrow keys to a `{ up, down }` intent.
- **Transport** — the *only* seam that changes for multiplayer. It owns the
  simulation lifecycle and exposes:
  - `start(config)`
  - `sendInput(playerId, intent)`
  - `tick(dt)`
  - `snapshot()` — latest state to render
  - `isOver()`

Today `LocalTransport` runs the Sim in the same browser tab. The main loop uses
a **fixed timestep** (`1/60s`) so the simulation is deterministic and
network-friendly.

## Phase 2 — shared multiplayer arena (not built yet)

Everyone swims in the same ocean at once, dodging the same sharks, live-synced.
The plan reuses the layers above unchanged except for Transport.

1. **Add `server/index.js`** on Node + [`ws`](https://github.com/websockets/ws)
   that `import`s the shared `src/sim.js`:
   - Holds the authoritative `Sim` state per room and ticks it at a fixed rate.
   - Room / lobby flow: a host creates a room → players open the URL, enter a
     name, and join → countdown → play → winner announced.
   - Receives `{ up, down }` inputs from each client and applies them via
     `Sim.step`.
   - Broadcasts state snapshots to all clients each tick.
2. **Add `src/transport-websocket.js`** implementing the same interface as
   `LocalTransport`. `sendInput` sends the intent to the server; incoming
   snapshots feed `snapshot()`. The main loop and Render do not change.
3. **Deploy.** Serve the static client from anywhere and host the WebSocket
   server on a websocket-friendly platform (e.g. Fly.io, Render, or a small VM).
   Point the client at the server URL.

Because the Sim is deterministic and side-effect free, the server can run it
directly and every client stays in sync from the broadcast snapshots.

**One thing to fix before shipping snapshots:** `state.rng` is a *closure* on
the state object — fine locally, not JSON-serialisable. The server should keep
just the seed and rebuild `rng` on demand rather than shipping the closure.

## Tuning

Gameplay constants live in the `CFG` object at the top of `src/sim.js` — player
speed, shark speed/spawn rate, laser windup/duration/range, and the difficulty
ramp. Adjust and reload.
