# Repeated supported-size benchmarks

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

Environment: Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz; v22.22.0; Windows; measurements ran alongside other verification activity and are not isolated production performance claims. Deterministic synthetic NDJSON rows use unique string IDs and amount=0.10. Each size has three fresh-workspace repetitions, then verified read/warm read, a one-row changed keyed comparison and exact aggregate replay with independent expected total rows/10.

Cells below are **median / nearest-rank sample p95 in milliseconds**. With only three samples, p95 is the maximum sample, not an estimate of production tail latency.

| Rows   | Capture         | First read    | Warm read     | Changed diff    | Replay          | Store bytes |
| ------ | --------------- | ------------- | ------------- | --------------- | --------------- | ----------- |
| 100    | 56.7 / 60.6     | 26.1 / 28.9   | 20.2 / 20.7   | 2.9 / 4.1       | 4.9 / 15.6      | 6396        |
| 1000   | 92.0 / 103.1    | 34.0 / 36.1   | 28.9 / 36.9   | 30.3 / 51.8     | 27.8 / 32.1     | 58597       |
| 10000  | 208.4 / 250.6   | 108.7 / 142.8 | 101.4 / 120.1 | 236.4 / 276.0   | 177.0 / 188.6   | 598598      |
| 100000 | 1157.8 / 1520.7 | 823.4 / 853.8 | 814.5 / 815.4 | 2128.0 / 2140.0 | 1432.7 / 1522.3 | 6178599     |

Per-sample CPU user/system microseconds, end RSS/heap/external memory, process lifetime maxRSS, source bytes and total logical store bytes are retained in [audit benchmarks](evidence/audit-v22.22.0.json). End memory is not per-operation peak memory; lifetime maxRSS cannot be attributed to one sample. File sizes are logical sizes, not actual NTFS allocation. Reads immediately follow capture, so the first read is not an OS cold-cache measurement. Import retains bounded normalized rows in memory; this is not a constant-memory engine.

Three fresh captures per size, five-version history and four-process concurrency provide bounded growth/repetition evidence. No sustained soak, tens-of-thousands snapshot index, measured parallel throughput or cold-start distribution was performed. One million rows are unsupported and skipped; 100,000 rows is the explicit maximum. No arbitrary performance SLA was invented. CI smoke gates verify correctness; benchmark numbers alone are not a release gate.
