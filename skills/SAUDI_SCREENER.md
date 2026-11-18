# Tadawul Screener (first functional adapter)

The pure JavaScript screener accepts a caller-supplied array of company fundamentals. It does not scrape websites or call an external provider.

Required company metadata:
- `symbol`: 4–5 digit Tadawul symbol.
- `market`: exactly `Tadawul`.
- `currency`: exactly `SAR`.
- `source`: non-empty provider/source label.
- `asOf`: date of the fundamental data.
- `metrics`: object of finite numeric metrics.

Rules support `>`, `>=`, `<`, `<=`, `==`, `!=`, `between`, `in`, and `not in`. Missing metrics fail by default; `missing: "skip"` must be explicitly requested and skipped metrics remain visible in the result. Fundamentals older than 180 days fail by default (configurable).

The output is explicitly `screening_only_not_a_recommendation`. A passing result is not a buy signal. This module is not connected to the quote API or a broker and must not be used as a substitute for verified, current market prices.
