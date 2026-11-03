// Draws the 1080x1350 share card on a canvas: the closed case on a ledge in the game's colours.
import { VERB } from "../../core/constants.js";
import { S, coverUrl, idx, myEntry } from "../../core/state.js";
import { fmtHours, took } from "../../core/util.js";
import { gameHueSat, gameTint, hsl } from "../../ui/theme.js";

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    const done = (ok) => resolve(ok ? img : null);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    setTimeout(() => done(false), 4000);
    img.src = src;
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  const usedAll = lines.join(" ").split(/\s+/).length >= words.length;
  if (!usedAll && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last.replace(/[\s,.;:]+$/, "") + "…";
  }
  return lines;
}
function starShape(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      rad = i % 2 ? r * 0.46 : r;
    ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
}

export async function drawShareCard(gameId, includeReview) {
  const g = idx.g[gameId],
    e = myEntry(gameId),
    me = idx.p[S.me];
  const W = 1080,
    H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const font = (w, px) => `${w} ${px}px "Funnel Display", system-ui, -apple-system, sans-serif`;
  try {
    await Promise.all([
      document.fonts.load(font(700, 72)),
      document.fonts.load(font(500, 34)),
      document.fonts.load(font(400, 36)),
    ]);
  } catch (_) {}
  const t = gameTint(g);

  // The wall, in this game's colours
  const [hh, hs] = gameHueSat(g);
  const C = {
    wall: hsl(hh, hs, 0.13),
    lip: hsl(hh, hs * 0.9, 0.22),
    front: hsl(hh, hs, 0.085),
    ink: hsl(hh, 0.5, 0.94),
    ink2: hsl(hh, 0.26, 0.79),
    body: hsl(hh, 0.32, 0.87),
    dim: hsl(hh, 0.16, 0.64),
  };
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, W, H);

  // The case, standing on a ledge
  const cw = 372,
    ch = 496,
    cx = (W - cw) / 2,
    cy = 96,
    ly = cy + ch;
  ctx.fillStyle = C.lip;
  ctx.fillRect(0, ly, W, 22);
  ctx.fillStyle = C.front;
  ctx.fillRect(0, ly + 22, W, 56);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#141416";
  rr(ctx, cx, cy, cw, ch, 18);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#2E2F35";
  rr(ctx, cx + 10, cy + 34, 9, ch - 68, 5);
  ctx.fill(); // hinge ridge
  const ax = cx + 32,
    ay = cy + 13,
    aw = cw - 45,
    ah = ch - 26;
  ctx.save();
  rr(ctx, ax, ay, aw, ah, 6);
  ctx.clip();
  ctx.fillStyle = t.tile;
  ctx.fillRect(ax, ay, aw, ah);
  const art = await loadImage(coverUrl(g, "cover_big_2x"));
  let drewArt = false;
  if (art) {
    try {
      const sc = Math.max(aw / art.width, ah / art.height);
      const iw = art.width * sc,
        ih = art.height * sc;
      ctx.drawImage(art, ax + (aw - iw) / 2, ay + (ah - ih) / 2, iw, ih);
      drewArt = true;
    } catch (_) {
      drewArt = false;
    }
  }
  if (!drewArt) {
    ctx.fillStyle = t.soft;
    ctx.font = font(700, 44);
    const tl = wrapLines(ctx, g.title, aw - 56, 4);
    tl.forEach((s, i) => ctx.fillText(s, ax + 28, ay + ah - 36 - (tl.length - 1 - i) * 52));
  }
  const glare = ctx.createLinearGradient(ax, ay, ax + aw * 0.5, ay + ah * 0.35);
  glare.addColorStop(0, "rgba(255,255,255,0.18)");
  glare.addColorStop(0.45, "rgba(255,255,255,0)");
  ctx.fillStyle = glare;
  ctx.fillRect(ax, ay, aw, ah);
  ctx.restore();
  // Sticker in the top-right corner
  const stick =
    e.status === "finished"
      ? "Completed"
      : e.status === "dropped"
        ? "Traded in"
        : e.status === "paused"
          ? "Paused"
          : "";
  if (stick === "Completed") {
    ctx.save();
    ctx.translate(cx + cw - 22, cy + 26);
    ctx.rotate(0.21);
    ctx.fillStyle = "#F6D37A";
    ctx.beginPath();
    ctx.arc(0, 0, 82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2A1418";
    ctx.font = font(800, 27);
    ctx.textAlign = "center";
    ctx.fillText("Completed", 0, 10);
    ctx.restore();
    ctx.textAlign = "left";
  } else if (stick) {
    ctx.save();
    ctx.translate(cx + cw - 30, cy + 20);
    ctx.rotate(stick === "Paused" ? -0.05 : -0.1);
    ctx.font = font(800, 30);
    const sw = ctx.measureText(stick).width + 40;
    ctx.fillStyle = C.ink;
    rr(ctx, -sw + 20, -26, sw, 54, 6);
    ctx.fill();
    ctx.fillStyle = C.wall;
    ctx.fillText(stick, -sw + 40, 10);
    ctx.restore();
  }

  // Text
  const x = 84;
  let y = ly + 150;
  const verb = VERB[e.status];
  ctx.fillStyle = C.ink2;
  ctx.font = font(500, 34);
  ctx.fillText(`${me ? me.display_name : "I"} ${verb}`, x, y);
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 70);
  wrapLines(ctx, g.title, W - x * 2, 2).forEach((s) => {
    y += 80;
    ctx.fillText(s, x, y);
  });
  if (e.rating != null) {
    y += 34;
    for (let i = 0; i < 5; i++) {
      const sx = x + 28 + i * 68,
        sy = y + 28;
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      starShape(ctx, sx, sy, 28);
      ctx.fill();
      const fill = e.rating >= i + 1 ? 1 : e.rating >= i + 0.5 ? 0.5 : 0;
      if (fill) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx - 29, sy - 29, 58 * fill, 58);
        ctx.clip();
        ctx.fillStyle = "#F6D37A";
        starShape(ctx, sx, sy, 28);
        ctx.fill();
        ctx.restore();
      }
    }
    y += 58;
  }
  const metaParts = [e.hours ? fmtHours(e.hours) + " played" : "", e.status === "finished" ? took(e) : ""].filter(
    Boolean,
  );
  const bottomLimit = H - 130;
  if (e.review) {
    ctx.font = font(400, 36);
    if (includeReview) {
      ctx.fillStyle = C.body;
      const room = Math.max(1, Math.min(5, Math.floor((bottomLimit - y - 16) / 50)));
      wrapLines(ctx, "“" + e.review.replace(/\s+/g, " ").trim() + "”", W - x * 2, room).forEach((q) => {
        y += 50;
        ctx.fillText(q, x, y);
      });
    } else if (e.spoiler) {
      ctx.fillStyle = C.dim;
      y += 50;
      ctx.fillText("Review hidden: it has spoilers", x, y);
    }
  }
  // Footer
  const fy = H - 70;
  if (metaParts.length) {
    ctx.fillStyle = C.ink2;
    ctx.font = font(500, 28);
    ctx.fillText(
      metaParts.join(", ").replace(/^./, (c) => c.toUpperCase()),
      x,
      fy,
    );
  }
  ctx.font = font(800, 32);
  ctx.fillStyle = C.ink;
  const brand = "Save Point";
  const bw = ctx.measureText(brand).width;
  ctx.fillText(brand, W - x - bw, fy);
  const ix = W - x - bw - 44,
    iy = fy - 30;
  ctx.fillStyle = "#141416";
  rr(ctx, ix, iy, 30, 38, 5);
  ctx.fill();
  ctx.fillStyle = C.ink;
  rr(ctx, ix + 7, iy + 3, 20, 32, 2);
  ctx.fill();
  ctx.fillStyle = "#F6D37A";
  ctx.beginPath();
  ctx.arc(ix + 27, iy + 5, 8, 0, Math.PI * 2);
  ctx.fill();
  if (drewArt) {
    ctx.fillStyle = C.dim;
    ctx.font = font(400, 20);
    ctx.fillText("Cover art via IGDB", x, H - 24);
  }

  return await new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
