# Saudi safety primitives

The first executable Saudi adaptation is deliberately limited to two pure, read-only calculations:

- **Market-data quality gate**: requires provider, valid 4–5 digit Tadawul symbol, explicit delay status, source timestamp and retrieval timestamp. Delayed, stale, future-dated, or incomplete data fails closed.
- **SAR position sizing**: calculates a long-position share quantity from a SAR risk budget, stop distance, maximum concentration, available cash and a cash reserve. It returns an estimate only; it does not generate or submit an order.

Default intraday freshness threshold is 60 seconds and can be overridden by the caller. A caller must choose a threshold appropriate to its strategy and market session. Passing this gate is not a buy signal and does not prove the provider's data is accurate.

Run `npm test` to execute the safety tests. All broker and automatic-execution capabilities remain disabled.
