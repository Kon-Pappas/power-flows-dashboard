#!/usr/bin/env python3
"""
Μέτρηση του data/historical_flows.json (D32, όπως BESS D54): μέγεθος, gzip, ρυθμός αύξησης, πόσο απέχει το όριο.
Από το D46 μετρά και τα μηνιαία αρχεία: τι θα κατεβάζει ο επισκέπτης στην πρώτη φόρτωση μετά το D48.

Τρέξε:   python3 scripts/data_size.py            (από τη ρίζα του repo)
         python3 scripts/data_size.py --json     (για μηχανική ανάγνωση)

Όριο (ROADMAP «Data files», K03): gzip > 250 KB → περνάμε σε ένα αρχείο ανά μήνα + manifest.
Το GitHub Pages στέλνει το αρχείο συμπιεσμένο (gzip): αυτό το νούμερο κατεβάζει ο επισκέπτης.
Μόνο βιβλιοθήκες της Python· δεν χρειάζεται δίκτυο.
"""
import gzip
import json
import sys
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "historical_flows.json"
GZIP_LIMIT_KB = 250
RECENT_DAYS = 30


def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def gz_kb(path):
    return len(gzip.compress(path.read_bytes(), 6)) / 1024


def monthly(data_dir):
    """Μηνιαία αρχεία (D46): τι θα κατεβάζει ο επισκέπτης στην πρώτη φόρτωση μετά το D48
    (manifest + analysis_core + ο τελευταίος μήνας και τα γεγονότα του) και ο μεγαλύτερος μήνας."""
    man_p, core_p = data_dir / "manifest.json", data_dir / "analysis_core.json"
    if not man_p.exists():
        return None
    man = json.loads(man_p.read_text(encoding="utf-8"))
    months = man.get("months") or []
    if not months:
        return None
    mfile = lambda sub, m: data_dir / sub / f"{m}.json"
    per_month = {m: gz_kb(mfile("months", m)) + (gz_kb(mfile("facts", m)) if mfile("facts", m).exists() else 0)
                 for m in months if mfile("months", m).exists()}
    base = gz_kb(man_p) + (gz_kb(core_p) if core_p.exists() else 0)
    big = max(per_month, key=per_month.get)
    return dict(
        manifest_kb=round(gz_kb(man_p), 1), core_kb=round(gz_kb(core_p), 1) if core_p.exists() else None,
        latest_month=months[0], first_load_gzip_kb=round(base + per_month.get(months[0], 0), 1),
        largest_month=big, largest_month_gzip_kb=round(per_month[big], 1),
        full_month_load_gzip_kb=round(base + per_month[big], 1),
        all_files_gzip_kb=round(base + sum(per_month.values()), 1), months=len(months),
    )


def main():
    raw = PATH.read_bytes()
    data = json.loads(raw)
    days = sorted(d["Date"] for d in data)
    raw_kb = len(raw) / 1024
    gz_kb = len(gzip.compress(raw, 6)) / 1024
    gz_ratio = gz_kb / raw_kb if raw_kb else 0

    # Ρυθμός: μέσο μέγεθος ανά ημέρα των τελευταίων 30 ημερών, όπως γράφεται στο αρχείο
    recent = sorted(data, key=lambda d: d["Date"])[-RECENT_DAYS:]
    per_day_raw_kb = sum(len(compact(d)) for d in recent) / max(len(recent), 1) / 1024    # μία ημέρα ανά γραμμή (D34)
    per_day_gz_kb = per_day_raw_kb * gz_ratio
    over = gz_kb >= GZIP_LIMIT_KB
    days_left = None if over else int((GZIP_LIMIT_KB - gz_kb) / max(per_day_gz_kb, 0.01))

    result = dict(
        file=PATH.name, raw_kb=round(raw_kb, 1), gzip_kb=round(gz_kb, 1), compact_raw_kb=round(len(compact(data)) / 1024, 1),
        days=len(days), first=days[0], last=days[-1],
        kb_per_day_raw=round(per_day_raw_kb, 2), kb_per_day_gzip=round(per_day_gz_kb, 2),
        gzip_limit_kb=GZIP_LIMIT_KB, over_limit=over, days_until_gzip_limit=days_left,
    )
    result["monthly"] = monthly(PATH.parent)
    if "--json" in sys.argv:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    print(f"{PATH.name}: {result['raw_kb']} KB raw, {result['gzip_kb']} KB gzip, "
          f"{result['days']} days ({result['first']} → {result['last']})")
    print(f"Growth (last {len(recent)} days): {result['kb_per_day_raw']} KB/day raw, about {result['kb_per_day_gzip']} KB/day gzip")
    if over:
        print(f"!! gzip is above {GZIP_LIMIT_KB} KB: time to move to monthly files (docs/ROADMAP.md, \"Data files\").")
    else:
        print(f"gzip limit {GZIP_LIMIT_KB} KB: about {days_left} days away at today's pace.")
    m = result["monthly"]
    if m:
        print(f"Monthly files (D46): first load {m['first_load_gzip_kb']} KB gzip (manifest {m['manifest_kb']} + core {m['core_kb']} "
              f"+ {m['latest_month']}); largest month {m['largest_month']}: {m['largest_month_gzip_kb']} KB, "
              f"so at most about {m['full_month_load_gzip_kb']} KB; all {m['months']} months together {m['all_files_gzip_kb']} KB")


if __name__ == "__main__":
    main()
