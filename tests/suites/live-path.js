// Run with: npm test  (tests/run.js starts a local server and sets BASE)
const BASE = process.env.BASE || 'http://localhost:8765';
// Exercises SupabaseApi against a mocked Supabase (auth, REST, RPC, functions).
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const check = (l, c) => console.log((c ? 'PASS ' : 'FAIL ') + l);
  const now = new Date().toISOString();
  const db = { profiles: [{ id: 'u1', display_name: 'Ali', color: 3, created_at: now }], games: [], entries: [], catalog_games: [] };
  const calls = [];
  await page.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.SAVEPOINT_CONFIG={supabaseUrl:"https://mock.supabase.co",supabaseAnonKey:"sb_publishable_x"}' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://images.igdb.com/**', r => r.fulfill({ status: 404, body: '' }));
  await page.route('https://mock.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const path = url.pathname; const method = req.method();
    calls.push(method + ' ' + path);
    const j = (b, s = 200, h = {}) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...h }, body: JSON.stringify(b) });
    if (method === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' });
    if (path === '/auth/v1/token') return j({ access_token: 'eyJ.x.y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', email: 'ali@example.com', aud: 'authenticated', role: 'authenticated' } });
    if (path === '/auth/v1/user') return j({ id: 'u1', email: 'ali@example.com', aud: 'authenticated', role: 'authenticated' });
    if (path === '/rest/v1/rpc/is_member') return j(true);
    if (path === '/rest/v1/rpc/add_hours') { const b = JSON.parse(req.postData()); const e = db.entries.find(x => x.id === b.entry); e.hours = (e.hours || 0) + b.delta; return j(e.hours); }
    if (path === '/functions/v1/catalog') {
      const b = JSON.parse(req.postData());
      if (b.action === 'search') return b.q.includes('boom') ? j({ error: 'igdb_busy' }, 503) : j({ results: [{ igdb_id: 119133, name: 'Elden Ring', year: 2022, cover_image_id: 'co4jni', platforms: ['PC', 'PS5'] }] });
      if (b.action === 'get') { const row = { igdb_id: 119133, name: 'Elden Ring', cover_image_id: 'co4jni', first_release_date: '2022-02-25', platforms: ['PC', 'PS5'], genres: ['RPG'], summary: 'Rise.', critic_score: 95.1, critic_count: 50, igdb_url: 'https://www.igdb.com/games/elden-ring', steam_appid: '1245620', similar_ids: [], cover_color: null, fetched_at: now }; db.catalog_games = [row]; return j({ game: row }); }
      if (b.action === 'steam') return j({ steam: { desc: 'Very Positive', pct: 93, total: 754321, players: 41020, fetched_at: new Date().toISOString(), appid: '1245620' } });
      if (b.action === 'refresh') { db.refreshed = b.ids; db.catalog_games.forEach(c => c.cover_color = '#a48c4c'); return j({ games: db.catalog_games.filter(c => b.ids.includes(c.igdb_id)) }); }
      if (b.action === 'discover') return j({ built_at: now, has_history: false, trending: [{ igdb_id: 1, name: 'Trendy', year: 2026, cover_image_id: null, platforms: ['PC'], critic_score: null, reason: 'Popular on Steam right now' }], upcoming: [{ igdb_id: 2, name: 'Soon Game', year: 2026, cover_image_id: null, platforms: ['PS5'], critic_score: null, date: '2099-01-02', human: 'Jan 02, 2099', hypes: 10, wish_rank: 3 }] });
    }
    const m = path.match(/^\/rest\/v1\/(\w+)/);
    if (m) {
      const t = m[1];
      if (method === 'GET') return j(db[t] || []);
      if (method === 'POST') {
        const body = JSON.parse(req.postData()); const rows = Array.isArray(body) ? body : [body];
        if (t === 'games' && rows[0].igdb_id && db.games.some(g => g.igdb_id === rows[0].igdb_id)) return j({ code: '23505', message: 'duplicate key value violates unique constraint "games_igdb_id_key"' }, 409);
        const made = rows.map(x => ({ id: 'id' + Math.random().toString(36).slice(2), created_at: now, updated_at: now, added_by: 'u1', user_id: 'u1', ...x }));
        db[t].push(...made);
        return j(made.length === 1 && (req.headers().accept || '').includes('vnd.pgrst.object') ? made[0] : made, 201);
      }
      if (method === 'PATCH') { const body = JSON.parse(req.postData()); const id = url.searchParams.get('id').replace('eq.', ''); const row = db[t].find(x => x.id === id); Object.assign(row, body, { updated_at: new Date().toISOString() }); return j([], 200); }
      if (method === 'DELETE') return j([], 200);
    }
    return j({ message: 'unmocked ' + path }, 500);
  });
  // S1: stale demo flag must not hijack a configured app
  await page.addInitScript(() => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', 1); localStorage.setItem('sp-demo', '1'); } });
  await page.goto(BASE + '/');
  await page.waitForSelector('form[data-form=signin]');
  check('S1 configured app ignores old demo flag', await page.locator('.demo-bar').count() === 0);
  await page.fill('input[name=email]', 'ali@example.com'); await page.fill('input[name=password]', 'secret1');
  await page.click('button[type=submit]');
  await page.waitForSelector('.tabbar');
  check('signed in to real app', true);
  await page.click('.topbar [data-act=add-game]');
  await page.fill('input[name=cat-q]', 'boom');
  await page.waitForSelector('.cat-msg[role=alert]');
  check('catalogue error message: ' + await page.locator('.cat-msg').innerText(), /busy/.test(await page.locator('.cat-msg').innerText()));
  await page.fill('input[name=cat-q]', 'elden');
  await page.waitForSelector('.cat-list');
  await page.click('.cat-list li');
  await page.click('[data-act=cat-platform][data-p=PS5]');
  await page.click('[data-act=cat-add]');
  await page.waitForSelector('.page .g-head');
  await page.waitForTimeout(400);
  const g = db.games[0];
  check('game row inserted with igdb_id + platform', g && g.igdb_id === 119133 && g.platform === 'PS5' && g.year === 2022);
  check('entry inserted as playing', db.entries.length === 1 && db.entries[0].status === 'playing');
  check('critic score 95 shown', /\b95\b/.test(await page.locator('.page').innerText()));
  await page.waitForSelector('.score-chip:has-text("Steam")');
  check('S35 Steam chip from steam action', /93%/.test(await page.locator('#chips').innerText()) && /41k playing on Steam/.test(await page.locator('#chips').innerText()));
  await page.waitForTimeout(400);
  check('refresh action called for missing cover colour', JSON.stringify(db.refreshed) === '[119133]');
  // quick hours via RPC
  await page.click('.sessions .chip >> nth=1');
  await page.waitForTimeout(500);
  check('add_hours RPC called', calls.includes('POST /rest/v1/rpc/add_hours') && db.entries[0].hours === 1);
  // finish with spoiler via entry form
  await page.click('[data-act=pick-status][data-status=finished]');
  await page.fill('textarea[name=review]', 'The ending twist!');
  await page.check('input[name=spoiler]');
  await page.click('form[data-form=entry] button[type=submit]');
  await page.waitForSelector('form[data-form=finish]');
  await page.click('.sheet form[data-form=finish] [data-act=open-game]');
  await page.waitForTimeout(600);
  const e = db.entries[0];
  check('PATCH sent status finished + spoiler', e.status === 'finished' && e.spoiler === true && e.review === 'The ending twist!');
  // duplicate add
  await page.click('[data-act=close]');
  await page.click('.topbar [data-act=add-game]');
  await page.fill('input[name=cat-q]', 'elden');
  await page.waitForSelector('.cat-list');
  check('on-shelf badge', await page.locator('.on-shelf').count() === 1);
  await page.click('.cat-list li');
  check('picked shows already-on-shelf', /already on the shelf/.test(await page.locator('.sheet').innerText()));
  await page.click('[data-act=close]');
  await page.click('[data-tab=discover]');
  await page.waitForSelector('.trend li');
  check('S33 Discover trending from the discover action', /Trendy/.test(await page.locator('.trend').innerText()));
  await page.click('[data-act=disc-view][data-v=calendar]');
  check('S34 Calendar shows upcoming release', /Soon Game/.test(await page.locator('.cal-list').innerText()));
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
