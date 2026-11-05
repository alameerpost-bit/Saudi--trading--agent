import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SAHMK_API_KEY;
const ARGAAM_API_KEY = process.env.ARGAAM_API_KEY;
const ARGAAM_BASE = 'https://api-sandbox.argaam.com/api/v1.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const BASE = (process.env.SAHMK_BASE_URL || 'https://api.sahmk.sa/api/v1').replace(/\\/+$/, '');

const allowedOrigins = new Set([
  'https://alameerpost-bit.github.io',
  ...(ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
]);
app.use(cors({ origin(origin, callback) {
  // Public, read-only market endpoints: allow the published app and configured origins.
  if (!origin || allowedOrigins.has(origin)) return callback(null, true);
  return callback(null, false);
} }));
app.use(express.json());\napp.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  provider: 'SAHMK',
  apiKeyConfigured: Boolean(API_KEY),
  argaamSandboxConfigured: Boolean(ARGAAM_API_KEY),
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
      message: error.message,
      tradingEnabled: false
    });
  }
});

app.get('/api/market/summary', async (_req, res) => {
  try {
    const data = await providerGet('/market/summary/?index=TASI');
    res.json({ provider: 'SAHMK', retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({ error: 'market_data_unavailable', providerStatus: error.status || null, message: error.message });
  }
});

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim();
  if (!/^\d{4,5}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  try {
    const data = await providerGet(`/quote/${encodeURIComponent(symbol)}/`);
    res.json({ provider: 'SAHMK', symbol, retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({ error: 'quote_unavailable', providerStatus: error.status || null, message: error.message });
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
      headers: { apikey: ARGAAM_API_KEY, Accept: 'application/json' }
    });
    const body = await response.text();
    if (!response.ok) {
      return res.status(502).json({
        error: 'argaam_sandbox_unavailable',
        status: response.status,
        message: body.slice(0, 300)
      });
    }
    let data;
    try { data = JSON.parse(body); }
    catch { throw new Error('Argaam response was not valid JSON'); }
    res.json({ provider: 'ARGAAM_SANDBOX', retrievedAt: new Date().toISOString(), page, pageSize, data });
  } catch (error) {
    res.status(502).json({ error: 'argaam_request_failed', message: error.message });
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
    headers: { apikey: ARGAAM_API_KEY, Accept: 'application/json' }
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(body.slice(0, 300) || `Argaam returned HTTP ${response.status}`);
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
    message: error.message
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

app.listen(PORT, () => console.log(`Saudi Trading Agent API listening on ${PORT}`));
