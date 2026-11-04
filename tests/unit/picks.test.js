import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "../../src/core/state.js";
import { taste, friendPicks, similarPicks, picksFor, pickReason, findRow } from "../../src/features/picks/picks.js";
import { loadFixture, ME, MAYA, JON } from "./fixture.js";

test("taste: 100 × (1 − mean |diff| / 4.5) over games both rated, needs 2 pairs", () => {
  loadFixture();
  // Sam and Maya both rated Elden Ring (5 vs 4.5) and Balatro (4 vs 4.5): mean diff 0.5
  const t = taste(MAYA);
  assert.equal(t.n, 2);
  assert.equal(t.pct, Math.round(100 * (1 - 0.5 / 4.5)));
  assert.deepEqual(
    t.pairs.map((p) => p.gameId),
    ["g1", "g3"],
  );
  // Jon shares only Elden Ring with Sam: no percentage yet
  assert.deepEqual(taste(JON), { n: 1, pct: null, pairs: [{ gameId: "g1", me: 5, them: 2 }] });
  assert.equal(taste(ME), null);
  S.me = null;
  assert.equal(taste(MAYA), null);
});

test("friendPicks: shelf games I haven't logged, rated 3.5+ by friends, weighted by taste", () => {
  loadFixture();
  const picks = friendPicks();
  // Celeste is the only shelf game Sam hasn't logged; Maya (89% match) rated it 5
  assert.equal(picks.length, 1);
  assert.equal(picks[0].kind, "friend");
  assert.equal(picks[0].game.id, "g2");
  assert.equal(picks[0].reason, `Maya rated it 5, ${taste(MAYA).pct}% match`);
  assert.equal(pickReason("g2"), picks[0].reason);
  assert.equal(pickReason("g1"), "");
});

test("friendPicks: a low rating keeps a game out; a friend without a match still counts at weight 0.6", () => {
  loadFixture();
  S.entries = S.entries.filter((e) => e.id !== "e4"); // Maya's Celeste review goes away
  S.entries.push({
    id: "e8",
    game_id: "g2",
    user_id: JON,
    status: "finished",
    rating: 3,
    hours: 5,
    review: "",
    updated_at: new Date().toISOString(),
  });
  loadFixture({ entries: S.entries });
  assert.equal(friendPicks().length, 0); // Jon rated it 3, below the 3.5 bar
  S.entries.find((e) => e.id === "e8").rating = 4;
  loadFixture({ entries: S.entries });
  const picks = friendPicks();
  assert.equal(picks.length, 1);
  assert.equal(picks[0].reason, "Jon rated it 4"); // no match percentage: too few shared games
});

test("similarPicks: IGDB similar games of my liked linked games, not already on the shelf, ranked by how many point to them", () => {
  loadFixture();
  S.similar = {
    key: "x",
    games: [
      { igdb_id: 2001, name: "Dark Souls III", critic_score: 89 },
      { igdb_id: 2002, name: "Hollow Knight", critic_score: 88 },
      { igdb_id: 2003, name: "Slay the Spire", critic_score: 90 },
      { igdb_id: 1003, name: "Balatro (already on the shelf)", critic_score: 99 },
      { igdb_id: 9999, name: "Not a seed", critic_score: 99 },
    ],
  };
  const picks = similarPicks();
  assert.deepEqual(
    picks.map((p) => p.row.igdb_id),
    [2002, 2003, 2001],
  ); // Hollow Knight is pointed to by both liked games; then the two singles by critic score
  assert.equal(picks[0].kind, "similar");
  assert.equal(picks[0].reason, "Like Elden Ring and Balatro");
  assert.equal(picks[2].reason, "Like Elden Ring");
});

test("picksFor: up to 6 friend picks first, then similar picks to fill 10", () => {
  loadFixture();
  S.similar = {
    key: "x",
    games: [
      { igdb_id: 2001, name: "A" },
      { igdb_id: 2002, name: "B" },
    ],
  };
  const all = picksFor();
  assert.equal(all.length, 3);
  assert.equal(all[0].kind, "friend");
  assert.ok(all.slice(1).every((p) => p.kind === "similar"));
  S.similar = null;
  assert.equal(picksFor().length, 1);
});

test("findRow looks through picks, Discover and search results, then the catalogue", () => {
  loadFixture();
  S.similar = { key: "x", games: [{ igdb_id: 2001, name: "From picks" }] };
  S.disc = {
    data: {
      trending: [{ igdb_id: 3001, name: "From trending" }],
      upcoming: [{ igdb_id: 3002, name: "From calendar" }],
    },
  };
  S.cat = { results: [{ igdb_id: 3003, name: "From search" }] };
  assert.equal(findRow(2001).name, "From picks");
  assert.equal(findRow(3001).name, "From trending");
  assert.equal(findRow(3002).name, "From calendar");
  assert.equal(findRow(3003).name, "From search");
  // a catalogue row is turned into the light shape the pages expect
  assert.deepEqual(findRow(1001), {
    igdb_id: 1001,
    name: "Elden Ring",
    cover_image_id: "co4jni",
    platforms: ["PC", "PS5"],
    year: 2022,
  });
  assert.equal(findRow(424242), null);
  S.disc = null;
  S.cat = null;
});
