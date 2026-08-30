# Standup Shark

A stand-up picker game. Swim left to right, dodge the laser-eyed sharks coming
the other way, and the **winner runs the next standup**. Sharks try to eat you
on contact or fry you with an eye-laser. Control your swimmer with the
**up / down arrow keys** (W / S also work).

The shark art (and the laser-eye rendering) is ported from the reference
`standup-lemmings/index-shark.html` game.

## Versions

`index.html` is always the latest build. Older snapshots are kept alongside it:

- `index-v1.html` - vertical-weaving sharks + fast, front-loaded difficulty ramp (before shark targeting).
- `index-v2.html` - sharks aim at a swimmer on entry (locked, dodgeable) and can reach the full vertical range, so there is no safe top/bottom corner.
- `index.html` (current) - adds a gentle shared speed-up (sharks travel faster over time while players get proportionally more agile so it stays dodgeable) and introduces a slightly larger shark size tier every 15 seconds.

## Run it (single player)

Just open `index.html` in any modern browser (double-click it, or drag it into a
tab). No build step, no dependencies, runs fully offline.

Pick a mode on the setup screen:

- **Party** - the **first name** in the team list is you (keyboard-controlled) and
  every other name becomes an AI bot swimmer. "Practice bots" adds extra AI
  swimmers. The last one still swimming wins and runs the next standup.
- **Solo survival** - you swim alone until you die. The HUD shows the live
  difficulty (size tier, tempo multiplier, shark count) and the result reports how
  long you lasted - ideal for testing the difficulty curve.

## Architecture (why it's built this way)

Everything lives in one `index.html`, but the code is split into four layers
with a hard boundary between them. This separation is the whole point: it is
what lets the single-player build become a shared multiplayer arena without
rewriting the game.

```
Input  ->  Transport  ->  Sim        (Sim advances the world)
Render <-  Transport  <-  Sim        (Render draws a state snapshot)
```

- **Sim** - pure game logic. `Sim.createState(config)` and
  `Sim.step(state, humanInputs, dt)`. No DOM, no canvas, no `Date.now()` inside
  the step. Randomness comes from a seeded `mulberry32` PRNG, so the same seed +
  same inputs always produce the same game on any machine (client or server).
- **Render** - reads a state snapshot and draws it to the canvas. Never mutates
  state. Contains the ported `drawSharkSprite` / `drawSharkLaser`.
- **Input** - maps arrow keys to a `{ up, down }` intent.
- **Transport** - the *only* seam that changes for multiplayer. It owns the
  simulation lifecycle and exposes:
  - `start(config)`
  - `sendInput(playerId, intent)`
  - `tick(dt)`
  - `snapshot()` -> latest state to render
  - `isOver()`

Today `LocalTransport` runs the Sim in the same browser tab. The main loop uses
a **fixed timestep** (`1/60s`) so the simulation is deterministic and
network-friendly.

## Phase 2 - shared multiplayer arena (not built yet)

Everyone swims in the same ocean at once, dodging the same sharks, live-synced.
The plan below reuses the layers above unchanged except for Transport.

1. **Extract the Sim.** Move the `Sim` object into a standalone `sim.js` written
   in a UMD-ish style so it loads both in the browser (`<script>`) and in Node
   (`require`/`module.exports`). Client and server then run *identical* logic.
2. **Authoritative server (`server.js`).** Node + [`ws`](https://github.com/websockets/ws):
   - Holds the authoritative `Sim` state per room and ticks it at a fixed rate.
   - Room / lobby flow: a host creates a room -> players open the URL, enter a
     name, and join -> countdown -> play -> winner announced.
   - Receives `{ up, down }` inputs from each client and applies them to that
     player's slot in `Sim.step`.
   - Broadcasts state snapshots to all clients each tick.
3. **Swap the Transport.** Add `WebSocketTransport` implementing the same
   interface (`start` / `sendInput` / `snapshot` / `isOver`). `sendInput` sends
   the intent to the server; incoming snapshots feed `snapshot()`. The main loop
   and Render do not change. To start with, clients simply render the latest
   server snapshot (server-authoritative, no client-side prediction) - add
   interpolation/prediction later only if it feels laggy.
4. **Deploy.** Serve the static client (`index.html`, `sim.js`) from anywhere,
   and host the WebSocket server on a websocket-friendly platform
   (e.g. Fly.io, Render, or a small VM). Point the client at the server URL.

Because the Sim is deterministic and side-effect free, the server can run it
directly and every client stays in sync from the broadcast snapshots.

## Tuning

Gameplay constants live in the `CFG` object near the top of the script in
`index.html` - player speed, shark speed/spawn rate, laser windup/duration/range,
and the difficulty ramp. Adjust and reload.
