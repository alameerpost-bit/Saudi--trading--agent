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

## API

The Express backend exposes this calculation through `POST /api/skills/screen`. Send JSON with `companies`, `rules`, and optional `rank`, `missing`, and `maxAgeDays`. The endpoint accepts at most 500 company records, 30 rules, and 10 ranking metrics; the JSON body limit is 256 KB. It performs no provider request and stores no submitted data. The caller remains responsible for supplying authentic source-labelled fundamentals; the endpoint's presence does not verify a source or grant a market-data license.
