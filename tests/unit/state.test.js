import { test } from "node:test";
import assert from "node:assert/strict";
import {
  S,
  idx,
  myEntry,
  groupScore,
  lastActivity,
  nameOf,
  verbFor,
  groupLine,
  catOf,
  catRow,
  coverUrl,
  releaseInfo,
} from "../../src/core/state.js";
import { loadFixture, ME, MAYA, JON } from "./fixture.js";

test("reindex builds the lookups", () => {
  loadFixture();
  assert.equal(idx.p[MAYA].display_name, "Maya");
  assert.equal(idx.g.g3.title, "Balatro");
  assert.equal(idx.c[1001].name, "Elden Ring");
  assert.equal(idx.byIgdb[1003].id, "g3");
  assert.deepEqual(
    idx.byGame.g1.map((e) => e.id),
    ["e1", "e2", "e3"],
  );
  assert.equal(idx.byGame.nope, undefined);
});

test("myEntry finds only my log", () => {
  loadFixture();
  assert.equal(myEntry("g1").id, "e1");
  assert.equal(myEntry("g2"), null); // only Maya logged Celeste
  assert.equal(myEntry("missing"), null);
});

test("groupScore averages every rating on the game", () => {
  loadFixture();
  assert.deepEqual(groupScore("g1"), { avg: (5 + 4.5 + 2) / 3, n: 3 });
  assert.deepEqual(groupScore("g4"), null); // one want-to-play log, no rating
});

test("lastActivity is the newest of the game and its logs", () => {
  loadFixture();
  const g3 = idx.g.g3;
  const newest = Math.max(
    new Date(g3.created_at).getTime(),
    ...idx.byGame.g3.map((e) => new Date(e.updated_at).getTime()),
  );
  assert.equal(lastActivity("g3"), newest);
  assert.ok(lastActivity("g4") > lastActivity("g1")); // wanted 4 days ago beats finished 5 days ago
});

test("nameOf and verbFor speak in the second person for me", () => {
  loadFixture();
  assert.equal(nameOf(ME), "You");
  assert.equal(nameOf(JON), "Jon");
  assert.equal(nameOf("ghost"), "Someone");
  assert.equal(verbFor({ user_id: ME, status: "playing" }), "are playing");
  assert.equal(verbFor({ user_id: MAYA, status: "playing" }), "is playing");
  assert.equal(verbFor({ user_id: ME, status: "want" }), "want to play");
});

test("groupLine puts me first, then the most recent friends, then a count", () => {
  loadFixture();
  assert.equal(groupLine("g1"), "You finished, Maya finished, 1 more");
  assert.equal(groupLine("g1", 3), "You finished, Maya finished, Jon dropped");
  assert.equal(groupLine("g2"), "Maya finished");
  assert.equal(groupLine("nothing"), "");
});

test("catOf and catRow resolve catalogue rows, including rows only seen off the shelf", () => {
  loadFixture();
  assert.equal(catOf(idx.g.g1).name, "Elden Ring");
  assert.equal(catOf(idx.g.g2), null); // hand-added, not linked
  assert.equal(catOf(null), null);
  S.ext[7777] = { igdb_id: 7777, name: "Off the shelf" };
  assert.equal(catRow(7777).name, "Off the shelf");
  assert.equal(catRow(1001).name, "Elden Ring");
  assert.equal(catRow(1), null);
});

test("coverUrl prefers a pasted https link, else the IGDB image, else nothing", () => {
  loadFixture();
  assert.equal(coverUrl(idx.g.g2, "cover_big"), "https://example.com/celeste.jpg");
  assert.equal(coverUrl(idx.g.g1, "cover_big"), "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg");
  assert.equal(coverUrl(idx.g.g4, "cover_big"), ""); // catalogue row without an image
  assert.equal(coverUrl({ cover_url: "http://insecure.example/x.jpg" }, "cover_big"), "");
});

test("releaseInfo: released, precise upcoming day, vague text, unknown", () => {
  loadFixture();
  assert.deepEqual(releaseInfo(catOf(idx.g.g1)), { upcoming: false });
  const soon = releaseInfo(catOf(idx.g.g4));
  assert.equal(soon.upcoming, true);
  assert.equal(soon.precise, true);
  assert.equal(soon.date, "2099-11-19");
  assert.match(soon.short, /Nov 19, 2099/);
  const vague = releaseInfo({ first_release_date: "2099-12-31", release_human: "Q4 2099" });
  assert.deepEqual(vague, { upcoming: true, precise: false, date: null, short: "Q4 2099" });
  assert.deepEqual(releaseInfo({ first_release_date: null, release_human: "TBD" }), {
    upcoming: true,
    precise: false,
    date: null,
    short: "TBD",
  });
  assert.equal(releaseInfo({}), null);
  assert.equal(releaseInfo(null), null);
});
