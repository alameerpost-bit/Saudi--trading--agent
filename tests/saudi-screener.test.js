import test from 'node:test';
import assert from 'node:assert/strict';
import { screenTadawulCompanies } from '../src/saudi/screener.js';

const nowMs = Date.parse('2026-11-18T08:00:00.000Z');
const companies = [
  { symbol: '2222', name: 'Example A', market: 'Tadawul', currency: 'SAR', source: 'test-fixture', asOf: '2026-10-31', metrics: { revenueGrowthYoY: 12, netMargin: 18, pe: 15 } },
  { symbol: '1120', name: 'Example B', market: 'Tadawul', currency: 'SAR', source: 'test-fixture', asOf: '2026-10-31', metrics: { revenueGrowthYoY: 4, netMargin: 20, pe: 12 } },
  { symbol: 'AAPL', name: 'US stock', market: 'NASDAQ', currency: 'USD', source: 'test-fixture', asOf: '2026-10-31', metrics: { revenueGrowthYoY: 20, netMargin: 25, pe: 10 } }
];
const config = {
  nowMs,
  rules: [
    { metric: 'revenueGrowthYoY', op: '>=', value: 10 },
    { metric: 'netMargin', op: '>=', value: 10 },
    { metric: 'pe', op: '<=', value: 25 }
  ],
  rank: [{ metric: 'revenueGrowthYoY', order: 'desc', weight: 2 }, { metric: 'pe', order: 'asc' }]
};

test('screens only valid Tadawul SAR companies and ranks passing candidates', () => {
  const result = screenTadawulCompanies(companies, config);
  assert.equal(result.market, 'Tadawul');
  assert.equal(result.currency, 'SAR');
  assert.equal(result.passed, 1);
  assert.equal(result.results[0].symbol, '2222');
  assert.equal(result.results[0].status, 'PASS');
  assert.equal(result.resultType, 'screening_only_not_a_recommendation');
});

test('missing metrics fail closed by default', () => {
  const result = screenTadawulCompanies([{
    symbol: '2222', market: 'Tadawul', currency: 'SAR', source: 'fixture',
    asOf: '2026-10-31', metrics: { revenueGrowthYoY: 15 }
  }], config);
  assert.equal(result.passed, 0);
  assert.ok(result.results[0].checks.some(x => x.reason === 'missing_or_non_numeric_metric' && x.status === 'FAIL'));
});

test('skip policy is explicit and visible', () => {
  const result = screenTadawulCompanies([{
    symbol: '2222', market: 'Tadawul', currency: 'SAR', source: 'fixture',
    asOf: '2026-10-31', metrics: { revenueGrowthYoY: 15, netMargin: 11 }
  }], { ...config, missing: 'skip' });
  assert.equal(result.passed, 1);
  assert.ok(result.results[0].checks.some(x => x.status === 'SKIP'));
  assert.equal(result.results[0].status, 'PASS');
});

test('stale fundamentals, US market and invalid symbol fail', () => {
  const result = screenTadawulCompanies([
    { ...companies[0], asOf: '2025-01-01' },
    companies[2]
  ], config);
  assert.equal(result.passed, 0);
  assert.ok(result.results.some(x => x.reasons.includes('stale_fundamentals')));
  assert.ok(result.results.some(x => x.reasons.includes('market_not_tadawul')));
});

test('invalid rule definitions throw rather than silently changing the screen', () => {
  assert.throws(() => screenTadawulCompanies(companies, { ...config, rules: [] }), TypeError);
  assert.throws(() => screenTadawulCompanies(companies, { ...config, rules: [{ metric: 'pe', op: 'approx', value: 10 }] }), TypeError);
});
