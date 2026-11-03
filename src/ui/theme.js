// Colour: tints taken from each game's cover, the wall (page) palette and the light booklet palette.
import { S, catOf, catRow, idx } from "../core/state.js";
import { $, hash } from "../core/util.js";

// ---------------- Colour: tints taken from each game's cover ----------------
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
export const hsl = (h, s, l) => `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
const tintCache = new Map();
// bg: dark panel behind a game (hero card, game page header). tile: cover placeholder. soft: readable text on either.
export function tintFrom(color, key) {
  const k = (color || "") + "|" + key;
  if (tintCache.has(k)) return tintCache.get(k);
  let h, s;
  const p = hexToHsl(color);
  if (p) { h = p[0]; s = p[1] < 0.1 ? 0.05 : Math.min(0.45, Math.max(0.2, p[1] * 0.7)); }
  else { h = hash(String(key)) % 360; s = 0.22; }
  const t = { bg: hsl(h, s, 0.19), tile: hsl(h, s, 0.25), soft: hsl(h, Math.min(0.55, s + 0.12), 0.84) };
  tintCache.set(k, t);
  return t;
}
export function gameTint(g) { const c = catOf(g); return tintFrom(c && c.cover_color, g.igdb_id || g.id || g.title); }
export function rowTint(r) { const c = catRow(r.igdb_id); return tintFrom((c && c.cover_color) || r.cover_color, r.igdb_id || r.name); }

// ---------------- Case Wall: the wall takes a deep shade of the game you're playing ----------------
const WALL_DEFAULT = [352, 0.38];
export function hueSat(color, key) {
  const p = hexToHsl(color);
  if (p) return [p[0], p[1] < 0.1 ? 0.06 : Math.min(0.5, Math.max(0.22, p[1] * 0.75))];
  return [hash(String(key)) % 360, 0.25];
}
export function gameHueSat(g) { const c = catOf(g); return hueSat(c && c.cover_color, g.igdb_id || g.id || g.title); }
function wallVars(h, s) {
  return {
    "--bg": hsl(h, s, 0.13), "--wall-2": hsl(h, s, 0.085), "--lip": hsl(h, s * 0.9, 0.22),
    "--s1": hsl(h, s, 0.1), "--s2": hsl(h, s * 0.85, 0.19), "--s3": hsl(h, s * 0.85, 0.25), "--sheet": hsl(h, s, 0.11),
    "--ink": hsl(h, 0.5, 0.94), "--body": hsl(h, 0.32, 0.87), "--ink-2": hsl(h, 0.26, 0.79), "--ink-3": hsl(h, 0.16, 0.64),
    "--on-ink": hsl(h, s, 0.12), "--sticker": hsl(h, 0.5, 0.94), "--sticker-ink": hsl(h, s, 0.12),
  };
}
// The game page's manual: light paper, faintly tinted by the game.
export function manualVars(h, s) {
  const ps = Math.min(0.3, s);
  return {
    "--bg": hsl(h, ps, 0.955), "--s1": hsl(h, ps, 0.915), "--s2": hsl(h, ps * 0.8, 0.89), "--s3": hsl(h, ps * 0.8, 0.83),
    "--sheet": hsl(h, ps, 0.955), "--line": "rgba(50, 25, 25, 0.12)", "--line-2": "rgba(50, 25, 25, 0.24)",
    "--ink": hsl(h, 0.45, 0.13), "--body": hsl(h, 0.22, 0.22), "--ink-2": hsl(h, 0.14, 0.32), "--ink-3": hsl(h, 0.1, 0.41),
    "--on-ink": hsl(h, ps, 0.965), "--star": "#D2930F", "--star-empty": "rgba(60, 35, 30, 0.2)", "--danger": "#B3302A",
  };
}
export const styleVars = (v) => Object.entries(v).map(([k, val]) => `${k}:${val}`).join(";");
let wallKey = "";
export function applyWall() {
  const mine = S.entries.filter((e) => e.user_id === S.me && idx.g[e.game_id]).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const pick = mine.find((e) => e.status === "playing") || mine[0];
  const hs = pick ? gameHueSat(idx.g[pick.game_id]) : WALL_DEFAULT;
  const key = hs.map((x) => x.toFixed(2)).join(",");
  if (key === wallKey) return;
  wallKey = key;
  const v = wallVars(hs[0], hs[1]);
  const r = document.documentElement.style;
  Object.entries(v).forEach(([k, val]) => r.setProperty(k, val));
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = v["--bg"];
}
