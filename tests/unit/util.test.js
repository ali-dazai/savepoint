import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  esc,
  norm,
  hash,
  fmtNum,
  fmtHours,
  fmtRating,
  dateInput,
  fromDateInput,
  todayISO,
  parseDay,
  addDays,
  daysUntil,
  fmtDay,
  took,
  since,
  ago,
  safeJson,
  debounce,
  round1,
} from "../../src/core/util.js";

const DAY = 864e5;
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();

describe("esc", () => {
  it("escapes all five HTML characters", () => {
    assert.equal(esc(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  });
  it("leaves plain text alone and stringifies non-strings", () => {
    assert.equal(esc("Hades II"), "Hades II");
    assert.equal(esc(42), "42");
  });
  it("turns null and undefined into an empty string", () => {
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
  });
});

describe("norm", () => {
  it("lowercases and strips everything but a-z and 0-9", () => {
    assert.equal(norm("Baldur's Gate 3!"), "baldursgate3");
    assert.equal(norm("  Hollow-Knight: Silksong "), "hollowknightsilksong");
  });
  it("handles empty input", () => {
    assert.equal(norm(null), "");
    assert.equal(norm(undefined), "");
  });
});

describe("hash", () => {
  it("is deterministic", () => {
    assert.equal(hash("celeste"), hash("celeste"));
  });
  it("returns an unsigned 32-bit integer", () => {
    for (const s of ["", "a", "Elden Ring", "x".repeat(500)]) {
      const h = hash(s);
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${s.slice(0, 10)} -> ${h}`);
    }
  });
  it("gives different values for different inputs", () => {
    assert.notEqual(hash("a"), hash("b"));
    assert.notEqual(hash("Balatro"), hash("balatro"));
  });
});

describe("number formatting", () => {
  it("fmtNum abbreviates thousands and millions", () => {
    assert.equal(fmtNum(999), "999");
    assert.equal(fmtNum(1000), "1k");
    assert.equal(fmtNum(1500), "1.5k");
    assert.equal(fmtNum(12000), "12k");
    assert.equal(fmtNum(1500000), "1.5M");
    assert.equal(fmtNum(1000000), "1M");
  });
  it("fmtHours rounds to one decimal", () => {
    assert.equal(fmtHours(null), "");
    assert.equal(fmtHours(12.34), "12.3h");
    assert.equal(fmtHours(0), "0h");
  });
  it("fmtRating drops the decimal for whole numbers", () => {
    assert.equal(fmtRating(null), "");
    assert.equal(fmtRating(4), "4");
    assert.equal(fmtRating(4.5), "4.5");
  });
  it("round1 rounds to one decimal", () => {
    assert.equal(round1(1.26), 1.3);
    assert.equal(round1(2), 2);
  });
});

describe("date helpers", () => {
  it("dateInput and fromDateInput round trip a local date", () => {
    assert.equal(dateInput(fromDateInput("2024-07-09")), "2024-07-09");
    assert.equal(dateInput(fromDateInput("2024-12-31")), "2024-12-31");
  });
  it("handle empty values", () => {
    assert.equal(dateInput(null), "");
    assert.equal(fromDateInput(""), null);
  });
  it("parseDay returns a local-midnight Date", () => {
    const d = parseDay("2024-03-05");
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2024, 2, 5, 0]);
  });
  it("addDays moves forwards and backwards across month and year ends", () => {
    assert.equal(addDays("2024-01-31", 1), "2024-02-01");
    assert.equal(addDays("2024-01-01", -1), "2023-12-31");
    assert.equal(addDays("2024-02-28", 2), "2024-03-01");
  });
  it("daysUntil counts calendar days from today", () => {
    const today = todayISO();
    assert.equal(daysUntil(today), 0);
    assert.equal(daysUntil(addDays(today, 3)), 3);
    assert.equal(daysUntil(addDays(today, -2)), -2);
  });
  it("fmtDay hides the year only for the current year", () => {
    const year = new Date().getFullYear();
    assert.ok(!fmtDay(`${year}-03-05`).includes(String(year)));
    assert.ok(fmtDay("2001-03-05").includes("2001"));
    assert.ok(fmtDay(`${year}-03-05`, true).includes(String(year)));
  });
});

describe("took", () => {
  const span = (days) => ({
    started_at: "2024-01-01T12:00:00Z",
    finished_at: new Date(Date.parse("2024-01-01T12:00:00Z") + days * DAY).toISOString(),
  });
  it("describes durations in days, weeks and months", () => {
    assert.equal(took(span(0.2)), "in a day");
    assert.equal(took(span(5)), "in 5 days");
    assert.equal(took(span(21)), "in 3 weeks");
    assert.equal(took(span(90)), "in 3 months");
  });
  it("returns empty for missing dates or negative spans", () => {
    assert.equal(took(null), "");
    assert.equal(took({ started_at: "2024-01-01T00:00:00Z" }), "");
    assert.equal(took({ finished_at: "2024-01-01T00:00:00Z" }), "");
    assert.equal(took(span(-5)), "");
  });
});

describe("ago", () => {
  it("uses relative wording for the first week", () => {
    assert.equal(ago(isoAgo(5000)), "just now");
    assert.equal(ago(isoAgo(5 * 60e3 + 1000)), "5m ago");
    assert.equal(ago(isoAgo(3 * 3600e3 + 1000)), "3h ago");
    assert.equal(ago(isoAgo(2 * DAY + 1000)), "2d ago");
  });
  it("falls back to a calendar date after a week", () => {
    const out = ago(isoAgo(30 * DAY));
    assert.ok(!/ago|now/.test(out), out);
  });
});

describe("since", () => {
  it("describes elapsed days, weeks and months", () => {
    assert.equal(since(isoAgo(1000)), "today");
    assert.equal(since(isoAgo(DAY + 1000)), "yesterday");
    assert.equal(since(isoAgo(5 * DAY + 1000)), "5 days ago");
    assert.equal(since(isoAgo(21 * DAY + 1000)), "3 weeks ago");
    assert.equal(since(isoAgo(90 * DAY + 1000)), "3 months ago");
  });
});

describe("safeJson", () => {
  it("parses valid JSON", () => {
    assert.deepEqual(safeJson('{"a":[1,2]}'), { a: [1, 2] });
  });
  it("returns null for invalid JSON", () => {
    assert.equal(safeJson("{nope"), null);
    assert.equal(safeJson(undefined), null);
  });
});

describe("debounce", () => {
  it("fires only the last call", async () => {
    let calls = 0;
    const d = debounce(() => calls++, 20);
    d();
    d();
    d();
    assert.equal(calls, 0);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(calls, 1);
  });
});
