# Known issues

Open problems found in the review of 19 October 2026, when the alignment with the other hub dashboards began. Each item says what is wrong, why it matters and where it is planned (see `ROADMAP.md`). Resolved items are moved to `DECISIONS.md` (K02 → D12, D14; K06 → D15; K12 → D17; K01 → D20; K05 → D21; K04 → D22). Issues that concern **every hub page** are listed separately at the end, so they can be fixed in all repositories at once.

| # | Issue | Why it matters | Plan |
|---|---|---|---|
| K03 | All data live in one file, `historical_flows.json` (1.1 MB for 141 days since 1 Jun 2026, ≈8 KB more every day), downloaded whole on every visit | Download time grows every day; large git diffs | Phase 4: one file per day plus `manifest.json` (live-greekpower D15) |
| K07 | Daylight-saving days (25 Oct 2026: 25 hours; 28 Mar 2027: 23 hours): how SCADA, ISP and ENTSO-E prices are read on those days has not been checked; the data format assumes 24 hours | A 25th hour could be dropped or shifted, and the completeness rule (24 prices) could mark the day incomplete | Check the 25 Oct 2026 data on 26–27 Oct |
| K08 | Commit messages are generic and carry no Athens time | Harder to match a commit to a run (live-greekpower D08) | Low priority |
| K09 | Right after batch 1 is uploaded, `data/meta.json` does not exist until the first run, so the header shows "–" | Cosmetic, one day at most | Resolved by one manual run of the workflow |
| K10 | The page keeps the old completeness rule as a fallback for days without `Flags.complete` (D13) | Two definitions exist until every day has the flag; after the first run following batch 3 the fallback is never used | Remove with the data contract (Phase 4) |

## Hub-wide issues

Same structure in every hub page, so a fix here alone would make this page differ from the others. To be fixed in one pass across all repositories (the same IDs should be used in every repository's docs).

| # | Issue | Seen in | Proposal |
|---|---|---|---|
| H01 | Mobile: two divider lines between the header and the tabs (`header` bottom border + tabs top border `pt-5 mt-2 border-t … md:border-none`). Was K11 here | Flows, live-greekpower (same classes); to check in BESS, Gas-Power, BigHydro | Keep one: drop the tabs' top border on mobile |
| H02 | Header labels on mobile: Flows uses short labels ("Updated:" / "Next:", "Ενημέρωση:" / "Επόμενη:"); live-greekpower shortens only "Next" | Flows, live-greekpower | Use Flows' short labels everywhere |
## Hub conventions

Rules that every hub page should follow; checked in each repository during the hub-wide pass.

| # | Convention | Status |
|---|---|---|
| C01 | **Main title** is the dashboard's name: a capital on every word except articles and conjunctions ("Ανάλυση Ροών Ελληνικού Συστήματος", "Ελληνικά Υδροηλεκτρικά και Ταμιευτήρες", "Ανάλυση Ελληνικής Αγοράς Φυσικού Αερίου"); an English brand name may stay untranslated ("Greek Power Live"). **Everything else** in Greek has a capital on the first word only | Flows, Gas-Power, BigHydro titles follow it; live-greekpower uses a brand name; in BESS only the English title was found in the code — to check in its own thread. Labels beyond the title: to check in Gas-Power, BigHydro, BESS |
| C02 | **No all-caps labels.** Captions are written normally, small and grey; numbers carry the colour and weight. If capitals are ever kept somewhere, Greek capitals must lose their accents in every browser (Flows batch 6, D19, had a helper for this) and units must not be uppercased (`MWh`, not `MWH`). Replaces H03 / H04 | Flows done (D24); live-greekpower: one small caption; BigHydro: 2 uses; BESS ≈40 and Gas-Power ≈42 uses to convert |

