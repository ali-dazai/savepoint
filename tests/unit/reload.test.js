import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "../../src/core/state.js";
import { reloadQuietly } from "../../src/app/reload.js";

test("reloadQuietly swallows a failed background load (offline) instead of rejecting", async () => {
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  S.api = { loadAll: () => Promise.reject(new Error("Failed to fetch")) };
  const before = { games: S.games, lastLoad: S.lastLoad };
  assert.equal(await reloadQuietly(), undefined);
  await new Promise((r) => setTimeout(r, 20)); // give any stray rejection a chance to surface
  process.off("unhandledRejection", onUnhandled);
  assert.deepEqual(unhandled, []);
  assert.equal(S.games, before.games, "the data on screen is left alone");
  assert.equal(S.lastLoad, before.lastLoad, "a failed load doesn't count as fresh");
});
