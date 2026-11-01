// Run with: npm test  (tests/run.js starts a local server and sets BASE)
const BASE = process.env.BASE || 'http://localhost:8765';
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/images\.igdb|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const check = (l, c) => console.log((c ? 'PASS ' : 'FAIL ') + l);
  await page.addInitScript(() => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', 1); localStorage.clear(); } });
  await page.goto(BASE + '/?demo');
  await page.waitForSelector('.hero');
  check('fonts are Funnel Sans + Funnel Display', await page.evaluate(async () => { await document.fonts.load('600 16px "Funnel Sans"'); await document.fonts.load('800 30px "Funnel Display"'); return [...document.fonts].some(f => f.family.includes('Funnel Sans') && f.status === 'loaded') && [...document.fonts].some(f => f.family.includes('Funnel Display') && f.status === 'loaded'); }));
  check('4 tabs incl. Discover', await page.locator('.tabbar button').count() === 4 && await page.locator('[data-tab=discover]').count() === 1);
  check('hero shows most recent player', /Jon is playing/.test(await page.locator('.hero').innerText()));
  check('no cartridges left', await page.locator('.cart').count() === 0);
  // Trending
  await page.click('[data-tab=discover]');
  await page.waitForSelector('.trend li');
  check('trending has 6 demo rows', await page.locator('.trend li').count() === 6);
  check('new/climbing/growing reasons highlighted', await page.locator('.reason.hot').count() === 3);
  const first = await page.locator('.trend li').first().innerText();
  check('trending row shows peak players and Steam score: ' + first.replace(/\n+/g, ' | '), /184k peak players/.test(first) && /81% positive/.test(first) && /New in Steam's top 100/.test(first));
  await page.click('.trend li:has-text("Halo Infinite") [data-act=quick-want]');
  await page.waitForTimeout(600);
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('savepoint-demo-v4')));
  const halo = db.games.find(g => g.igdb_id === 9006);
  check('quick + adds Halo as Want to play', !!halo && db.entries.some(e => e.game_id === halo.id && e.user_id === 'demo-me' && e.status === 'want'));
  check('button turns into a check', await page.locator('.trend li:has-text("Halo Infinite") .want-btn[aria-pressed=true]').count() === 1);
  check('status line shows on trending row', /You want to play/.test(await page.locator('.trend li:has-text("Halo Infinite")').innerText()));
  // ext page -> Finished -> finish moment, back returns to game page
  await page.click('.trend li:has-text("Zelda") .open');
  await page.waitForSelector('.page [data-act=ext-add]');
  await page.waitForSelector('.page .about');
  await page.click('[data-act=ext-add][data-status=finished]');
  await page.waitForSelector('form[data-form=finish]');
  check('finished from Discover opens the finish moment', true);
  await page.click('.sheet [data-act=close]');
  await page.waitForSelector('.page form[data-form=entry]');
  check('closing finish returns to the game page', /Zelda/.test(await page.locator('.page h1').innerText()));
  await page.click('.g-nav [data-act=close]');
  // Calendar
  await page.click('[data-act=disc-view][data-v=calendar]');
  await page.waitForSelector('.cal-list');
  const sum = await page.locator('.cal-summary').innerText();
  check('calendar summary names next wishlist release: ' + sum.replace(/\n/g, ' '), /Ghost Harbor/.test(sum) && /in 12 days/.test(sum));
  const groups = await page.locator('.cal-group h3').allInnerTexts();
  console.log('groups:', JSON.stringify(groups));
  check('This week group + later group', groups[0] === 'This week' && groups[groups.length - 1].startsWith('Later'));
  check('friend wishlist (Maya: Lantern Road) flagged', /Maya wants it/.test(await page.locator('.cal-list li:has-text("Lantern Road")').innerText()));
  check('Ghost Harbor flagged on your list', /On your list/.test(await page.locator('.cal-list li:has-text("Ghost Harbor")').innerText()));
  await page.click('[data-act=plat][data-p=switch]');
  const names = await page.locator('.cal-list .t-text b').allInnerTexts();
  check('Switch filter hides Neon Drift, keeps wishlist games: ' + names.join(', '), !names.includes('Neon Drift') && names.includes('Ghost Harbor') && names.includes('Moonlit Kingdoms'));
  await page.click('[data-act=plat][data-p=all]');
  // Release chip on the game page for a wishlist game
  await page.click('.cal-list li:has-text("Ghost Harbor") .open');
  await page.waitForSelector('.page #chips');
  check('release chip on upcoming game: ' + (await page.locator('#chips').innerText()).replace(/\n/g, ' '), /Out in 12 days/.test(await page.locator('#chips').innerText()));
  await page.click('.g-nav [data-act=close]');
  // Friend sheet -> game -> back returns to the friend sheet
  await page.click('[data-tab=friends]');
  await page.locator('.friend', { hasText: 'Priya' }).click();
  await page.locator('.sheet .tile').first().click();
  await page.waitForSelector('.page');
  await page.click('.g-nav [data-act=close]');
  check('back from game returns to Priya', await page.locator('.sheet .friend-head h1').innerText().catch(() => '') === 'Priya');
  // Discover survives reload from cache
  await page.click('.sheet [data-act=close]');
  check('discover cached locally', await page.evaluate(() => !!JSON.parse(localStorage.getItem('sp-disc')).data.trending.length));
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
