# Known issues

Open problems found in the review of 19 October 2026, when the alignment with the other hub dashboards began. Each item says what is wrong, why it matters and where it is planned (see `ROADMAP.md`). Resolved items are moved to `DECISIONS.md` (K02 → D12, D14; K06 → D15; K12 → D17; K01 → D20; K05 → D21; K04 → D22; K07 → D26; K11 → D33). Issues that concern **every hub page** are listed separately at the end, so they can be fixed in all repositories at once.

| # | Issue | Why it matters | Plan |
|---|---|---|---|
| K03 | All data live in one file, `historical_flows.json`, downloaded whole on every first visit (later visits get a 304, D32). Measured by `scripts/data_size.py` (workflow log). **3 Nov 2026:** 147.6 KB gzip with indentation; written one day per line (D34) ≈130 KB; with the D34 fields after the history is fetched again **≈163 KB, limit in ≈83 days (late January 2027)** | It becomes a problem in early 2027 | **Monthly files plus a manifest, planned for December 2026 – January 2027** (ROADMAP, "Data files") |
| K08 | Commit messages are generic and carry no Athens time | Harder to match a commit to a run (live-greekpower D08) | Low priority |
| K09 | Right after batch 1 is uploaded, `data/meta.json` does not exist until the first run, so the header shows "–" | Cosmetic, one day at most | Resolved by one manual run of the workflow |
| K10 | The page keeps the old completeness rule as a fallback for days without `Flags.complete` (D13) | Two definitions exist until every day has the flag; after the first run following batch 3 the fallback is never used | Remove with the data contract (Phase 4) |

## Hub-wide issues

Same structure in every hub page, so a fix here alone would make this page differ from the others. To be fixed in one pass across all repositories (the same IDs should be used in every repository's docs).

| # | Issue | Seen in | Proposal |
|---|---|---|---|
| H01 | Mobile: divider lines between the header and the tabs | live-greekpower; **Flows: none on mobile (D29, which supersedes D25)**; BESS done (its D71) | Covered by H06 |
| H02 | Header labels on mobile: Flows uses short labels ("Updated:" / "Next:", "Ενημέρωση:" / "Επόμενη:"); live-greekpower shortens only "Next" | Flows, live-greekpower | Use Flows' short labels everywhere || H05 | Mobile height: the status pill (complete data / live status) sits on its own line under Last / Next update; it could live inside the picker box, next to the date, saving one more line | Flows, live-greekpower (same header) | Owner's idea (20 Oct 2026), kept for the hub-wide pass because it changes the header of every page |
| H06 | **Mobile secondary box** (playbook): day / month with the completeness pill inside, Methodology + GR \| EN in one row, dark wells on a lighter panel, tabs as the main filled buttons (two-line labels), no divider, 12 px gaps, up-arrow button, Methodology opening at the tab's section. Includes H05 (pill inside the picker box) | **Flows ✓ (D29, D30)**; BESS ✓ (D71–D75); live-greekpower: to do | Same structure on every page |
| H07 | **Market clock vs SCADA clock**: prices and ISP are published per market day in CET, SCADA in Greek time (one hour ahead). Pairing them at the same array position shifts one by an hour | **Flows ✓ (D33: measured, everything in Greek time)**; BESS: offers a switch (its D10), to re-measure with the same test; live-greekpower: to check | Measure as Flows D33 (correlation of hour-to-hour changes at lags −2…+2); if the one-hour lag is as clear, store everything in Greek time |

## Hub conventions

Rules that every hub page should follow; checked in each repository during the hub-wide pass.

| # | Convention | Status |
|---|---|---|
| C01 | **Main title** is the dashboard's name: a capital on every word except articles and conjunctions ("Ανάλυση Ροών Ελληνικού Συστήματος", "Ελληνικά Υδροηλεκτρικά και Ταμιευτήρες", "Ανάλυση Ελληνικής Αγοράς Φυσικού Αερίου"); an English brand name may stay untranslated ("Greek Power Live"). **Everything else** in Greek has a capital on the first word only | Flows, Gas-Power, BigHydro titles follow it; live-greekpower uses a brand name; in BESS only the English title was found in the code — to check in its own thread. Labels beyond the title: to check in Gas-Power, BigHydro, BESS |
| C02 | **No all-caps labels.** Captions are written normally, small and grey; numbers carry the colour and weight. If capitals are ever kept somewhere, Greek capitals must lose their accents in every browser (Flows batch 6, D19, had a helper for this) and units must not be uppercased (`MWh`, not `MWH`). Replaces H03 / H04 | Flows done (D24); live-greekpower: one small caption; BigHydro: 2 uses; BESS ≈40 and Gas-Power ≈42 uses to convert |

