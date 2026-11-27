/**
 * Deterministic Tadawul fundamentals screener.
 * Screens supplied, source-labelled metrics only. It never fetches prices,
 * infers missing metrics, creates recommendations, or submits orders.
 */
const VALID_SYMBOL = /^\d{4,5}$/;
const OPS = new Set(['>', '>=', '<', '<=', '==', '!=', 'between', 'in', 'not in']);
const numeric = value => typeof value === 'number' && Number.isFinite(value);

function compare(actual, op, expected) {
  if (op === 'between') return actual >= expected[0] && actual <= expected[1];
  if (op === 'in') return expected.includes(actual);
  if (op === 'not in') return !expected.includes(actual);
  if (op === '>') return actual > expected;
  if (op === '>=') return actual >= expected;
  if (op === '<') return actual < expected;
  if (op === '<=') return actual <= expected;
  if (op === '==') return actual === expected;
  if (op === '!=') return actual !== expected;
  return false;
}

function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) throw new TypeError('At least one screening rule is required.');
  for (const rule of rules) {
    if (!rule || typeof rule.metric !== 'string' || !rule.metric.trim() || !OPS.has(rule.op)) {
      throw new TypeError('Each rule requires a metric and a supported operator.');
    }
    if (rule.op === 'between') {
      if (!Array.isArray(rule.value) || rule.value.length !== 2 ||
          !rule.value.every(numeric) || rule.value[0] > rule.value[1]) {
        throw new TypeError('between requires an ascending pair of finite numbers.');
      }
    } else if (rule.op === 'in' || rule.op === 'not in') {
      if (!Array.isArray(rule.value) || rule.value.length === 0) throw new TypeError(rule.op + ' requires a non-empty list.');
    } else if (!numeric(rule.value)) {
      throw new TypeError('Numeric comparison rules require a finite numeric value.');
    }
  }
}

function validateRank(rank) {
  if (!Array.isArray(rank)) throw new TypeError('rank must be an array.');
  for (const item of rank) {
    if (!item || typeof item.metric !== 'string' || !item.metric.trim() ||
        !['asc', 'desc'].includes(item.order) ||
        (item.weight !== undefined && (!numeric(item.weight) || item.weight <= 0))) {
      throw new TypeError('Each rank item requires a metric, asc/desc order, and a positive finite weight.');
    }
  }
}

export function screenTadawulCompanies(companies, config = {}) {
  const rules = config.rules;
  validateRules(rules);
  const missingPolicy = config.missing || 'fail';
  if (!['fail', 'skip'].includes(missingPolicy)) throw new TypeError('missing must be fail or skip.');
  const nowMs = Number.isFinite(config.nowMs) ? config.nowMs : Date.now();
  const maxAgeDays = Number.isFinite(config.maxAgeDays) ? config.maxAgeDays : 180;
  if (maxAgeDays < 0) throw new RangeError('maxAgeDays must be non-negative.');
  const rank = config.rank === undefined ? [] : config.rank;
  validateRank(rank);
  const input = Array.isArray(companies) ? companies : [];

  // Normalize every ranking metric to 0..1 across this screening batch.
  // Missing ranking values remain unavailable; raw SAR, percentages and ratios
  // are never mixed directly in a weighted sum.
  const ranges = new Map();
  for (const item of rank) {
    const values = input.map(c => c?.metrics?.[item.metric]).filter(numeric);
    if (values.length) ranges.set(item.metric, { min: Math.min(...values), max: Math.max(...values) });
  }

  const results = input.map(company => {
    if (!company || typeof company !== 'object') {
      return { symbol: null, status: 'FAIL', reasons: ['invalid_company_record'], checks: [], score: null };
    }
    const reasons = [];
    const metrics = company.metrics && typeof company.metrics === 'object' ? company.metrics : {};
    if (typeof company.symbol !== 'string' || !VALID_SYMBOL.test(company.symbol)) reasons.push('invalid_tadawul_symbol');
    if (company.market !== 'Tadawul') reasons.push('market_not_tadawul');
    if (company.currency !== 'SAR') reasons.push('currency_not_sar');
    if (typeof company.source !== 'string' || !company.source.trim()) reasons.push('missing_data_source');
    const asOfMs = Date.parse(company.asOf || '');
    if (!Number.isFinite(asOfMs)) reasons.push('missing_or_invalid_as_of_date');
    else {
      const ageDays = (nowMs - asOfMs) / 86400000;
      if (ageDays < -1) reasons.push('fundamentals_date_in_future');
      else if (ageDays > maxAgeDays) reasons.push('stale_fundamentals');
    }

    const checks = rules.map(rule => {
      const actual = metrics[rule.metric];
      if (!numeric(actual)) return {
        metric: rule.metric, status: missingPolicy === 'skip' ? 'SKIP' : 'FAIL',
        actual: null, op: rule.op, expected: rule.value,
        reason: 'missing_or_non_numeric_metric'
      };
      const passed = compare(actual, rule.op, rule.value);
      return { metric: rule.metric, status: passed ? 'PASS' : 'FAIL', actual, op: rule.op, expected: rule.value };
    });
    const failedChecks = checks.filter(x => x.status === 'FAIL');
    const skippedChecks = checks.filter(x => x.status === 'SKIP');
    if (failedChecks.length) reasons.push('screening_rules_failed');
    if (skippedChecks.length) reasons.push('required_metrics_skipped');

    const normalized = rank.map(item => {
      const value = metrics[item.metric];
      const range = ranges.get(item.metric);
      if (!numeric(value) || !range) return null;
      const raw = range.max === range.min ? 1 : (value - range.min) / (range.max - range.min);
      return { metric: item.metric, score: item.order === 'desc' ? raw : 1 - raw, weight: item.weight ?? 1 };
    });
    const rankIncomplete = normalized.some(x => x === null);
    if (rankIncomplete && rank.length) reasons.push('ranking_metric_missing');
    const usable = normalized.filter(Boolean);
    const score = usable.length === rank.length && rank.length
      ? usable.reduce((sum, x) => sum + x.score * x.weight, 0) / usable.reduce((sum, x) => sum + x.weight, 0)
      : null;

    const hardFail = reasons.some(x => !['required_metrics_skipped', 'ranking_metric_missing'].includes(x)) || failedChecks.length > 0;
    const status = hardFail ? 'FAIL' : (skippedChecks.length || rankIncomplete ? 'INCONCLUSIVE' : 'PASS');
    return {
      symbol: company.symbol || null,
      name: typeof company.name === 'string' ? company.name : null,
      status, asOf: company.asOf || null, source: company.source || null,
      reasons, checks, score
    };
  });

  const order = { PASS: 0, INCONCLUSIVE: 1, FAIL: 2 };
  results.sort((a, b) => order[a.status] - order[b.status] ||
    (a.score === null && b.score === null ? String(a.symbol).localeCompare(String(b.symbol)) :
      a.score === null ? 1 : b.score === null ? -1 : b.score - a.score));

  return {
    market: 'Tadawul', currency: 'SAR',
    resultType: 'screening_only_not_a_recommendation',
    screenedAt: new Date(nowMs).toISOString(),
    total: results.length,
    passed: results.filter(x => x.status === 'PASS').length,
    inconclusive: results.filter(x => x.status === 'INCONCLUSIVE').length,
    failed: results.filter(x => x.status === 'FAIL').length,
    results
  };
}
