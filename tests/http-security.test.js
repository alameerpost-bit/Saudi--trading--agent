import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSahmkBaseUrl, safeProviderMessage } from '../src/saudi/http-security.js';

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
