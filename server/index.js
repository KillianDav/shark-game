// standup-shark multiplayer server.
// One Node process:
//   - Serves the static client files (index.html + src/*.js) on port 8080.
//   - Accepts WebSocket connections at /ws, routes them into Rooms.
//   - /health -> 200 OK for Fly's health check.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Room } from "./room.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const PORT       = Number(process.env.PORT || 8080);

// ---- room registry ---------------------------------------------------------
/** @type {Map<string, Room>} */
const rooms = new Map();
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // no I/O to reduce confusion
function makeCode() {
  for (let attempts = 0; attempts < 100; attempts++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_LETTERS[(Math.random() * CODE_LETTERS.length) | 0];
    if (!rooms.has(c)) return c;
  }
  throw new Error("could not allocate a room code");
}
function releaseRoom(code) { rooms.delete(code); }

// ---- static file server ----------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon"
};
// Whitelist of directories we're willing to serve. Everything else is 404.
const SAFE_DIRS = ["src", "history"];
function resolveSafe(reqPath) {
  const clean = reqPath === "/" ? "/index.html" : reqPath;
  const decoded = decodeURIComponent(clean).replace(/^\/+/, "");
  const abs = path.resolve(ROOT, decoded);
  if (abs !== path.resolve(ROOT, "index.html") &&
      !SAFE_DIRS.some((d) => abs.startsWith(path.resolve(ROOT, d) + path.sep))) {
    return null;
  }
  return abs;
}
function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") { res.writeHead(200); res.end("ok"); return; }
  const abs = resolveSafe(url.pathname);
  if (!abs) { res.writeHead(404); res.end("not found"); return; }
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const type = MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(data);
  });
}

// ---- HTTP + WS wiring ------------------------------------------------------
const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  let boundRoom = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { send(ws, { type: "error", msg: "bad json" }); return; }
    if (!msg || typeof msg.type !== "string") { send(ws, { type: "error", msg: "no type" }); return; }

    switch (msg.type) {
      case "create": {
        if (boundRoom) { send(ws, { type: "error", msg: "already in a room" }); break; }
        const code = makeCode();
        const room = new Room(code, releaseRoom);
        rooms.set(code, room);
        const p = room.addPlayer(ws, msg.name);
        if (p) boundRoom = room;
        break;
      }
      case "join": {
        if (boundRoom) { send(ws, { type: "error", msg: "already in a room" }); break; }
        const code = String(msg.code || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(ws, { type: "error", msg: "room not found: " + code }); break; }
        const p = room.addPlayer(ws, msg.name);
        if (p) boundRoom = room;
        break;
      }
      case "start": {
        if (!boundRoom) { send(ws, { type: "error", msg: "not in a room" }); break; }
        boundRoom.start(msg.config || {}, ws);
        break;
      }
      case "input": {
        if (!boundRoom) break;
        boundRoom.applyInput(ws, msg);
        break;
      }
      case "leave": {
        if (boundRoom) { boundRoom.removePlayerByWs(ws); boundRoom = null; }
        break;
      }
      default:
        send(ws, { type: "error", msg: "unknown type: " + msg.type });
    }
  });

  ws.on("close", () => {
    if (boundRoom) { boundRoom.removePlayerByWs(ws); boundRoom = null; }
  });

  ws.on("error", () => { /* clients drop; nothing to log noisily */ });
});

function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ } }

server.listen(PORT, () => {
  console.log(`standup-shark server: http+ws on 0.0.0.0:${PORT}`);
  console.log(`  static root: ${ROOT}`);
  console.log(`  websocket path: /ws`);
});
