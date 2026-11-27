/**
 * Saudi-market safety primitives.
 * Advisory gates only: these functions never create or submit orders.
 */
export function assessMarketDataQuality(snapshot, options = {}) {
  const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds) ? options.maxAgeSeconds : 60;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const reasons = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { eligible: false, reasons: ['missing_snapshot'], ageSeconds: null };
  }
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) throw new RangeError('maxAgeSeconds must be non-negative.');
  if (typeof snapshot.provider !== 'string' || !snapshot.provider.trim()) reasons.push('missing_provider');
  if (typeof snapshot.symbol !== 'string' || !/^\d{4,5}$/.test(snapshot.symbol)) reasons.push('invalid_tadawul_symbol');
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

/** Validate candle structure and chronological ordering before indicators run. */
export function assessOhlcvQuality(candles) {
  const reasons = [];
  if (!Array.isArray(candles) || candles.length === 0) {
    return { eligible: false, reasons: ['missing_candles'], candleCount: 0 };
  }
  let previousTime = -Infinity;
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle || typeof candle !== 'object') {
      reasons.push('invalid_candle_' + i);
      continue;
    }
    const { open, high, low, close, volume } = candle;
    const values = [open, high, low, close, volume];
    if (!values.every(Number.isFinite) || [open, high, low, close].some(x => x <= 0) || volume < 0) {
      reasons.push('invalid_ohlcv_values_' + i);
      continue;
    }
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      reasons.push('inconsistent_ohlc_range_' + i);
    }
    const time = Date.parse(candle.timestamp || candle.time || '');
    if (!Number.isFinite(time)) reasons.push('invalid_candle_timestamp_' + i);
    else if (time <= previousTime) reasons.push('non_increasing_candle_timestamps_' + i);
    if (Number.isFinite(time)) previousTime = time;
  }
  return { eligible: reasons.length === 0, reasons, candleCount: candles.length };
}

/**
 * Long-position sizing. commissionPercent is the all-in commission rate per
 * side (include applicable VAT); slippageBps is the estimated adverse slippage
 * per side. Both are explicit assumptions and default to zero only when the
 * caller deliberately supplies no cost model.
 */
export function calculateSaudiPositionSize(input) {
  const {
    capitalSar, riskPercent, entryPrice, stopPrice,
    maxPositionPercent = 100, cashAvailableSar = capitalSar,
    reservePercent = 0, commissionPercent = 0, slippageBps = 0
  } = input || {};
  const values = [capitalSar, riskPercent, entryPrice, stopPrice, maxPositionPercent,
    cashAvailableSar, reservePercent, commissionPercent, slippageBps];
  if (!values.every(Number.isFinite) || capitalSar <= 0 || riskPercent <= 0 ||
      riskPercent > 100 || entryPrice <= 0 || stopPrice <= 0 ||
      stopPrice >= entryPrice || maxPositionPercent <= 0 ||
      maxPositionPercent > 100 || cashAvailableSar < 0 ||
      reservePercent < 0 || reservePercent >= 100 ||
      commissionPercent < 0 || commissionPercent > 100 ||
      slippageBps < 0 || slippageBps > 10000) {
    throw new RangeError('Invalid SAR position-sizing inputs or transaction-cost assumptions.');
  }

  const riskBudgetSar = capitalSar * riskPercent / 100;
  const commissionRate = commissionPercent / 100;
  const slippageRate = slippageBps / 10000;
  const entryCostPerShare = entryPrice * (1 + commissionRate + slippageRate);
  const exitCostPerShare = stopPrice * (commissionRate + slippageRate);
  const grossPriceRiskPerShare = entryPrice - stopPrice;
  const transactionCostsPerShare = entryPrice * commissionRate + stopPrice * commissionRate +
    (entryPrice + stopPrice) * slippageRate;
  const riskPerShareSar = grossPriceRiskPerShare + transactionCostsPerShare;
  const sharesByRisk = Math.floor(riskBudgetSar / riskPerShareSar);
  const maxPositionSar = capitalSar * maxPositionPercent / 100;
  const deployableCashSar = cashAvailableSar * (1 - reservePercent / 100);
  const sharesByPosition = Math.floor(maxPositionSar / entryCostPerShare);
  const sharesByCash = Math.floor(deployableCashSar / entryCostPerShare);
  const shares = Math.max(0, Math.min(sharesByRisk, sharesByPosition, sharesByCash));
  const grossEntryValueSar = shares * entryPrice;
  const entryFeesAndSlippageSar = shares * (entryCostPerShare - entryPrice);
  const exitFeesAndSlippageSar = shares * exitCostPerShare;
  return {
    shares,
    estimatedCostSar: grossEntryValueSar + entryFeesAndSlippageSar,
    grossEntryValueSar,
    entryFeesAndSlippageSar,
    exitFeesAndSlippageSar,
    estimatedRiskSar: shares * riskPerShareSar,
    grossPriceRiskSar: shares * grossPriceRiskPerShare,
    transactionCostsAtStopSar: shares * transactionCostsPerShare,
    riskBudgetSar,
    riskPerShareSar,
    assumptions: { commissionPercentPerSide: commissionPercent, slippageBpsPerSide: slippageBps },
    limits: { sharesByRisk, sharesByPosition, sharesByCash }
  };
}
