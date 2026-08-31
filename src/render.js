// standup-shark Render: canvas 2D drawing. Reads state snapshots, never mutates them.
import { CFG, Sim, clamp, lerp, makeRng } from './sim.js';

export const Render = {
  // Sample the ocean background gradient at world y so the mouth interior
  // (and anywhere else we cut into the fish) matches the water behind it.
  // Gradient stops mirror drawState: top #0a3352, mid #083049, bottom #04202f.
  _waterColorAt(y) {
    const H = CFG.world.h;
    const yy = clamp(y, 0, H);
    const t = yy / H;
    const top = [10, 51, 82], mid = [8, 48, 73], bot = [4, 32, 47];
    let r, g, b;
    if (t <= 0.5) {
      const k = t / 0.5;
      r = top[0] + (mid[0] - top[0]) * k;
      g = top[1] + (mid[1] - top[1]) * k;
      b = top[2] + (mid[2] - top[2]) * k;
    } else {
      const k = (t - 0.5) / 0.5;
      r = mid[0] + (bot[0] - mid[0]) * k;
      g = mid[1] + (bot[1] - mid[1]) * k;
      b = mid[2] + (bot[2] - mid[2]) * k;
    }
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
  },

  // --- shark art ported from the reference lemmings game -----------------
  drawSharkSprite(ctx, sx, sy, opts) {
    opts = opts || {};
    let angle = opts.angle != null ? opts.angle : 0;
    const tailWave = opts.tailWave || 0;
    const tailPropel = opts.tailPropel || 0;
    const open = opts.open || 0;
    const laserEyes = opts.laserEyes || false;

    const scale = opts.scale || 1.5;
    let flipX = false;
    if (Math.abs(Math.sin(angle)) < 0.45) { flipX = Math.cos(angle) < 0; angle = 0; }

    ctx.save();
    ctx.translate(sx, sy);
    if (flipX) ctx.scale(-1, 1);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const tailAng = Math.sin(tailWave) * (0.28 + tailPropel * 0.42);
    ctx.save();
    ctx.translate(-28, 0);
    ctx.rotate(tailAng);
    ctx.fillStyle = "#36444e";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -11); ctx.lineTo(-14, 11); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#4a5a66";
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#5d6e7a"; ctx.beginPath(); ctx.ellipse(0, -2, 22, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3e4d57";
    ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(14, 13); ctx.lineTo(-2, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#36444e";
    ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(6, -20); ctx.lineTo(14, -7); ctx.closePath(); ctx.fill();

    if (laserEyes) {
      ctx.fillStyle = "#ff2222"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(13, -4, 3.2, 0, 7); ctx.arc(19, -4, 3.2, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.fillRect(12, -5, 2, 2); ctx.fillRect(18, -5, 2, 2);
    } else {
      ctx.fillStyle = "#0d141a"; ctx.beginPath(); ctx.arc(13, -3, 1.8, 0, 7); ctx.fill();
    }

    const snout = 22;
    if (open > 0.05) {
      // Mouth is carved INTO the body ellipse so the opening is the body,
      // not a separate graphic sitting on top of it.
      const g = 2.0 + open * 4.2;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 11, 0, 0, 7);
      ctx.clip();
      ctx.fillStyle = opts.waterFill || "#083049";
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.quadraticCurveTo(15, -g * 0.2, 25, -g);
      ctx.lineTo(27, -g);
      ctx.lineTo(27, g);
      ctx.quadraticCurveTo(15, g * 0.2, 7, 0);
      ctx.fill();
      // body-coloured lips along the split
      ctx.strokeStyle = "#4a5a66";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(8, -0.6);
      ctx.quadraticCurveTo(15, -g * 0.25, 24, -g);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, 0.6);
      ctx.quadraticCurveTo(15, g * 0.25, 24, g);
      ctx.stroke();
      // small teeth on the inner lip, clipped so they stay inside the body
      ctx.fillStyle = "#f2eee4";
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.45) / n;
        const fx = lerp(10, 21.5, t);
        const upY = lerp(-1.1, -g + 0.5, t);
        const loY = lerp(1.1, g - 0.5, t);
        const th = 1.5 + open * 1.1;
        ctx.beginPath(); ctx.moveTo(fx - 1.05, upY); ctx.lineTo(fx, upY + th); ctx.lineTo(fx + 1.05, upY); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx - 1.05, loY); ctx.lineTo(fx, loY - th); ctx.lineTo(fx + 1.05, loY); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = "#26323b"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(16, 2); ctx.lineTo(snout, 2); ctx.stroke();
    }
    ctx.restore();
  },

  drawSharkLaser(ctx, sh, frame) {
    const eye = Sim._eye(sh);
    const range = CFG.shark.laserRange;
    const x1 = eye.x - range, y1 = eye.y;   // beam fires leftward
    ctx.strokeStyle = "rgba(255,40,40,0.85)";
    ctx.lineWidth = 5; ctx.shadowColor = "#ff2222"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(eye.x, eye.y); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = "rgba(255,220,120,0.95)"; ctx.lineWidth = 2; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.moveTo(eye.x, eye.y); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff4444";
    ctx.beginPath(); ctx.arc(eye.x, eye.y, 3 + (frame % 6 === 0 ? 1 : 0), 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(eye.x - 1, eye.y - 1, 2, 2);
  },

  drawWindupCharge(ctx, sh, frame) {
    const eye = Sim._eye(sh);
    const pulse = 2 + Math.abs(Math.sin(frame * 0.4)) * 4;
    ctx.fillStyle = "rgba(255,60,60,0.35)"; ctx.shadowColor = "#ff2222"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(eye.x, eye.y, pulse, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  },

  drawPlayer(ctx, p, state) {
    const frame = state.frame;
    let alpha = 1, scale = 1, showBody = true, showName = true, vaporSparks = false;

    if (!p.alive) {
      const age = state.t - (p.deathT || 0);
      if (p.deathKind === "laser") {
        // Gentle flashing, then vaporise (shrink + fade to nothing).
        const dur = CFG.fx.vaporDur;
        if (age >= dur) return;                 // fully vaporised
        const t = age / dur;
        alpha = (0.55 + 0.45 * Math.sin(age * 34)) * (1 - t);  // flicker, fading out
        scale = 1 - t * 0.6;
        vaporSparks = true;
        showName = false;
      } else {
        // Eaten: quick shrink into the shark's jaws.
        const dur = CFG.fx.eatDur;
        if (age >= dur) return;
        const t = age / dur;
        alpha = 1 - t;
        scale = 1 - t * 0.8;
        showName = false;
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    const wob = Math.sin(frame * 0.3 + p.id) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + (p.alive ? wob : 0));
    ctx.scale(scale, scale);

    if (vaporSparks) {
      // faint rising motes as the swimmer dissolves
      ctx.fillStyle = "rgba(180,230,255,0.7)";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frame * 0.2;
        const r = 14 + (frame % 12);
        ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r - (frame % 20), 2, 2);
      }
    }

    // body (a little swimmer fish in the player's colour)
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-26, -9); ctx.lineTo(-26, 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.ellipse(2, 4, 12, 5, 0, 0, 7); ctx.fill();
    // eye (looking right, the way it swims)
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9, -3, 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#0b1522"; ctx.beginPath(); ctx.arc(10.5, -3, 2, 0, 7); ctx.fill();
    if (!p.alive) {
      ctx.strokeStyle = "#0b1522"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(12, -1); ctx.moveTo(12, -5); ctx.lineTo(7, -1); ctx.stroke();
    }
    ctx.restore();

    if (showName) {
      ctx.globalAlpha = 1;
      ctx.font = "bold 13px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(p.name, p.x, p.y - 22 + 1);
      ctx.fillStyle = p.alive ? "#eaf6ff" : "#9aa6c8";
      ctx.fillText(p.name, p.x, p.y - 22);
    }
    ctx.restore();
  },

  // Cartoon seabed props - generated once so they stay put.
  _seabed: null,
  _buildSeabed() {
    const W = CFG.world;
    const rng = makeRng(0x5eabed);
    const items = [];
    let x = 28;
    while (x < W.w - 20) {
      const roll = rng();
      const y = W.waterBottom + 2;
      if (roll < 0.48) {
        items.push({ kind: "kelp", x, y, h: 28 + rng() * 38, hue: rng(), phase: rng() * 6, stems: 2 + ((rng() * 3) | 0) });
        x += 36 + rng() * 40;
      } else if (roll < 0.64) {
        items.push({ kind: "coral", x, y, s: 0.7 + rng() * 0.7, tint: rng() });
        x += 40 + rng() * 30;
      } else if (roll < 0.80) {
        items.push({ kind: "rock", x, y, w: 14 + rng() * 18, h: 8 + rng() * 8 });
        x += 34 + rng() * 28;
      } else if (roll < 0.90) {
        items.push({ kind: "starfish", x, y: y - 1, s: 1.05 + rng() * 0.25, rot: rng() * 0.8, phase: rng() * 6 });
        x += 90 + rng() * 50;
      } else {
        items.push({ kind: "shell", x, y: y - 2, flip: rng() > 0.5 });
        x += 36 + rng() * 24;
      }
    }
    // One large chest, sitting on the sand - not a scatter of tiny ones.
    items.push({ kind: "chest", x: 980, y: W.waterBottom + 3, open: true });
    return items;
  },

  drawKelp(ctx, it, frame) {
    const wave = Math.sin(frame * 0.04 + it.phase);
    for (let s = 0; s < it.stems; s++) {
      const ox = (s - (it.stems - 1) / 2) * 6;
      ctx.strokeStyle = s % 2 ? "#2d8a5a" : "#1f6b46";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(it.x + ox, it.y);
      const segs = 5;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        ctx.lineTo(it.x + ox + Math.sin(wave + t * 1.6 + s) * (4 + t * 7), it.y - it.h * t);
      }
      ctx.stroke();
      ctx.fillStyle = s % 2 ? "#3cb372" : "#2a8f58";
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const lx = it.x + ox + Math.sin(wave + t * 1.6 + s) * (4 + t * 7);
        const ly = it.y - it.h * t;
        ctx.beginPath();
        ctx.ellipse(lx + (i % 2 ? 5 : -5), ly, 5, 2.2, i % 2 ? -0.6 : 0.6, 0, 7);
        ctx.fill();
      }
    }
  },

  drawCoral(ctx, it) {
    const warm = it.tint > 0.5;
    ctx.fillStyle = warm ? "#d45a6a" : "#c46b3a";
    const s = it.s;
    ctx.beginPath(); ctx.ellipse(it.x, it.y - 4 * s, 10 * s, 6 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(it.x - 8 * s, it.y - 14 * s, 5 * s, 12 * s, -0.25, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(it.x + 2 * s, it.y - 18 * s, 5 * s, 14 * s, 0.08, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(it.x + 9 * s, it.y - 12 * s, 4.5 * s, 11 * s, 0.35, 0, 7); ctx.fill();
    ctx.fillStyle = warm ? "#f08a96" : "#e08a4a";
    ctx.beginPath(); ctx.arc(it.x - 8 * s, it.y - 24 * s, 3.2 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(it.x + 2 * s, it.y - 30 * s, 3.4 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(it.x + 9 * s, it.y - 21 * s, 3 * s, 0, 7); ctx.fill();
  },

  drawRock(ctx, it) {
    ctx.fillStyle = "#2a3d4a";
    ctx.beginPath(); ctx.ellipse(it.x, it.y - it.h * 0.35, it.w * 0.55, it.h * 0.7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a5160";
    ctx.beginPath(); ctx.ellipse(it.x - 2, it.y - it.h * 0.55, it.w * 0.28, it.h * 0.28, 0, 0, 7); ctx.fill();
  },

  drawStarfish(ctx, it, frame) {
    ctx.save();
    ctx.translate(it.x, it.y + 3);
    // Squash hard on Y so it reads as lying flat on the sand, not standing up.
    ctx.scale(it.s * 1.45, it.s * 0.26);
    ctx.rotate(it.rot);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(2, 4, 15, 9, 0, 0, 7); ctx.fill();
    const twitch = it.phase != null ? Math.sin((frame || 0) * 0.03 + it.phase) * 0.04 : 0;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 10 + (i === 0 ? twitch : 0);
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = i % 2 ? "#e0783c" : "#c85a28";
      ctx.beginPath();
      ctx.moveTo(-3.6, -2);
      ctx.quadraticCurveTo(-4.4, -12, 0, -16);
      ctx.quadraticCurveTo(4.4, -12, 3.6, -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,210,150,0.5)";
      ctx.beginPath(); ctx.arc(0, -7, 1.15, 0, 7); ctx.arc(0, -11.5, 0.95, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#e88848";
    ctx.beginPath(); ctx.ellipse(0, 0, 6.8, 5.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#f2a66a";
    ctx.beginPath(); ctx.ellipse(-0.6, -0.4, 3.4, 2.7, 0, 0, 7); ctx.fill();
    ctx.restore();
  },

  drawChest(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(1.85, 1.85);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(0, 3, 24, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b3a16";
    ctx.beginPath();
    ctx.moveTo(-20, -14); ctx.lineTo(20, -14); ctx.lineTo(18, 4); ctx.lineTo(-18, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8a4e1e";
    ctx.fillRect(-20, -14, 40, 7);
    ctx.strokeStyle = "#4a2610"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-19, -7); ctx.lineTo(19, -7); ctx.stroke();
    ctx.fillStyle = "#d4b03a";
    ctx.fillRect(-21, -15, 5, 20);
    ctx.fillRect(16, -15, 5, 20);
    ctx.fillRect(-18, -4, 36, 3.5);
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(-5, -8, 10, 8);
    ctx.strokeStyle = "#8a7020"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -8, 3.4, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = "#2a1a08";
    ctx.beginPath(); ctx.arc(0, -4, 1.4, 0, 7); ctx.fill();
    if (it.open) {
      ctx.save();
      ctx.translate(-20, -14);
      ctx.rotate(-0.62);
      ctx.fillStyle = "#8a4e1e";
      ctx.fillRect(0, -10, 40, 10);
      ctx.fillStyle = "#d4b03a";
      ctx.fillRect(0, -10, 5, 10);
      ctx.fillRect(35, -10, 5, 10);
      ctx.restore();
      ctx.fillStyle = "#f4d44a";
      ctx.beginPath(); ctx.arc(-5, -20, 6, 0, 7); ctx.arc(3, -23, 5.2, 0, 7); ctx.arc(10, -18, 4.6, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffe566";
      ctx.beginPath(); ctx.arc(-1, -26, 3, 0, 7); ctx.fill();
    }
    ctx.restore();
  },

  drawShell(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    if (it.flip) ctx.scale(-1, 1);
    ctx.fillStyle = "#e8c9a0";
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "#c9a57a"; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(i * 3.2, -4.2); ctx.stroke();
    }
    ctx.restore();
  },

  drawSeabed(ctx, state) {
    const W = CFG.world;
    if (!Render._seabed) Render._seabed = Render._buildSeabed();

    // Underwater current: shift the whole seabed left over time so the
    // stationary swimmers feel like they're actually moving forward. Tie
    // scroll speed to the shared tempo multiplier so the world rushes by
    // faster as the difficulty ramps.
    const tileW = W.w;
    const scrollX = state.t * W.scrollSpeed * Sim._speedMul(state.t);
    const offset = ((scrollX % tileW) + tileW) % tileW;

    // Dune ridge silhouette — evaluated in world coords so the ridge
    // scrolls continuously with no visible seam at the tile wrap.
    ctx.fillStyle = "#1a3d2e";
    ctx.beginPath();
    ctx.moveTo(0, W.h);
    ctx.lineTo(0, W.waterBottom);
    for (let sx = 0; sx <= W.w; sx += 24) {
      const wx = sx + scrollX;
      ctx.lineTo(sx, W.waterBottom - 3 - Math.sin(wx * 0.018) * 4 - Math.sin(wx * 0.05) * 2);
    }
    ctx.lineTo(W.w, W.h);
    ctx.closePath(); ctx.fill();
    // Flat sand underneath the dune - uniform colour, no scroll needed.
    ctx.fillStyle = "#24503c";
    ctx.fillRect(0, W.waterBottom + 4, W.w, W.h - W.waterBottom);

    // Props scroll with the current. Draw the whole tile twice back-to-back
    // so as one copy slides off the left, the other slides in from the right.
    const order = { rock: 0, shell: 1, starfish: 2, coral: 3, kelp: 4, chest: 5 };
    const props = Render._seabed.slice().sort((a, b) => (order[a.kind] || 0) - (order[b.kind] || 0));
    ctx.save();
    ctx.translate(-offset, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (const it of props) {
        if (it.kind === "kelp") Render.drawKelp(ctx, it, state.frame);
        else if (it.kind === "coral") Render.drawCoral(ctx, it);
        else if (it.kind === "rock") Render.drawRock(ctx, it);
        else if (it.kind === "starfish") Render.drawStarfish(ctx, it, state.frame);
        else if (it.kind === "chest") Render.drawChest(ctx, it);
        else if (it.kind === "shell") Render.drawShell(ctx, it);
      }
      ctx.translate(tileW, 0);
    }
    ctx.restore();
  },

  drawState(ctx, state) {
    const W = CFG.world;
    ctx.clearRect(0, 0, W.w, W.h);

    // --- ocean background ---
    const g = ctx.createLinearGradient(0, 0, 0, W.h);
    g.addColorStop(0, "#0a3352");
    g.addColorStop(0.5, "#083049");
    g.addColorStop(1, "#04202f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W.w, W.h);

    // sky-ish band above water surface
    ctx.fillStyle = "#0b2135"; ctx.fillRect(0, 0, W.w, W.waterTop);
    // water surface line with light ripples
    ctx.strokeStyle = "rgba(120,200,255,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W.w; x += 20) {
      const yy = W.waterTop + Math.sin(x * 0.03 + state.frame * 0.05) * 3;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    Render.drawSeabed(ctx, state);

    // drifting bubbles for depth
    ctx.fillStyle = "rgba(160,220,255,0.10)";
    for (let i = 0; i < 22; i++) {
      const bx = (i * 71 + state.frame * 0.6) % W.w;
      const by = W.waterTop + ((i * 137 - state.frame * 0.9) % (W.waterBottom - W.waterTop) + (W.waterBottom - W.waterTop)) % (W.waterBottom - W.waterTop);
      ctx.beginPath(); ctx.arc(W.w - bx, by, 2 + (i % 3), 0, 7); ctx.fill();
    }

    // --- sharks + lasers ---
    for (const sh of state.sharks) {
      const charging = sh.laser.state === "windup";
      const firing = sh.laser.state === "firing";
      // Jaws open + teeth flash while biting a swimmer.
      const chompN = sh.chomp > 0 ? clamp(sh.chomp / CFG.shark.chomp, 0, 1) : 0;
      Render.drawSharkSprite(ctx, sh.x, sh.y + Math.sin(sh.bob) * 2, {
        angle: Math.PI,                 // face left
        scale: sh.scale || 1.7,
        tailWave: state.frame * 0.26 + sh.id,
        tailPropel: 1,
        laserEyes: charging || firing,
        open: chompN > 0 ? 0.45 + chompN * 0.5 : 0,  // closed normally; toothy bite when eating
        waterFill: Render._waterColorAt(sh.y)         // mouth interior matches the water behind the shark
      });
      if (charging) Render.drawWindupCharge(ctx, sh, state.frame);
      if (firing) Render.drawSharkLaser(ctx, sh, state.frame);
    }

    // --- players (draw living on top of the dissolving dead) ---
    const dead = state.players.filter((p) => !p.alive);
    const living = state.players.filter((p) => p.alive);
    for (const p of dead) Render.drawPlayer(ctx, p, state);
    for (const p of living) Render.drawPlayer(ctx, p, state);

    // --- HUD ---
    const aliveCount = state.players.filter((p) => p.alive).length;
    const label = (txt, x, align) => {
      ctx.textAlign = align;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText(txt, x + 1, 27);
      ctx.fillStyle = "#cfe8ff"; ctx.fillText(txt, x, 26);
    };
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    label(`Time ${state.t.toFixed(1)}s`, 15, "left");
    if (state.mode === "solo") {
      // Surface the difficulty knobs so the curve is observable.
      const tier = Math.floor(state.t / CFG.shark.tierSeconds) + 1;
      const spd = Sim._speedMul(state.t).toFixed(2);
      label(`Size tier ${tier}   \u2022   tempo x${spd}   \u2022   sharks ${state.sharks.length}`, W.w - 16, "right");
    } else {
      label(`Swimming: ${aliveCount}`, W.w - 16, "right");
    }
  }
};
