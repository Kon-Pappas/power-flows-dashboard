# Roadmap

Order of work for aligning this dashboard with the hub house style (live-greekpower, BigHydro) while keeping its own analyses. One batch at a time; each batch is recorded in `DECISIONS.md`.

## Phase 1: loading overlay and basics (batch 1, 19 Oct 2026) — done

- Loading overlay paced as in live-greekpower D47 (D03)
- Language remembered with `kp_lang` (D04)
- Update only through cron-job.org at 07:02; workflow `schedule:` removed; Actions updated (D05, D08)
- Real *Last / Next update* from `data/meta.json` (D06)
- Cyan accent defined in one place (D02); Tailwind pinned (D07)
- README and `docs/`

## Phase 2: house shell and accent

- ~~Cyan accent across the whole page; no colour per tab~~ — done in batch 3 (D14)
- ~~One picker box, dates in the visitor's language, completeness pill in the header; completeness computed in Python~~ — done in batch 3 (D13, D14)
- ~~New data colours for ISP, Turkey and the Italian price~~ — done in batch 2 (D12)
- ~~GR | EN switch as on the other pages~~ — done in batch 3 (D14)
- ~~Methodology modal as in live, footer rule, header labels~~ — done in batch 4 (D15)
- ~~Methodology links next to the transit toggle and the ⚠ notices~~ — done in batch 4 (D16)
- ~~Greek texts: country names, chart legends, methodology section titles~~ — done in batch 5 (D17)
- ~~Greek casing and Greek capitals~~ — done in batch 6 (D18, D19)

## Hub-wide (all repositories in one pass)

- H07 market vs SCADA clock (Flows done, D33); H06 mobile secondary box, which includes H01 (no divider) and H05 (pill in the box): Flows done (D29), BESS done, live-greekpower to do; H02 short header labels on mobile; conventions C01 (titles and casing) and C02 (no all-caps labels) (see `KNOWN_ISSUES.md`)

## Phase 3: charts — done in batch 7

- ~~Pin Chart.js; remove the unused datalabels plugin~~ (D20)
- ~~Hour labels `00–01` … `23–24`~~ (D21)
- ~~Own HTML tooltips with deviation, spreads and hourly cash~~ (D22)

## Mobile and readability — done in batch 8

- ~~Country cards on mobile, "–" for no volume~~ (D23)
- ~~No all-caps labels~~ (D24)

## Mobile header (H06) — done in batch 13

- ~~Secondary box, pill inside, tabs 2 + 2, no divider, up-arrow~~ (D29)
- ~~Methodology: Detailed opens at the tab's section; new title~~ (D30)

## Interconnection analysis (owner's decisions, 3 Nov 2026)

- ~~Batch 16 — data layer: hourly schedule per country (BG, IT), coupling per quarter-hour, `data/analysis.json` (cash per country, line status, saturation, ceilings, daily facts)~~ (D34). After the upload: fetch the history again, month by month (2026-06 … 2026-10) and once with start 2026-11-01, end empty
- ~~Review of the daily texts~~ (owner, 3 Nov 2026): 1 €/MWh rule, "observed limit", schedule and actual side by side, two sentences per decoupling — batch 17 (D35)
- ~~Batch 18 — tab "By country" and zero-flow notes by day / month / period~~ (D36)
- ~~Batch 19 — tab "Saturation"~~ (D37; mobile tabs 3 + 3): first the daily card "The day of the interconnections" (Today: final day-ahead prices only; Yesterday: windows, then schedule vs actual flow against the observed limit and congestion rent (estimate), unusual events; 3–5 sentences by score; any day from the picker), then the monthly saturation and the ceilings
- Later: real capacity from ENTSO-E (offered transfer capacity per border and hour) replacing the "usual limit"; an afternoon run (≈14:30) for "Tomorrow"; a "copy text" button

## Owner's review, 11 Nov 2026 (D38)

- ~~Batch 20 — zero notes on tabs 1–2; By country driven by the list (cumulative line, ceiling, saturation by month); tab 6 renamed "Interconnector day"~~
- ~~Batch 21 — observed limit per direction per day, probable capacity limitation for BG / IT (schedule plateau), two 24-hour charts~~ (D39)
- Batch 22 — schedule per border for AL / MK / TR (moved from batch 21, one history fetch) and NTC per border and hour from ENTSO-E (all five lines): exact limitation sentences ("GR→AL: NTC 100 MW 08–18 CET, usually 400") and "at 98 % of the available capacity"

## Data files — before February 2027 (plan for December 2026 – January 2027)

Measured by `scripts/data_size.py` (K03): after D34 (one day per line, new fields as lists) ≈163 KB gzip once the history is fetched again, growing ≈1.1 KB/day; the 250 KB limit about 83 days away (late January 2027):

- one file **per month** (`data/months/2026-10.json`) plus a `manifest.json` (list of days and their completeness, last / next update; replaces `meta.json`);
- the page downloads the manifest and only the months it shows (normally the current one, ≈20–30 KB); MTD needs a whole month anyway, so a monthly file fits it exactly;
- step 1 of the loading overlay then follows several real files.

Rejected for now: one file per day, as in live-greekpower — far more files and changes for data this light.

## Checks with a date

- ~~Verify the 25-hour day of 25 Oct (K07)~~: it was cut to 24 hours; fixed in batch 10 (D26). After the upload: fetch 25 Oct again (Actions → Run workflow, start and end 2026-10-25)
- After batch 12: fetch the whole history again so the hourly ISP of past days leaves out Crete (D27): Actions → Run workflow, start 2026-06-01, end empty (= today, D28); ≈15–40 s per day, roughly 1 hour. Not around 07:02, when the daily run starts
- ~~Clock alignment of SCADA and prices (K11)~~: measured and fixed in batch 15 (D33). After the upload: fetch the history again, month by month as on 3 Nov 2026 (2026-06-01 … 2026-10-31 in five runs; November follows with the daily runs)

## Later

- `ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODS.md` (the source text of the methodology modal)
