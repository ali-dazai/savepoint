import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutHTML } from "../../src/features/game/page.js";

test("aboutHTML links out only to a real IGDB page and a numeric Steam app id", () => {
  const ok = aboutHTML({
    igdb_url: "https://www.igdb.com/games/elden-ring",
    steam_appid: "1245620",
    genres: ["RPG"],
    summary: "Rise.",
  });
  assert.match(ok, /href="https:\/\/www\.igdb\.com\/games\/elden-ring"/);
  assert.match(ok, /href="https:\/\/store\.steampowered\.com\/app\/1245620"/);
  assert.match(ok, /<span>RPG<\/span>/);

  const bad = aboutHTML({
    igdb_url: "javascript:alert(1)",
    steam_appid: '1" onmouseover="alert(1)',
    summary: "<b>x</b>",
  });
  assert.doesNotMatch(bad, /javascript:/);
  assert.doesNotMatch(bad, /onmouseover/);
  assert.doesNotMatch(bad, /store\.steampowered/);
  assert.match(bad, /&lt;b&gt;x&lt;\/b&gt;/, "summary is escaped");
  assert.match(bad, /Game data from IGDB<\/p>/, "the credit still shows without links");

  assert.doesNotMatch(aboutHTML({ igdb_url: "https://evil.example/igdb.com/" }), /href=/);
  assert.equal(aboutHTML(null), "");
});
