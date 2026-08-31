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
  skipBtn: document.getElementById("skipBtn")
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

function startGame() {
  const mode = currentMode();
  const names = parseNames();
  const botCount = clamp(parseInt(els.botCount.value, 10) || 0, 0, 10);
  const players = buildPlayers(names, botCount, mode);
  const hazards = els.stingraysToggle && els.stingraysToggle.checked ? "all" : "sharks-only";
  const lives = clamp(parseInt(els.livesCount.value, 10) || 1, 1, 9);
  const config = { players, mode, hazards, lives, seed: (Date.now() & 0xffffffff) };
  game.lastConfig = { names, botCount };

  game.transport = LocalTransport();
  game.transport.start(config);
  game.localPlayerId = 0;

  els.setup.style.display = "none";
  els.stage.classList.add("active");
  els.result.classList.remove("show");
  els.status.textContent = mode === "solo"
    ? "Solo survival - stay alive as long as you can!"
    : "Swim! Dodge with the arrow keys.";

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

  // fixed-timestep simulation (deterministic + network-friendly)
  let steps = 0;
  while (game.acc >= CFG.fixedDt && steps < 6) {
    game.transport.tick(CFG.fixedDt);
    game.acc -= CFG.fixedDt;
    steps++;
  }

  const state = game.transport.snapshot();
  Render.drawState(ctx, state);

  if (game.transport.isOver()) { endGame(state); return; }
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
    const spd = Sim._speedMul(survived).toFixed(2);
    const how = winner && winner.deathKind === "laser" ? "lasered"
              : winner && winner.deathKind === "stung" ? "stung by a ray"
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
els.startBtn.addEventListener("click", startGame);
els.againBtn.addEventListener("click", startGame);
els.editBtn.addEventListener("click", backToSetup);
els.resetNamesBtn.addEventListener("click", () => { els.names.value = DEFAULT_NAMES.join("\n"); });
els.skipBtn.addEventListener("click", () => {
  if (!game.running || !game.transport) return;
  // fast-forward the simulation to a conclusion
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

// seed default names
els.names.value = DEFAULT_NAMES.join("\n");

// draw an idle frame so the canvas isn't blank if opened directly
Render.drawState(ctx, { world: CFG.world, frame: 0, t: 0, players: [], sharks: [] });
