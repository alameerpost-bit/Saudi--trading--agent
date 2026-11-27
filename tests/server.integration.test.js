import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../server.js';

test('HTTP API integration: health, skills, validation, security headers, CORS and rate limiting', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Origin: 'https://alameerpost-bit.github.io' };
  try {
    const health = await fetch(`${base}/api/health`, { headers });
    assert.equal(health.status, 200);
    const healthData = await health.json();
    assert.equal(healthData.tradingEnabled, false);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.match(health.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(health.headers.get('x-permitted-cross-domain-policies'), 'none');
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://alameerpost-bit.github.io');

    const skills = await fetch(`${base}/api/skills`, { headers });
    const registry = await skills.json();
    assert.equal(skills.status, 200);
    assert.equal(registry.skills.length, 11);
    assert.equal(registry.safety.automaticExecution, false);
    assert.ok(registry.skills.every(skill => skill.enabled === false));

    const invalidScreen = await fetch(`${base}/api/skills/screen`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies: 'not-an-array', rules: [] })
    });
    assert.equal(invalidScreen.status, 400);
    assert.equal((await invalidScreen.json()).error, 'invalid_companies');

    // The quote-specific limiter permits 30 requests/minute; request 31 is rejected.
    let last;
    for (let i = 0; i < 31; i++) {
      last = await fetch(`${base}/api/quote/not-a-symbol`, { headers });
      if (i < 30) assert.equal(last.status, 400);
    }
    assert.equal(last.status, 429);
    assert.equal((await last.json()).error, 'rate_limit_exceeded');
    assert.ok(Number(last.headers.get('retry-after')) >= 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
