import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SAHMK_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const BASE = 'https://www.sahmk.sa/api/v1';

app.use(cors({ origin: ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(',').map(s => s.trim()) : false }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  provider: 'SAHMK',
  apiKeyConfigured: Boolean(API_KEY),
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

app.listen(PORT, () => console.log(`Saudi Trading Agent API listening on ${PORT}`));
