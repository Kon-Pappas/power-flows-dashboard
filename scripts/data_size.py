#!/usr/bin/env python3
"""
Μέτρηση των αρχείων δεδομένων (D32, όπως BESS D54· από το D48 μηνιαία αρχεία): τι κατεβάζει ο επισκέπτης.

Τρέξε:   python3 scripts/data_size.py            (από τη ρίζα του repo)
         python3 scripts/data_size.py --json     (για μηχανική ανάγνωση)

Πρώτη φόρτωση = manifest + analysis_core + ο τελευταίος μήνας και τα γεγονότα του (D48). Κάθε άλλος μήνας κατεβαίνει
μόνο αν τον διαλέξει ο επισκέπτης. Το GitHub Pages στέλνει τα αρχεία συμπιεσμένα (gzip): αυτά τα νούμερα μετράνε.
Ό,τι μεγαλώνει με τον χρόνο είναι μόνο το core (ημερήσιο ταμείο όλης της περιόδου, για το «Ανά χώρα»).
Μόνο βιβλιοθήκες της Python· δεν χρειάζεται δίκτυο.
"""
import gzip
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
FIRST_LOAD_LIMIT_KB = 150        # όριο προσοχής για την πρώτη φόρτωση (πριν το D48: 250 KB για το ενιαίο αρχείο)


def gz_kb(path):
    return len(gzip.compress(path.read_bytes(), 6)) / 1024


def measure(data_dir=DATA):
    man_p, core_p = data_dir / "manifest.json", data_dir / "analysis_core.json"
    man = json.loads(man_p.read_text(encoding="utf-8"))
    months = man.get("months") or []
    mfile = lambda sub, m: data_dir / sub / f"{m}.json"
    per_month = {m: gz_kb(mfile("months", m)) + (gz_kb(mfile("facts", m)) if mfile("facts", m).exists() else 0)
                 for m in months if mfile("months", m).exists()}
    core_kb = gz_kb(core_p) if core_p.exists() else 0
    base = gz_kb(man_p) + core_kb
    big = max(per_month, key=per_month.get) if per_month else None
    n_days = len(man.get("days") or {})
    core_per_day = core_kb / n_days if n_days else 0
    first = base + per_month.get(months[0], 0) if months else base
    return dict(
        days=n_days, months=len(months), manifest_kb=round(gz_kb(man_p), 1), core_kb=round(core_kb, 1),
        latest_month=months[0] if months else None, first_load_gzip_kb=round(first, 1),
        largest_month=big, largest_month_gzip_kb=round(per_month[big], 1) if big else None,
        full_month_load_gzip_kb=round(base + per_month[big], 1) if big else None,
        all_files_gzip_kb=round(base + sum(per_month.values()), 1),
        core_kb_per_day=round(core_per_day, 3), core_kb_per_year=round(core_per_day * 365, 1),
        first_load_limit_kb=FIRST_LOAD_LIMIT_KB,
    )


def main():
    if not (DATA / "manifest.json").exists():
        print("data/manifest.json: δεν υπάρχει ακόμα")
        return
    r = measure()
    if "--json" in sys.argv:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return
    print(f"Data (D48): {r['days']} days in {r['months']} monthly files, {r['all_files_gzip_kb']} KB gzip together")
    print(f"First load: {r['first_load_gzip_kb']} KB gzip (manifest {r['manifest_kb']} + core {r['core_kb']} + {r['latest_month']}); "
          f"largest month {r['largest_month']}: {r['largest_month_gzip_kb']} KB, so at most about {r['full_month_load_gzip_kb']} KB")
    print(f"Growth of the first load: core only, about {r['core_kb_per_year']} KB gzip a year")
    if r["full_month_load_gzip_kb"] and r["full_month_load_gzip_kb"] > FIRST_LOAD_LIMIT_KB:
        print(f"!! first load above {FIRST_LOAD_LIMIT_KB} KB: time to split the core (docs/ROADMAP.md, \"Data files\").")


if __name__ == "__main__":
    main()
