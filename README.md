# Greek Power Flows Analytics

Public dashboard of Greece's cross-border electricity flows: scheduled (ISP) versus actual (SCADA) flows per interconnection, hourly profiles with day-ahead prices, the daily cash position of imports and exports, and the month-to-date position.

**Live page:** https://kon-pappas.github.io/power-flows-dashboard/
**Part of:** [Konstantinos Pappas Hub](https://kon-pappas.github.io/), with BESS, Gas-Power, BigHydro and Live Greek Power.

## What the page shows

| Tab | Content |
|---|---|
| Daily ISP vs SCADA | Net flow per neighbour (Albania, Bulgaria, Italy, North Macedonia, Turkey) for the selected day, scheduled vs actual. Negative = exports, positive = imports. |
| Hourly Profiles | Hourly net flow (ISP vs SCADA) and the day-ahead prices of Greece, Bulgaria and Italy. |
| Daily Arbitrage | Cash flow of the day's physical flows per country, with an optional removal of BG↔IT transit through Greece. |
| MTD Position | Cumulative cash and volume for the selected month; days with incomplete data are excluded and listed. |

Days with missing SCADA data or prices are marked ⚠ in the date picker and with an *Incomplete data* badge; their cash flow is not shown.

## Data sources

- **IPTO / ADMIE**: SCADA (actual flows) and ISP (scheduled flows), daily files.
- **ENTSO-E Transparency Platform**: day-ahead prices for Greece, Bulgaria and Italy.

## How it updates

`scripts/update_flows.py` runs once a day at **07:02 Athens time**, started by an external cron-job.org call to the GitHub Actions workflow `Daily Power Flows Fetcher` (the workflow has no schedule of its own). Each run re-fetches the last five days and writes:

- `data/historical_flows.json`: all days, newest first;
- `data/meta.json`: time of the run and of the next scheduled run, shown in the page header.

A run for a date range can be started by hand: *Actions → Daily Power Flows Fetcher → Run workflow*, with a start and end date. The workflow needs the repository secret `ENTSOE_TOKEN`.

## Repository layout

```
index.html                 page (Tailwind + Chart.js)
dashboard.js               page logic, texts in English and Greek, methodology
scripts/update_flows.py    data pipeline (Python)
data/                      data files written by the pipeline
docs/                      decisions, known issues, roadmap
.github/workflows/         the update workflow
```

## Documentation

- [docs/DECISIONS.md](docs/DECISIONS.md): what was decided and why
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md): open problems
- [docs/ROADMAP.md](docs/ROADMAP.md): next steps

---
Konstantinos Pappas · Energy Market Analyst
