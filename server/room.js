// One multiplayer Room. Owns the authoritative Sim state for a single
// online round and broadcasts snapshots to connected players.
//
// Boundary: this file talks to `Sim` and nothing else about the game. It
// receives websockets from server/index.js but only uses `ws.send` and
// `ws.readyState` - it doesn't parse messages or open sockets.
import { Sim, CFG, PLAYER_COLORS } from '../src/sim.js';

// Every Nth sim tick a snapshot goes out. 60 Hz / 3 = 20 Hz broadcasts.
const BROADCAST_EVERY = 3;

// After the round ends we keep the room around briefly so late "over"
// messages get through and clients can see the result overlay before we
// close the room out.
const OVER_LINGER_MS = 4000;

let __seedCounter = Date.now() >>> 0;
function nextSeed() {
  __seedCounter = (__seedCounter + 0x9e3779b9) >>> 0;   // golden-ratio hash spread
  return __seedCounter;
}

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;    // callback so server/index.js can free the code
    this.players = [];         // [{ id, name, color, ws, intent, isBot: false }]
    this.hostId = null;
    this.state = null;         // Sim state, populated after start()
    this.tickInterval = null;
    this.overTimeout = null;
    this.tickCount = 0;
    this.nextPlayerId = 0;
    this.status = "lobby";     // "lobby" | "playing" | "over"
  }

  // ---- lifecycle ----
  addPlayer(ws, name) {
    if (this.status !== "lobby") {
      Room._send(ws, { type: "error", msg: "round already started" });
      return null;
    }
    const id = this.nextPlayerId++;
    const color = PLAYER_COLORS[id % PLAYER_COLORS.length];
    const player = { id, name: String(name || "Diver"), color, ws, intent: { up: false, down: false } };
    this.players.push(player);
    if (this.hostId == null) this.hostId = id;
    this.broadcastLobby();
    return player;
  }

  removePlayerByWs(ws) {
    const i = this.players.findIndex((p) => p.ws === ws);
    if (i < 0) return;
    const leaving = this.players[i];
    const wasHost = leaving.id === this.hostId;
    this.players.splice(i, 1);
    if (this.players.length === 0) {
      this._shutdown();
      return;
    }
    if (wasHost) this.hostId = this.players[0].id;
    // If a round is in progress, mark the departed player dead in the sim so
    // they don't block the win condition for the swimmers still present.
    if (this.state && this.state.status === "playing") {
      const dead = this.state.players.find((p) => p.id === leaving.id);
      if (dead && dead.alive) Sim._kill(this.state, dead, "left", dead.x, dead.y);
    }
    this.broadcastLobby();
  }

  // ---- inputs + tick ----
  applyInput(ws, intent) {
    const p = this.players.find((x) => x.ws === ws);
    if (!p) return;
    p.intent = { up: !!intent.up, down: !!intent.down };
  }

  // ---- start / stop ----
  start(config, requestingWs) {
    if (this.status !== "lobby") return;
    const requester = this.players.find((p) => p.ws === requestingWs);
    if (!requester || requester.id !== this.hostId) return;   // host only

    // Build the sim's player roster from the connected clients so their ids
    // and colours match what the lobby has been showing.
    const simPlayers = this.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, isBot: false
    }));
    // Fill bots if the host asked for practice bots (party mode only).
    if ((config.mode || "party") === "party" && (config.botCount | 0) > 0) {
      const bots = Math.min(config.botCount | 0, 10);
      for (let i = 0; i < bots; i++) {
        const id = this.nextPlayerId++;
        simPlayers.push({ id, name: `Bot ${i + 1}`, color: PLAYER_COLORS[id % PLAYER_COLORS.length], isBot: true });
      }
    }

    const seed = nextSeed();
    this.state = Sim.createState({
      seed,
      mode: config.mode || "party",
      hazards: config.hazards || "all",
      difficulty: config.difficulty || "medium",
      lives: config.lives || 1,
      players: simPlayers
    });
    this.status = "playing";
    this.tickCount = 0;

    // Send a "start" so clients switch out of the lobby and know their config
    // (including the seed - lets any client-side deterministic effects match).
    this.broadcast({
      type: "start",
      config: {
        seed, mode: this.state.mode, hazards: this.state.hazards,
        difficulty: this.state.difficulty, lives: this.state.initialLives,
        hostId: this.hostId,
        players: simPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color, isBot: p.isBot }))
      }
    });

    // Start the fixed-timestep loop.
    const dt = CFG.fixedDt;
    this.tickInterval = setInterval(() => this._tick(dt), dt * 1000);
  }

  _tick(dt) {
    if (!this.state || this.status !== "playing") return;
    // Build inputs map (playerId -> {up, down}) from every connected human.
    const inputs = {};
    for (const p of this.players) inputs[p.id] = p.intent;
    Sim.step(this.state, inputs, dt);
    this.tickCount++;

    if (this.tickCount % BROADCAST_EVERY === 0) {
      this.broadcast({ type: "state", state: Sim.snapshotForWire(this.state) });
    }

    if (this.state.status === "over") {
      this.status = "over";
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      // Final snapshot so everyone sees the exact end state.
      this.broadcast({ type: "state", state: Sim.snapshotForWire(this.state) });
      this.broadcast({ type: "over", winnerId: this.state.winnerId });
      // Free the room after a short linger so late joiners don't grab this code.
      this.overTimeout = setTimeout(() => this._shutdown(), OVER_LINGER_MS);
    }
  }

  _shutdown() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.overTimeout)  { clearTimeout(this.overTimeout);   this.overTimeout = null; }
    if (this.onEmpty) this.onEmpty(this.code);
  }

  // ---- outbound ----
  broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const p of this.players) Room._sendRaw(p.ws, payload);
  }
  broadcastLobby() {
    this.broadcast({
      type: "lobby",
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color }))
    });
    // Also let each client know its OWN id.
    for (const p of this.players) {
      Room._send(p.ws, { type: "you", id: p.id });
    }
  }

  // ---- utility ----
  static _send(ws, msg) { Room._sendRaw(ws, JSON.stringify(msg)); }
  static _sendRaw(ws, payload) {
    // ws.OPEN === 1, but avoid importing ws in a pure-logic file so this
    // works in tests with a mock ws that just needs a `send` method.
    if (ws && (ws.readyState == null || ws.readyState === 1)) {
      try { ws.send(payload); } catch (_e) { /* client already gone */ }
    }
  }
}
