import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenTadawulCompanies } from './src/saudi/screener.js';
import { createFixedWindowRateLimiter, normalizeSahmkBaseUrl, safeProviderMessage } from './src/saudi/http-security.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SAHMK_API_KEY;
const ARGAAM_API_KEY = process.env.ARGAAM_API_KEY; // Market Data Sandbox credential
const ARGAAM_FUNDAMENTALS_API_KEY = process.env.ARGAAM_FUNDAMENTALS_API_KEY; // Fundamentals Sandbox credential
const ARGAAM_BASE = 'https://api-sandbox.argaam.com/api/v1.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const BASE = normalizeSahmkBaseUrl(process.env.SAHMK_BASE_URL);
const SKILL_REGISTRY = JSON.parse(readFileSync(new URL('./skills/registry.json', import.meta.url), 'utf8'));

const allowedOrigins = new Set([
  'https://alameerpost-bit.github.io',
  ...(ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
]);
app.use(cors({ origin(origin, callback) {
  // Public, read-only market endpoints: allow the published app and configured origins.
  if (!origin || allowedOrigins.has(origin)) return callback(null, true);
  return callback(null, false);
} }));
app.set('trust proxy', 1); // Trust only Render's single reverse proxy for client IP/HTTPS metadata.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy': 'same-site'
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use('/api', createFixedWindowRateLimiter({ windowMs: 15 * 60 * 1000, max: 180 }));
app.use(['/api/market', '/api/quote', '/api/history', '/api/argaam'], createFixedWindowRateLimiter({ windowMs: 60 * 1000, max: 30 }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/skills', (_req, res) => res.json({ ...SKILL_REGISTRY, retrievedAt: new Date().toISOString() }));

app.post('/api/skills/screen', (req, res) => {
  const { companies, rules, rank, missing, maxAgeDays } = req.body || {};
  if (!Array.isArray(companies) || companies.length > 500) {
    return res.status(400).json({ error: 'invalid_companies', message: 'Provide an array of up to 500 company records.' });
  }
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > 30) {
    return res.status(400).json({ error: 'invalid_rules', message: 'Provide between 1 and 30 screening rules.' });
  }
  if (rank !== undefined && (!Array.isArray(rank) || rank.length > 10)) {
    return res.status(400).json({ error: 'invalid_rank', message: 'Rank must contain no more than 10 metrics.' });
  }
  try {
    const result = screenTadawulCompanies(companies, { rules, rank, missing, maxAgeDays });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: 'invalid_screen_request', message: error.message });
  }
});

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  provider: 'SAHMK',
  apiKeyConfigured: Boolean(API_KEY),
  argaamSandboxConfigured: Boolean(ARGAAM_API_KEY),
  argaamFundamentalsSandboxConfigured: Boolean(ARGAAM_FUNDAMENTALS_API_KEY),
  tradingEnabled: false,
  serverTime: new Date().toISOString()
}));

async function providerGet(path) {
  if (!API_KEY) {
    const error = new Error('SAHMK_API_KEY is not configured on the server.');
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
  } catch (cause) {
    const error = new Error(cause?.name === 'TimeoutError'
      ? 'SAHMK request timed out after 15 seconds.'
      : 'Could not connect to the SAHMK API host.');
    error.cause = cause;
    throw error;
  }
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = null; }
  if (!response.ok) {
    const providerMessage = parsed?.error?.message || parsed?.message || `SAHMK returned HTTP ${response.status}`;
    const error = new Error(String(providerMessage).slice(0, 220));
    error.status = response.status;
    throw error;
  }
  if (parsed === null) throw new Error('SAHMK response was not valid JSON.');
  return parsed;
}

app.get('/api/health/provider', async (_req, res) => {
  try {
    const data = await providerGet('/market/summary/?index=TASI');
    res.json({
      ok: true,
      provider: 'SAHMK',
      authenticated: true,
      providerTimestamp: data.timestamp || null,
      isDelayed: typeof data.is_delayed === 'boolean' ? data.is_delayed : null,
      retrievedAt: new Date().toISOString(),
      tradingEnabled: false
    });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({
      ok: false,
      provider: 'SAHMK',
      authenticated: false,
      providerStatus: error.status || null,
      message: safeProviderMessage(error, 'SAHMK'),
      tradingEnabled: false
    });
  }
});

