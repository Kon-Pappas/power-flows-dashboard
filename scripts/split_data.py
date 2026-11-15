#!/usr/bin/env python3
"""
Μηνιαία αρχεία δεδομένων (D46). Από τα τρία ενιαία αρχεία (historical_flows.json, analysis.json, meta.json)
γράφει τα αρχεία που θα διαβάζει η σελίδα μετά το επόμενο βήμα (D48):

  data/manifest.json        όλες οι ημέρες με την πληρότητά τους, οι μήνες, τελευταία / επόμενη ενημέρωση
  data/months/YYYY-MM.json  οι ημέρες του μήνα, ίδια δομή με το historical_flows.json (νεότερη πρώτη, μία ανά γραμμή)
  data/facts/YYYY-MM.json   τα γεγονότα («days») και τα παρατηρούμενα όρια («limits») των ημερών του μήνα
  data/analysis_core.json   το analysis.json χωρίς «days» και «limits»: ταμείο, κατάσταση γραμμών, κορεσμός, ταβάνια

Φάση Α (D46): τα ενιαία αρχεία γράφονται όπως πριν και η σελίδα τα διαβάζει ακόμα· τα μηνιαία γράφονται
ΔΙΠΛΑ τους, από αυτά, ώστε να ελεγχθούν πριν περάσει η σελίδα σε αυτά. Δεν χρειάζεται δίκτυο.

Τρέξε:   python3 scripts/split_data.py      (από τη ρίζα του repo· το καλεί και το update_flows.py)
"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONTH_RE = re.compile(r"^\d{4}-\d{2}\.json$")


def _dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _write(path, text):
    """Ατομική εγγραφή· αν το περιεχόμενο δεν άλλαξε, το αρχείο δεν ξαναγράφεται."""
    path = Path(path)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)
    return True


def days_text(days):
    """Ίδια μορφή με το historical_flows.json (D34): λίστα, μία ημέρα ανά γραμμή, χωρίς κενά."""
    return "[\n" + ",\n".join(_dump(x) for x in days) + "\n]\n"


def split(flows, analysis, meta):
    """Επιστρέφει {σχετική διαδρομή: περιεχόμενο}. Καθαρή συνάρτηση: δεν διαβάζει ούτε γράφει αρχεία."""
    flows = sorted(flows, key=lambda d: d["Date"], reverse=True)
    months = sorted({d["Date"][:7] for d in flows}, reverse=True)
    out = {}
    for m in months:
        out[f"months/{m}.json"] = days_text([d for d in flows if d["Date"][:7] == m])

    analysis = analysis or {}
    facts_all = analysis.get("days") or {}
    limits_all = analysis.get("limits") or {}
    for m in months:
        f = {k: v for k, v in sorted(facts_all.items()) if k[:7] == m}
        lim = {k: v for k, v in sorted(limits_all.items()) if k[:7] == m}
        out[f"facts/{m}.json"] = _dump({"month": m, "days": f, "limits": lim}) + "\n"

    if analysis:
        core = {k: v for k, v in analysis.items() if k not in ("days", "limits")}
        out["analysis_core.json"] = _dump(core) + "\n"

    meta = meta or {}
    manifest = {
        "fetched": meta.get("fetched"),
        "next_update": meta.get("next_update"),
        "analysis_generated": analysis.get("generated"),
        "months": months,
        # ημέρα → πλήρης (true / false), νεότερη πρώτη· η σελίδα φτιάχνει από εδώ την επιλογή ημέρας (⚠)
        "days": {d["Date"]: bool((d.get("Flags") or {}).get("complete")) for d in flows},
    }
    out["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"
    return out


def write_split(data_dir=None, log=print):
    """Διαβάζει τα ενιαία αρχεία του data_dir και γράφει τα μηνιαία δίπλα τους.
    Σβήνει μόνο μηνιαία αρχεία (ΕΕΕΕ-ΜΜ.json) μηνών που δεν υπάρχουν πια στο ιστορικό."""
    data_dir = Path(data_dir or ROOT / "data")
    flows = json.loads((data_dir / "historical_flows.json").read_text(encoding="utf-8"))
    ap, mp = data_dir / "analysis.json", data_dir / "meta.json"
    analysis = json.loads(ap.read_text(encoding="utf-8")) if ap.exists() else None
    meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else None
    if not analysis:
        log("   ! split: δεν υπάρχει analysis.json· γράφονται μόνο ημέρες και manifest")

    files = split(flows, analysis, meta)
    changed = [p for p, text in files.items() if _write(data_dir / p, text)]
    removed = []
    for sub in ("months", "facts"):
        d = data_dir / sub
        if d.is_dir():
            for f in d.iterdir():
                if MONTH_RE.match(f.name) and f"{sub}/{f.name}" not in files:
                    f.unlink()
                    removed.append(f"{sub}/{f.name}")
    n_months = sum(1 for p in files if p.startswith("months/"))
    log(f"split (D46): {n_months} μήνες, {len(files)} αρχεία, άλλαξαν {len(changed)}"
        + (f": {', '.join(sorted(changed))}" if 0 < len(changed) <= 8 else "")
        + (f"; σβήστηκαν {', '.join(removed)}" if removed else ""))
    return files


if __name__ == "__main__":
    write_split()
