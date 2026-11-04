// Runs in its own process (node --test isolates files), so the fake localStorage is in place before state.js loads.
import { test } from "node:test";
import assert from "node:assert/strict";

const stored = {
  "sp-tab": "settings",
  "sp-scope": "everyone",
  "sp-sort": "rated",
  "sp-disc-view": "list",
  "sp-plat": "xbox",
};
globalThis.localStorage = { getItem: (k) => (k in stored ? stored[k] : null), setItem() {}, removeItem() {} };
const { S } = await import("../../src/core/state.js");
const { storedChoice } = await import("../../src/core/util.js");

test("unknown remembered values fall back to the defaults; valid ones are kept", () => {
  assert.equal(S.tab, "feed"); // "settings" isn't a tab
  assert.equal(S.scope, "mine"); // "everyone" isn't a scope
  assert.equal(S.sort, "rated"); // valid, kept
  assert.equal(S.discView, "trending"); // "list" isn't a view
  assert.equal(S.plat, "xbox"); // valid, kept
});

test("storedChoice", () => {
  assert.equal(storedChoice("sp-sort", ["recent", "rated"], "recent"), "rated");
  assert.equal(storedChoice("sp-scope", ["mine", "all"], "mine"), "mine");
  assert.equal(storedChoice("missing", ["a"], "a"), "a");
});
