// P5 buy-or-wait: the texts and HTML of the "Price on Steam" card, the data clean-up and the index lookup.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ITAD_URL, money, pctText, priceAdvice, priceCard } from "../../src/features/game/price.js";
import { cleanPrice } from "../../src/data/supabase.js";
import { demoPrices } from "../../src/data/demo.js";
import { S, idx, priceOf, reindex } from "../../src/core/state.js";

const DAY = 864e5;
const NOW = Date.parse("2026-11-25T12:00:00Z");
const at = (days) => new Date(NOW - days * DAY).toISOString();
const row = (over = {}) => ({
  igdb_id: 1001,
  steam_appid: "1245620",
  country: "AE",
  currency: "AED",
  regular_price: 92,
  current_price: 92,
  current_cut: 0,
  low_1y: 69,
  median_past_cut: 25,
  sales_seen: 3,
  history_days: 380,
  p_30: 0.72,
  p_90: 0.88,
  verdict: "wait",
  basis: "model",
  confidence: "medium",
  reason: "The winter sale is a few weeks away.",
  model_version: "test-1",
  computed_at: at(2),
  ...over,
});

describe("priceAdvice", () => {
  it("wait / model / medium", () => {
    const a = priceAdvice(row(), NOW);
    assert.equal(a.headline, "Wait for a sale");
    assert.equal(a.tone, "pw-wait");
    assert.equal(a.odds, "72% chance of a 20%+ sale within 30 days, 88% within 90");
    assert.equal(a.sale, "");
    assert.equal(a.drought, "");
    assert.equal(a.confidence, "Medium confidence");
    assert.equal(a.reason, "The winter sale is a few weeks away.");
    assert.equal(a.context, "Regular AED 92.00 · 1-year low AED 69.00 · usually −25%");
    assert.equal(a.footer, "Steam AE prices · updated 2 days ago");
  });

  it("buy / model / high with no sale in years says so", () => {
    const a = priceAdvice(
      row({
        verdict: "buy",
        confidence: "high",
        sales_seen: 0,
        history_days: 1130,
        p_30: 0.03,
        p_90: 0.08,
        median_past_cut: null,
        reason: "Rarely discounted.",
      }),
      NOW,
    );
    assert.equal(a.headline, "Buy now");
    assert.equal(a.tone, "pw-buy");
    assert.equal(a.odds, "under 5% chance of a 20%+ sale within 30 days, 8% within 90");
    assert.equal(a.drought, "Hasn't been on a 20%+ sale in 3 years");
    assert.equal(a.confidence, "High confidence");
  });

  it("one year of sale-free history reads 'in a year'; short history or sales seen say nothing", () => {
    const buy = { verdict: "buy", confidence: "high", sales_seen: 0 };
    assert.equal(priceAdvice(row({ ...buy, history_days: 400 }), NOW).drought, "Hasn't been on a 20%+ sale in a year");
    assert.equal(priceAdvice(row({ ...buy, history_days: 200 }), NOW).drought, "");
    assert.equal(priceAdvice(row({ ...buy, history_days: 900, sales_seen: 1 }), NOW).drought, "");
    assert.equal(priceAdvice(row({ ...buy, history_days: 900, confidence: "medium" }), NOW).drought, "");
    assert.equal(priceAdvice(row({ ...buy, history_days: null }), NOW).drought, "");
  });

  it("buy / on_sale shows the cut and price and whether it matches the 1-year low", () => {
    const sale = {
      verdict: "buy",
      basis: "on_sale",
      confidence: "high",
      regular_price: 41.25,
      current_price: 16.5,
      current_cut: 60,
      low_1y: 16.5,
      median_past_cut: 50,
      p_30: null,
      p_90: null,
    };
    const a = priceAdvice(row(sale), NOW);
    assert.equal(a.headline, "On sale now");
    assert.equal(a.tone, "pw-sale");
    assert.equal(a.odds, "");
    assert.equal(a.sale, "−60% now: AED 16.50");
    assert.equal(a.saleNote, "Matches its lowest price in the past year");
    assert.equal(a.context, "Regular AED 41.25 · usually −50%", "the low isn't repeated");

    const higher = priceAdvice(row({ ...sale, low_1y: 12 }), NOW);
    assert.equal(higher.saleNote, "");
    assert.match(higher.context, /1-year low AED 12\.00/);
  });

  it("unsure / baseline / low", () => {
    const a = priceAdvice(
      row({ verdict: "unsure", basis: "baseline", confidence: "low", p_30: 0.18, p_90: 0.46, low_1y: null }),
      NOW,
    );
    assert.equal(a.headline, "Hard to say");
    assert.equal(a.tone, "pw-unsure");
    assert.equal(a.odds, "18% chance of a 20%+ sale within 30 days, 46% within 90");
    assert.equal(a.confidence, "Low confidence");
    assert.doesNotMatch(a.context, /1-year low/);
  });

  it("rounds to whole percent and says under 5% / over 95% at the extremes", () => {
    assert.equal(pctText(0), "under 5%");
    assert.equal(pctText(0.049), "under 5%");
    assert.equal(pctText(0.05), "5%");
    assert.equal(pctText(0.724), "72%");
    assert.equal(pctText(0.725), "73%");
    assert.equal(pctText(0.95), "95%");
    assert.equal(pctText(0.951), "over 95%");
    assert.equal(pctText(1), "over 95%");
    assert.equal(
      priceAdvice(row({ p_30: 0.97, p_90: 1 }), NOW).odds,
      "over 95% chance of a 20%+ sale within 30 days, over 95% within 90",
    );
  });

  it("a small current discount on a model verdict shows in the context", () => {
    const a = priceAdvice(row({ current_price: 82.8, current_cut: 10 }), NOW);
    assert.match(a.context, /^Now AED 82\.80 \(−10%\) · Regular AED 92\.00/);
  });

  it("hides missing, stale, undated and unknown-verdict rows", () => {
    assert.equal(priceAdvice(null, NOW), null);
    assert.equal(priceAdvice(undefined, NOW), null);
    assert.equal(priceAdvice(row({ computed_at: at(8.01) }), NOW), null);
    assert.ok(priceAdvice(row({ computed_at: at(7.9) }), NOW));
    assert.equal(priceAdvice(row({ computed_at: null }), NOW), null);
    assert.equal(priceAdvice(row({ computed_at: "not a date" }), NOW), null);
    assert.equal(priceAdvice(row({ verdict: "maybe" }), NOW), null);
  });

  it("copes with every optional field being null", () => {
    const a = priceAdvice(
      row({
        regular_price: null,
        current_price: null,
        current_cut: null,
        low_1y: null,
        median_past_cut: null,
        sales_seen: null,
        history_days: null,
        p_30: null,
        p_90: null,
        reason: null,
        confidence: null,
        country: null,
        currency: null,
      }),
      NOW,
    );
    assert.equal(a.headline, "Wait for a sale");
    assert.equal(a.odds, "");
    assert.equal(a.context, "");
    assert.equal(a.reason, "");
    assert.equal(a.confidence, "");
    assert.equal(a.footer, "Steam prices · updated 2 days ago");
    const sale = priceAdvice(
      row({ basis: "on_sale", verdict: "buy", current_price: null, p_30: null, p_90: null }),
      NOW,
    );
    assert.equal(sale.headline, "On sale now");
    assert.equal(sale.sale, "");
    assert.ok(priceCard(row({ regular_price: null, p_30: null, p_90: null, reason: null }), NOW).includes("pw-card"));
  });

  it("only one probability: says which window it is", () => {
    assert.equal(priceAdvice(row({ p_90: null }), NOW).odds, "72% chance of a 20%+ sale within 30 days");
    assert.equal(priceAdvice(row({ p_30: null }), NOW).odds, "88% chance of a 20%+ sale within 90 days");
  });

  it("footer says today / yesterday for recent rows", () => {
    assert.equal(priceAdvice(row({ computed_at: at(0.1) }), NOW).footer, "Steam AE prices · updated today");
    assert.equal(priceAdvice(row({ computed_at: at(1.2) }), NOW).footer, "Steam AE prices · updated yesterday");
  });
});

