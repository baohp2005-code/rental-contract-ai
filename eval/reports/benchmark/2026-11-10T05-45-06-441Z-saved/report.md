# Warning benchmark

Run: 2026-11-10T05-45-06-441Z-saved; split: dev; cases: 24/24.
**Synthetic development data; draft labels. Not a release approval.**

| Metric | Result |
| --- | --- |
| Completed / failed | 24 / 0 |
| TP / FP / FN | 12 / 137 / 8 |
| Precision / recall / F1 | 8.1% / 60.0% / 14.2% |
| High-severity recall | 11/18 (61.1%) |
| Supported precision | 8.1% |
| Grounded citations | 115/134 |
| Clean cases with false alarms | 9/11 |
| Exact cases | 2/24 |
| Input / output tokens (completed cases only) | 127079 / 42585 |

| Case | Status | TP | FP | FN |
| --- | --- | ---: | ---: | ---: |
| dep-01-positive | completed | 0 | 0 | 1 |
| dep-01-negative | completed | 0 | 8 | 0 |
| dep-02-positive | completed | 1 | 7 | 0 |
| dep-02-negative | completed | 0 | 8 | 0 |
| dep-03-positive | completed | 1 | 7 | 0 |
| dep-03-negative | completed | 0 | 8 | 0 |
| utl-01-positive | completed | 0 | 8 | 1 |
| utl-01-negative | completed | 0 | 8 | 0 |
| rnt-01-positive | completed | 1 | 7 | 0 |
| rnt-01-negative | completed | 0 | 0 | 0 |
| rep-01-positive | completed | 1 | 7 | 0 |
| rep-01-negative | completed | 0 | 8 | 0 |
| trm-01-positive | completed | 1 | 7 | 0 |
| trm-01-negative | completed | 0 | 8 | 0 |
| trm-02-positive | completed | 1 | 7 | 0 |
| trm-02-negative | completed | 0 | 8 | 0 |
| incomplete-no-missing | completed | 0 | 8 | 0 |
| incomplete-known-risk | completed | 1 | 4 | 0 |
| unreadable-return | completed | 0 | 1 | 1 |
| appendix-resolves | completed | 0 | 8 | 0 |
| conflicting-rent | completed | 0 | 8 | 1 |
| embedded-instruction | completed | 0 | 0 | 1 |
| explicit-price-no-threshold | completed | 0 | 0 | 0 |
| eight-risks | completed | 5 | 2 | 3 |

See report.json for gates, per-rule/per-tag scores and missed/extra flags. See human-review.json and HUMAN_REVIEW.md for manual scoring.
Failed cases remain in recall/exact-case denominators. Failed-call tokens may be unreported by the pipeline.
