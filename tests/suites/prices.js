// P5 buy-or-wait: the "Price on Steam" card on the game page, against the demo's four price rows.
// Run with: npm run test:e2e  (tests/run.js starts a local server and sets BASE)
import path from "node:path";
import fs from "node:fs";
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:8765";
const out = path.join(import.meta.dirname, "..", "..", "test-results", "prices");
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const scheme = "dark";
  const ctx = await browser.newContext({ ...devices["iPhone 13"], colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/images\.igdb|ERR_|Failed to load resource/.test(m.text()))
      errors.push("console: " + m.text());
  });
  const check = (l, c) => console.log((c ? "PASS " : "FAIL ") + l);
  const shot = async (n) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${n}-${scheme}.png`, fullPage: true });
  };
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("i")) {
      sessionStorage.setItem("i", 1);
      localStorage.clear();
    }
  });
  await page.goto(BASE + "/?demo");
  await page.waitForSelector(".feed-item");

  // Opens a game page from the whole group's shelf by searching its title.
  const open = async (q, title) => {
    await page.click("[data-tab=shelf]");
    await page.click("[data-act=scope][data-scope=all]");
    await page.fill("input[name=q]", q);
    await page.waitForTimeout(250);
    await page.locator(".case-btn", { hasText: title }).first().click();
    await page.waitForSelector(".page form[data-form=entry]");
    await page.waitForTimeout(900); // the case-opening animation
  };
  const close = async () => {
    await page.click("[data-act=close]");
    await page.waitForTimeout(300);
  };
  const card = () => page.locator(".page .pw-card");
  const cardText = async () => ((await card().count()) ? (await card().innerText()).replace(/\s+/g, " ") : "");
  // True when the price card comes before the log form in the booklet.
  const cardFirst = () =>
    page.evaluate(() => {
      const c = document.querySelector(".page .pw-card"),
        f = document.querySelector(".page form[data-form=entry]");
      return !!(c && f && c.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
    });

  // 1. Want to play (yours): wait / model / medium, shown above "Your log"
  await open("ghost", "Ghost Harbor");
  let t = await cardText();
  console.log("Ghost Harbor:", t);
  check("Ghost Harbor (want): price card shows", (await card().count()) === 1);
  check(
    "Ghost Harbor: headline 'Wait for a sale'",
    (await page.locator(".pw-verdict").innerText()) === "Wait for a sale",
  );
  check(
    "Ghost Harbor: odds, confidence and footer",
    t.includes("72% chance of a 20%+ sale within 30 days, 88% within 90") &&
      t.includes("Medium confidence") &&
      /Steam AE prices · updated 2 days ago/.test(t),
  );
  check("Ghost Harbor: card sits above your log (want to play)", await cardFirst());
  const link = page.locator(".pw-card a");
  check(
    "IsThereAnyDeal credit links out safely",
    (await link.getAttribute("href")) === "https://isthereanydeal.com/" &&
      (await link.getAttribute("rel")) === "noopener" &&
      (await link.innerText()) === "Price history: IsThereAnyDeal",
  );
  check(
    "card is styled as a booklet panel (pw- styles loaded)",
    await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector(".pw-card"));
      return s.borderTopLeftRadius === "16px" && s.backgroundColor !== "rgba(0, 0, 0, 0)";
    }),
  );
  await card().scrollIntoViewIfNeeded();
  await shot("01-wait");
  await close();

  // 2. Finished (yours): buy / model / high, below your log, with the "no sale in years" line
  await open("elden", "Elden Ring");
  t = await cardText();
  console.log("Elden Ring:", t);
  check("Elden Ring: headline 'Buy now'", (await page.locator(".pw-verdict").innerText()) === "Buy now");
  check(
    "Elden Ring: rarely discounted, under 5%, high confidence",
    t.includes("Hasn't had a 20%+ sale on Steam in 3 years") &&
      t.includes("under 5% chance") &&
      t.includes("High confidence"),
  );
  check("Elden Ring: card sits below your log (finished)", !(await cardFirst()));
  await card().scrollIntoViewIfNeeded();
  await shot("02-buy");
  await close();

  // 3. A friend's game: buy / on_sale
  await open("hades", "Hades II");
  t = await cardText();
  console.log("Hades II:", t);
  check("Hades II: headline 'On sale now'", (await page.locator(".pw-verdict").innerText()) === "On sale now");
  check(
    "Hades II: cut, price and the 1-year-low note",
    t.includes("−60% now: AED 16.50") && t.includes("Matches its lowest price in the past year"),
  );
  await card().scrollIntoViewIfNeeded();
  await shot("03-sale");
  await close();

  // 4. unsure / baseline / low
  await open("lantern", "Lantern Road");
  t = await cardText();
  console.log("Lantern Road:", t);
  check("Lantern Road: headline 'Hard to say'", (await page.locator(".pw-verdict").innerText()) === "Hard to say");
  check("Lantern Road: low confidence", t.includes("Low confidence") && t.includes("18% chance"));
  await card().scrollIntoViewIfNeeded();
  await shot("04-unsure");
  await close();

  // 5. A game with no prediction (not linked to the catalogue): no card
  await open("celeste", "Celeste");
  check("Celeste (no prediction): no price card", (await card().count()) === 0);
  await close();

  // 6. A stale prediction (computed 9 days ago) is hidden. Edit the demo data through the demo API, then reload.
  await page.evaluate(async () => {
    const { DemoApi } = await import("/src/data/demo.js");
    const api = new DemoApi();
    api.db.prices.find((r) => r.igdb_id === 9011).computed_at = new Date(Date.now() - 9 * 864e5).toISOString();
    api.save();
  });
  await page.reload();
  await page.waitForSelector(".tabbar");
  await open("ghost", "Ghost Harbor");
  check("stale prediction (9 days old): card hidden", (await card().count()) === 0);
  await close();
  await open("elden", "Elden Ring");
  check("other fresh predictions still show after the reload", (await card().count()) === 1);

  console.log("errors:", JSON.stringify(errors));
  await browser.close();
})();
