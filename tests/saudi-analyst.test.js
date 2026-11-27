import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSaudiQuarterlyResults } from '../src/saudi/analyst.js';

const company = {
  symbol: '2222', market: 'Tadawul', currency: 'SAR', source: 'Saudi Exchange filing fixture',
  current: {
    periodEnd: '2026-09-30', publishedAt: '2026-11-05T10:00:00Z',
    revenue: 1000, grossProfit: 300, operatingIncome: 180, netIncome: 120, dilutedEps: 0.4
  },
  previousYear: {
    periodEnd: '2025-09-30', publishedAt: '2025-11-06T10:00:00Z',
    revenue: 800, grossProfit: 240, operatingIncome: 136, netIncome: 80, dilutedEps: 0.3
  }
};
const options = { nowMs: Date.parse('2026-11-18T12:00:00Z') };

test('compares matching Saudi quarterly statements year over year', () => {
  const result = analyzeSaudiQuarterlyResults(company, options);
  assert.equal(result.symbol, '2222');
  assert.equal(result.market, 'Tadawul');
  assert.equal(result.currency, 'SAR');
  assert.equal(result.resultType, 'financial_analysis_only_not_a_recommendation');
  assert.equal(result.comparison.yearOverYearGrowthPercent.revenue, 25);
  assert.equal(result.comparison.marginsPercent.net, 12);
  assert.equal(result.comparison.marginChangePercentagePoints.net, 2);
  assert.deepEqual(result.limitations, []);
});

test('rejects non-Saudi company metadata and missing sources', () => {
  assert.throws(() => analyzeSaudiQuarterlyResults({ ...company, market: 'NYSE' }, options), /Only Tadawul/);
  assert.throws(() => analyzeSaudiQuarterlyResults({ ...company, source: ' ' }, options), /source/);
});

test('rejects mismatched quarters, stale publication and future publication', () => {
  assert.throws(() => analyzeSaudiQuarterlyResults({
    ...company, previousYear: { ...company.previousYear, periodEnd: '2025-06-30' }
  }, options), /same quarter/);
  assert.throws(() => analyzeSaudiQuarterlyResults({
    ...company, current: { ...company.current, publishedAt: '2025-01-01T00:00:00Z' }
  }, options), /too old/);
  assert.throws(() => analyzeSaudiQuarterlyResults({
    ...company, current: { ...company.current, publishedAt: '2026-12-01T00:00:00Z' }
  }, options), /future/);
});

test('handles prior losses without inventing a growth percentage', () => {
  const result = analyzeSaudiQuarterlyResults({
    ...company, previousYear: { ...company.previousYear, netIncome: -20 }
  }, options);
  assert.equal(result.comparison.yearOverYearGrowthPercent.netIncome, null);
  assert.ok(result.limitations.includes('netIncome_growth_unavailable_previous_value_not_positive'));
});

test('rejects incomplete or non-numeric financial statements', () => {
  const current = { ...company.current, dilutedEps: undefined };
  assert.throws(() => analyzeSaudiQuarterlyResults({ ...company, current }, options), /dilutedEps/);
});
