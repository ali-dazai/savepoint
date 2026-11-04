// Keeps the module layout honest: layers only import downwards, and there are no import cycles.
// See docs/ARCHITECTURE.md ("Folders" and "How a screen works").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const src = path.join(root, "src");

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? jsFiles(p) : d.name.endsWith(".js") ? [p] : [];
  });
}
const files = jsFiles(src).map((f) => path.relative(src, f).split(path.sep).join("/"));
const graph = Object.fromEntries(
  files.map((f) => {
    const text = fs.readFileSync(path.join(src, f), "utf8");
    const deps = [...text.matchAll(/^import [^"]*"(\.[^"]+)";/gm)].map((m) =>
      path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])),
    );
    return [f, deps];
  }),
);
const layer = (f) => (f === "main.js" ? "main" : f.split("/")[0]);

test("every import resolves to a file under src/", () => {
  for (const [f, deps] of Object.entries(graph))
    for (const d of deps) assert.ok(files.includes(d), `${f} imports missing ${d}`);
});

test("layers only import downwards: core ← data ← ui ← features ← app ← main", () => {
  // What each layer may import. features may call the two orchestration modules in app (reload, boot) and each other.
  const allowed = {
    core: ["core"],
    data: ["core", "data"],
    ui: ["core", "ui"],
    features: ["core", "data", "ui", "features", "app/reload.js", "app/boot.js"],
    app: ["core", "data", "ui", "features", "app"],
    main: ["core", "data", "ui", "features", "app"],
  };
  const bad = [];
  for (const [f, deps] of Object.entries(graph)) {
    for (const d of deps) {
      const ok = allowed[layer(f)].some((rule) => d === rule || layer(d) === rule);
      if (!ok) bad.push(`${f} → ${d}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("no import cycles", () => {
  const cycles = [];
  const visit = (node, stack) => {
    for (const d of graph[node] || []) {
      const i = stack.indexOf(d);
      if (i >= 0) cycles.push(stack.slice(i).concat(d).join(" → "));
      else visit(d, stack.concat(d));
    }
  };
  for (const f of files) visit(f, [f]);
  assert.deepEqual(cycles, []);
});

test("src/data is the only place that knows about supabase-js", () => {
  for (const f of files) {
    const text = fs.readFileSync(path.join(src, f), "utf8");
    if (!f.startsWith("data/")) assert.doesNotMatch(text, /window\.supabase|createClient\(/, f);
  }
});
