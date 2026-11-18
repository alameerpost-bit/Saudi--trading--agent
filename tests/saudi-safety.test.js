import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMarketDataQuality, calculateSaudiPositionSize } from '../src/saudi/safety.js';

const now = Date.parse('2026-11-18T08:00:00.000Z');
const fresh = {
  provider: 'SAHMK', symbol: '2222', isDelayed: false,
  sourceTimestamp: '2026-11-18T07:59:30.000Z',
  retrievedAt: '2026-11-18T07:59:40.000Z'
};

test('fresh, identified, non-delayed Tadawul data passes quality gate', () => {
  assert.equal(assessMarketDataQuality(fresh, { nowMs: now }).eligible, true);
});

test('delayed data is rejected even when its timestamp is recent', () => {
  const result = assessMarketDataQuality({ ...fresh, isDelayed: true }, { nowMs: now });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('delayed_data'));
});

test('missing source timestamp and unknown delay status are rejected', () => {
  const result = assessMarketDataQuality({ provider: 'SAHMK', symbol: '2222', retrievedAt: fresh.retrievedAt }, { nowMs: now });
  assert.ok(result.reasons.includes('missing_or_invalid_source_timestamp'));
  assert.ok(result.reasons.includes('delay_status_unknown'));
});

test('stale and future source timestamps are rejected', () => {
  const stale = assessMarketDataQuality({ ...fresh, sourceTimestamp: '2026-11-18T07:50:00.000Z' }, { nowMs: now });
  assert.ok(stale.reasons.includes('stale_data'));
  const future = assessMarketDataQuality({ ...fresh, sourceTimestamp: '2026-11-18T08:01:00.000Z' }, { nowMs: now });
  assert.ok(future.reasons.includes('source_timestamp_in_future'));
});

test('position sizing uses the tightest risk, concentration and cash constraint', () => {
  const result = calculateSaudiPositionSize({
    capitalSar: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 48,
    maxPositionPercent: 20, cashAvailableSar: 5000, reservePercent: 10
  });
  assert.equal(result.shares, 40);
  assert.equal(result.estimatedCostSar, 2000);
  assert.equal(result.estimatedRiskSar, 80);
});

test('position sizing rejects invalid long-stop and unsafe percentages', () => {
  assert.throws(() => calculateSaudiPositionSize({
    capitalSar: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 51
  }), RangeError);
  assert.throws(() => calculateSaudiPositionSize({
    capitalSar: 10000, riskPercent: 101, entryPrice: 50, stopPrice: 48
  }), RangeError);
});
