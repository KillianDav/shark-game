// standup-shark WebSocketTransport: same interface as LocalTransport, but the
// authoritative Sim runs on the SERVER. This transport:
//   - opens a websocket to the multiplayer server
//   - provides create/join room helpers
//   - relays local player input to the server every frame (via sendInput)
//   - stores the latest broadcast snapshot; snapshot() returns it
//   - fires callbacks (onLobby / onStart / onOver / onError) so main.js can
//     drive the lobby UI, transition into gameplay, and show results
//
// The game loop in main.js never has to know it's talking to the server
// instead of a local Sim - the LocalTransport-shaped interface (start /
// sendInput / tick / snapshot / isOver) is unchanged.

import { Sim } from './sim.js';

export function WebSocketTransport(url, handlers = {}) {
  const ws = new WebSocket(url);
  let latestState = null;
  let over = false;
  let localPlayerId = null;
  let roomCode = null;
  let hostId = null;
  let players = [];         // lobby roster (id/name/color)
  let startConfig = null;   // what the server sent in the `start` message

  ws.addEventListener("open", () => {
    if (handlers.onOpen) handlers.onOpen();
  });

  ws.addEventListener("close", () => {
    if (handlers.onClose) handlers.onClose();
  });

  ws.addEventListener("error", () => {
    if (handlers.onError) handlers.onError({ msg: "websocket error" });
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "you":
        localPlayerId = msg.id;
        break;
      case "lobby":
        roomCode = msg.code;
        hostId = msg.hostId;
        players = msg.players || [];
        if (handlers.onLobby) handlers.onLobby({ code: roomCode, hostId, youId: localPlayerId, players });
        break;
      case "start":
        startConfig = msg.config;
        over = false;
        latestState = null;
        if (handlers.onStart) handlers.onStart(startConfig);
        break;
      case "state":
        // Rehydrate the `.diff` field that snapshotForWire scrubbed - Render
        // reads it for HUD + scroll speed.
        latestState = Sim.hydrateWireSnapshot(msg.state);
        break;
      case "over":
        over = true;
        if (handlers.onOver) handlers.onOver({ winnerId: msg.winnerId, state: latestState });
        break;
      case "error":
        if (handlers.onError) handlers.onError({ msg: msg.msg });
        break;
    }
  });

  function send(msg) {
    if (ws.readyState !== 1) return;   // 1 = OPEN
    ws.send(JSON.stringify(msg));
  }

  return {
    // ---- LocalTransport-shaped interface (used by main.js game loop) ----
    // The server picks the seed + starts the Sim in response to our `start`
    // message, so start(config) here just sends the request. onStart fires
    // when the server confirms and the round begins.
    start(config) { send({ type: "start", config }); },
    // Server knows our id from the websocket; playerId arg is ignored.
    sendInput(_playerId, intent) { send({ type: "input", up: !!intent.up, down: !!intent.down }); },
    // No local ticking - the server ticks the authoritative Sim.
    tick(_dt) { /* no-op */ },
    // Latest snapshot the server broadcast to us.
    snapshot() { return latestState; },
    isOver()   { return over; },

    // ---- online-only helpers used by the lobby UI ----
    createRoom(name)      { send({ type: "create", name }); },
    joinRoom(name, code)  { send({ type: "join",   name, code: String(code || "").toUpperCase() }); },
    leaveRoom()           { send({ type: "leave" }); },
    close()               { try { ws.close(); } catch { /* ignore */ } },

    // ---- read-only accessors ----
    get localPlayerId() { return localPlayerId; },
    get roomCode()      { return roomCode; },
    get hostId()        { return hostId; },
    get players()       { return players; },
    get isHost()        { return localPlayerId != null && localPlayerId === hostId; },
    get startConfig()   { return startConfig; }
  };
}
