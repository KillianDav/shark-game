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
      // Teeth on the inner lip, clipped inside the body. The range is chosen
      // to line the mouth OPENING - starting past the eye (which sits at
      // x=13, radius 1.8) so no tooth ever covers the eye, and ending at
      // the mouth's front tip.
      ctx.fillStyle = "#f2eee4";
      const n = 5;
      const TEETH_START = 16;    // past the eye
      const TEETH_END   = 25;    // at the mouth tip
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const fx = lerp(TEETH_START, TEETH_END, t);
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

  drawCoffin(ctx, cf, state) {
    const C = CFG.coffin;
    const age = state.t - cf.spawnT;
    const fadeT = Math.max(0, (age - C.fadeStart) / Math.max(0.001, C.lifetime - C.fadeStart));
    const alpha = 1 - Math.min(1, fadeT);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cf.x, cf.y);
    // Coffin stays put (no sink, no rotate) - a still marker at the death spot.

    // Coffin silhouette - proper elongated hexagon: narrow head + foot,
    // widening at the shoulders. Traditional "toe-pincher" coffin shape.
    //
    //          .___.     <- head (narrow)
    //         /     \
    //        /       \
    //       |         |  <- shoulders (widest)
    //       |         |
    //        \       /
    //         \     /
    //          '---'     <- foot (narrow)
    //
    ctx.fillStyle = "#5b3a1c";
    ctx.beginPath();
    ctx.moveTo(-5, -21);      // head top-left
    ctx.lineTo(5, -21);       // head top-right
    ctx.lineTo(10, -11);      // shoulder right-upper
    ctx.lineTo(10, 11);       // shoulder right-lower
    ctx.lineTo(5, 21);        // foot bottom-right
    ctx.lineTo(-5, 21);       // foot bottom-left
    ctx.lineTo(-10, 11);      // shoulder left-lower
    ctx.lineTo(-10, -11);     // shoulder left-upper
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#2f1f10"; ctx.lineWidth = 1.3; ctx.stroke();

    // Lid seams (top + bottom bevels).
    ctx.strokeStyle = "#3d2510"; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-5, -21); ctx.lineTo(-10, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -21); ctx.lineTo(10, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 11); ctx.lineTo(-5, 21); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 11); ctx.lineTo(5, 21); ctx.stroke();

    // Cross on the lid, upper third (traditional placement).
    ctx.fillStyle = "#e8dfcc";
    ctx.fillRect(-1.2, -15, 2.4, 14);
    ctx.fillRect(-4, -10, 8, 2.4);

    // Small colour dot in the player's colour (foot end) so party rounds can
    // see whose coffin sits where.
    if (cf.color) {
      ctx.fillStyle = cf.color;
      ctx.beginPath(); ctx.arc(0, 15, 1.8, 0, 7); ctx.fill();
    }

    ctx.restore();
  },

  drawStingray(ctx, r, frame) {
    const S = CFG.stingray;
    const s = r.scale;
    const T = r.sting;
    const wingWave = Math.sin(frame * 0.18 + r.id) * 3;

    ctx.save();
    ctx.translate(r.x, r.y);

    // Soft shadow on the sand - only draw when the ray is close enough to the
    // seabed for a shadow to actually land there. Fades in as it approaches.
    const sandY = CFG.world.waterBottom;
    const shadowFade = Math.max(0, 1 - (sandY - r.y) / 60);   // 0 at 60px above sand, 1 at sand
    if (shadowFade > 0) {
      ctx.fillStyle = "rgba(0,0,0," + (0.32 * shadowFade).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(0, sandY - r.y + 2, S.bodyRX * s * 0.9, 3.2, 0, 0, 7); ctx.fill();
    }

    // Body - a flat kite. Two ellipses give the diamond silhouette.
    ctx.fillStyle = "#453b30";
    ctx.beginPath(); ctx.ellipse(0, 0, S.bodyRX * s, (S.bodyRY + 1) * s + wingWave * 0.3, 0, 0, 7); ctx.fill();
    // Front point (nose) - a small triangle poking forward
    ctx.beginPath();
    ctx.moveTo(-S.bodyRX * s, 0);
    ctx.lineTo(-S.bodyRX * s - 8 * s, -2);
    ctx.lineTo(-S.bodyRX * s - 8 * s, 2);
    ctx.closePath(); ctx.fill();
    // Highlight along the back so the body reads as 3D-ish
    ctx.fillStyle = "#5f5344";
    ctx.beginPath(); ctx.ellipse(-2, -1.5, (S.bodyRX - 6) * s, (S.bodyRY - 1) * s * 0.9, 0, 0, 7); ctx.fill();
    // Sand-toned spots for cartoon flair
    ctx.fillStyle = "#786550";
    ctx.beginPath(); ctx.arc(-6 * s, -1, 1.6 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(4 * s, 1, 1.4 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(12 * s, -1, 1.2 * s, 0, 7); ctx.fill();

    // Undulating wing edges - two small curves that flap as the ray glides
    ctx.strokeStyle = "#332b23"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-S.bodyRX * s * 0.4, -S.bodyRY * s - 1);
    ctx.quadraticCurveTo(0, -S.bodyRY * s - 2 - wingWave * 0.4, S.bodyRX * s * 0.4, -S.bodyRY * s - 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-S.bodyRX * s * 0.4, S.bodyRY * s + 1);
    ctx.quadraticCurveTo(0, S.bodyRY * s + 2 + wingWave * 0.4, S.bodyRX * s * 0.4, S.bodyRY * s + 1);
    ctx.stroke();

    // Eyes on top of the body, near the front (leftward-facing).
    ctx.fillStyle = "#0d141a";
    ctx.beginPath(); ctx.arc(-S.bodyRX * s * 0.55, -1.8, 1.2 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-S.bodyRX * s * 0.55, 1.8, 1.2 * s, 0, 7); ctx.fill();

    // Tail - either trailing behind (idle) or arced up to the strike tip.
    const tailBaseX = S.bodyRX * s - 2;
    const tailBaseY = 2;
    let tipX, tipY, curveX, curveY;
    if (T.state === "windup" || T.state === "active") {
      tipX = T.x - r.x; tipY = T.y - r.y;
      curveX = (tailBaseX + tipX) / 2;
      curveY = Math.min(tailBaseY, tipY) - 14;
      ctx.strokeStyle = T.state === "active" ? "#c7a640" : "#3a342c";
      ctx.lineWidth = T.state === "active" ? 2.8 : 2.4;
    } else {
      tipX = tailBaseX + S.tailIdleLen * s * 0.8;
      tipY = tailBaseY + Math.sin(frame * 0.08 + r.id) * 3;
      curveX = (tailBaseX + tipX) / 2;
      curveY = (tailBaseY + tipY) / 2 + Math.sin(frame * 0.06 + r.id) * 2;
      ctx.strokeStyle = "#3a342c";
      ctx.lineWidth = 2.1;
    }
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tailBaseX, tailBaseY);
    ctx.quadraticCurveTo(curveX, curveY, tipX, tipY);
    ctx.stroke();

    // Barb at the tail tip - a small triangle. Glows during an active strike.
    ctx.save();
    if (T.state === "active") { ctx.shadowColor = "#ffd240"; ctx.shadowBlur = 14; }
    ctx.fillStyle = T.state === "active" ? "#ffe066" : "#e6dfcc";
    // Aim the barb roughly along the tail direction so it looks pointy, not blobby.
    const ang = Math.atan2(tipY - curveY, tipX - curveX);
    ctx.translate(tipX, tipY); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(-3, -2); ctx.lineTo(-3, 2); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Danger telegraph. The visible circle IS the kill zone - draw it at the
    // exact stingReach radius so the player can see where the sting lands.
    if (T.state === "active") {
      const pulse = 0.85 + 0.15 * Math.sin(frame * 0.6);
      ctx.fillStyle = "rgba(255,240,120,0.30)";
      ctx.beginPath(); ctx.arc(tipX, tipY, S.stingReach * pulse, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,232,110,0.75)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tipX, tipY, S.stingReach, 0, 7); ctx.stroke();
    } else if (T.state === "windup") {
      // Softer preview of the same circle so the danger is telegraphed.
      ctx.fillStyle = "rgba(255,200,80,0.12)";
      ctx.beginPath(); ctx.arc(tipX, tipY, S.stingReach, 0, 7); ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,210,110,0.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tipX, tipY, S.stingReach, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  },

  drawOctopus(ctx, o, frame) {
    const O = CFG.octopus;
    const s = o.scale;
    const bodyR = O.bodyR * s;
    const tipR = O.tipR;   // rendered at world scale so the kill circle matches the visible ring

    // Tentacles: drawn in world coords so the top of each curve attaches to
    // a spread point along the bottom of the mantle and the tip lands where
    // `Sim._octopusTip` says it does.
    ctx.lineCap = "round";
    for (let i = 0; i < O.tentacles; i++) {
      const root = Sim._octopusRoot(o, i);
      const tip = Sim._octopusTip(o, i);
      // A control point pushed out perpendicular to the (root -> tip) line
      // gives each tentacle a lazy S-shape / curl.
      const dx = tip.x - root.x, dy = tip.y - root.y;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len, perpY = dx / len;
      const curl = Math.sin(o.swimT * 1.9 + i * 0.9 + o.wavePhase) * 10 * s;
      // Give outer tentacles a stronger curl than the central ones.
      const t = O.tentacles > 1 ? i / (O.tentacles - 1) : 0.5;
      const outerBias = (t - 0.5) * 2 * 6 * s;
      const cx = (root.x + tip.x) * 0.5 + perpX * (curl + outerBias);
      const cy = (root.y + tip.y) * 0.5 + perpY * (curl + outerBias);
      // Outer stroke (darker)
      ctx.strokeStyle = "#3a1128"; ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.quadraticCurveTo(cx, cy, tip.x, tip.y);
      ctx.stroke();
      // Inner stroke (lighter for depth)
      ctx.strokeStyle = "#6c2450"; ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.quadraticCurveTo(cx, cy, tip.x, tip.y);
      ctx.stroke();
    }

    // Mantle: bulbous "onion-dome" / mushroom-cap silhouette sitting ABOVE
    // the tentacle roots. Wider through the middle, tapered top and bottom -
    // the stereotypical cartoon-octopus head shape.
    ctx.save();
    ctx.translate(o.x, o.y);
    const bR = bodyR;
    ctx.fillStyle = "#5a1c3e";
    ctx.beginPath();
    ctx.moveTo(0, -bR * 1.15);                                                          // top peak
    ctx.bezierCurveTo( bR * 1.15, -bR * 1.15,  bR * 1.15, bR * 0.15,  bR * 0.72, bR * 0.55);  // right side down
    ctx.bezierCurveTo( bR * 0.5,  bR * 0.85, -bR * 0.5,  bR * 0.85, -bR * 0.72, bR * 0.55);  // pinched bottom
    ctx.bezierCurveTo(-bR * 1.15, bR * 0.15, -bR * 1.15, -bR * 1.15, 0, -bR * 1.15);         // left side back up
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3a0f28"; ctx.lineWidth = 1.3; ctx.stroke();
    // Top highlight for a shiny bulb feel
    ctx.fillStyle = "#8a3768";
    ctx.beginPath();
    ctx.ellipse(-bR * 0.15, -bR * 0.75, bR * 0.5, bR * 0.24, -0.2, 0, 7);
    ctx.fill();
    // A few faint blue rings on the mantle for real-world flavour (not the
    // stingers - those are only at the tentacle tips).
    ctx.strokeStyle = "#0a3d8a"; ctx.lineWidth = 1;
    ctx.fillStyle = "#3af0ff";
    const mantleRings = [
      { x: -bR * 0.35, y: -bR * 0.15, r: 1.5 },
      { x:  bR * 0.30, y: -bR * 0.40, r: 1.3 },
      { x:  bR * 0.05, y: -bR * 0.05, r: 1.6 },
      { x: -bR * 0.10, y: -bR * 0.65, r: 1.2 }
    ];
    for (const r of mantleRings) {
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * s, 0, 7); ctx.fill(); ctx.stroke();
    }

    // Eyes on the front-top of the mantle.
    ctx.fillStyle = "#fff8e0";
    ctx.beginPath(); ctx.ellipse(-bR * 0.36, -bR * 0.32, 2.4, 1.8, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse( bR * 0.36, -bR * 0.32, 2.4, 1.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#0d141a";
    ctx.beginPath(); ctx.arc(-bR * 0.36, -bR * 0.32, 1.1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc( bR * 0.36, -bR * 0.32, 1.1, 0, 7); ctx.fill();
    ctx.restore();

    // Blue-ring stingers at each tentacle TIP (in world coords, drawn last so
    // they sit on top). Circle IS the kill zone.
    for (let i = 0; i < O.tentacles; i++) {
      const tip = Sim._octopusTip(o, i);
      // Soft glow halo matching the kill radius
      ctx.fillStyle = "rgba(58,240,255,0.32)";
      ctx.beginPath(); ctx.arc(tip.x, tip.y, tipR, 0, 7); ctx.fill();
      // Ring
      ctx.strokeStyle = "#0a3d8a"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, tipR * 0.55, 0, 7); ctx.stroke();
      // Bright inner dot
      ctx.fillStyle = "#3af0ff";
      ctx.beginPath(); ctx.arc(tip.x, tip.y, tipR * 0.32, 0, 7); ctx.fill();
    }
  },

  drawLionfish(ctx, f, frame) {
    const L = CFG.lionfish;
    const s = f.scale;
    const bodyRX = L.bodyRX * s;
    const bodyRY = L.bodyRY * s;
    const tipR = L.tipR;

    // Dorsal spikes drawn FIRST (behind the body) so the body overlaps their
    // base cleanly. Each spike is a thin line from its root on the body-top
    // up to the tip that Sim._lionfishTip returns.
    ctx.lineCap = "round";
    for (let i = 0; i < L.spikes; i++) {
      const root = Sim._lionfishSpikeRoot(f, i);
      const tip = Sim._lionfishTip(f, i);
      // Outer dark stroke
      ctx.strokeStyle = "#2f1810"; ctx.lineWidth = 2.4 * s;
      ctx.beginPath(); ctx.moveTo(root.x, root.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      // Inner warm colour so the spike reads as ridged
      ctx.strokeStyle = "#c74a2a"; ctx.lineWidth = 1.1 * s;
      ctx.beginPath(); ctx.moveTo(root.x, root.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    }
    // Translucent dorsal fin membrane connecting adjacent spike tips - only
    // above the body, so it reads as a proper dorsal fin (not a full-body halo).
    ctx.fillStyle = "rgba(212,64,42,0.25)";
    ctx.beginPath();
    for (let i = 0; i < L.spikes; i++) {
      const tip = Sim._lionfishTip(f, i);
      if (i === 0) ctx.moveTo(tip.x, tip.y);
      else ctx.lineTo(tip.x, tip.y);
    }
    // Close along the body top from right root to left root.
    for (let i = L.spikes - 1; i >= 0; i--) {
      const root = Sim._lionfishSpikeRoot(f, i);
      ctx.lineTo(root.x, root.y);
    }
    ctx.closePath(); ctx.fill();

    // Body (facing right toward the divers).
    ctx.save();
    ctx.translate(f.x, f.y);

    // Slight tail fin at the back-left
    ctx.fillStyle = "#c74a2a";
    ctx.beginPath();
    ctx.moveTo(-bodyRX, 0);
    ctx.lineTo(-bodyRX * 1.6, -bodyRY * 0.9);
    ctx.lineTo(-bodyRX * 1.5, 0);
    ctx.lineTo(-bodyRX * 1.6, bodyRY * 0.9);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#2f1810"; ctx.lineWidth = 1; ctx.stroke();

    // Pectoral fin on the side (feathered look)
    ctx.fillStyle = "rgba(212,64,42,0.55)";
    ctx.beginPath();
    ctx.moveTo(-bodyRX * 0.1, bodyRY * 0.4);
    ctx.quadraticCurveTo(bodyRX * 0.1, bodyRY * 1.4, -bodyRX * 0.5, bodyRY * 1.1);
    ctx.closePath(); ctx.fill();

    // Body ellipse - cream base with warning stripes.
    ctx.fillStyle = "#f0e6d0";
    ctx.beginPath(); ctx.ellipse(0, 0, bodyRX, bodyRY, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#2f1810"; ctx.lineWidth = 1.1; ctx.stroke();
    // Warning stripes (clipped to body)
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, bodyRX, bodyRY, 0, 0, 7); ctx.clip();
    ctx.fillStyle = "#c74a2a";
    for (const bx of [-bodyRX * 0.6, -bodyRX * 0.2, bodyRX * 0.25]) {
      ctx.fillRect(bx - 2.5 * s, -bodyRY - 1, 5 * s, bodyRY * 2 + 2);
    }
    ctx.restore();

    // Head - just the front third of the body highlighted, with eye + mouth.
    ctx.fillStyle = "#f6cea0";
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, bodyRX, bodyRY, 0, 0, 7); ctx.clip();
    ctx.beginPath(); ctx.arc(bodyRX * 0.7, 0, bodyRY * 1.2, 0, 7); ctx.fill();
    ctx.restore();
    // Eye
    ctx.fillStyle = "#0d141a";
    ctx.beginPath(); ctx.arc(bodyRX * 0.72, -bodyRY * 0.35, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(bodyRX * 0.76, -bodyRY * 0.42, 0.6, 0, 7); ctx.fill();
    // Mouth
    ctx.strokeStyle = "#4a1a10"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bodyRX * 0.9, bodyRY * 0.2);
    ctx.quadraticCurveTo(bodyRX * 1.05, bodyRY * 0.15, bodyRX * 1.05, bodyRY * 0.35);
    ctx.stroke();
    // Pelvic fin below body
    ctx.fillStyle = "rgba(212,64,42,0.6)";
    ctx.beginPath();
    ctx.moveTo(-bodyRX * 0.2, bodyRY * 0.9);
    ctx.quadraticCurveTo(-bodyRX * 0.05, bodyRY * 1.5, -bodyRX * 0.4, bodyRY * 1.3);
    ctx.closePath(); ctx.fill();

    ctx.restore();

    // Hazard tips at the TOP of each spike (world coords, drawn last).
    // Small yellow warning dot - the visible circle IS the kill zone.
    for (let i = 0; i < L.spikes; i++) {
      const tip = Sim._lionfishTip(f, i);
      ctx.fillStyle = "rgba(255,224,102,0.42)";
      ctx.beginPath(); ctx.arc(tip.x, tip.y, tipR, 0, 7); ctx.fill();
      ctx.strokeStyle = "#3a2612"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, tipR * 0.55, 0, 7); ctx.stroke();
      ctx.fillStyle = "#ffe066";
      ctx.beginPath(); ctx.arc(tip.x, tip.y, tipR * 0.32, 0, 7); ctx.fill();
    }
  },

  drawAnchor(ctx, a, frame) {
    const s = a.scale;
    const W = CFG.world;

    // Chain: straight vertical line from the anchor's ring up to the surface.
    // Represents the length of chain paid out from the boat that dropped it.
    const chainTop = W.waterTop;
    const ringWorldY = a.y - 18 * s;   // ring position in world coords (matches art below)
    if (ringWorldY > chainTop) {
      ctx.strokeStyle = "#2a2016"; ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, chainTop); ctx.lineTo(a.x, ringWorldY); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale(s, s);

    // Ring at the top - a small circle you can see the water through.
    ctx.strokeStyle = "#3a2f22"; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, -18, 5, 0, 7); ctx.stroke();

    // Crossbar (the top piece of the anchor's stock).
    ctx.fillStyle = "#5b4a35";
    ctx.beginPath();
    ctx.moveTo(-13, -10); ctx.lineTo(13, -10); ctx.lineTo(11, -6); ctx.lineTo(-11, -6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#2a1e12"; ctx.lineWidth = 1; ctx.stroke();

    // Shaft straight down.
    ctx.fillStyle = "#6b573f";
    ctx.beginPath();
    ctx.moveTo(-2.4, -13); ctx.lineTo(2.4, -13); ctx.lineTo(2.4, 14); ctx.lineTo(-2.4, 14);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3a2f22"; ctx.lineWidth = 1; ctx.stroke();

    // Crown at the bottom of the shaft (a small bulge).
    ctx.fillStyle = "#5b4a35";
    ctx.beginPath(); ctx.arc(0, 14, 3.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#2a1e12"; ctx.lineWidth = 1; ctx.stroke();

    // Two curved flukes - attach at the crown, sweep OUT and DOWN, then curl
    // UP so the pointed tips end above the crown line (proper anchor shape).
    ctx.fillStyle = "#5b4a35";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 12);                                          // crown attach top
      ctx.quadraticCurveTo(side * 6, 22, side * 18, 20);           // out and down along the palm
      ctx.quadraticCurveTo(side * 22, 12, side * 16, 6);           // up and back to the pointed tip
      ctx.quadraticCurveTo(side * 8, 12, 0, 15);                    // back to the crown
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#2a1e12"; ctx.lineWidth = 1; ctx.stroke();
    }

    // Pointed fluke tips (highlight the up-facing points).
    ctx.fillStyle = "#7a6647";
    ctx.beginPath(); ctx.moveTo(-16, 6); ctx.lineTo(-19, 3); ctx.lineTo(-14, 3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, 6); ctx.lineTo(19, 3); ctx.lineTo(14, 3); ctx.closePath(); ctx.fill();

    ctx.restore();

    // Surface splash right after the drop - a couple of white arcs above the
    // water line so the entry has some visual punch.
    if (a.splash > 0) {
      const alpha = a.splash / 0.35;
      ctx.fillStyle = "rgba(200,235,255," + (0.7 * alpha).toFixed(2) + ")";
      for (let i = -2; i <= 2; i++) {
        const px = a.x + i * 8;
        const py = W.waterTop - Math.abs(i) * 3;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fill();
      }
    }
  },

  drawBoat(ctx, b, state) {
    const B = CFG.boat;
    const W = CFG.world;
    ctx.save();
    ctx.translate(b.x, W.waterTop);
    // Small drifting bob so the boat feels alive on the surface.
    ctx.rotate(Math.sin(state.frame * 0.03 + b.id) * 0.02);

    // A proper large hull: the SUBMERGED half sits below the water surface
    // (that's the part the diver sees), and a slim deck strip peeks above.
    const w = B.hullW, h = B.hullH;
    // Hull below water - tapered "V" cross-section
    ctx.fillStyle = "#3d2612";
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.quadraticCurveTo(w / 2 - 12, h * 0.65, w / 2 - 30, h);
    ctx.lineTo(-w / 2 + 30, h);
    ctx.quadraticCurveTo(-w / 2 + 12, h * 0.65, -w / 2, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#180e05"; ctx.lineWidth = 1.5; ctx.stroke();

    // Hull planking - a couple of horizontal grain lines for depth
    ctx.strokeStyle = "#2a1a0a"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, h * 0.35); ctx.lineTo(w / 2 - 4, h * 0.35);
    ctx.moveTo(-w / 2 + 12, h * 0.7); ctx.lineTo(w / 2 - 12, h * 0.7);
    ctx.stroke();

    // Waterline plank (a bright brown band right at the water level)
    ctx.fillStyle = "#7a4720";
    ctx.fillRect(-w / 2 + 3, -3, w - 6, 5);
    ctx.strokeStyle = "#3a2210"; ctx.lineWidth = 0.8;
    ctx.strokeRect(-w / 2 + 3, -3, w - 6, 5);

    // Deck strip peeking above the water
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(-w / 2 + 10, -9, w - 20, 6);
    ctx.strokeStyle = "#4a2a10"; ctx.lineWidth = 0.8;
    ctx.strokeRect(-w / 2 + 10, -9, w - 20, 6);

    // Small superstructure (bridge cabin) near the stern (right side, since
    // the boat is heading LEFT, the stern is behind - visually on the right).
    ctx.fillStyle = "#c4a670";
    ctx.fillRect(w * 0.20, -20, w * 0.16, 11);
    ctx.strokeStyle = "#4a3520"; ctx.lineWidth = 0.9;
    ctx.strokeRect(w * 0.20, -20, w * 0.16, 11);
    // Cabin windows
    ctx.fillStyle = "#152a3a";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(w * 0.20 + 4 + i * (w * 0.16 - 8) / 3, -17, 5, 4);
    }
    // Little chimney stack
    ctx.fillStyle = "#2a1a10";
    ctx.fillRect(w * 0.28, -26, 5, 7);
    // Puff of smoke
    ctx.fillStyle = "rgba(230,230,230,0.55)";
    const smokeShift = (state.frame * 0.3) % 12;
    ctx.beginPath(); ctx.arc(w * 0.31 - smokeShift, -30 - smokeShift * 0.4, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.29 - smokeShift * 0.6, -34 - smokeShift * 0.3, 2.4, 0, 7); ctx.fill();

    // Anchor winch + capstan near the bow (left side - where the anchor
    // deploys as the boat moves left over its target).
    ctx.fillStyle = "#3a2f22";
    ctx.fillRect(-w * 0.35, -14, 12, 5);
    ctx.fillStyle = "#6b6558";
    ctx.beginPath(); ctx.arc(-w * 0.33, -12, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = "#1a1510"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-w * 0.33, -12, 3, 0, 7); ctx.stroke();

    // Bow rail sticking up at the very front (left)
    ctx.strokeStyle = "#3a2210"; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 8, -8);
    ctx.lineTo(-w / 2 + 12, -12);
    ctx.lineTo(-w / 2 + 22, -12);
    ctx.stroke();

    ctx.restore();

    // Bow wake as the ship pushes water aside (in front of and behind hull)
    ctx.fillStyle = "rgba(220,240,255,0.45)";
    for (let i = 0; i < 4; i++) {
      const wx = b.x - w * 0.5 - i * 8;
      const wy = W.waterTop + Math.sin(state.frame * 0.2 + i) * 1.6;
      ctx.beginPath(); ctx.arc(wx, wy, 2.4, 0, 7); ctx.fill();
    }
    // Stern wake trailing behind
    ctx.fillStyle = "rgba(220,240,255,0.35)";
    for (let i = 0; i < 4; i++) {
      const wx = b.x + w * 0.5 + i * 10;
      const wy = W.waterTop + Math.sin(state.frame * 0.15 + i) * 1.8;
      ctx.beginPath(); ctx.arc(wx, wy, 2.2, 0, 7); ctx.fill();
    }
  },

  drawPlayer(ctx, p, state) {
    const frame = state.frame;
    let alpha = 1, scale = 1, showBody = true, showName = true, vaporSparks = false, stungSparks = false, anchorSquash = 0;

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
      } else if (p.deathKind === "stung" || p.deathKind === "octopus" || p.deathKind === "lionfish") {
        // Stung / octopus tip / lionfish spike - all toxin-style deaths: a quick
        // electric flicker then shrink. Distinct from "eaten" so the player can
        // tell what killed them.
        const dur = CFG.fx.stingDur;
        if (age >= dur) return;
        const t = age / dur;
        alpha = (0.5 + 0.5 * Math.sin(age * 55)) * (1 - t);
        scale = 1 - t * 0.7;
        stungSparks = true;
        showName = false;
      } else if (p.deathKind === "anchor") {
        // Anchored: squish downward, then vanish.
        const dur = CFG.fx.anchorDur;
        if (age >= dur) return;
        const t = age / dur;
        alpha = 1 - t * 0.6;
        anchorSquash = t;
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
    // Alive-but-invulnerable = post-respawn flash so the player can see the
    // i-frames without confusing them for a full death.
    if (p.alive && p.invuln > 0) {
      alpha *= 0.35 + 0.55 * Math.abs(Math.sin(p.invuln * 22));
    }
    ctx.globalAlpha = alpha;
    const wob = Math.sin(frame * 0.3 + p.id) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + (p.alive ? wob : 0));
    // Anchor squash: flatten Y, widen X - a cartoon "pancake" moment.
    if (anchorSquash > 0) ctx.scale(scale * (1 + anchorSquash * 0.4), scale * (1 - anchorSquash * 0.75));
    else ctx.scale(scale, scale);

    if (vaporSparks) {
      // faint rising motes as the swimmer dissolves
      ctx.fillStyle = "rgba(180,230,255,0.7)";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frame * 0.2;
        const r = 14 + (frame % 12);
        ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r - (frame % 20), 2, 2);
      }
    }
    if (stungSparks) {
      // Yellow electric jitter - distinct from the blue laser vapor.
      ctx.fillStyle = "rgba(255,232,120,0.85)";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + frame * 0.4;
        const r = 12 + (i % 3) * 3;
        ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2);
      }
    }

    // ---- Scuba diver: black wetsuit + team colour on tank/mask/fins ----
    //
    // Coordinate frame: origin at the diver's centre; +X forward (right), +Y
    // down. The diver swims horizontally facing right (the same direction the
    // fish used to face). Sprite footprint roughly x=[-38, 30], y=[-15, 15].
    //
    const WETSUIT = "#141821";
    const WETSUIT_HL = "#282f3c";      // subtle highlight on the black rubber
    const SKIN = "#f0d2a8";
    const MASK_GLASS = "#0a1e33";
    const HOSE = "#22262f";
    const ACCENT = p.color;             // tank + mask strap + fin colour
    const ACCENT_DARK = "rgba(0,0,0,0.35)";
    const OUTLINE = "#080a0e";
    const kick = Math.sin(frame * 0.35 + p.id) * 3.5;

    // ---- Fins (drawn first, at the back). Coloured, with a dark rib. ----
    for (const [yOff, k] of [[-6, kick], [6, -kick]]) {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(-22, yOff - 3);
      ctx.quadraticCurveTo(-32, yOff - 5 + k * 0.4, -38, yOff - 8 + k * 0.6);
      ctx.lineTo(-36, yOff + 3 + k * 0.5);
      ctx.quadraticCurveTo(-30, yOff + 2 + k * 0.3, -22, yOff + 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
      // Rib along the middle of the fin blade
      ctx.strokeStyle = ACCENT_DARK; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-22, yOff);
      ctx.quadraticCurveTo(-30, yOff - 1 + k * 0.3, -36, yOff - 2 + k * 0.5);
      ctx.stroke();
    }

    // ---- Legs: two clearly separated shapes from hips back to the fins. ---
    // Upper leg
    ctx.fillStyle = WETSUIT;
    ctx.beginPath();
    ctx.moveTo(-6, -8);           // hip top-front
    ctx.lineTo(-14, -7);          // knee top
    ctx.lineTo(-22, -5 + kick * 0.15);  // ankle top
    ctx.lineTo(-22, -1 + kick * 0.15);  // ankle bottom
    ctx.lineTo(-14, -3);          // knee bottom
    ctx.lineTo(-6, -4);           // hip bottom-front
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    // Lower leg
    ctx.fillStyle = WETSUIT;
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.lineTo(-14, 3);
    ctx.lineTo(-22, 1 - kick * 0.15);
    ctx.lineTo(-22, 5 - kick * 0.15);
    ctx.lineTo(-14, 7);
    ctx.lineTo(-6, 8);
    ctx.closePath(); ctx.fill();
    ctx.stroke();
    // Knee highlight lines
    ctx.strokeStyle = WETSUIT_HL; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-14, -7); ctx.lineTo(-14, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 3); ctx.lineTo(-14, 7); ctx.stroke();

    // ---- Torso (elongated body of the wetsuit) ----
    ctx.fillStyle = WETSUIT;
    ctx.beginPath();
    ctx.ellipse(-1, 0, 14, 9, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    // Chest highlight
    ctx.fillStyle = WETSUIT_HL;
    ctx.beginPath(); ctx.ellipse(0, -3, 9, 2.2, 0, 0, 7); ctx.fill();
    // Belt / weight harness
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(-11, 6, 22, 1.8);

    // ---- Air tank on the back (coloured, clearly visible above the torso) --
    // The tank sits on the diver's back; in this side view it reads as a
    // rectangle above the torso.
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.lineTo(5, -14);
    ctx.quadraticCurveTo(7, -14, 7, -12);
    ctx.lineTo(7, -6);
    ctx.quadraticCurveTo(7, -4, 5, -4);
    ctx.lineTo(-8, -4);
    ctx.quadraticCurveTo(-10, -4, -10, -6);
    ctx.lineTo(-10, -12);
    ctx.quadraticCurveTo(-10, -14, -8, -14);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    // Colour band across the tank for contrast
    ctx.fillStyle = ACCENT_DARK;
    ctx.fillRect(-10, -9, 17, 1.6);
    // Tank cap (silver) and valve
    ctx.fillStyle = "#c8ccd0";
    ctx.fillRect(4, -14, 3, 4);
    ctx.fillStyle = "#a0a4a8";
    ctx.fillRect(-1, -16, 3, 2.5);
    // Tank straps wrapping over the torso
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-4, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(2, 8); ctx.stroke();

    // ---- Arms: two clearly separated arms reaching forward ----
    // Upper arm (further from viewer)
    ctx.fillStyle = WETSUIT;
    ctx.beginPath();
    ctx.moveTo(6, -6);            // shoulder top
    ctx.lineTo(16, -6);           // elbow top
    ctx.lineTo(24, -3);           // wrist top
    ctx.lineTo(24, -0.5);         // wrist bottom
    ctx.lineTo(16, -3);           // elbow bottom
    ctx.lineTo(6, -3);            // shoulder bottom
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    // Lower arm (nearer to viewer)
    ctx.fillStyle = WETSUIT;
    ctx.beginPath();
    ctx.moveTo(6, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(24, 4);
    ctx.lineTo(24, 6.5);
    ctx.lineTo(16, 5);
    ctx.lineTo(6, 5);
    ctx.closePath(); ctx.fill();
    ctx.stroke();
    // Elbow highlights
    ctx.strokeStyle = WETSUIT_HL; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(16, -6); ctx.lineTo(16, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, 2); ctx.lineTo(16, 5); ctx.stroke();
    // Hands (skin, gripped together in a streamlined swim pose)
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.arc(26, -1.5, 2.2, 0, 7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.arc(26, 5, 2.2, 0, 7); ctx.fill();
    ctx.stroke();

    // ---- Head: black neoprene hood with face + mask ----
    ctx.fillStyle = WETSUIT;
    ctx.beginPath(); ctx.arc(15, -6, 8, 0, 7); ctx.fill();       // hood
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    // Face opening (skin visible around the mask/mouth area)
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.arc(19, -5, 5.2, -1.2, 1.4); ctx.fill();

    // Mask strap in the player colour (visible band around the hood)
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(15, -6, 8.2, -0.5, 0.55, false); ctx.stroke();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(15, -6, 8.2, -0.5, 0.55, false); ctx.stroke();

    // Mask glass panel (dark blue-black) with a highlight
    ctx.fillStyle = MASK_GLASS;
    ctx.beginPath(); ctx.ellipse(21, -7, 4.2, 3.2, -0.15, 0, 7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "rgba(220,240,255,0.55)";
    ctx.beginPath(); ctx.ellipse(22, -8, 1.6, 1, 0, 0, 7); ctx.fill();

    // Regulator hose from the tank valve to the mouth
    ctx.strokeStyle = HOSE; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(8, -8, 15, -2);
    ctx.stroke();
    // Mouthpiece
    ctx.fillStyle = OUTLINE;
    ctx.beginPath(); ctx.arc(16, -1.5, 1.5, 0, 7); ctx.fill();

    // Rising bubbles from the regulator
    ctx.fillStyle = "rgba(210,235,255,0.9)";
    for (let i = 0; i < 4; i++) {
      const life = ((frame * 0.4) + i * 8) % 28;
      const bx = 17 + Math.sin(life * 0.3 + i) * 2;
      const by = -8 - life * 0.7;
      const br = 1.8 - life * 0.045;
      if (br > 0.4) { ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); }
    }

    // Dead marker: red X over the mask glass
    if (!p.alive) {
      ctx.strokeStyle = "#c81a2a"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(17.5, -10); ctx.lineTo(24.5, -4);
      ctx.moveTo(24.5, -10); ctx.lineTo(17.5, -4);
      ctx.stroke();
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
    const scrollX = state.t * W.scrollSpeed * Sim._speedMul(state, state.t);
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

    // --- boats crossing the surface (drawn first so hazards can overlap) ---
    if (state.boats) {
      for (const b of state.boats) Render.drawBoat(ctx, b, state);
    }

    // --- coffins (behind hazards so they don't obscure gameplay) ---
    if (state.coffins) {
      for (const cf of state.coffins) Render.drawCoffin(ctx, cf, state);
    }

    // --- stingrays (drawn behind sharks so sharks stay visually dominant) ---
    if (state.stingrays) {
      for (const r of state.stingrays) Render.drawStingray(ctx, r, state.frame);
    }

    // --- octopuses ---
    if (state.octopuses) {
      for (const o of state.octopuses) Render.drawOctopus(ctx, o, state.frame);
    }

    // --- lionfish ---
    if (state.lionfish) {
      for (const f of state.lionfish) Render.drawLionfish(ctx, f, state.frame);
    }

    // --- anchors (drawn in front so nothing overlaps the falling body) ---
    if (state.anchors) {
      for (const a of state.anchors) Render.drawAnchor(ctx, a, state.frame);
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
    // Human player's hearts, shown whenever the round starts with > 1 life.
    // In solo the human is state.players[0]; in party the human is the first
    // non-bot player (falling back to the first player if none flagged human).
    const human = state.players.find((p) => !p.isBot) || state.players[0];
    const initialLives = state.initialLives || 1;
    if (human && initialLives > 1) {
      const filled = Math.max(0, human.lives);
      const hearts = "\u2665".repeat(filled) + "\u2661".repeat(Math.max(0, initialLives - filled));
      ctx.font = "bold 16px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText(`Lives ${hearts}`, 130 + 1, 27);
      ctx.fillStyle = "#ff8a9a"; ctx.fillText(`Lives ${hearts}`, 130, 26);
    }
    if (state.mode === "solo") {
      const tier = Math.floor(state.t / state.diff.shark.tierSeconds) + 1;
      const spd = Sim._speedMul(state, state.t).toFixed(2);
      const rayCount = (state.stingrays && state.stingrays.length) || 0;
      const octCount = (state.octopuses && state.octopuses.length) || 0;
      const lionCount = (state.lionfish && state.lionfish.length) || 0;
      const anchorCount = (state.anchors && state.anchors.length) || 0;
      const hazardBit = state.hazards === "sharks-only"
        ? `sharks ${state.sharks.length}`
        : `sharks ${state.sharks.length} \u2022 rays ${rayCount} \u2022 octo ${octCount} \u2022 lion ${lionCount} \u2022 anch ${anchorCount}`;
      ctx.font = "bold 16px 'Segoe UI', sans-serif";
      label(`Size tier ${tier}   \u2022   tempo x${spd}   \u2022   ${hazardBit}`, W.w - 16, "right");
    } else {
      label(`Swimming: ${aliveCount}`, W.w - 16, "right");
    }
  }
};
