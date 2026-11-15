# Greek Power Flows Analytics

Public dashboard of Greece's cross-border electricity flows: scheduled (ISP) versus actual (SCADA) flows per interconnection, hourly profiles with day-ahead prices, the daily cash position of imports and exports, the month-to-date position, the whole-period position per country and a daily review of each interconnector (coupling, congestion, transfer capacity).

**Live page:** https://kon-pappas.github.io/power-flows-dashboard/
**Part of:** [Greek Energy Hub](https://kon-pappas.github.io/), with BESS, Gas-Power, BigHydro and Live Greek Power.

## What the page shows

| Tab (EN / GR) | Content |
|---|---|
| Daily ISP vs SCADA / Ημερήσια ροή | Net flow per neighbour (Albania, Bulgaria, Italy, North Macedonia, Turkey) for the selected day, scheduled vs actual, with notes on zero-flow days. Negative = exports, positive = imports. |
| Hourly Profiles / Ωριαία προφίλ | Hourly net flow (ISP vs SCADA) and the day-ahead prices of Greece, Bulgaria and Italy. |
| Daily Arbitrage / Ημερήσιο Arbitrage | Cash flow of the day's physical flows per country, valued at the **Greek** day-ahead price (D44), with an optional removal of BG↔IT transit through Greece. |
| MTD Position / Μηνιαία θέση | Cumulative cash and volume for the selected month; days with incomplete data are excluded and listed. |
| By country / Ανά χώρα | Whole-period cash per country, chosen from the list: cumulative line, congestion rent (estimate), line ceiling, saturation by month. |
| Interconnector day / Ημέρα διασυνδέσεων | The day of the interconnections in a few sentences (coupling with Bulgaria and Italy, congestion, reduced or zero capacity), and 24-hour charts: measured flow (bars), schedule (line) and transfer capacity, NTC (dashed). |

Days with missing SCADA data or prices are marked ⚠ in the date picker and with an *Incomplete data* badge; their cash flow is not shown.

All hourly figures are in **Greek time**: prices and the ISP schedule, published by the market in Central European Time, are shifted by one hour to match the SCADA measurements.

The **transfer capacity (NTC)** of every border comes from the ENTSO-E Transparency Platform (day-ahead forecasted transfer capacities); the manual workflow *Probe ENTSO-E capacity* lists what ENTSO-E publishes for the Greek borders without changing any data.

## Data sources

- **IPTO / ADMIE**: SCADA (actual flows) and ISP (scheduled flows), daily files.
- **ENTSO-E Transparency Platform**: day-ahead prices for Greece, Bulgaria and Italy; transfer capacity (NTC) of all five borders.

## How it updates

`scripts/update_flows.py` runs once a day at **07:02 Athens time**, started by an external cron-job.org call to the GitHub Actions workflow `Daily Power Flows Fetcher` (the workflow has no schedule of its own). Each run re-fetches the last five days and writes the data **by month** (D46, D48):

- `data/manifest.json`: every day and whether its data are complete, the list of months, time of the run and of the next scheduled run (shown in the page header);
- `data/months/YYYY-MM.json`: the days of each month, newest first;
- `data/facts/YYYY-MM.json`: the facts of each day of the month (the sentences of *Interconnector day*) and the observed limits;
- `data/analysis_core.json`: the interconnection analysis of the whole history without the daily facts (cash per country, line status, saturation, line ceilings), which feeds *By country*; see `docs/DECISIONS.md`, D34;
- `data/meta.json`: time of the run and of the next one, read by the hub page.

The page downloads the manifest, the core and only the month it shows (≈41 KB gzip on a first visit, at most ≈65 KB); another month is downloaded when the visitor picks a day or a month in it.

After every fetch the workflow prints the size of the data files (`scripts/data_size.py`; you can also run it yourself: `python3 scripts/data_size.py`).

Before every fetch the workflow runs three offline checks, `scripts/test_dst_days.py` (days of 23, 24 and 25 hours, Greek time, Crete), `scripts/test_analysis.py` (the interconnection analysis) and `scripts/test_split.py` (the monthly files: reading and writing them back gives the same files); if it fails, nothing is fetched or written.

A run for a date range can be started by hand: *Actions → Daily Power Flows Fetcher → Run workflow*, with a start date and, optionally, an end date (empty = up to today). The workflow needs the repository secret `ENTSOE_TOKEN`.

## Visit counting

The page counts visits with **GoatCounter** (`konpappas.goatcounter.com`): one script line just before `</body>` in `index.html`. No cookies are set and no consent banner is needed. The owner's own visits are excluded through the hub (`#toggle-goatcounter`). See `docs/DECISIONS.md`, D45.

## Repository layout

```
index.html                 page (Tailwind + Chart.js)
dashboard.js               page logic, texts in English and Greek, methodology
scripts/update_flows.py    data pipeline (Python)
scripts/analysis.py        interconnection analysis
scripts/split_data.py      monthly data files: reads and writes them (D46, D48)
scripts/data_size.py       size of what a visitor downloads
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