app.get('/api/market/summary', async (_req, res) => {
  try {
    const data = await providerGet('/market/summary/?index=TASI');
    res.json({ provider: 'SAHMK', retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({ error: 'market_data_unavailable', providerStatus: error.status || null, message: safeProviderMessage(error, 'SAHMK') });
  }
});

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim();
  if (!/^\d{4,5}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  try {
    const data = await providerGet(`/quote/${encodeURIComponent(symbol)}/`);
    res.json({ provider: 'SAHMK', symbol, retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({ error: 'quote_unavailable', providerStatus: error.status || null, message: safeProviderMessage(error, 'SAHMK') });
  }
});

app.get('/api/history/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim();
  if (!/^\d{4,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'invalid_symbol', message: 'Use a 4- or 5-digit Tadawul symbol.' });
  }
  const interval = String(req.query.interval || '1d').trim();
  const allowedIntervals = new Set(['1min', '5min', '15min', '30min', '60min', '1d', '1w', '1mo']);
  if (!allowedIntervals.has(interval)) {
    return res.status(400).json({ error: 'invalid_interval', message: 'Allowed intervals: 1min, 5min, 15min, 30min, 60min, 1d, 1w, 1mo.' });
  }
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
    return res.status(400).json({ error: 'invalid_date_range', message: 'Use valid YYYY-MM-DD dates with from <= to.' });
  }
  const limit = Math.max(1, Math.min(2000, Number.parseInt(req.query.limit || '500', 10) || 500));
  const offset = Math.max(0, Math.min(1000000, Number.parseInt(req.query.offset || '0', 10) || 0));
  const params = new URLSearchParams({ interval, limit: String(limit), offset: String(offset) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  try {
    const data = await providerGet(`/historical/${encodeURIComponent(symbol)}/?${params.toString()}`);
    res.json({ provider: 'SAHMK', symbol, interval, from: from || null, to: to || null, retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    const planLimit = error.status === 403;
    res.status(planLimit ? 403 : (error.status === 503 ? 503 : 502)).json({
      error: planLimit ? 'historical_data_plan_required' : 'history_unavailable',
      providerStatus: error.status || null,
      message: safeProviderMessage(error, 'SAHMK'),
      provider: 'SAHMK',
      tradingEnabled: false
    });
  }
});

app.get('/api/argaam/companies', async (req, res) => {
  if (!ARGAAM_API_KEY) {
    return res.status(503).json({ error: 'argaam_not_configured', message: 'ARGAAM_API_KEY is not configured' });
  }
  const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page || '1', 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(req.query.pageSize || '20', 10) || 20));
  const params = new URLSearchParams({
    lang: '2',
    page: String(page),
    pageSize: String(pageSize),
    marketIds: '1'
  });
  try {
    const response = await fetch(`${ARGAAM_BASE}/companies?${params.toString()}`, {
      headers: { apikey: ARGAAM_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.text();
    if (!response.ok) {
      return res.status(502).json({
        error: 'argaam_sandbox_unavailable',
        status: response.status,
        message: 'Argaam data is temporarily unavailable.'
      });
    }
    let data;
    try { data = JSON.parse(body); }
    catch { throw new Error('Argaam response was not valid JSON'); }
    res.json({ provider: 'ARGAAM_SANDBOX', retrievedAt: new Date().toISOString(), page, pageSize, data });
  } catch (error) {
    res.status(502).json({ error: 'argaam_request_failed', message: safeProviderMessage(error, 'Argaam') });
  }
});


function argaamParams(input, defaults = {}) {
  const params = new URLSearchParams({ ...defaults, ...input, marketId: '1' });
  return params;
}

async function argaamGet(path, params = {}) {
  if (!ARGAAM_API_KEY) {
    const error = new Error('ARGAAM_API_KEY is not configured');
    error.status = 503;
    throw error;
  }
  const query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params).toString();
  const response = await fetch(`${ARGAAM_BASE}${path}${query ? `?${query}` : ''}`, {
    headers: { apikey: ARGAAM_API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`Argaam returned HTTP ${response.status}`);
    error.status = response.status;
    error.requestId = response.headers.get('x-request-id') || null;
    throw error;
  }
  try { return JSON.parse(body); }
  catch { throw new Error('Argaam response was not valid JSON'); }
}

function validSymbol(req, res) {
  const symbol = String(req.params.symbol || '').trim();
  if (!/^\d{4,5}$/.test(symbol)) {
    res.status(400).json({ error: 'invalid_symbol', message: 'Use a 4- or 5-digit Tadawul symbol.' });
    return null;
  }
  return symbol;
}

function argaamError(res, error) {
  const status = error.status === 503 ? 503 : 502;
  res.status(status).json({
    error: error.status ? 'argaam_sandbox_unavailable' : 'argaam_request_failed',
    status: error.status || null,
    requestId: error.requestId || null,
    message: safeProviderMessage(error, 'Argaam')
  });
}

// Read-only Argaam Sandbox endpoints. marketId=1 is always explicit for Tadawul.
app.get('/api/argaam/quote/:symbol', async (req, res) => {
  const symbol = validSymbol(req, res);
  if (!symbol) return;
  try {
    const data = await argaamGet(`/companies/${encodeURIComponent(symbol)}/price`, argaamParams({}));
    res.json({ provider: 'ARGAAM_SANDBOX', symbol, marketId: 1, retrievedAt: new Date().toISOString(), data });
  } catch (error) { argaamError(res, error); }
});

app.get('/api/argaam/quote/:symbol/intraday', async (req, res) => {
  const symbol = validSymbol(req, res);
  if (!symbol) return;
  try {
    const data = await argaamGet(`/companies/${encodeURIComponent(symbol)}/price/intraday`, argaamParams({}));
    res.json({ provider: 'ARGAAM_SANDBOX', symbol, marketId: 1, retrievedAt: new Date().toISOString(), data });
  } catch (error) { argaamError(res, error); }
});

app.get('/api/argaam/quote/:symbol/history', async (req, res) => {
  const symbol = validSymbol(req, res);
  if (!symbol) return;
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return res.status(400).json({ error: 'invalid_date_range', message: 'Provide from and to as YYYY-MM-DD, with from <= to.' });
  }
  try {
    const params = argaamParams({ from, to });
    const data = await argaamGet(`/companies/${encodeURIComponent(symbol)}/price/history`, params);
    res.json({ provider: 'ARGAAM_SANDBOX', symbol, marketId: 1, from, to, retrievedAt: new Date().toISOString(), data });
  } catch (error) { argaamError(res, error); }
});

app.get('/api/argaam/market/summary', async (_req, res) => {
  try {
    const data = await argaamGet('/markets/1/data', new URLSearchParams());
    res.json({ provider: 'ARGAAM_SANDBOX', marketId: 1, retrievedAt: new Date().toISOString(), data });
  } catch (error) { argaamError(res, error); }
});


async function argaamFundamentalsGet(path, params = {}) {
  if (!ARGAAM_FUNDAMENTALS_API_KEY) {
    const error = new Error('ARGAAM_FUNDAMENTALS_API_KEY is not configured');
    error.status = 503;
    throw error;
  }
  const query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params).toString();
  let response;
  try {
    response = await fetch(`https://api-sandbox.argaam.com/api/v1.1${path}${query ? `?${query}` : ''}`, {
      headers: { apikey: ARGAAM_FUNDAMENTALS_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
  } catch (cause) {
    const error = new Error(cause?.name === 'TimeoutError'
      ? 'Argaam Fundamentals request timed out after 15 seconds.'
      : 'Could not connect to the Argaam Fundamentals Sandbox.');
    error.cause = cause;
    throw error;
  }
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`Argaam Fundamentals returned HTTP ${response.status}`);
    error.status = response.status;
    error.requestId = response.headers.get('x-request-id') || null;
    throw error;
  }
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; }
  catch { throw new Error('Argaam Fundamentals response was not valid JSON.'); }
  return parsed;
}

app.get('/api/argaam/fundamentals/:symbol', async (req, res) => {
  const symbol = validSymbol(req, res);
  if (!symbol) return;
  const period = String(req.query.period || 'quarterly').trim().toLowerCase();
  if (!['quarterly', 'annual', 'auto'].includes(period)) {
    return res.status(400).json({ error: 'invalid_period', message: 'period must be quarterly, annual, or auto.' });
  }
  try {
    const params = new URLSearchParams({ marketId: '1', period });
    const data = await argaamFundamentalsGet(
      `/companies/${encodeURIComponent(symbol)}/financials`,
      params
    );
    res.json({
      provider: 'ARGAAM_FUNDAMENTALS_SANDBOX',
      symbol,
      marketId: 1,
      period,
      retrievedAt: new Date().toISOString(),
      normalization: 'raw_provider_response_not_yet_mapped',
      data
    });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({
      error: error.status ? 'argaam_fundamentals_unavailable' : 'argaam_fundamentals_request_failed',
      status: error.status || null,
      requestId: error.requestId || null,
      message: safeProviderMessage(error, 'Argaam Fundamentals')
    });
  }
});

export { app };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  app.listen(PORT, () => console.log(`Saudi Trading Agent API listening on ${PORT}`));
}
