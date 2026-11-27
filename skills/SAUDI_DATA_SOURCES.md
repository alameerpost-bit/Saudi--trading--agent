# Saudi market data source assessment

Last reviewed: 2026-11-18

This document records documented source capabilities. Documentation is not proof that this project's account is entitled to an endpoint or that a request succeeds.

## SAHMK

Official API base: `https://api.sahmk.sa/api/v1`

Authentication uses the server-side `X-API-Key` header.

Documented capabilities:
- Single-stock quotes: `GET /quote/{symbol}/`. The Free and Starter plans return delayed prices (about 15 minutes); Pro+ is documented for real-time prices.
- Financial statements: `GET /financials/{symbol}/`, documented as Starter+.
- The financials API supports `type=income|balance|cashflow|all`, `period=annual|quarterly|auto`, and historical windows. The documentation notes that Starter should explicitly request annual data; quarterly data may return `403 PLAN_LIMIT` when not entitled.
- Real-time stock WebSocket is documented as Pro+.

References:
- https://www.sahmk.sa/en/developers/docs/getting-started
- https://www.sahmk.sa/en/developers
- https://www.sahmk.sa/en/developers/pricing

Project implication: the existing Free/Starter delayed quote access is not a real-time source. Do not mark data as real-time based on retrieval time. Do not request quarterly financials unless the account entitlement is confirmed. No WebSocket or financial-statement integration is enabled by this change.

## Argaam Fundamentals Layer

Official Sandbox base: `https://api-sandbox.argaam.com`

Official Production base: `https://api.argaam.com`

Authentication is documented through an `apikey` request header (or query parameter; the header is preferred). The financial endpoints include:
- `GET /api/v1.1/companies/{stockSymbol}/financials`
- `GET /api/v1.1/companies/{stockSymbol}/financials/history`

The documented `marketId` for Tadawul main market is `1`; the default `3` is not safe to assume for this project. The standard response envelope includes `success`, `apiVersion`, `timestamp`, `requestId`, `data`, `meta` and `rateLimit`.

References:
- https://developer.argaam.com/fundamentals-overview
- https://developer.argaam.com/apis/fundamentals-layer-api-sandbox-v1/versions/6df307f2-7eaf-4885-847f-c59d9ce4f0bb
- https://developer.argaam.com/getting-started

Important access distinction: Argaam exposes separate Sandbox products for Market Data and Fundamentals. Approval or credentials for Market Data Sandbox do not establish access to Fundamentals Sandbox. Sandbox and Production credentials are distinct. The earlier Market Data Sandbox `401 Unauthorized` remains unresolved and is not evidence that Fundamentals access works or fails.

## Integration gate

Before writing a live adapter:
1. Activate the Fundamentals Layer API Sandbox product in the Argaam developer portal and create/use its application credential.
2. Confirm the exact product-specific key and endpoint with a harmless read-only request for symbol `2222`, explicitly passing `marketId=1`.
3. Capture a redacted response sample (remove keys and personal data) to establish actual financial field names, units, fiscal-period labels, publication timestamps and restatement behavior.
4. Map only fields confirmed in that response into `analyzeSaudiQuarterlyResults`; reject unknown or incomplete mappings.
5. Keep the provider behind a server-side environment variable and add mocked tests before any live request is enabled.

No credentials are stored in the repository. No provider request, order, or production deployment is added by this assessment.
