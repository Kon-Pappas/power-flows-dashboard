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

- Cyan accent across the whole page; no colour per tab (K02)
- ~~New data colours for ISP, Turkey and the Italian price~~ — done in batch 2 (D12)
- GR | EN segmented switch as on the other pages
- Methodology modal with boxed X and fixed header / footer (K06)

## Phase 3: charts

- Pin Chart.js (K01)
- Own HTML tooltips (K04)
- Hour labels `00–01` … `23–24` (K05)

## Phase 4: data contract

- One file per day plus `manifest.json`; the page downloads only what it shows (K03)
- Step 1 of the loading overlay then follows several real files

## Checks with a date

- 26–27 Oct 2026: verify the 25-hour day of 25 Oct (K07)

## Later

- `ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `METHODS.md` (the source text of the methodology modal)
