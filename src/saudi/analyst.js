/**
 * Read-only Saudi quarterly financial comparison.
 * Consumes caller-supplied, source-labelled statements; it does not fetch data
 * or produce investment recommendations.
 */
const FIELDS = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'dilutedEps'];

function validPeriod(value) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return { ms, year: date.getUTCFullYear(), quarter: Math.floor(date.getUTCMonth() / 3) + 1 };
}

function validateStatement(statement, label) {
  if (!statement || typeof statement !== 'object') throw new TypeError(label + ' statement is required.');
  const period = validPeriod(statement.periodEnd);
  const published = Date.parse(statement.publishedAt || '');
  if (!period) throw new TypeError(label + ' periodEnd must be a valid date.');
  if (!Number.isFinite(published)) throw new TypeError(label + ' publishedAt must be a valid timestamp.');
  for (const field of FIELDS) {
    if (typeof statement[field] !== 'number' || !Number.isFinite(statement[field])) {
      throw new TypeError(label + ' requires a finite numeric ' + field + '.');
    }
  }
  if (statement.revenue <= 0) throw new RangeError(label + ' revenue must be positive.');
  return { ...period, published };
}

function growth(current, previous) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function margin(value, revenue) {
  return (value / revenue) * 100;
}

export function analyzeSaudiQuarterlyResults(company, options = {}) {
  if (!company || typeof company !== 'object') throw new TypeError('Company metadata is required.');
  if (typeof company.symbol !== 'string' || !/^\d{4,5}$/.test(company.symbol)) {
    throw new TypeError('A valid 4–5 digit Tadawul symbol is required.');
  }
  if (company.market !== 'Tadawul' || company.currency !== 'SAR') {
    throw new TypeError('Only Tadawul companies reported in SAR are supported.');
  }
  if (typeof company.source !== 'string' || !company.source.trim()) {
    throw new TypeError('A non-empty financial data source is required.');
  }

  const current = validateStatement(company.current, 'current');
  const previous = validateStatement(company.previousYear, 'previousYear');
  if (current.year - previous.year !== 1 || current.quarter !== previous.quarter) {
    throw new RangeError('Statements must represent the same quarter in consecutive years.');
  }

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const maxPublishedAgeDays = Number.isFinite(options.maxPublishedAgeDays) ? options.maxPublishedAgeDays : 240;
  if (maxPublishedAgeDays < 0) throw new RangeError('maxPublishedAgeDays must be non-negative.');
  if (current.published > nowMs) throw new RangeError('Current statement publication timestamp is in the future.');
  if (nowMs - current.published > maxPublishedAgeDays * 86400000) {
    throw new RangeError('Current statement publication is too old for this analysis.');
  }
  if (current.ms > nowMs) throw new RangeError('Current reporting period is in the future.');

  const currentStatement = company.current;
  const previousStatement = company.previousYear;
  const growthRates = Object.fromEntries(FIELDS.map(field => [field, growth(currentStatement[field], previousStatement[field])]));
  const margins = {
    gross: margin(currentStatement.grossProfit, currentStatement.revenue),
    operating: margin(currentStatement.operatingIncome, currentStatement.revenue),
    net: margin(currentStatement.netIncome, currentStatement.revenue)
  };
  const previousMargins = {
    gross: margin(previousStatement.grossProfit, previousStatement.revenue),
    operating: margin(previousStatement.operatingIncome, previousStatement.revenue),
    net: margin(previousStatement.netIncome, previousStatement.revenue)
  };

  return {
    symbol: company.symbol,
    market: 'Tadawul',
    currency: 'SAR',
    source: company.source,
    resultType: 'financial_analysis_only_not_a_recommendation',
    currentPeriod: currentStatement.periodEnd,
    comparisonPeriod: previousStatement.periodEnd,
    publishedAt: currentStatement.publishedAt,
    comparison: {
      current: Object.fromEntries(FIELDS.map(field => [field, currentStatement[field]])),
      previousYear: Object.fromEntries(FIELDS.map(field => [field, previousStatement[field]])),
      yearOverYearGrowthPercent: growthRates,
      marginsPercent: margins,
      previousYearMarginsPercent: previousMargins,
      marginChangePercentagePoints: {
        gross: margins.gross - previousMargins.gross,
        operating: margins.operating - previousMargins.operating,
        net: margins.net - previousMargins.net
      }
    },
    limitations: FIELDS.filter(field => growthRates[field] === null).map(field => field + '_growth_unavailable_previous_value_not_positive')
  };
}
