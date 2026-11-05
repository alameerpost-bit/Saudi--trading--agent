# Saudi Trading Agent v0.1

Arabic-first PWA frontend for the Saudi market, plus a Node.js/Express backend proxy for SAHMK market data.

## Current safety and data status

- The frontend is hosted separately on GitHub Pages.
- The backend reads the SAHMK API key only from the server environment variable `SAHMK_API_KEY`.
- The backend does not connect to a brokerage account and has no order-submission endpoint.
- Automatic trading is disabled. No buy/sell entry signal should be generated from missing, stale, or unverified data.
- The frontend reads TASI market summary and watchlist quotes from the Render backend through `/api/market/summary` and `/api/quote/{symbol}`.

## Deploy the backend on Render

The backend files (`server.js` and `package.json`) are in the repository root. Do not set a Root Directory such as `backend`.

1. Create a Render **Web Service** and connect `alameerpost-bit/Saudi--trading--agent`.
2. Runtime: **Node**.
3. Root Directory: leave blank (repository root).
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Add these environment variables in Render:
   - `SAHMK_API_KEY`: your private SAHMK API key.
   - `ALLOWED_ORIGIN`: `https://alameerpost-bit.github.io`.
   - Optional `SAHMK_BASE_URL`: defaults to `https://api.sahmk.sa/api/v1`.
7. Deploy and copy the public Render service URL.

## Backend endpoints

Replace `YOUR_RENDER_URL` with the deployed service URL:

- `YOUR_RENDER_URL/api/health` — backend status and whether the key is configured.
- `YOUR_RENDER_URL/api/health/provider` — performs a read-only authenticated SAHMK market-summary request and reports provider timestamp/delay status.
- `YOUR_RENDER_URL/api/market/summary` — market summary from SAHMK.
- `YOUR_RENDER_URL/api/quote/2222` — quote test for symbol 2222 (Saudi Aramco).

A successful health response does not prove market-data access. Test the summary and quote endpoints separately and verify each provider timestamp and delayed/realtime flag.

## Security

- Never commit `.env`, API keys, passwords, or OTPs.
- Keep the SAHMK key only in Render Environment Variables.
- Do not put the key in frontend JavaScript, GitHub Pages, screenshots, or chat messages.
- Confirm the provider's current endpoint, response schema, data delay, and display permissions before using data for decisions.
- Do not add brokerage credentials or order execution to this project without a separate, explicit security review and user approval.
