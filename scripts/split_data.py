#!/usr/bin/env python3
"""
Μηνιαία αρχεία δεδομένων (D46, D48): ο ΜΟΝΑΔΙΚΟΣ τρόπος αποθήκευσης των δεδομένων από το D48.

  data/manifest.json        όλες οι ημέρες με την πληρότητά τους, οι μήνες, τελευταία / επόμενη ενημέρωση
  data/months/YYYY-MM.json  οι ημέρες του μήνα (νεότερη πρώτη, μία ανά γραμμή)
  data/facts/YYYY-MM.json   τα γεγονότα («days») και τα παρατηρούμενα όρια («limits») των ημερών του μήνα
  data/analysis_core.json   η ανάλυση όλης της περιόδου χωρίς γεγονότα / όρια: ταμείο, κατάσταση γραμμών, κορεσμός, ταβάνια
  data/meta.json            μένει (γράφεται από το update_flows.py): το διαβάζει το hub για το «ενημερώθηκε»

Η σελίδα κατεβάζει manifest + core + μόνο τους μήνες που δείχνει (D48). Τα παλιά ενιαία αρχεία
(historical_flows.json, analysis.json) σβήνονται στην πρώτη εγγραφή μετά το D48.

Τρέξε:   python3 scripts/split_data.py      (από τη ρίζα του repo: ξαναφτιάχνει ανάλυση και αρχεία από τους μήνες,
                                             χωρίς δίκτυο· το κανονικό τρέξιμο το κάνει το update_flows.py)
"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MONTH_RE = re.compile(r"^\d{4}-\d{2}\.json$")
LEGACY = ("historical_flows.json", "analysis.json")       # τα ενιαία αρχεία πριν το D48


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
    """Μία ημέρα ανά γραμμή, χωρίς κενά (όπως το historical_flows.json από το D34)."""
    return "[\n" + ",\n".join(_dump(x) for x in days) + "\n]\n"


def load_days(data_dir=None):
    """Όλο το ιστορικό, νεότερη ημέρα πρώτη: από τους μήνες· αν δεν υπάρχουν ακόμα, από το παλιό ενιαίο αρχείο.
    Χαλασμένο αρχείο → σφάλμα (ασφαλές: το τρέξιμο σταματά πριν γράψει οτιδήποτε)."""
    data_dir = Path(data_dir or DATA)
    mdir = data_dir / "months"
    files = sorted(f for f in mdir.iterdir() if MONTH_RE.match(f.name)) if mdir.is_dir() else []
    if files:
        days = [d for f in files for d in json.loads(f.read_text(encoding="utf-8"))]
    elif (data_dir / "historical_flows.json").exists():
        days = json.loads((data_dir / "historical_flows.json").read_text(encoding="utf-8"))
    else:
        days = []
    return sorted(days, key=lambda d: d["Date"], reverse=True)


def split(flows, analysis, meta, prev_generated=None):
    """{σχετική διαδρομή: περιεχόμενο}. Καθαρή συνάρτηση. Χωρίς analysis (απέτυχε) δεν παράγει γεγονότα / core,
    ώστε να μείνουν τα προηγούμενα."""
    flows = sorted(flows, key=lambda d: d["Date"], reverse=True)
    months = sorted({d["Date"][:7] for d in flows}, reverse=True)
    out = {}
    for m in months:
        out[f"months/{m}.json"] = days_text([d for d in flows if d["Date"][:7] == m])

    if analysis:
        facts_all = analysis.get("days") or {}
        limits_all = analysis.get("limits") or {}
        for m in months:
            f = {k: v for k, v in sorted(facts_all.items()) if k[:7] == m}
            lim = {k: v for k, v in sorted(limits_all.items()) if k[:7] == m}
            out[f"facts/{m}.json"] = _dump({"month": m, "days": f, "limits": lim}) + "\n"
        core = {k: v for k, v in analysis.items() if k not in ("days", "limits")}
        out["analysis_core.json"] = _dump(core) + "\n"

    meta = meta or {}
    manifest = {
        "fetched": meta.get("fetched"),
        "next_update": meta.get("next_update"),
        "analysis_generated": (analysis or {}).get("generated") or prev_generated,
        "months": months,
        # ημέρα → πλήρης (true / false), νεότερη πρώτη· η σελίδα φτιάχνει από εδώ την επιλογή ημέρας (⚠)
        "days": {d["Date"]: bool((d.get("Flags") or {}).get("complete")) for d in flows},
    }
    out["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"
    return out


def write_split(flows, analysis, meta, data_dir=None, log=print):
    """Γράφει τα αρχεία του split(). Σβήνει: μηνιαία αρχεία (ΕΕΕΕ-ΜΜ.json) μηνών που έφυγαν από το ιστορικό
    (γεγονότα μόνο όταν υπάρχει νέα ανάλυση) και τα παλιά ενιαία αρχεία (D48)."""
    data_dir = Path(data_dir or DATA)
    prev = None
    if not analysis and (data_dir / "manifest.json").exists():
        try:                                          # η ανάλυση απέτυχε: κρατάμε την ώρα της προηγούμενης
            prev = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8")).get("analysis_generated")
        except Exception:
            pass
    files = split(flows, analysis, meta, prev)
    changed = [p for p, text in files.items() if _write(data_dir / p, text)]
    removed = []
    for sub in ("months", "facts") if analysis else ("months",):
        d = data_dir / sub
        if d.is_dir():
            for f in d.iterdir():
                if MONTH_RE.match(f.name) and f"{sub}/{f.name}" not in files:
                    f.unlink()
                    removed.append(f"{sub}/{f.name}")
    for name in LEGACY:
        if (data_dir / name).exists():
            (data_dir / name).unlink()
            removed.append(name)
    n_months = sum(1 for p in files if p.startswith("months/"))
    log(f"data (D48): {n_months} μήνες, {len(files)} αρχεία, άλλαξαν {len(changed)}"
        + (f": {', '.join(sorted(changed))}" if 0 < len(changed) <= 8 else "")
        + (f"; σβήστηκαν {', '.join(removed)}" if removed else "")
        + ("" if analysis else " (χωρίς νέα ανάλυση: γεγονότα και core όπως ήταν)"))
    return files


def rebuild(data_dir=None, log=print):
    """Χωρίς δίκτυο: ξαναϋπολογίζει την ανάλυση από τους μήνες και ξαναγράφει τα αρχεία (το meta μένει ως έχει)."""
    import analysis as A
    data_dir = Path(data_dir or DATA)
    days = load_days(data_dir)
    mp = data_dir / "meta.json"
    meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else None
    out = A.build(days)
    write_split(days, out, meta, data_dir, log=log)
    return out


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    rebuild()
