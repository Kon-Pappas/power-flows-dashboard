# Known issues

Open problems found in the review of 19 October 2026, when the alignment with the other hub dashboards began. Each item says what is wrong, why it matters and where it is planned (see `ROADMAP.md`). Resolved items are moved to `DECISIONS.md` (K02 → D12, D14).

| # | Issue | Why it matters | Plan |
|---|---|---|---|
| K01 | Chart.js is loaded without a version (`cdn.jsdelivr.net/npm/chart.js`, i.e. the latest release); the datalabels plugin is pinned to 2.0.0 | A new Chart.js release can change or break the charts overnight. live-greekpower pins 4.5.1 | Phase 3 |
| K03 | All data live in one file, `historical_flows.json` (1.1 MB for 141 days since 1 Jun 2026, ≈8 KB more every day), downloaded whole on every visit | Download time grows every day; large git diffs | Phase 4: one file per day plus `manifest.json` (live-greekpower D15) |
| K04 | Charts use Chart.js' default tooltips | live-greekpower D27: own HTML tooltips, header with hour and price, zero rows hidden | Phase 3 |
| K05 | Hours are labelled `H01` … `H24` | live-greekpower D23 labels hours by their start (`00–01` … `23–24`) | Phase 3 |
| K06 | Methodology modal: the close X is not boxed (house style: fixed header with title and boxed X, fixed footer with boxed Close) | Same modal on every hub page | Phase 2 |
| K07 | Daylight-saving days (25 Oct 2026: 25 hours; 28 Mar 2027: 23 hours): how SCADA, ISP and ENTSO-E prices are read on those days has not been checked; the data format assumes 24 hours | A 25th hour could be dropped or shifted, and the completeness rule (24 prices) could mark the day incomplete | Check the 25 Oct 2026 data on 26–27 Oct |
| K08 | Commit messages are generic and carry no Athens time | Harder to match a commit to a run (live-greekpower D08) | Low priority |
| K09 | Right after batch 1 is uploaded, `data/meta.json` does not exist until the first run, so the header shows "–" | Cosmetic, one day at most | Resolved by one manual run of the workflow |
| K10 | The page keeps the old completeness rule as a fallback for days without `Flags.complete` (D13) | Two definitions exist until every day has the flag; after the first run following batch 3 the fallback is never used | Remove with the data contract (Phase 4) |
| K11 | Mobile: two divider lines between the header and the tabs (header bottom border + tabs top border); existed before batch 3 | Cosmetic | Phase 2 (shell) |
