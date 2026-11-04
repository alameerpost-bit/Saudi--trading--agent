# Saudi Trading Agent Backend v0.1

Backend proxy for testing SAHMK market-data access. It does not connect to a brokerage account and cannot submit orders.

## Deploy on Render
1. Create a new **Web Service** and connect the GitHub repository containing this folder, or deploy the backend source as a separate repository.
2. Set the Root Directory to `backend` if deploying from the existing project repository.
3. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
4. Add Environment Variables in Render:
   - `SAHMK_API_KEY`: your private SAHMK key
   - `ALLOWED_ORIGIN`: `https://alameerpost-bit.github.io`
5. Deploy, then test `/api/health`, `/api/market/summary`, and `/api/quote/2222` on the service URL.

Never commit `.env`, API keys, passwords, or OTPs. Keep the key only in Render Environment Variables. Confirm the provider's current endpoint, response schema, data delay, and display permissions before using the data for decisions.
