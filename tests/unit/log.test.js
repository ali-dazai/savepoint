import { test } from "node:test";
import assert from "node:assert/strict";
import { S, myEntry } from "../../src/core/state.js";
import { applyLocalEntry, queueFor } from "../../src/features/game/log.js";
import { loadFixture } from "./fixture.js";

test("applyLocalEntry mirrors the database trigger: start and finish dates fill in once", () => {
  loadFixture();
  // Ghost Harbor: want → playing sets started_at
  const e = applyLocalEntry("g4", { status: "playing" });
  assert.equal(e.id, "e7");
  assert.equal(e.status, "playing");
  assert.ok(e.started_at, "started_at set when a log becomes Playing");
  assert.equal(e.finished_at, null);
  const started = e.started_at;
  // playing → playing again does not move the start date
  applyLocalEntry("g4", { status: "playing", hours: 2 });
  assert.equal(myEntry("g4").started_at, started);
  assert.equal(myEntry("g4").hours, 2);
  // → finished sets finished_at, keeps started_at
  applyLocalEntry("g4", { status: "finished" });
  assert.equal(myEntry("g4").started_at, started);
  assert.ok(myEntry("g4").finished_at);
  // updated_at always moves
  assert.ok(myEntry("g4").updated_at >= started);
});

test("applyLocalEntry creates a temporary entry for a game I haven't logged", () => {
  loadFixture();
  assert.equal(myEntry("g2"), null);
  const e = applyLocalEntry("g2", { status: "want", rating: null, hours: null, review: null });
  assert.match(e.id, /^tmp-/);
  assert.equal(e.user_id, S.me);
  assert.equal(e.game_id, "g2");
  assert.equal(e.started_at, null); // Want to play never starts the clock
  assert.equal(myEntry("g2"), e);
  assert.equal(S.entries.length, 8);
});

test("queueFor runs saves for one game strictly one after another, independently per game", async () => {
  loadFixture();
  const log = [];
  const slow = (name, ms) => () =>
    new Promise((resolve) => {
      log.push(name + " start");
      setTimeout(() => {
        log.push(name + " end");
        resolve(name);
      }, ms);
    });
  const a = queueFor("g1", slow("a", 30));
  const b = queueFor("g1", slow("b", 5));
  const c = queueFor("g3", slow("c", 5)); // another game: not blocked by a
  assert.deepEqual(await Promise.all([a, b, c]), ["a", "b", "c"]);
  assert.deepEqual(log, ["a start", "c start", "c end", "a end", "b start", "b end"]);
  assert.deepEqual(Object.keys(S.pending), [], "finished queues are cleaned up");
});

test("queueFor: a failed save does not block the next one for that game", async () => {
  loadFixture();
  const failed = queueFor("g1", () => Promise.reject(new Error("offline")));
  await assert.rejects(failed, /offline/);
  assert.equal(await queueFor("g1", async () => "next"), "next");
});
