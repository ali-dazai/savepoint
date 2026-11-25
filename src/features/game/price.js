// P5 buy-or-wait: turns a price_predictions row into the texts for the "Price on Steam" card on the game page.
// priceAdvice() is pure (no DOM, no state) so it can be unit-tested; priceCard() escapes every text it renders.
import { DAY_MS } from "../../core/constants.js";
import { esc, since } from "../../core/util.js";

export const PRICE_MAX_AGE_DAYS = 8; // older predictions are hidden rather than shown as if current
export const ITAD_URL = "https://isthereanydeal.com/";

const MINUS = "−"; // a real minus sign: "−60%"
const CONFIDENCE = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" };
// Class modifiers come from this fixed map, never from the row.
const TONE = { wait: "pw-wait", buy: "pw-buy", on_sale: "pw-sale", unsure: "pw-unsure" };

// A finite number, or null (null, undefined, "", NaN and strings that aren't numbers all count as missing).
function num(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
// "72%", with "under 5%" / "over 95%" at the extremes, where a whole-percent figure would claim too much.
export function pctText(p) {
  const r = p * 100;
  if (r < 5) return "under 5%";
  if (r > 95) return "over 95%";
  return `${Math.round(r)}%`;
}
// Money in the row's own currency ("AED 16.50"). An unknown currency code falls back to a plain number.
export function money(amount, currency) {
  const n = num(amount);
  if (n == null) return "";
  if (/^[A-Z]{3}$/.test(String(currency || ""))) {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency }).format(n).replace(/\u00a0/g, " ");
    } catch (_) {
      /* fall through */
    }
  }
  return n.toFixed(2);
}

// The texts to show for one prediction, or null when there is nothing (fresh) to show.
// Returns { tone, headline, odds, sale, saleNote, drought, reason, context, contextItems, confidence, footer };
// any text may be "" (contextItems may be empty; context is the same items joined with " · ").
export function priceAdvice(row, now = Date.now()) {
  if (!row || typeof row !== "object") return null;
  const at = Date.parse(row.computed_at);
  if (!Number.isFinite(at) || now - at > PRICE_MAX_AGE_DAYS * DAY_MS) return null;
  const onSale = row.basis === "on_sale";
  const key = onSale ? "on_sale" : row.verdict;
  const headline = {
    on_sale: "On sale now",
    wait: "Wait for a sale",
    buy: "Buy now",
    unsure: "Hard to say",
  }[key];
  if (!headline) return null;

  const cur = row.currency;
  const regular = num(row.regular_price),
    price = num(row.current_price),
    cut = num(row.current_cut),
    low = num(row.low_1y),
    usual = num(row.median_past_cut),
    seen = num(row.sales_seen),
    days = num(row.history_days),
    p30 = num(row.p_30),
    p90 = num(row.p_90);

  // The chance of a 20%+ sale, from the model or the calendar baseline.
  let odds = "";
  if (!onSale) {
    if (p30 != null && p90 != null)
      odds = `${pctText(p30)} chance of a 20%+ sale within 30 days, ${pctText(p90)} within 90`;
    else if (p30 != null) odds = `${pctText(p30)} chance of a 20%+ sale within 30 days`;
    else if (p90 != null) odds = `${pctText(p90)} chance of a 20%+ sale within 90 days`;
  }

  // On sale now: the cut and price, and how it compares with the past year.
  let sale = "",
    saleNote = "";
  if (onSale && price != null) {
    sale =
      cut != null && cut > 0 ? `${MINUS}${Math.round(cut)}% now: ${money(price, cur)}` : `Now ${money(price, cur)}`;
    if (low != null) saleNote = price <= low ? "Matches its lowest price in the past year" : "";
  }

  // "Hasn't been on a 20%+ sale in 3 years": only for a confident buy with a long, sale-free history.
  let drought = "";
  if (row.verdict === "buy" && row.confidence === "high" && !onSale && seen === 0 && days != null && days >= 365) {
    const years = Math.floor(days / 365);
    drought = `Hasn't been on a 20%+ sale in ${years === 1 ? "a year" : `${years} years`}`;
  }

  const context = [];
  if (!onSale && price != null && cut != null && cut > 0)
    context.push(`Now ${money(price, cur)} (${MINUS}${Math.round(cut)}%)`);
  if (regular != null) context.push(`Regular ${money(regular, cur)}`);
  if (low != null && !saleNote) context.push(`1-year low ${money(low, cur)}`);
  if (usual != null && usual > 0) context.push(`usually ${MINUS}${Math.round(usual)}%`);

  const country = /^[A-Z]{2}$/.test(String(row.country || "")) ? row.country : "";
  const footer = `Steam ${country ? country + " " : ""}prices · updated ${since(row.computed_at, now)}`;

  return {
    tone: TONE[key],
    headline,
    odds,
    sale,
    saleNote,
    drought,
    reason: typeof row.reason === "string" ? row.reason.slice(0, 200) : "",
    context: context.join(" · "),
    contextItems: context,
    confidence: CONFIDENCE[row.confidence] || "",
    footer,
  };
}

// The card's HTML, or "" when there is no fresh prediction.
export function priceCard(row, now = Date.now()) {
  const a = priceAdvice(row, now);
  if (!a) return "";
  const line = (cls, text) => (text ? `<p class="${cls}">${esc(text)}</p>` : "");
  return `<section class="pw-card ${a.tone}" aria-label="Price on Steam">
    <div class="pw-top"><h2 class="pw-title">Price on Steam</h2>${a.confidence ? `<span class="pw-conf">${esc(a.confidence)}</span>` : ""}</div>
    <p class="pw-verdict">${esc(a.headline)}</p>
    ${line("pw-odds", a.odds)}
    ${a.sale ? `<p class="pw-sale">${esc(a.sale)}${a.saleNote ? ` <span class="pw-low">${esc(a.saleNote)}</span>` : ""}</p>` : ""}
    ${line("pw-drought", a.drought)}
    ${line("pw-reason", a.reason)}
    ${a.contextItems.length ? `<p class="pw-context">${a.contextItems.map((x) => `<span>${esc(x)}</span>`).join(" · ")}</p>` : ""}
    <p class="pw-foot">${esc(a.footer)} · <a href="${ITAD_URL}" target="_blank" rel="noopener">Price history: IsThereAnyDeal</a></p>
  </section>`;
}
