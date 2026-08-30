# Handoff: Standup Shark

Read this first. It is the source of truth for continuing the project on another machine or with another agent.

## What this is

A **standup picker game**: a team swims in an ocean, dodges laser-eyed sharks, and the **last player still swimming runs the next standup**.

**End goal:** host it at a public URL so each person plays from their own browser, **in the same shared ocean at the same time**, live-synced. One room, one simulation, everyone sees the same sharks.

**Current state:** a self-contained **local single-player** HTML build used to prove gameplay, art, and difficulty. The code is already split so multiplayer is a Transport swap, not a rewrite.

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
| Stack | Vanilla JS + Canvas. No build step. Offline `file://` must still work for the local build. |

## How to run (today)

- Open `index.html` in a browser (double-click or any static server).
- **Party:** first name in the list is the human (↑/↓ or W/S). Other names + practice bots are AI. Last one swimming wins.
- **Solo survival:** you swim alone until death. HUD shows `Size tier`, `tempo xN`, `sharks K`. Result is survival time. Use this to test the difficulty curve.

A static server is optional. Last used: `python -m http.server 8912 --bind 127.0.0.1` from this folder → `http://127.0.0.1:8912/index.html`.

Git is initialized locally. There is **no remote** and **no `package.json`** yet. Do not commit unless the user asks.

## Repo layout

| File | Role |
|---|---|
| `index.html` | **Latest playable build.** Entire game: CSS, setup UI, `Sim`, `Render`, `Input`, `LocalTransport`, main loop. |
| `index-v1.html` | Snapshot: weaving sharks + fast difficulty ramp. No targeting. |
| `index-v2.html` | Snapshot: targeting on entry + full vertical range (no safe corners). |
| `README.md` | Player-facing + architecture overview. Slightly stale vs this file on polish details. |
| `handoff.md` | This file. Agent-facing. Prefer this over README when continuing work. |

`CFG` (all tunables) is near the top of the `<script>` in `index.html`.

## Architecture (the multiplayer seam)

Four layers inside one IIFE. Keep the boundary sacred.

```
Input  →  Transport  →  Sim        (Sim advances the world)
Render ←  Transport  ←  Sim        (Render draws a snapshot only)
```

- **Sim** — pure. `Sim.createState(config)` and `Sim.step(state, humanInputs, dt)`. No DOM, no canvas, no `Date.now()` inside `step`. RNG is seeded `mulberry32` (`makeRng(seed)`). Same seed + same inputs = same game on any JS engine.
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

- Object shorthand cannot be `y - 4`. Use `y: y - 4`. A syntax error here silently breaks the whole IIFE (setup names stay empty, Start does nothing).
- Background / unfocused tabs throttle `requestAnimationFrame`. Playtest in a focused window. “Skip to result” runs the sim synchronously and is good for catching JS errors.
- `_seabed` is cached on `Render`. Reload the page after changing `_buildSeabed`.
- `createState` uses `Date.now()` **only** as a default seed when none is passed. For multiplayer the **server must pick the seed** and send it in `config`.

## Phase 2 — online multiplayer (not built)

This is the next real feature. Goal: each player opens a hosted URL, types a name, joins a room, and all swim in **one authoritative ocean**.

### Recommended build order

1. **Extract `sim.js`** (UMD / dual export) containing `CFG` (or a shared subset), `makeRng`, `Sim`, `PLAYER_COLORS`. Load in the browser via `<script>` and in Node via `require`/`module.exports`. Do not put DOM or canvas in this file.
2. **`server.js`** — Node + [`ws`](https://github.com/websockets/ws):
   - Rooms: host creates a room (short code) → others join by URL/`?room=XXXX` + name.
   - Lobby → countdown → `Sim.createState({ players, seed, mode: "party" })` on the server.
   - Fixed tick (`CFG.fixedDt`). Collect latest `{ up, down }` per `playerId`. `Sim.step`. Broadcast snapshot (or a slim snapshot) to all clients.
   - When `state.status === "over"`, broadcast winner and freeze.
3. **`WebSocketTransport`** — same interface as `LocalTransport`. `sendInput` sends intent to the server. Incoming snapshots become `snapshot()`. Main loop and Render stay as-is. **Server-authoritative, no prediction at first.** Add interpolation only if lag is obvious.
4. **Client lobby UI** — replace/extend the setup screen: name, room code, player list, “ready”, host Start. Keep Party win copy (“they run the next standup”). Solo mode can stay local-only.
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

## Suggested next work (priority)

1. User-facing art check: bite mouth, starfish-on-sand, single chest. Iterate only if they still dislike it.
2. Then **Phase 2 multiplayer** as above. Do not add a finish line, homing sharks, or a second game mode unless asked.
3. Optional later: `localStorage` best time for Solo; interpolate remote snapshots; host-kicks / reconnect.

## Agent conventions for this user

- Prefer small, targeted edits. Match existing style (vanilla IIFE, `CFG` knobs, no framework).
- Save a snapshot (`index-vN.html`) before large gameplay changes if the user asks to “save a copy”.
- Verify UI in a browser when possible. A single screenshot is not enough for gameplay — click through setup → start → result.
- Do not commit or push unless explicitly asked.
- Do not edit the plan file from the original Cursor plan session.

## Quick map of the script in `index.html`

Search these identifiers:

- `CFG` — tunables
- `Sim` — `createState`, `step`, `_spawnShark`, `_botIntent`, `_resolveWinner`
- `Render` — `drawSharkSprite`, `drawSharkLaser`, `drawPlayer`, `drawSeabed`, `drawState`
- `Input` — key map
- `LocalTransport` — in-tab sim
- `startGame` / `loop` / `endGame` — glue + Party vs Solo result copy
