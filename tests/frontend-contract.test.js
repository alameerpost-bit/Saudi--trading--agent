import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('frontend DOM references resolve to elements in the published HTML', () => {
  const ids = new Set([...html.matchAll(/\\bid="([^"]+)"/g)].map(match => match[1]));
  const referenced = new Set([...frontend.matchAll(/\\$\\(["']([^"']+)["']\\)/g)].map(match => match[1]));
  const missing = [...referenced].filter(id => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('frontend API calls have matching read-only backend routes', () => {
  assert.match(frontend, /getJSON\\("\/api\/market\/summary"\\)/);
  assert.match(frontend, /getJSON\\("\/api\/quote\/"\\s*\\+/);
  assert.match(frontend, /fetch\\(\`\\$\\{API_BASE\\}\/api\/skills\`/);
  assert.match(backend, /app\\.get\\('\/api\/market\/summary'/);
  assert.match(backend, /app\\.get\\('\/api\/quote\/:symbol'/);
  assert.match(backend, /app\\.get\\('\/api\/skills'/);
  assert.match(backend, /tradingEnabled: false/);
});

test('frontend and backend JavaScript parse without syntax errors', () => {
  for (const file of ['app.js', 'server.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});
