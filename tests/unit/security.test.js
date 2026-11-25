// Guards for the 2026-11-25 security sweep: the Content-Security-Policy, no inline event handlers, and the
// service worker's offline fallback.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
function walk(dir) {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : [],
    );
}
function csp() {
  const m = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(read("index.html"));
  assert.ok(m, "index.html has a Content-Security-Policy meta tag");
  return Object.fromEntries(
    m[1]
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((p) => p[0])
      .map(([name, ...vals]) => [name, vals]),
  );
}

test("CSP: scripts only from this site, no eval, no plugins, no <base> tricks", () => {
  const p = csp();
  assert.deepEqual(p["script-src"], ["'self'"]);
  assert.deepEqual(p["default-src"], ["'self'"]);
  assert.deepEqual(p["object-src"], ["'none'"]);
  assert.deepEqual(p["base-uri"], ["'none'"]);
  assert.ok(!Object.values(p).flat().includes("'unsafe-eval'"));
});

test("CSP: connect-src allows exactly the Supabase project in config.js (https and wss)", () => {
  const url = /supabaseUrl:\s*"([^"]+)"/.exec(read("config.js"))[1];
  const host = new URL(url).host;
  assert.deepEqual(p_sorted(csp()["connect-src"]), p_sorted(["'self'", `https://${host}`, `wss://${host}`]));
});
const p_sorted = (a) => [...a].sort();

test("no inline event handlers (onerror=, onclick=...) in index.html or the app's HTML templates", () => {
  for (const f of ["index.html", ...walk("src")]) {
    assert.doesNotMatch(
      read(f),
      /\son(?:error|load|click|input|change|submit|focus|blur|mouse[a-z]*|key[a-z]*|touch[a-z]*|pointer[a-z]*)\s*=/,
      f,
    );
  }
});

test("service worker: offline fallback to index.html only for page loads", () => {
  const sw = read("sw.js");
  assert.match(
    sw,
    /req\.mode === "navigate"\s*\?\s*caches\.match\("\.\/index\.html"\)\.then\(\(p\) => p \|\| Response\.error\(\)\)/,
  );
});
