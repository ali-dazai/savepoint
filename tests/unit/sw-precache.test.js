import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const version = /const VERSION = "([^"]*)"/.exec(sw)?.[1];
const shellText = /const SHELL = (\[[\s\S]*?\]);/.exec(sw)?.[1];
const SHELL = shellText ? new Function(`return ${shellText}`)() : [];

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return jsFiles(p);
    return d.name.endsWith(".js") ? [p] : [];
  });
}

describe("service worker pre-cache", () => {
  it("parses VERSION and SHELL out of sw.js", () => {
    assert.ok(version, "VERSION not found");
    assert.ok(Array.isArray(SHELL) && SHELL.length > 0, "SHELL not found");
  });
  it("has a versioned cache name", () => {
    assert.match(version, /^savepoint-v\d+$/);
  });
  it("lists only files that exist", () => {
    for (const entry of SHELL.filter((e) => e !== "./")) {
      assert.ok(fs.existsSync(path.join(root, entry)), `missing on disk: ${entry}`);
    }
  });
  it("includes every module under src/", () => {
    const missing = jsFiles(path.join(root, "src"))
      .map((f) => "./" + path.relative(root, f).split(path.sep).join("/"))
      .filter((rel) => !SHELL.includes(rel));
    assert.deepEqual(missing, [], `add to SHELL in sw.js: ${missing.join(", ")}`);
  });
  it("has no duplicates", () => {
    const dupes = SHELL.filter((e, i) => SHELL.indexOf(e) !== i);
    assert.deepEqual(dupes, []);
  });
  it("includes the core shell files", () => {
    for (const f of ["./index.html", "./styles.css", "./config.js", "./vendor/supabase.js", "./manifest.webmanifest"]) {
      assert.ok(SHELL.includes(f), f);
    }
  });
});