describe("money", () => {
  it("formats in the row's currency, two decimals", () => {
    assert.equal(money(16.5, "AED"), "AED 16.50");
    assert.equal(money("199", "AED"), "AED 199.00");
    assert.equal(money(1234.5, "AED"), "AED 1,234.50");
  });
  it("falls back to a plain number for a bad currency code, and to '' for no amount", () => {
    assert.equal(money(16.5, "<b>"), "16.50");
    assert.equal(money(16.5, "ZZZ").replace(/\s/g, " "), "ZZZ 16.50");
    assert.equal(money(null, "AED"), "");
    assert.equal(money("abc", "AED"), "");
  });
});

describe("priceCard", () => {
  it("escapes the reason and every other text from the row", () => {
    const html = priceCard(row({ reason: '<script>alert("x")</script> & <img src=x>', currency: "<b>" }), NOW);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /<b>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &lt;img src=x&gt;/);
  });
  it("class modifiers come from a fixed list, never from the row", () => {
    const html = priceCard(row({ verdict: 'wait" onmouseover="x', basis: "model" }), NOW);
    assert.equal(html, "", "an unknown verdict renders nothing");
    assert.match(priceCard(row(), NOW), /class="pw-card pw-wait"/);
  });
  it("renders the title, verdict, confidence, footer and the IsThereAnyDeal credit", () => {
    const html = priceCard(row(), NOW);
    assert.match(html, /<h2 class="pw-title">Price on Steam<\/h2>/);
    assert.match(html, /<p class="pw-verdict">Wait for a sale<\/p>/);
    assert.match(html, /Medium confidence/);
    assert.match(html, /Steam AE prices · updated 2 days ago/);
    assert.ok(html.includes(`<a href="${ITAD_URL}" target="_blank" rel="noopener">Price history: IsThereAnyDeal</a>`));
  });
  it("is empty when the row is missing or stale", () => {
    assert.equal(priceCard(null, NOW), "");
    assert.equal(priceCard(row({ computed_at: at(9) }), NOW), "");
  });
});

