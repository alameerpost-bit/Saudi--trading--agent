import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SAHMK_API_KEY;
const ARGAAM_API_KEY = process.env.ARGAAM_API_KEY;
const ARGAAM_BASE = 'https://api-sandbox.argaam.com/api/v1.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const BASE = 'https://api.sahmk.sa/api/v1';

const allowedOrigins = new Set([
  'https://alameerpost-bit.github.io',
  ...(ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
]);
app.use(cors({ origin(origin, callback) {
  // Public, read-only market endpoints: allow the published app and configured origins.
  if (!origin || allowedOrigins.has(origin)) return callback(null, true);
  return callback(null, false);
} }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  provider: 'SAHMK',
  apiKeyConfigured: Boolean(API_KEY),
  argaamSandboxConfigured: Boolean(ARGAAM_API_KEY),
  tradingEnabled: false,
  serverTime: new Date().toISOString()
}));

async function providerGet(path) {
  if (!API_KEY) throw new Error('SAHMK_API_KEY is not configured');
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`SAHMK returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  try { return JSON.parse(body); } catch { throw new Error('SAHMK response was not valid JSON'); }
}

app.get('/api/market/summary', async (_req, res) => {
  try {
    const data = await providerGet('/market/summary/');
    res.json({ provider: 'SAHMK', retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    res.status(502).json({ error: 'market_data_unavailable', message: error.message });
  }
});

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim();
  if (!/^\d{4,5}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  try {
    const data = await providerGet(`/quote/${encodeURIComponent(symbol)}/`);
    res.json({ provider: 'SAHMK', symbol, retrievedAt: new Date().toISOString(), data });
  } catch (error) {
    res.status(502).json({ error: 'quote_unavailable', message: error.message });
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

app.listen(PORT, () => console.log(`Saudi Trading Agent API listening on ${PORT}`));
