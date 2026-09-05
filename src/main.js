/* ============================================================================
 * Standup Shark - client entry point.
 *
 * ARCHITECTURE (see handoff.md "Phase 2" for the multiplayer swap):
 *   Sim        - pure game logic. No DOM/canvas. Deterministic given a seed.
 *                createState(config) and step(state, humanInputs, dt).
 *   Render     - reads a state snapshot and draws it.
 *   Input      - maps arrow keys to {up, down} intents.
 *   Transport  - the ONLY seam that changes for multiplayer. LocalTransport
 *                runs the Sim in this tab. A future WebSocketTransport would
 *                send inputs to a server running the same Sim and receive
 *                authoritative snapshots.
 *   main       - glue: gather input -> transport -> render, fixed timestep.
 * ==========================================================================*/
// standup-shark Main: DOM wiring + fixed-timestep game loop.
// Gathers input, drives the transport, hands snapshots to Render.
import { CFG, PLAYER_COLORS, Sim, clamp } from './sim.js';
import { Render } from './render.js';
import { Input } from './input.js';
import { LocalTransport } from './transport-local.js';
import { WebSocketTransport } from './transport-websocket.js';

const DEFAULT_NAMES = ["Ahmed", "Ben", "Chris", "Dana", "Eve"];

const els = {
  names: document.getElementById("names"),
  botCount: document.getElementById("botCount"),
  livesCount: document.getElementById("livesCount"),
  stingraysToggle: document.getElementById("stingraysToggle"),
  startBtn: document.getElementById("startBtn"),
  resetNamesBtn: document.getElementById("resetNamesBtn"),
  setup: document.getElementById("setup"),
  stage: document.getElementById("stage"),
  canvas: document.getElementById("game"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  resultLead: document.getElementById("resultLead"),
  winnerName: document.getElementById("winnerName"),
  winnerTag: document.getElementById("winnerTag"),
  swatch: document.getElementById("swatch"),
  againBtn: document.getElementById("againBtn"),
  editBtn: document.getElementById("editBtn"),
  fsBtn: document.getElementById("fsBtn"),
  skipBtn: document.getElementById("skipBtn"),
  // Online lobby
  onlineSetup: document.getElementById("onlineSetup"),
  onlineChoose: document.getElementById("onlineChoose"),
  onlineLobby: document.getElementById("onlineLobby"),
  onlineName: document.getElementById("onlineName"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  joinCodeInput: document.getElementById("joinCodeInput"),
  onlineError: document.getElementById("onlineError"),
  roomCodeBadge: document.getElementById("roomCodeBadge"),
  roomRoster: document.getElementById("roomRoster"),
  onlineStartBtn: document.getElementById("onlineStartBtn"),
  onlineStartHint: document.getElementById("onlineStartHint"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn")
};
const ctx = els.canvas.getContext("2d");

const game = {
  transport: null,
  localPlayerId: 0,
  running: false,
  acc: 0,
  last: 0,
  raf: 0,
  lastConfig: null
};

function parseNames() {
  const raw = els.names.value.split("\n").map((s) => s.trim()).filter(Boolean);
  return raw.length ? raw : DEFAULT_NAMES.slice();
}

function buildPlayers(names, botCount, mode) {
  const players = [];
  // human is always the first entry
  players.push({ id: 0, name: names[0] || "You", color: PLAYER_COLORS[0], isBot: false });
  if (mode === "solo") return players;   // solo: just you, play until you die
  // remaining team names become bots
  let idx = 1;
  for (let i = 1; i < names.length; i++) {
    players.push({ id: idx, name: names[i], color: PLAYER_COLORS[idx % PLAYER_COLORS.length], isBot: true });
    idx++;
  }
  // pad with extra practice bots if requested beyond the roster
  const extra = clamp(botCount - (names.length - 1), 0, 12);
  const botNames = ["Fin", "Gill", "Reef", "Coral", "Kelp", "Wave", "Splash", "Bubbles", "Marlin", "Nemo", "Pearl", "Sandy"];
  for (let i = 0; i < extra; i++) {
    players.push({ id: idx, name: botNames[i % botNames.length], color: PLAYER_COLORS[idx % PLAYER_COLORS.length], isBot: true });
    idx++;
  }
  return players;
}

function currentMode() {
  const sel = document.querySelector('input[name="mode"]:checked');
  return sel ? sel.value : "party";
}

function currentDifficulty() {
  const sel = document.querySelector('input[name="difficulty"]:checked');
  return sel ? sel.value : "medium";
}

function currentPlayMode() {
  const sel = document.querySelector('input[name="playMode"]:checked');
  return sel ? sel.value : "local";
}

// URL of the multiplayer server. Same host as the page in the deployed case;
// override with ?server=ws://localhost:8080/ws for local dev of a client
// against a remote server. Defaults to the page's own origin's /ws.
function defaultServerUrl() {
  const override = new URLSearchParams(location.search).get("server");
  if (override) return override;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws`;
}

// Room roster rendering + host-only Start visibility.
function renderRoomLobby(info) {
  els.roomCodeBadge.textContent = info.code || "----";
  els.roomRoster.innerHTML = "";
  for (const p of (info.players || [])) {
    const li = document.createElement("li");
    li.style.cssText = "display:flex; align-items:center; gap:6px; background:#071829; border:1px solid #1c3a5c; border-radius:8px; padding:4px 10px;";
    const sw = document.createElement("span");
    sw.style.cssText = `width:12px; height:12px; border-radius:3px; background:${p.color};`;
    const name = document.createElement("span");
    name.textContent = p.name + (p.id === info.hostId ? "  (host)" : "") + (p.id === info.youId ? "  ← you" : "");
    li.appendChild(sw); li.appendChild(name);
    els.roomRoster.appendChild(li);
  }
  const isHost = info.youId != null && info.youId === info.hostId;
  els.onlineStartBtn.style.display = isHost ? "" : "none";
  els.onlineStartHint.textContent = isHost
    ? "You are the host - click Start when everyone's in."
    : "Waiting for host to start...";
  els.onlineChoose.style.display = "none";
  els.onlineLobby.style.display = "flex";
}

function commonRoundConfig() {
  return {
    hazards: (els.stingraysToggle && els.stingraysToggle.checked) ? "all" : "sharks-only",
    lives: clamp(parseInt(els.livesCount.value, 10) || 1, 1, 9),
    difficulty: currentDifficulty()
  };
}

// Local single-player / party round: LocalTransport, config built here.
function startLocalGame() {
  const mode = currentMode();
  const names = parseNames();
  const botCount = clamp(parseInt(els.botCount.value, 10) || 0, 0, 10);
  const players = buildPlayers(names, botCount, mode);
  const config = { ...commonRoundConfig(), players, mode, seed: (Date.now() & 0xffffffff) };
  game.lastConfig = { names, botCount };

  game.transport = LocalTransport();
  game.transport.start(config);
  game.localPlayerId = 0;

  enterStage(mode === "solo"
    ? "Solo survival - stay alive as long as you can!"
    : "Swim! Dodge with the arrow keys.");
}

// Host clicked Start in the online lobby. Tell the server what config to run.
function startOnlineGame() {
  if (!game.transport || typeof game.transport.createRoom !== "function") return;
  const cfg = { ...commonRoundConfig(), mode: "party" };
  game.transport.start(cfg);
  // Everyone (including the host) transitions to the stage on the server's
  // 'start' broadcast; see the WebSocketTransport onStart handler.
}

function enterStage(statusText) {
  els.setup.style.display = "none";
  els.stage.classList.add("active");
  els.result.classList.remove("show");
  els.status.textContent = statusText;
  Input.reset();
  Input.attach();
  game.running = true;
  game.acc = 0;
  game.last = performance.now();
  cancelAnimationFrame(game.raf);
  game.raf = requestAnimationFrame(loop);
}

function loop(now) {
  if (!game.running) return;
  const dt = Math.min((now - game.last) / 1000, 0.1);
  game.last = now;
  game.acc += dt;

  // feed local input to the transport once per frame
  game.transport.sendInput(game.localPlayerId, Input.intent());

  // fixed-timestep simulation (deterministic + network-friendly).
  // For WebSocketTransport, tick() is a no-op - the server ticks the sim
  // and this client just renders whatever snapshot arrived most recently.
  let steps = 0;
  while (game.acc >= CFG.fixedDt && steps < 6) {
    game.transport.tick(CFG.fixedDt);
    game.acc -= CFG.fixedDt;
    steps++;
  }

  const state = game.transport.snapshot();
  if (state) Render.drawState(ctx, state);   // online: first snapshot may not have arrived yet

  if (game.transport.isOver()) { if (state) endGame(state); return; }
  game.raf = requestAnimationFrame(loop);
}

function endGame(state) {
  game.running = false;
  Input.detach();
  cancelAnimationFrame(game.raf);

  const winner = state.players.find((p) => p.id === state.winnerId);
  els.status.textContent = "Round over.";
  if (state.mode === "solo") {
    const survived = (winner && winner.deathT != null ? winner.deathT : state.t);
    const tier = Math.floor(survived / CFG.shark.tierSeconds) + 1;
    const spd = Sim._speedMul(state, survived).toFixed(2);
    const how = winner && winner.deathKind === "laser" ? "lasered"
              : winner && winner.deathKind === "stung" ? "stung by a ray"
              : winner && winner.deathKind === "octopus" ? "zapped by a blue-ring"
              : winner && winner.deathKind === "lionfish" ? "spiked by a lionfish"
              : winner && winner.deathKind === "electric" ? "shocked by an eel"
              : winner && winner.deathKind === "anchor" ? "anchored"
              : "eaten";
    els.resultLead.textContent = "You survived";
    els.swatch.style.display = "none";
    els.winnerName.textContent = `${survived.toFixed(1)}s`;
    els.winnerTag.textContent = `Got ${how} at size tier ${tier} (tempo x${spd}). Swim again to beat your time!`;
  } else if (winner) {
    els.swatch.style.display = "inline-block";
    els.resultLead.textContent = winner.alive
      ? "Last one swimming - dodged every shark:"
      : "Everyone got eaten, but the one who survived longest is:";
    els.winnerName.textContent = winner.name;
    els.swatch.style.background = winner.color;
    els.winnerTag.textContent = winner.isBot
      ? "(a bot won this time - the humans need practice!) They run the next standup."
      : "They run the next standup!";
  } else {
    els.resultLead.textContent = "No winner this round.";
    els.winnerName.textContent = "-";
  }
  els.result.classList.add("show");
}

function backToSetup() {
  game.running = false;
  Input.detach();
  cancelAnimationFrame(game.raf);
  els.result.classList.remove("show");
  els.stage.classList.remove("active");
  els.setup.style.display = "flex";
}

// --- wire up UI ---
els.startBtn.addEventListener("click", startLocalGame);
els.againBtn.addEventListener("click", () => {
  // Local: build a fresh round; Online: host asks the server for another round.
  if (currentPlayMode() === "online" && game.transport && typeof game.transport.createRoom === "function") {
    // Return to the online lobby so the host can Start again.
    els.result.classList.remove("show");
    els.stage.classList.remove("active");
    els.setup.style.display = "flex";
    return;
  }
  startLocalGame();
});
els.editBtn.addEventListener("click", backToSetup);
els.resetNamesBtn.addEventListener("click", () => { els.names.value = DEFAULT_NAMES.join("\n"); });
els.skipBtn.addEventListener("click", () => {
  if (!game.running || !game.transport) return;
  // Online rounds are server-authoritative - can't fast-forward locally.
  if (typeof game.transport.createRoom === "function") return;
  const state = game.transport.snapshot();
  let guard = 0;
  while (state.status !== "over" && guard < 60 * 90) { Sim.step(state, {}, CFG.fixedDt); guard++; }
  Render.drawState(ctx, state);
  endGame(state);
});
els.fsBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) els.stage.requestFullscreen && els.stage.requestFullscreen();
  else document.exitFullscreen && document.exitFullscreen();
});

// Solo mode ignores the roster/bots - grey out the bot count when selected.
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
  const solo = currentMode() === "solo";
  els.botCount.disabled = solo;
  els.botCount.style.opacity = solo ? 0.4 : 1;
}));

// Local vs Online: toggle visibility of the two sub-panels within setup.
function applyPlayMode() {
  const online = currentPlayMode() === "online";
  document.querySelectorAll('[data-when="local"]').forEach((el) => {
    el.style.display = online ? "none" : "";
  });
  els.onlineSetup.style.display = online ? "flex" : "none";
}
document.querySelectorAll('input[name="playMode"]').forEach((r) => r.addEventListener("change", applyPlayMode));
applyPlayMode();

// --- online lobby wiring ------------------------------------------------------
function ensureOnlineTransport() {
  if (game.transport && typeof game.transport.createRoom === "function") return game.transport;
  const t = WebSocketTransport(defaultServerUrl(), {
    onLobby: (info) => { renderRoomLobby(info); els.onlineError.textContent = ""; },
    onStart: (_cfg) => { enterStage("Online round - swim!"); },
    onOver:  (_r)   => { /* loop's isOver() check will surface endGame */ },
    onError: (e)    => { els.onlineError.textContent = e.msg || "connection error"; }
  });
  game.transport = t;
  return t;
}

function pickName() {
  const raw = (els.onlineName.value || "").trim();
  if (raw) return raw.slice(0, 20);
  const guess = parseNames()[0] || "Diver";
  els.onlineName.value = guess;
  return guess;
}

els.createRoomBtn.addEventListener("click", () => {
  ensureOnlineTransport().createRoom(pickName());
});
els.joinRoomBtn.addEventListener("click", () => {
  const code = (els.joinCodeInput.value || "").toUpperCase().trim();
  if (code.length !== 4) { els.onlineError.textContent = "Codes are 4 letters."; return; }
  ensureOnlineTransport().joinRoom(pickName(), code);
});
els.joinCodeInput.addEventListener("input", () => {
  els.joinCodeInput.value = els.joinCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});
els.onlineStartBtn.addEventListener("click", startOnlineGame);
els.leaveRoomBtn.addEventListener("click", () => {
  if (game.transport && typeof game.transport.leaveRoom === "function") {
    try { game.transport.leaveRoom(); game.transport.close(); } catch (_e) {}
  }
  game.transport = null;
  els.onlineLobby.style.display = "none";
  els.onlineChoose.style.display = "";
  els.onlineError.textContent = "";
});

// seed default names
els.names.value = DEFAULT_NAMES.join("\n");

// draw an idle frame so the canvas isn't blank if opened directly
Render.drawState(ctx, { world: CFG.world, frame: 0, t: 0, players: [], sharks: [] });
