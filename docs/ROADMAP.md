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

- H01 one divider on mobile (Flows done as pilot, D25); H05 status pill inside the picker box; H02 short header labels on mobile; conventions C01 (titles and casing) and C02 (no all-caps labels) (see `KNOWN_ISSUES.md`)

## Phase 3: charts — done in batch 7

- ~~Pin Chart.js; remove the unused datalabels plugin~~ (D20)
- ~~Hour labels `00–01` … `23–24`~~ (D21)
- ~~Own HTML tooltips with deviation, spreads and hourly cash~~ (D22)

## Mobile and readability — done in batch 8

- ~~Country cards on mobile, "–" for no volume~~ (D23)
- ~~No all-caps labels~~ (D24)

## Data files — later, not urgent

Measured on 20 Oct 2026 (K03): the single data file transfers as 120 KB today and ≈310 KB after a year. When the history reaches about a year, or loading becomes noticeably slow:

- one file **per month** (`data/months/2026-10.json`) plus a `manifest.json` (list of days and their completeness, last / next update; replaces `meta.json`);
- the page downloads the manifest and only the months it shows (normally the current one, ≈20–30 KB); MTD needs a whole month anyway, so a monthly file fits it exactly;
- step 1 of the loading overlay then follows several real files.

Rejected for now: one file per day, as in live-greekpower — far more files and changes for data this light.

## Checks with a date

- 26–27 Oct 2026: verify the 25-hour day of 25 Oct (K07)

## Later

- `ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODS.md` (the source text of the methodology modal)
