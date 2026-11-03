// Small pure helpers: escaping, hashing, dates, number formatting, DOM lookup.
import { DAY_MS } from "./constants.js";

export function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
export function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} }
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
export function since(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
export function fmtHours(h) { return h == null ? "" : (Math.round(h * 10) / 10) + "h"; }
export function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e4) return Math.round(n / 1e3) + "k";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
export function dateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromDateInput(v) { return v ? new Date(v + "T12:00:00").toISOString() : null; }
export function todayISO() { return dateInput(new Date().toISOString()); }
export function parseDay(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return dateInput(d.toISOString()); }
export function fmtDay(s, withYear) {
  const d = parseDay(s);
  const show = withYear || d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: show ? "numeric" : undefined });
}
export function daysUntil(s) { return Math.round((parseDay(s) - parseDay(todayISO())) / DAY_MS); }
export function took(e) {
  if (!e || !e.started_at || !e.finished_at) return "";
  const days = Math.round((new Date(e.finished_at) - new Date(e.started_at)) / DAY_MS);
  if (days < 0) return "";
  if (days < 1) return "in a day";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
export function fmtRating(r) { return r == null ? "" : (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)); }
export const round1 = (n) => Math.round(n * 10) / 10;
export const $ = (sel, root = document) => root.querySelector(sel);
export function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }
export function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }
