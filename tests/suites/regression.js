// Run with: npm test  (tests/run.js starts a local server and sets BASE)
const path = require('node:path');
const BASE = process.env.BASE || 'http://localhost:8765';
const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const out = path.join(__dirname, '..', '..', 'test-results', 'regression'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const scheme = 'dark';
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/images\.igdb|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${n}-${scheme}.png` }); };
  const check = (label, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + label);

  // S22: pretend last visit was 3 days ago
  await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.clear(); localStorage.setItem('sp-seen', new Date(Date.now() - 3 * 864e5).toISOString()); } });
  await page.goto(BASE + '/?demo');
  await page.waitForSelector('.feed-item');
  check('S22 new count shown', await page.locator('.new-count').count() === 1);
  check('S22 divider shown', await page.locator('.feed-divider').count() === 1);
  await shot('01-feed');
  // S24 spoiler: Priya's Outer Wilds review blurred
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const sp = page.locator('.feed .spoiler');
  check('S24 spoiler hidden in feed', await sp.count() === 1);
  await sp.first().click();
  check('S24 spoiler revealed', await page.locator('.feed .spoiler').count() === 0 && (await page.locator('.feed').innerText()).includes('first campfire'));
  await page.evaluate(() => window.scrollTo(0, 0));

  // S17: quick +1h on shelf
  await page.click('[data-tab=shelf]');
  await page.click('[data-act=scope][data-scope=mine]');
  // Case Wall: hold a case to add an hour (with Undo)
  check('Case Wall: shelf is a wall of cases on ledges', await page.locator('.wall .shelf-row .ledge .lbl').count() >= 1 && await page.locator('.wall .case-btn .cv .art').count() >= 1);
  check('Case Wall: playing case stands forward', await page.locator('.case-btn.out').count() >= 1);
  check('Case Wall: finished game has a Completed sticker', await page.locator('.case-btn .stk.done').count() >= 1);
  check('Case Wall: want-to-play game is shrink-wrapped', await page.locator('.case-btn .wrap').count() >= 1);
  check('Case Wall: wall tinted from your game', await page.evaluate(() => /hsl/.test(document.documentElement.style.getPropertyValue('--bg'))));
  const held = page.locator('.case-btn.out[data-hold]').first();
  const heldId = await held.getAttribute('data-id');
  const box = await held.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForTimeout(300);
  const toastTxt = await page.locator('.toast').innerText().catch(() => '');
  check('S17 hold adds an hour, toast shows new total: ' + toastTxt.replace(/\n/g, ' '), /\+1h on .*\(\d/.test(toastTxt) && /Undo/.test(toastTxt));
  check('hold does not open the game', await page.locator('.page').count() === 0);
  const lblBefore = await page.locator(`.case-btn[data-id="${heldId}"]`).getAttribute('aria-label');
  await page.click('.toast button');
  await page.waitForTimeout(300);
  check('Undo takes the hour back: ' + (await page.locator('.toast').innerText().catch(() => '')), /Undone/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.locator(`.case-btn[data-id="${heldId}"]`).getAttribute('aria-label')) !== lblBefore);
  // a short tap still opens the case
  await page.locator(`.case-btn[data-id="${heldId}"]`).click();
  await page.waitForSelector('.page .open-case');
  check('Case Wall: game page opens the case (lid, disc, booklet)', await page.locator('.page.opening .lid').count() === 1 && await page.locator('.open-case .disc').count() === 1 && await page.locator('.booklet form[data-form=entry]').count() === 1);
  await page.waitForTimeout(1000);
  await page.click('[data-act=pick-status][data-status=paused]');
  check('Case Wall: re-render does not replay the opening', await page.locator('.page.opening').count() === 0);
  await page.click('[data-act=close]');
  await shot('02-shelf-quick');

  // S31: add via catalogue
  await page.click('.topbar [data-act=add-game]');
  await page.fill('input[name=cat-q]', 'hollow');
  await page.waitForSelector('.cat-list');
  await shot('03-cat-results');
  check('S31 results listed', await page.locator('.cat-list li').count() === 2);
  check('S31 on-shelf badge for existing? (Silksong not linked yet)', await page.locator('.on-shelf').count() === 0);
  await page.click('.cat-list li >> nth=0'); // Hollow Knight
  await page.click('[data-act=cat-platform][data-p=Switch]');
  await page.click('[data-act=pick-add-status][data-status=want]');
  await shot('04-cat-picked');
  await page.click('[data-act=cat-add]');
  await page.waitForSelector('.page .g-head');
  await page.waitForTimeout(300);
  const hero = await page.locator('.page').innerText();
  check('S31 critic score shown', /Critics/.test(hero) && /\b88\b/.test(hero));
  check('S31 genres shown', /Metroidvania/.test(hero));
  check('S31 IGDB credit', /Game data from IGDB/.test(hero));
  await shot('05-game-from-catalog');
  // duplicate: search again, should show On the shelf and open existing
  await page.click('[data-act=close]');
  await page.click('.topbar [data-act=add-game]');
  await page.fill('input[name=cat-q]', 'hollow knight');
  await page.waitForSelector('.cat-list');
  check('S31 duplicate badge', await page.locator('.on-shelf').count() === 1);
  await page.click('[data-act=cat-manual]');
  check('S31 manual fallback form', await page.locator('form[data-form=add] input[name=title]').inputValue() === 'hollow knight');
  await page.click('[data-act=cat-back]');
  check('S31 back to search keeps query', await page.locator('input[name=cat-q]').inputValue() === 'hollow knight');
  await page.click('[data-act=close]');

  // S20 + S21 + S18: open a playing game (Baldur's Gate 3), finish it
  await page.click('[data-tab=shelf]');
  await page.click('[data-act=scope][data-scope=mine]');
  await page.fill('input[name=q]', 'baldur');
  await page.click('.case-btn');
  await page.waitForSelector('form[data-form=entry]');
  check('S17 sessions row in game sheet', await page.locator('.sessions .chip').count() === 3);
  check('S20 date fields shown', await page.locator('input[name=started_at]').count() === 1);
  const started = await page.locator('input[name=started_at]').inputValue();
  check('S20 started date prefilled: ' + started, /^\d{4}-\d\d-\d\d$/.test(started));
  await page.click('[data-act=pick-status][data-status=finished]');
  const t0 = Date.now();
  await page.click('form[data-form=entry] button[type=submit]');
  await page.waitForSelector('form[data-form=finish]');
  check('S18 instant (finish sheet in ' + (Date.now() - t0) + 'ms)', Date.now() - t0 < 1500);
  await shot('06-finish-moment');
  const star = page.locator('.star-btn').nth(4); const b = await star.boundingBox();
  await page.mouse.click(b.x + b.width - 4, b.y + b.height / 2);
  await page.fill('form[data-form=finish] input[name=review]', 'Camp scenes alone are worth it.');
  await page.click('form[data-form=finish] button[type=submit]');
  await page.waitForSelector('.page .g-head');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('savepoint-demo-v4')).entries.find(e => e.user_id === 'demo-me' && e.game_id === 'g4'));
  check('S21 saved rating 5 + review', after.rating === 5 && after.review === 'Camp scenes alone are worth it.' && after.status === 'finished');
  check('S20 finished_at set', !!after.finished_at);
  await shot('07-after-finish');

  // Link existing manual game to catalogue (Stardew Valley g7)
  await page.click('[data-act=close]');
  await page.click('[data-tab=shelf]');
  await page.click('[data-act=scope][data-scope=all]');
  await page.fill('input[name=q]', '');
  await page.fill('input[name=q]', 'stardew');
  await page.click('.case-btn');
  await page.click('[data-act=edit-game]');
  await shot('08-edit-link');
  await page.click('[data-act=link-start]');
  await page.waitForSelector('.cat-list');
  await page.click('.cat-list li >> nth=0');
  await page.click('[data-act=cat-link]');
  await page.waitForSelector('.page .g-head');
  await page.waitForTimeout(300);
  check('link: critic score now shown', /Critics/.test(await page.locator('.page').innerText()));
  await shot('09-linked');

  // S19 swipe right from the left edge closes the game page
  await page.evaluate(async () => {
    const el = document.querySelector('.page');
    const mk = (type, xx) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: xx, clientY: 400 })], changedTouches: [new Touch({ identifier: 1, target: el, clientX: xx, clientY: 400 })] });
    el.dispatchEvent(mk('touchstart', 10));
    for (let i = 1; i <= 10; i++) { el.dispatchEvent(mk('touchmove', 10 + i * 20)); await new Promise(r => setTimeout(r, 16)); }
    el.dispatchEvent(mk('touchend', 210));
  });
  await page.waitForTimeout(500);
  check('S19 edge swipe closed game page', await page.locator('.page').count() === 0);
  // S19 swipe down closes a sheet
  await page.click('.topbar [data-act=add-game]');
  const sheetBox = await page.locator('.sheet').boundingBox();
  await page.evaluate(async ({ x, y }) => {
    const el = document.querySelector('.sheet .sheet-head');
    const mk = (type, yy) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: yy })], changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: yy })] });
    el.dispatchEvent(mk('touchstart', y));
    for (let i = 1; i <= 10; i++) { el.dispatchEvent(mk('touchmove', y + i * 20)); await new Promise(r => setTimeout(r, 16)); }
    el.dispatchEvent(mk('touchend', y + 200));
  }, { x: sheetBox.x + 100, y: sheetBox.y + 30 });
  await page.waitForTimeout(500);
  check('S19 swipe down closed sheet', await page.locator('.sheet').count() === 0);
  // S19 pull to refresh
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => {
    const el = document.querySelector('#main');
    const mk = (type, yy) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 2, target: el, clientX: 150, clientY: yy })], changedTouches: [new Touch({ identifier: 2, target: el, clientX: 150, clientY: yy })] });
    el.dispatchEvent(mk('touchstart', 150));
    for (let i = 1; i <= 6; i++) { el.dispatchEvent(mk('touchmove', 150 + i * 16)); await new Promise(r => setTimeout(r, 16)); }
  });
  await shot('10-pull');
  const ptrTxt = await page.locator('#ptr').innerText();
  check('S19 pull indicator: ' + ptrTxt, /Release to refresh/.test(ptrTxt));
  await page.evaluate(() => document.querySelector('#main').dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [] })));
  await page.waitForTimeout(600);
  check('S19 indicator collapsed after refresh', (await page.locator('#ptr').evaluate(e => e.offsetHeight)) === 0);

  // Friend review spoiler in game sheet
  await page.click('[data-tab=shelf]');
  await page.fill('input[name=q]', 'outer');
  await page.click('.case-btn');
  check('S24 revealed spoiler stays open this session', await page.locator('#others .spoiler').count() === 0 && (await page.locator('#others').innerText()).includes('first campfire'));
  await shot('11-game-spoiler');
  await page.click('[data-act=close]');

  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
