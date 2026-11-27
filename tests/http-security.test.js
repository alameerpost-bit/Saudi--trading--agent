import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedWindowRateLimiter, normalizeSahmkBaseUrl, safeProviderMessage } from '../src/saudi/http-security.js';

test('Sahm base URL accepts only official HTTPS hosts and API path', () => {
  assert.equal(normalizeSahmkBaseUrl('https://api.sahmk.sa/api/v1/'), 'https://api.sahmk.sa/api/v1');
  assert.equal(normalizeSahmkBaseUrl('https://www.sahmk.sa/api/v1'), 'https://www.sahmk.sa/api/v1');
});
test('Sahm base URL rejects lookalike hosts, HTTP and credential forwarding', () => {
  for (const value of [
    'http://api.sahmk.sa/api/v1',
    'https://api.sahmk.sa.attacker.example/api/v1',
    'https://user:pass@api.sahmk.sa/api/v1',
    'https://api.sahmk.sa/other',
    'https://api.sahmk.sa/api/v1?redirect=https://attacker.example'
  ]) assert.throws(() => normalizeSahmkBaseUrl(value), /official Sahm/);
});
test('provider errors are sanitized and timeout remains identifiable', () => {
  assert.equal(safeProviderMessage(new Error('secret response body'), 'Argaam'), 'Argaam data is temporarily unavailable.');
  const timeout = new Error('internal'); timeout.cause = { name: 'TimeoutError' };
  assert.equal(safeProviderMessage(timeout, 'Argaam'), 'Argaam request timed out.');
});

test('fixed-window limiter blocks requests above the configured threshold', () => {
  const limiter = createFixedWindowRateLimiter({ windowMs: 10000, max: 1, maxKeys: 100 });
  const makeResponse = () => ({
    headers: {}, statusCode: 200, payload: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  });
  const req = { ip: '192.0.2.10', socket: { remoteAddress: '127.0.0.1' } };
  let nextCalls = 0;
  const first = makeResponse();
  limiter(req, first, () => { nextCalls += 1; });
  const second = makeResponse();
  limiter(req, second, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(second.statusCode, 429);
  assert.equal(second.payload.error, 'rate_limit_exceeded');
  assert.equal(second.headers['Retry-After'] > 0, true);
});
