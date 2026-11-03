import { test } from "node:test";
import assert from "node:assert/strict";
import { S } from "../../src/core/state.js";
import { platKinds, calendarItems } from "../../src/features/discover/view.js";
import { wrapLines } from "../../src/features/share/card.js";
import { loadFixture, MAYA } from "./fixture.js";

test("platKinds maps IGDB platform abbreviations to the four filter families", () => {
  assert.deepEqual([...platKinds(["PC", "Mac", "Linux"])], ["pc"]);
  assert.deepEqual([...platKinds(["PS5", "PlayStation 4"])], ["ps"]);
  assert.deepEqual([...platKinds(["XSX", "XONE", "Xbox Series X|S"])], ["xbox"]);
  assert.deepEqual([...platKinds(["Switch", "NSW", "NS2"])], ["switch"]);
  assert.deepEqual([...platKinds(["PC", "PS5", "Switch", "Quest", "iOS"])].sort(), ["pc", "ps", "switch"]);
  assert.deepEqual([...platKinds(null)], []);
});

test("calendarItems: wishlist games on the shelf plus the server's upcoming list, merged by igdb_id", () => {
  loadFixture();
  const items = calendarItems({
    upcoming: [
      {
        igdb_id: 1004,
        name: "Ghost Harbor (server copy)",
        date: "2099-11-19",
        human: "Nov 19, 2099",
        platforms: ["PC"],
      },
      { igdb_id: 5001, name: "Big Release", date: "2099-03-02", human: "Mar 02, 2099", platforms: ["PS5"], hypes: 10 },
      { igdb_id: 5002, name: "Someday", date: "2099-12-31", human: "2099", platforms: ["PC"] },
      { igdb_id: 5003, name: "Already out", date: "2000-01-01", human: "Jan 01, 2000", platforms: ["PC"] },
    ],
  });
  const byId = Object.fromEntries(items.map((it) => [it.igdb_id, it]));
  // my wishlist game keeps the shelf's title and is flagged as mine, not overwritten by the server copy
  assert.equal(byId[1004].name, "Ghost Harbor");
  assert.equal(byId[1004].mine, true);
  assert.deepEqual(byId[1004].wanters, []);
  assert.equal(byId[1004].date, "2099-11-19");
  // a big release from the server
  assert.equal(byId[5001].big, true);
  assert.equal(byId[5001].mine, false);
  assert.match(byId[5001].human, /Mar 2/);
  // vague dates stay as text with no day
  assert.equal(byId[5002].date, null);
  assert.equal(byId[5002].human, "2099");
  // released games drop out
  assert.equal(byId[5003], undefined);
  assert.equal(items.length, 3);
});

test("calendarItems: a friend's wishlist game shows who wants it; without a date it can borrow the server's", () => {
  loadFixture();
  S.entries.push({
    id: "e9",
    game_id: "g4",
    user_id: MAYA,
    status: "want",
    rating: null,
    hours: null,
    review: null,
    updated_at: new Date().toISOString(),
  });
  S.catalog.find((c) => c.igdb_id === 1004).first_release_date = null;
  S.catalog.find((c) => c.igdb_id === 1004).release_human = "TBD";
  loadFixture({ entries: S.entries, catalog: S.catalog });
  const [it] = calendarItems({
    upcoming: [{ igdb_id: 1004, name: "x", date: "2099-11-19", human: "Nov 19, 2099", platforms: [] }],
  });
  assert.equal(it.mine, true);
  assert.deepEqual(it.wanters, [MAYA]);
  assert.equal(it.date, "2099-11-19", "precise server date fills in a TBD wishlist entry");
});

test("wrapLines fits words into lines and ellipsises the last one", () => {
  const ctx = { measureText: (s) => ({ width: s.length * 10 }) }; // 10px per character
  assert.deepEqual(wrapLines(ctx, "one two three four", 90, 3), ["one two", "three", "four"]);
  assert.deepEqual(wrapLines(ctx, "one two three four five six", 90, 2), ["one two", "three…"]);
  assert.deepEqual(wrapLines(ctx, "supercalifragilistic", 50, 2), ["supercalifragilistic"]); // one over-long word is kept whole
  assert.deepEqual(wrapLines(ctx, "", 100, 2), []);
  assert.deepEqual(wrapLines(ctx, "  spaced   out  ", 200, 1), ["spaced out"]);
  // a trailing comma before the ellipsis is trimmed
  assert.deepEqual(wrapLines(ctx, "alpha, beta, gamma", 60, 1), ["alpha…"]);
});
