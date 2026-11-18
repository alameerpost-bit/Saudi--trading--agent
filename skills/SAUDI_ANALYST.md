# Saudi quarterly financial analyst

This is a deterministic, read-only analyst for caller-supplied Saudi quarterly financial statements. It replaces the upstream analyst's SEC-specific data assumptions with a neutral input contract suitable for Tadawul disclosures.

Required company metadata: a 4–5 digit Tadawul symbol, `market: "Tadawul"`, `currency: "SAR"`, and a non-empty source label.

Both statements must include period end, publication timestamp, revenue, gross profit, operating income, net income and diluted EPS. The comparison is restricted to the same fiscal quarter in consecutive years. The current statement publication must not be in the future or older than 240 days by default (configurable).

The result calculates year-over-year changes, gross/operating/net margins and margin changes in percentage points. A growth percentage is reported only when the prior-year value is positive; otherwise it is `null` and explicitly listed as unavailable. This avoids misleading percentage calculations across zero or negative prior values.

The function does not retrieve or authenticate Tadawul disclosures, normalize accounting standards, adjust for restatements, or create recommendations. The caller remains responsible for providing accurate, comparable, source-licensed statements. It is not connected to a live Saudi fundamentals provider.

Run `npm test` for validation. No broker, order, or automatic-execution functionality is added.
