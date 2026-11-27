import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
let server;
let origin;
let browser;

test.before(async () => {
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = normalize(join(root, relative));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

test('dashboard loads using mocked market data and displays all 11 skills as disabled', async () => {
  const page = await browser.newPage();
  const providerRequests = [];
  await page.route('https://saudi-trading-agent.onrender.com/**', async route => {
    const url = new URL(route.request().url());
    providerRequests.push({ method: route.request().method(), path: url.pathname });
    if (url.pathname === '/api/market/summary') {
      return route.fulfill({ json: { provider: 'MOCK', data: {
        index_value: 10800.5, index_change: 12.5, index_change_percent: 0.12,
        market_mood: 'Bullish', advancing: 120, declining: 80, unchanged: 15,
        timestamp: '2026-11-27T09:00:00+03:00', is_delayed: false
      } } });
    }
    if (url.pathname === '/api/quote/2222' || url.pathname === '/api/quote/1120') {
      return route.fulfill({ json: { provider: 'MOCK', symbol: url.pathname.split('/').pop(), data: {
        price: 25.4, change: 0.2, change_percent: 0.79, is_delayed: false,
        updated_at: '2026-11-27T09:00:00+03:00'
      } } });
    }
    if (url.pathname === '/api/skills') {
      return route.fulfill({ json: { skills: Array.from({ length: 11 }, (_, i) => ({
        id: `skill-${i + 1}`, nameAr: `مهارة ${i + 1}`, purpose: 'اختبار تجريبي', notes: 'غير مفعّلة'
      })) } });
    }
    return route.fulfill({ status: 404, json: { error: 'mock_not_found' } });
  });

  await page.goto(origin);
  await page.getByText('مهارة 11').waitFor();
  await page.locator('#tasi-value').waitFor();
  assert.notEqual((await page.locator('#tasi-value').innerText()).trim(), '—');
  assert.equal(await page.locator('.skill-item').count(), 11);
  assert.equal(await page.locator('.skill-state').count(), 11);
  assert.match(await page.locator('#data-status-title').innerText(), /الاتصال ناجح/);
  assert.ok(providerRequests.every(request => request.method === 'GET'));
  assert.ok(!providerRequests.some(request => /order|trade|broker/i.test(request.path)));
  await page.close();
});

test('watchlist add/remove and risk calculator work without submitting trades', async () => {
  const page = await browser.newPage();
  await page.route('https://saudi-trading-agent.onrender.com/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/market/summary') {
      return route.fulfill({ json: { provider: 'MOCK', data: { index_value: 10800, index_change: 0, index_change_percent: 0, timestamp: '2026-11-27T09:00:00+03:00', is_delayed: true } } });
    }
    if (url.pathname.startsWith('/api/quote/')) {
      return route.fulfill({ json: { provider: 'MOCK', data: { price: 25, change: 0, change_percent: 0, is_delayed: true } } });
    }
    if (url.pathname === '/api/skills') return route.fulfill({ json: { skills: [] } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto(origin);
  await page.locator('#watch-list tr').first().waitFor();
  await page.locator('#symbol').fill('1120');
  await page.locator('#watch-form button').click();
  await page.locator('#watch-list').getByText('1120').waitFor();
  const row = page.locator('#watch-list tr').filter({ hasText: '1120' });
  await row.getByRole('button', { name: 'حذف' }).click();
  assert.equal(await page.locator('#watch-list').getByText('1120').count(), 0);

  await page.locator('#capital').fill('10000');
  await page.locator('#risk').fill('1');
  await page.locator('#entry').fill('25');
  await page.locator('#stop').fill('24');
  await page.locator('#calculate').click();
  assert.match(await page.locator('#result').innerText(), /الكمية النظرية:.*سهم/);
  assert.equal(await page.locator('#watch-list tr').count(), 1);
  await page.close();
});
