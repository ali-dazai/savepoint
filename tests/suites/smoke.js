// Smoke test: the main things a person does in the app, end to end, in demo mode (no network).
// It is the safety net for refactors: every flow here must keep working byte-for-byte in behaviour.
// Run with: npm run test:e2e smoke   (tests/run.js starts a local server and sets BASE)
const BASE = process.env.BASE || "http://localhost:8765";
import { chromium, devices } from "playwright";

const DEMO_KEY = "savepoint-demo-v4";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "dark", hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/images\.igdb|ERR_|Failed to load resource/.test(m.text()))
      errors.push("console: " + m.text());
  });
  const check = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);
  const text = async (sel) =>
    (
      await page
        .locator(sel)
        .first()
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
  const demoDb = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), DEMO_KEY);
  const toast = async () => {
    await page.waitForSelector(".toast", { timeout: 3000 }).catch(() => {});
    return text(".toast");
  };
  const confirm = async () => {
    await page.waitForSelector(".dialog");
    await page.click('.dialog [data-r="1"]');
  };

  // 1. Boot straight into the demo
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("init")) {
      sessionStorage.setItem("init", "1");
      localStorage.clear();
    }
  });
  await page.goto(BASE + "/?demo");
  await page.waitForSelector(".tabbar");
  check("boot: feed shows the tab bar with 4 tabs", (await page.locator(".tabbar button").count()) === 4);
  check("boot: demo bar visible", (await page.locator(".demo-bar").count()) === 1);
  check(
    "feed: now-playing hero + latest list",
    (await page.locator(".now").count()) === 1 && (await page.locator(".feed-item").count()) >= 5,
  );
  check("feed: picks rail rendered", (await page.locator(".rail .rail-item").count()) >= 1);

  // 2. Tabs
  await page.click("[data-tab=shelf]");
  check(
    "shelf tab opens",
    (await page.locator("[data-tab=shelf][aria-current=page]").count()) === 1 &&
      (await page.locator(".wall").count()) === 1,
  );
  await page.click("[data-tab=discover]");
  await page.waitForSelector(".trend li");
  check("discover: trending list", (await page.locator(".trend li").count()) >= 3);
  await page.click("[data-act=disc-view][data-v=calendar]");
  await page.waitForSelector(".cal-list li");
  check(
    "discover: calendar groups + summary",
    (await page.locator(".cal-group").count()) >= 1 && /Want to play/.test(await text(".cal-summary")),
  );
  await page.click("[data-act=disc-view][data-v=trending]");
  await page.click("[data-tab=friends]");
  check(
    "friends: one card per member + profile form",
    (await page.locator(".friend").count()) === 4 && (await page.locator("form[data-form=profile]").count()) === 1,
  );
  await page.click("[data-tab=feed]");
  check("back on feed", (await page.locator(".now").count()) === 1);

  // 3. Shelf controls
  await page.click("[data-tab=shelf]");
  await page.click("[data-act=scope][data-scope=mine]");
  const mineCount = await page.locator(".case-btn").count();
  await page.click("[data-act=scope][data-scope=all]");
  const allCount = await page.locator(".case-btn").count();
  check(
    `shelf: Everyone's shows more than My games (${allCount} > ${mineCount})`,
    allCount > mineCount && mineCount > 0,
  );
  await page.click("[data-act=scope][data-scope=mine]");
  await page.click("[data-act=status-filter][data-status=finished]");
  const finished = await page.locator(".case-btn").count();
  check(
    "shelf: status filter narrows to finished games",
    finished > 0 && finished < mineCount && (await page.locator(".case-btn .stk.done").count()) === finished,
  );
  await page.click("[data-act=status-filter][data-status=all]");
  await page.fill("input[name=q]", "elden");
  check(
    "shelf: search narrows to one game",
    (await page.locator(".case-btn").count()) === 1 && /Elden Ring/.test(await text(".lbl .t")),
  );
  await page.fill("input[name=q]", "");
  await page.selectOption("select[name=sort]", "az");
  const firstAz = await text(".lbl .t");
  check("shelf: A to Z sort puts an A-title first: " + firstAz, /^[AB]/.test(firstAz));
  await page.selectOption("select[name=sort]", "recent");
  check("shelf: 3 cases per ledge on a phone", (await page.locator(".wall").getAttribute("style")) === "--cols:3");
  await page.setViewportSize({ width: 600, height: 844 });
  await page.waitForTimeout(400);
  check(
    "shelf: turning/widening the screen re-lays the wall to 4 per ledge",
    (await page.locator(".wall").getAttribute("style")) === "--cols:4",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check("shelf: back to 3 per ledge", (await page.locator(".wall").getAttribute("style")) === "--cols:3");

  // 4. Open a game and change the log
  await page.fill("input[name=q]", "astro");
  await page.click(".case-btn");
  await page.waitForSelector(".page form[data-form=entry]");
  check(
    "game page: title, your log, friends section",
    /Astro Bot/.test(await text(".g-head h1")) && (await page.locator("#others .review").count()) >= 1,
  );
  await page.waitForTimeout(950); // let the case-opening animation finish
  const star3 = page.locator(".star-input .star-btn").nth(2);
  await star3.scrollIntoViewIfNeeded();
  const sb = await star3.boundingBox();
  await page.mouse.click(sb.x + sb.width - 3, sb.y + sb.height / 2); // right half: whole star
  check("game page: rating readout updates to 3", /3 out of 5/.test(await text(".rating-readout")));
  await page.fill("input[name=hours]", "16");
  await page.fill("textarea[name=review]", "Still a delight on a second run.");
  await page.click("form[data-form=entry] button[type=submit]");
  check("game page: save toast: " + (await toast()), /Changes saved/.test(await toast()));
  await page.waitForTimeout(400);
  let db = await demoDb();
  const astro = db.entries.find((e) => e.user_id === "demo-me" && e.game_id === "g8");
  check(
    "save persisted rating/hours/review",
    astro.rating === 3 && astro.hours === 16 && astro.review === "Still a delight on a second run.",
  );
  await page.click("[data-act=close]");
  check(
    "close returns to the shelf",
    (await page.locator(".page").count()) === 0 && (await page.locator(".wall").count()) === 1,
  );

  // 5. Add a game by hand, then edit it, then remove the log, then delete the game
  await page.click(".topbar [data-act=add-game]");
  await page.waitForSelector("input[name=cat-q]");
  await page.click("[data-act=cat-manual]");
  await page.fill("form[data-form=add] input[name=title]", "Smoke Test Quest");
  await page.fill("form[data-form=add] input[name=platform]", "PC");
  await page.fill("form[data-form=add] input[name=year]", "2024");
  await page.click("[data-act=pick-add-status][data-status=want]");
  await page.click("form[data-form=add] button[type=submit]");
  await page.waitForSelector(".page .g-head");
  check(
    "add by hand: page opens for the new game",
    /Smoke Test Quest/.test(await text(".g-head h1")) && /2024, PC/.test(await text(".g-meta")),
  );
  db = await demoDb();
  const added = db.games.find((g) => g.title === "Smoke Test Quest");
  check(
    "add by hand: game + want log stored",
    !!added &&
      added.platform === "PC" &&
      added.year === 2024 &&
      db.entries.some((e) => e.game_id === added.id && e.status === "want"),
  );
  await page.waitForTimeout(950);
  await page.click("[data-act=edit-game]");
  await page.waitForSelector("form[data-form=edit]");
  await page.fill("form[data-form=edit] input[name=title]", "Smoke Test Quest II");
  await page.click("form[data-form=edit] button[type=submit]");
  await page.waitForSelector(".page .g-head");
  check(
    "edit details: new title shown + toast: " + (await toast()),
    /Smoke Test Quest II/.test(await text(".g-head h1")) && /Details saved/.test(await toast()),
  );
  await page.waitForTimeout(950);
  await page.click("[data-act=remove-entry]");
  await page.waitForSelector(".dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check(
    "confirm dialog: Escape cancels and keeps the page open",
    (await page.locator(".dialog").count()) === 0 &&
      (await page.locator(".page").count()) === 1 &&
      /Your log/.test(await text(".card-head h2")),
  );
  await page.click("[data-act=remove-entry]");
  await confirm();
  check(
    "remove from my shelf: toast + form now says Log it",
    /Removed from your shelf/.test(await toast()) && /Log it/.test(await text(".card-head h2")),
  );
  await page.click("[data-act=delete-game]");
  await confirm();
  await page.waitForSelector(".page", { state: "detached" });
  check("delete game: toast + page closed", /Game deleted/.test(await toast()));
  db = await demoDb();
  check("delete game: gone from the demo database", !db.games.some((g) => g.title === "Smoke Test Quest II"));

  // 6. Friends: open a friend, open one of their games, Back returns to the friend
  await page.click("[data-tab=friends]");
  await page.click(".friend >> nth=1");
  await page.waitForSelector(".sheet .friend-head");
  const friendName = await text(".friend-head h1");
  check(
    "friend sheet: name + grouped games",
    friendName.length > 0 && (await page.locator(".sheet .tile").count()) >= 1,
  );
  await page.click(".sheet .tile >> nth=0");
  await page.waitForSelector(".page .g-head");
  await page.waitForTimeout(950);
  await page.click(".g-nav [data-act=close]");
  await page.waitForSelector(".sheet .friend-head");
  check("Back from the game returns to the friend", (await text(".friend-head h1")) === friendName);
  await page.click(".sheet [data-act=close]");

  // 7. Profile
  await page.fill("form[data-form=profile] input[name=name]", "Sam K");
  await page.click("form[data-form=profile] button[type=submit]");
  check(
    "profile: name saved: " + (await toast()),
    /Name saved/.test(await toast()) && /Sam K/.test(await text(".friend >> nth=0")),
  );
  await page.click('[data-act=color][data-color="5"]');
  check(
    "profile: colour saved",
    /Colour saved/.test(await toast()) &&
      (await page.locator('[data-act=color][data-color="5"][aria-pressed=true]').count()) === 1,
  );

  // 8. Discover: one-tap Want to play
  await page.click("[data-tab=discover]");
  await page.waitForSelector(".trend li");
  const plus = page.locator(".trend .want-btn[aria-pressed=false]").first();
  const plusLabel = await plus.getAttribute("aria-label");
  await plus.click();
  await page.waitForTimeout(500);
  check(
    "discover: + adds to Want to play: " + (await toast()),
    /added to Want to play/.test(await toast()) &&
      (await page.locator(".trend .want-btn[aria-pressed=true]").count()) >= 1,
  );
  db = await demoDb();
  const wantedName = (plusLabel || "").replace(/^Add /, "").replace(/ to Want to play$/, "");
  check(
    "discover: new shelf game + want log stored for " + wantedName,
    db.games.some((g) => g.title === wantedName) &&
      db.entries.some((e) => e.status === "want" && db.games.find((g) => g.id === e.game_id && g.title === wantedName)),
  );

  // 9. Exit demo lands on sign-in, Try the demo comes back
  await page.click(".demo-bar [data-act=exit-demo]");
  await page.waitForSelector("form[data-form=signin]");
  check("exit demo: sign-in screen, URL clean", !new URL(page.url()).searchParams.has("demo"));
  await page.click("[data-act=try-demo]");
  await page.waitForSelector(".tabbar");
  check("try the demo: back in demo mode", (await page.locator(".demo-bar").count()) === 1);

  console.log("errors:", JSON.stringify(errors));
  await browser.close();
})();
