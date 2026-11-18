/**
 * Deterministic Tadawul fundamentals screener.
 * Screens supplied, source-labelled metrics only. It does not fetch prices,
 * infer missing metrics, create recommendations, or submit orders.
 */
const VALID_SYMBOL = /^\d{4,5}$/;
const OPS = new Set(['>', '>=', '<', '<=', '==', '!=', 'between', 'in', 'not in']);

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function compare(actual, op, expected) {
  if (op === 'between') return Array.isArray(expected) && expected.length === 2 &&
    numeric(expected[0]) && numeric(expected[1]) && actual >= expected[0] && actual <= expected[1];
  if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (op === 'not in') return Array.isArray(expected) && !expected.includes(actual);
  if (!numeric(actual) || !numeric(expected)) return false;
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

export function screenTadawulCompanies(companies, config = {}) {
  const rules = config.rules;
  validateRules(rules);
  const missingPolicy = config.missing || 'fail';
  if (!['fail', 'skip'].includes(missingPolicy)) throw new TypeError('missing must be fail or skip.');
  const nowMs = Number.isFinite(config.nowMs) ? config.nowMs : Date.now();
  const maxAgeDays = Number.isFinite(config.maxAgeDays) ? config.maxAgeDays : 180;
  if (maxAgeDays < 0) throw new RangeError('maxAgeDays must be non-negative.');
  const rank = Array.isArray(config.rank) ? config.rank : [];

  const results = (Array.isArray(companies) ? companies : []).map(company => {
    const reasons = [];
    const metrics = company && company.metrics && typeof company.metrics === 'object' ? company.metrics : {};
    if (!company || typeof company !== 'object') return { symbol: null, status: 'FAIL', reasons: ['invalid_company_record'] };
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
      const exists = numeric(actual);
      if (!exists) return { metric: rule.metric, status: missingPolicy === 'skip' ? 'SKIP' : 'FAIL', actual: null, op: rule.op, expected: rule.value, reason: 'missing_or_non_numeric_metric' };
      const passed = compare(actual, rule.op, rule.value);
      return { metric: rule.metric, status: passed ? 'PASS' : 'FAIL', actual, op: rule.op, expected: rule.value };
    });
    const failedChecks = checks.filter(x => x.status === 'FAIL');
    if (failedChecks.length) reasons.push('screening_rules_failed');

    const rankScores = rank.map(item => {
      const value = metrics[item.metric];
      if (!numeric(value) || !['asc', 'desc'].includes(item.order)) return null;
      return { metric: item.metric, value, order: item.order, weight: numeric(item.weight) && item.weight > 0 ? item.weight : 1 };
    }).filter(Boolean);
    const score = rankScores.length
      ? rankScores.reduce((sum, item) => sum + (item.order === 'desc' ? item.value : -item.value) * item.weight, 0) /
        rankScores.reduce((sum, item) => sum + item.weight, 0)
      : null;
    return {
      symbol: company.symbol || null,
      name: typeof company.name === 'string' ? company.name : null,
      status: reasons.length === 0 && failedChecks.length === 0 ? 'PASS' : 'FAIL',
      asOf: company.asOf || null,
      source: company.source || null,
      reasons,
      checks,
      score
    };
  });

  results.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'PASS' ? -1 : 1;
    if (a.score === null && b.score === null) return String(a.symbol).localeCompare(String(b.symbol));
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  return {
    market: 'Tadawul',
    currency: 'SAR',
    resultType: 'screening_only_not_a_recommendation',
    screenedAt: new Date(nowMs).toISOString(),
    total: results.length,
    passed: results.filter(x => x.status === 'PASS').length,
    failed: results.filter(x => x.status === 'FAIL').length,
    results
  };
}
