/**
 * Saudi-market safety primitives.
 * These functions are advisory gates only; they never create or submit orders.
 */
export function assessMarketDataQuality(snapshot, options = {}) {
  const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds) ? options.maxAgeSeconds : 60;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const reasons = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { eligible: false, reasons: ['missing_snapshot'], ageSeconds: null };
  }
  if (typeof snapshot.provider !== 'string' || !snapshot.provider.trim()) reasons.push('missing_provider');
  if (typeof snapshot.symbol !== 'string' || !/^\\d{4,5}$/.test(snapshot.symbol)) reasons.push('invalid_tadawul_symbol');
  if (typeof snapshot.isDelayed !== 'boolean') reasons.push('delay_status_unknown');
  else if (snapshot.isDelayed) reasons.push('delayed_data');
  const sourceMs = Date.parse(snapshot.sourceTimestamp || '');
  const retrievedMs = Date.parse(snapshot.retrievedAt || '');
  if (!Number.isFinite(sourceMs)) reasons.push('missing_or_invalid_source_timestamp');
  if (!Number.isFinite(retrievedMs)) reasons.push('missing_or_invalid_retrieval_timestamp');
  let ageSeconds = null;
  if (Number.isFinite(sourceMs)) {
    ageSeconds = (nowMs - sourceMs) / 1000;
    if (ageSeconds < -5) reasons.push('source_timestamp_in_future');
    else if (ageSeconds > maxAgeSeconds) reasons.push('stale_data');
  }
  if (Number.isFinite(sourceMs) && Number.isFinite(retrievedMs) && sourceMs - retrievedMs > 5) {
    reasons.push('source_after_retrieval');
  }
  return { eligible: reasons.length === 0, reasons, ageSeconds };
}

export function calculateSaudiPositionSize(input) {
  const {
    capitalSar, riskPercent, entryPrice, stopPrice,
    maxPositionPercent = 100, cashAvailableSar = capitalSar,
    reservePercent = 0
  } = input || {};
  const values = [capitalSar, riskPercent, entryPrice, stopPrice, maxPositionPercent, cashAvailableSar, reservePercent];
  if (!values.every(Number.isFinite) || capitalSar <= 0 || riskPercent <= 0 ||
      riskPercent > 100 || entryPrice <= 0 || stopPrice <= 0 ||
      stopPrice >= entryPrice || maxPositionPercent <= 0 ||
      maxPositionPercent > 100 || cashAvailableSar < 0 ||
      reservePercent < 0 || reservePercent >= 100) {
    throw new RangeError('Invalid SAR position-sizing inputs for a long position.');
  }
  const riskBudgetSar = capitalSar * riskPercent / 100;
  const riskPerShareSar = entryPrice - stopPrice;
  const sharesByRisk = Math.floor(riskBudgetSar / riskPerShareSar);
  const maxPositionSar = capitalSar * maxPositionPercent / 100;
  const deployableCashSar = cashAvailableSar * (1 - reservePercent / 100);
  const sharesByPosition = Math.floor(maxPositionSar / entryPrice);
  const sharesByCash = Math.floor(deployableCashSar / entryPrice);
  const shares = Math.max(0, Math.min(sharesByRisk, sharesByPosition, sharesByCash));
  return {
    shares,
    estimatedCostSar: shares * entryPrice,
    estimatedRiskSar: shares * riskPerShareSar,
    riskBudgetSar,
    riskPerShareSar,
    limits: { sharesByRisk, sharesByPosition, sharesByCash }
  };
}