describe("price data", () => {
  it("cleanPrice turns numeric strings into numbers and keeps nulls", () => {
    const r = cleanPrice({ ...row(), igdb_id: "1001", regular_price: "92.00", p_30: "0.720", low_1y: null });
    assert.equal(r.igdb_id, 1001);
    assert.equal(r.regular_price, 92);
    assert.equal(r.p_30, 0.72);
    assert.equal(r.low_1y, null);
    assert.equal(r.verdict, "wait");
  });
  it("demo rows cover the four cases and are all fresh", () => {
    const rows = demoPrices();
    assert.deepEqual(rows.map((r) => r.igdb_id).sort(), [9001, 9004, 9011, 9013]);
    const heads = Object.fromEntries(rows.map((r) => [r.igdb_id, priceAdvice(r).headline]));
    assert.deepEqual(heads, { 9011: "Wait for a sale", 9004: "Buy now", 9001: "On sale now", 9013: "Hard to say" });
    for (const r of rows) {
      assert.ok(["buy", "wait", "unsure"].includes(r.verdict));
      assert.ok(["model", "baseline", "on_sale"].includes(r.basis));
      assert.ok(r.reason.length >= 1 && r.reason.length <= 200);
      if (r.basis === "on_sale") assert.ok(r.p_30 == null && r.p_90 == null);
      else assert.ok(r.p_90 >= r.p_30);
    }
    assert.match(priceAdvice(rows.find((r) => r.igdb_id === 9004)).drought, /in 3 years/);
  });
  it("reindex builds idx.price and priceOf finds a shelf game's prediction", () => {
    S.profiles = [];
    S.entries = [];
    S.catalog = [];
    S.games = [
      { id: "g1", igdb_id: 1001 },
      { id: "g2", igdb_id: null },
    ];
    S.prices = [row()];
    reindex();
    assert.equal(idx.price[1001].verdict, "wait");
    assert.equal(priceOf(S.games[0]).igdb_id, 1001);
    assert.equal(priceOf(S.games[1]), null);
    assert.equal(priceOf(null), null);
    S.prices = [];
    reindex();
  });
});
