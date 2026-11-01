// Runs every suite in tests/suites against a local copy of the site and fails if any check fails.
// Usage: npm test   (needs: npm ci && npx playwright install chromium)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8765);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function runSuite(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { env: { ...process.env, BASE: `http://localhost:${PORT}` } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const pass = (out.match(/^PASS /gm) || []).length;
      const fail = (out.match(/^FAIL /gm) || []).length;
      const errLine = (out.match(/^errors: (.*)$/m) || [])[1];
      const problems = [];
      if (code !== 0) problems.push(`exited with code ${code}`);
      if (fail) problems.push(`${fail} failed check(s)`);
      if (!pass) problems.push('no checks ran');
      if (errLine === undefined) problems.push('did not finish');
      else if (errLine.trim() !== '[]') problems.push(`page errors: ${errLine}`);
      resolve({ file: path.basename(file), pass, problems });
    });
  });
}

server.listen(PORT, async () => {
  const dir = path.join(__dirname, 'suites');
  const only = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && (!only.length || only.some((o) => f.includes(o)))).sort();
  const results = [];
  for (const f of files) {
    console.log(`\n=== ${f} ===`);
    results.push(await runSuite(path.join(dir, f)));
  }
  server.close();
  console.log('\n=== Summary ===');
  results.forEach((r) => console.log(`${r.problems.length ? 'FAILED' : 'ok    '} ${r.file}: ${r.pass} checks passed${r.problems.length ? '; ' + r.problems.join('; ') : ''}`));
  process.exit(results.some((r) => r.problems.length) ? 1 : 0);
});
