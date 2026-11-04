import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DemoApi, ME } from "../../src/data/demo.js";

describe("DemoApi", () => {
  describe("basics", () => {
    it("loadAll returns the four collections", async () => {
      const db = await new DemoApi().loadAll();
      for (const k of ["profiles", "games", "entries", "catalog"]) {
        assert.ok(Array.isArray(db[k]) && db[k].length > 0, k);
      }
    });
    it("loadAll returns a deep copy", async () => {
      const api = new DemoApi();
      const a = await api.loadAll();
      const count = a.games.length;
      const title = a.games[0].title;
      a.games.push({ id: "x" });
      a.games[0].title = "changed";
      const b = await api.loadAll();
      assert.equal(b.games.length, count);
      assert.equal(b.games[0].title, title);
    });
    it("session and isMember describe the demo user", async () => {
      const api = new DemoApi();
      assert.deepEqual(await api.session(), { userId: ME, email: "demo@example.com" });
      assert.equal(await api.isMember(), true);
    });
    it("updateProfile changes display_name", async () => {
      const api = new DemoApi();
      await api.updateProfile(ME, { display_name: "Renamed" });
      const { profiles } = await api.loadAll();
      assert.equal(profiles.find((p) => p.id === ME).display_name, "Renamed");
    });
    it("reset restores the seed", async () => {
      const api = new DemoApi();
      const seedCount = (await api.loadAll()).games.length;
      const own = (await api.loadAll()).games.find((x) => x.added_by === ME);
      await api.deleteGame(own.id);
      assert.equal((await api.loadAll()).games.length, seedCount - 1);
      api.reset();
      assert.equal((await api.loadAll()).games.length, seedCount);
    });
  });

  describe("games", () => {
    it("addGame returns a row with id, added_by and created_at", async () => {
      const g = await new DemoApi().addGame({ title: "New Game", igdb_id: 123456 });
      assert.equal(typeof g.id, "string");
      assert.equal(g.added_by, ME);
      assert.ok(!Number.isNaN(Date.parse(g.created_at)));
      assert.equal(g.title, "New Game");
    });
    it("addGame rejects a duplicate igdb_id", async () => {
      await assert.rejects(new DemoApi().addGame({ title: "Dup", igdb_id: 9001 }), /already on the shelf/);
    });
    it("deleteGame refuses a game someone else added", async () => {
      const api = new DemoApi();
      const { games } = await api.loadAll();
      const other = games.find((g) => g.added_by !== ME);
      await assert.rejects(api.deleteGame(other.id), /Only the friend who added/);
      assert.ok((await api.loadAll()).games.some((g) => g.id === other.id));
    });
    it("deleteGame removes your own game and its entries", async () => {
      const api = new DemoApi();
      const g = await api.addGame({ title: "Mine" });
      await api.saveEntry(null, g.id, { status: "want" });
      assert.equal((await api.loadAll()).entries.filter((e) => e.game_id === g.id).length, 1);
      await api.deleteGame(g.id);
      const db = await api.loadAll();
      assert.ok(!db.games.some((x) => x.id === g.id));
      assert.equal(db.entries.filter((e) => e.game_id === g.id).length, 0);
    });
    it("linkGame rejects an igdb_id another game already has", async () => {
      const api = new DemoApi();
      const g = await api.addGame({ title: "Unlinked" });
      await assert.rejects(api.linkGame(g.id, 9001), /already on the shelf/);
      await api.linkGame(g.id, 777777);
      assert.equal((await api.loadAll()).games.find((x) => x.id === g.id).igdb_id, 777777);
    });
  });

  describe("entries", () => {
    const find = async (api, id) => (await api.loadAll()).entries.find((e) => e.id === id);
    const create = async (api, fields) => {
      const g = await api.addGame({ title: "Entry host" });
      await api.saveEntry(null, g.id, fields);
      return (await api.loadAll()).entries.find((e) => e.game_id === g.id);
    };

    it("a new playing entry gets started_at", async () => {
      const e = await create(new DemoApi(), { status: "playing" });
      assert.ok(e.started_at);
      assert.equal(e.finished_at, null);
      assert.equal(e.user_id, ME);
    });
    it("a new finished entry gets finished_at", async () => {
      const e = await create(new DemoApi(), { status: "finished" });
      assert.ok(e.finished_at);
    });
    it("moving playing to finished sets finished_at and keeps started_at", async () => {
      const api = new DemoApi();
      const e = await create(api, { status: "playing" });
      await api.saveEntry(e.id, e.game_id, { status: "finished" });
      const after = await find(api, e.id);
      assert.equal(after.started_at, e.started_at);
      assert.ok(after.finished_at);
    });
    it("addHours adds and rounds to one decimal", async () => {
      const api = new DemoApi();
      const e = await create(api, { status: "playing", hours: 10 });
      assert.equal(await api.addHours(e.id, 5.25), 15.3);
      assert.equal((await find(api, e.id)).hours, 15.3);
    });
    it("addHours clamps to [0, 99999]", async () => {
      const api = new DemoApi();
      const e = await create(api, { status: "playing", hours: 10 });
      assert.equal(await api.addHours(e.id, -500), 0);
      assert.equal(await api.addHours(e.id, 1e6), 99999);
    });
    it("addHours throws for an unknown entry", async () => {
      await assert.rejects(new DemoApi().addHours("nope", 1), /Couldn't update your hours/);
    });
  });

  describe("catalog", () => {
    it("catalogSearch returns [] for queries under 2 characters", async () => {
      const api = new DemoApi();
      assert.deepEqual(await api.catalogSearch(""), []);
      assert.deepEqual(await api.catalogSearch("h"), []);
      assert.deepEqual(await api.catalogSearch(null), []);
    });
    it("catalogSearch finds hollow", async () => {
      const res = await new DemoApi().catalogSearch("hollow");
      assert.equal(res.length, 2);
      assert.ok(res.every((r) => /hollow/i.test(r.name) && typeof r.igdb_id === "number"));
    });
    it("catalogGet throws for an unknown id", async () => {
      await assert.rejects(new DemoApi().catalogGet(1), /isn't in the games database/);
    });
    it("catalogGet stores the row so loadAll includes it", async () => {
      const api = new DemoApi();
      assert.ok(!(await api.loadAll()).catalog.some((c) => c.igdb_id === 9002));
      const row = await api.catalogGet(9002);
      assert.equal(row.igdb_id, 9002);
      assert.ok((await api.loadAll()).catalog.some((c) => c.igdb_id === 9002));
    });
    it("catalogSteam returns null for a game without Steam data", async () => {
      assert.equal(await new DemoApi().catalogSteam(9002), null);
    });
    it("catalogSteam returns the demo data for a game that has it", async () => {
      const st = await new DemoApi().catalogSteam(9001);
      assert.equal(st.pct, 96);
      assert.equal(st.desc, "Overwhelmingly Positive");
    });
    it("catalogDiscover returns trending and upcoming lists", async () => {
      const d = await new DemoApi().catalogDiscover();
      assert.ok(d.trending.length > 0 && d.upcoming.length > 0);
      for (const t of d.trending) {
        assert.equal(typeof t.igdb_id, "number");
        assert.equal(typeof t.name, "string");
        assert.equal(typeof t.reason, "string");
      }
      for (const u of d.upcoming) {
        assert.ok(u.date === null || /^\d{4}-\d{2}-\d{2}$/.test(u.date));
        assert.equal(typeof u.human, "string");
      }
    });
  });
});
