# Warning benchmark

Run: 2026-11-10T06-11-04-523Z-live; split: dev; cases: 24/24.
**Synthetic development data; draft labels. Not a release approval.**

| Metric | Result |
| --- | --- |
| Completed / failed | 24 / 0 |
| TP / FP / FN | 14 / 107 / 6 |
| Precision / recall / F1 | 11.6% / 70.0% / 19.9% |
| High-severity recall | 13/18 (72.2%) |
| Supported precision | 11.6% |
| Grounded citations | 99/108 |
| Clean cases with false alarms | 7/11 |
| Exact cases | 5/24 |
| Input / output tokens (completed cases only) | 138958 / 38532 |

| Case | Status | TP | FP | FN |
| --- | --- | ---: | ---: | ---: |
| dep-01-positive | completed | 0 | 1 | 1 |
| dep-01-negative | completed | 0 | 8 | 0 |
| dep-02-positive | completed | 1 | 6 | 0 |
| dep-02-negative | completed | 0 | 8 | 0 |
| dep-03-positive | completed | 1 | 0 | 0 |
| dep-03-negative | completed | 0 | 7 | 0 |
| utl-01-positive | completed | 1 | 7 | 0 |
| utl-01-negative | completed | 0 | 8 | 0 |
| rnt-01-positive | completed | 1 | 7 | 0 |
| rnt-01-negative | completed | 0 | 8 | 0 |
| rep-01-positive | completed | 1 | 7 | 0 |
| rep-01-negative | completed | 0 | 0 | 0 |
| trm-01-positive | completed | 1 | 6 | 0 |
| trm-01-negative | completed | 0 | 0 | 0 |
| trm-02-positive | completed | 0 | 0 | 1 |
| trm-02-negative | completed | 0 | 0 | 0 |
| incomplete-no-missing | completed | 0 | 8 | 0 |
| incomplete-known-risk | completed | 1 | 4 | 0 |
| unreadable-return | completed | 0 | 6 | 1 |
| appendix-resolves | completed | 0 | 0 | 0 |
| conflicting-rent | completed | 0 | 1 | 1 |
| embedded-instruction | completed | 1 | 6 | 0 |
| explicit-price-no-threshold | completed | 0 | 7 | 0 |
| eight-risks | completed | 6 | 2 | 2 |

See report.json for gates, per-rule/per-tag scores and missed/extra flags. See human-review.json and HUMAN_REVIEW.md for manual scoring.
Failed cases remain in recall/exact-case denominators. Failed-call tokens may be unreported by the pipeline.
