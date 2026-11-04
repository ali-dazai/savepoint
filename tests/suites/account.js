// Password reset end to end: the real SupabaseApi against a mocked Supabase (auth, REST, RPC, the account function).
// Run with: npm run test:e2e account   (tests/run.js starts a local server and sets BASE)
const BASE = process.env.BASE || "http://localhost:8765";
import { chromium, devices } from "playwright";

const ALI = "0dccdee8-9cfa-4cba-949f-74fe0b5064e3";
const MOHD = "b6f6b12b-ea5b-46d7-86bc-70aab13aa5ab";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const check = (l, c) => console.log((c ? "PASS " : "FAIL ") + l);
  const text = async (sel) =>
    (
      await page
        .locator(sel)
        .first()
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
  // Waits for a toast saying this (an earlier toast may still be on screen, so don't just read the current one).
  const toastSays = (re) =>
    page
      .waitForFunction(
        (src) => [...document.querySelectorAll(".toast")].some((t) => new RegExp(src).test(t.textContent)),
        re.source,
        { timeout: 4000 },
      )
      .then(() => true)
      .catch(() => false);

  const now = new Date().toISOString();
  const users = {
    "ali@example.com": { id: ALI, email: "ali@example.com", user_metadata: {} },
    "mohd@example.com": { id: MOHD, email: "mohd@example.com", user_metadata: { must_change_password: true } },
  };
  const db = {
    profiles: [
      { id: ALI, display_name: "Ali", color: 3, created_at: now, is_admin: true },
      { id: MOHD, display_name: "Mohd", color: 0, created_at: now, is_admin: false },
    ],
    games: [],
    entries: [],
    catalog_games: [],
  };
  let current = null;
  const puts = [];
  const resets = [];
  let accountReply = { status: 200, body: { password: "k7qm-3xvp-9tnr", name: "Mohd" } };
  const userJson = (u) => ({ ...u, aud: "authenticated", role: "authenticated", app_metadata: {}, identities: [{}] });

  await page.route("**/config.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: 'window.SAVEPOINT_CONFIG={supabaseUrl:"https://mock.supabase.co",supabaseAnonKey:"sb_publishable_x"}',
    }),
  );
  await page.route("https://mock.supabase.co/**", async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const j = (b, s = 200) =>
      r.fulfill({ status: s, contentType: "application/json", headers: cors, body: JSON.stringify(b) });
    if (method === "OPTIONS") return r.fulfill({ status: 200, headers: cors, body: "" });
    if (path === "/auth/v1/token") {
      const b = JSON.parse(req.postData() || "{}");
      current = users[b.email];
      if (!current) return j({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400);
      return j({
        access_token: "eyJ.x.y",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "r",
        user: userJson(current),
      });
    }
    if (path === "/auth/v1/user" && method === "GET") return j(userJson(current));
    if (path === "/auth/v1/user" && method === "PUT") {
      const b = JSON.parse(req.postData());
      puts.push({ who: current.email, ...b });
      Object.assign(current.user_metadata, b.data || {});
      return j(userJson(current));
    }
    if (path === "/auth/v1/logout") return r.fulfill({ status: 204, headers: cors, body: "" });
    if (path === "/rest/v1/rpc/is_member") return j(true);
    if (path === "/functions/v1/account") {
      resets.push({ who: current.email, ...JSON.parse(req.postData()) });
      return j(accountReply.body, accountReply.status);
    }
    const m = path.match(/^\/rest\/v1\/(\w+)/);
    if (m && method === "GET") return j(db[m[1]] || []);
    return j({ message: "unmocked " + method + " " + path }, 500);
  });

  const signIn = async (email) => {
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", "whatever1");
    await page.click("form[data-form=signin] button[type=submit]");
  };

  // 1. Forgot your password? explains the admin reset
  await page.goto(BASE + "/");
  await page.waitForSelector("form[data-form=signin]");
  await page.click("[data-act=forgot-password]");
  check("sign-in: Forgot your password? explains the admin reset", /Reset password/.test(await text(".notice")));
  check("sign-in: the form is still there", (await page.locator("form[data-form=signin]").count()) === 1);

  // 2. Ali (admin) signs in normally
  await signIn("ali@example.com");
  await page.waitForSelector(".tabbar");
  check(
    "admin signs in straight to the app (no new-password screen)",
    (await page.locator("form[data-form=new-password]").count()) === 0,
  );

  // 3. Change password under Your profile
  await page.click("[data-tab=friends]");
  const form = "form[data-form=change-password]";
  check(
    "Friends: Change password panel, with a username for password managers",
    (await page.locator(form).count()) === 1 &&
      (await page.locator(`${form} input[name=username]`).inputValue()) === "ali@example.com",
  );
  await page.fill(`${form} input[name=password]`, "new-secret-1");
  await page.fill(`${form} input[name=confirm]`, "new-secret-2");
  await page.click(`${form} button[type=submit]`);
  check(
    "Change password: mismatch is caught before anything is sent",
    /don't match/.test(await text(`${form} .error`)) && puts.length === 0,
  );
  await page.fill(`${form} input[name=confirm]`, "new-secret-1");
  await page.click(`${form} button[type=submit]`);
  check("Change password: saved (toast)", await toastSays(/Password changed/));
  check(
    "Change password: PUT /auth/v1/user with the password and the flag cleared",
    puts.length === 1 &&
      puts[0].password === "new-secret-1" &&
      puts[0].data &&
      puts[0].data.must_change_password === false,
  );
  check("Change password: form cleared", (await page.locator(`${form} input[name=password]`).inputValue()) === "");

  // 4. Reset Mohd's password from his page
  await page.click(".friend >> nth=1");
  await page.waitForSelector(".sheet .friend-head");
  check("friend page: admin sees Reset Mohd's password", /Reset Mohd's password/.test(await text(".admin-panel")));
  await page.click("[data-act=reset-password]");
  await page.waitForSelector(".dialog");
  check("reset asks first", /Reset Mohd's password\?/.test(await text(".dialog")));
  await page.click('.dialog [data-r="0"]');
  check("Cancel sends nothing", resets.length === 0);
  await page.click("[data-act=reset-password]");
  await page.click('.dialog [data-r="1"]');
  await page.waitForSelector(".temp-pw");
  check(
    "reset: account function called with Mohd's id",
    resets.length === 1 &&
      resets[0].action === "reset_password" &&
      resets[0].user_id === MOHD &&
      resets[0].who === "ali@example.com",
  );
  check("temporary password shown", (await text(".temp-pw")) === "k7qm-3xvp-9tnr" && /Mohd/.test(await text(".sheet")));
  await page.click("[data-act=copy-temp-password]");
  check("Copy: toast", await toastSays(/Password copied/));
  check("Copy: on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())) === "k7qm-3xvp-9tnr");
  await page.click(".sheet [data-act=close]");
  await page.waitForSelector(".sheet .friend-head");
  check(
    "Back returns to Mohd's page and the password is gone",
    /Mohd/.test(await text(".friend-head h1")) && (await page.locator(".temp-pw").count()) === 0,
  );

  // 5. The server refuses
  accountReply = { status: 403, body: { error: "not_admin" } };
  await page.click("[data-act=reset-password]");
  await page.click('.dialog [data-r="1"]');
  check(
    "server refusal shows its reason",
    (await toastSays(/Only the group admin can reset passwords/)) && (await page.locator(".temp-pw").count()) === 0,
  );
  await page.click(".sheet [data-act=close]");

  // 6. Your own page has no reset button
  await page.click(".friend >> nth=0");
  await page.waitForSelector(".sheet .friend-head");
  check("own page: no reset panel", (await page.locator(".admin-panel").count()) === 0);
  await page.click(".sheet [data-act=close]");

  // 7. Mohd signs in with the temporary password and must choose his own
  await page.click("[data-act=sign-out]");
  await page.waitForSelector("form[data-form=signin]");
  await signIn("mohd@example.com");
  await page.waitForSelector("form[data-form=new-password]");
  check(
    "flagged account lands on Choose a new password, not the app",
    (await page.locator(".tabbar").count()) === 0 && /Choose a new password/.test(await text("h1")),
  );
  const np = "form[data-form=new-password]";
  await page.fill(`${np} input[name=password]`, "short");
  await page.fill(`${np} input[name=confirm]`, "short");
  await page.click(`${np} button[type=submit]`);
  check("new password: too short is caught", /at least 6/.test(await text(`${np} .error`)));
  await page.fill(`${np} input[name=password]`, "mohds-own-pw");
  await page.fill(`${np} input[name=confirm]`, "mohds-own-pw");
  await page.click(`${np} button[type=submit]`);
  await page.waitForSelector(".tabbar");
  const last = puts[puts.length - 1];
  check(
    "new password saved for Mohd and the flag cleared",
    last.who === "mohd@example.com" && last.password === "mohds-own-pw" && last.data.must_change_password === false,
  );
  check("then into the app", (await page.locator(".tabbar").count()) === 1);

  // 8. Mohd is not the admin
  await page.click("[data-tab=friends]");
  await page.click(".friend >> nth=1");
  await page.waitForSelector(".sheet .friend-head");
  check("non-admin: no reset panel on Ali's page", (await page.locator(".admin-panel").count()) === 0);

  console.log("errors:", JSON.stringify(errors));
  await browser.close();
})();
