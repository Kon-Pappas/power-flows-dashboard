#!/usr/bin/env python3
"""Έλεγχος των μηνιαίων αρχείων (D46, D48), χωρίς δίκτυο.
(α) τεχνητό ιστορικό γνωστής απάντησης· (β) η μετάβαση από τα παλιά ενιαία αρχεία· (γ) τα πραγματικά αρχεία του
repo, σε προσωρινό φάκελο: διάβασμα και ξαναγράψιμο δίνουν ακριβώς τα ίδια αρχεία (τα αρχεία του repo δεν αλλάζουν).
Τρέξε από τη ρίζα του repo:  python3 scripts/test_split.py
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import split_data as S      # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ok = 0


def check(name, cond, info=""):
    global ok
    print(("✔" if cond else "✘"), name, info)
    if not cond:
        raise SystemExit(1)
    ok += 1


def day(date, complete=True):
    return {"Date": date, "Totals": {"SCADA": {"BG": 1}}, "Hourly": [{"SCADA_BG": 1.5}] * 24,
            "Flags": {"scada": True, "complete": complete}}


flows = [day("2026-09-30"), day("2026-10-01", complete=False), day("2026-10-31"), day("2026-11-01"), day("2026-11-02")]
analysis = {"generated": "2026-11-02T05:00:00Z", "cash": {"daily": {"2026-09-30": 1}}, "status": {"IT": {}},
            "days": {"2026-09-30": [{"type": "a"}], "2026-10-31": [], "2026-11-02": [{"type": "b"}]},
            "limits": {"2026-11-02": {"BG": {"to_n": 500}}}}
meta = {"fetched": "2026-11-02T05:06:00Z", "next_update": "2026-11-03T05:02:00Z"}

# 1. Τεχνητό ιστορικό
files = S.split(flows, analysis, meta)
man = json.loads(files["manifest.json"])
check("τεχνητό: 3 μήνες, νεότερος πρώτος", man["months"] == ["2026-11", "2026-10", "2026-09"])
check("τεχνητό: 3 + 3 μηνιαία + manifest + core = 8 αρχεία", len(files) == 8, str(sorted(files)))
check("τεχνητό: Οκτώβριος = 31 Οκτ, 1 Οκτ (νεότερη πρώτη)", [d["Date"] for d in json.loads(files["months/2026-10.json"])] == ["2026-10-31", "2026-10-01"])
check("τεχνητό: πληρότητα στο manifest (1 Οκτ ελλιπής)", man["days"]["2026-10-01"] is False and man["days"]["2026-11-02"] is True)
check("τεχνητό: ημέρες manifest νεότερη πρώτη", list(man["days"]) == ["2026-11-02", "2026-11-01", "2026-10-31", "2026-10-01", "2026-09-30"])
check("τεχνητό: τελευταία / επόμενη ενημέρωση στο manifest", man["fetched"] == meta["fetched"] and man["next_update"] == meta["next_update"])
core = json.loads(files["analysis_core.json"])
check("τεχνητό: core χωρίς days / limits, με cash και status", "days" not in core and "limits" not in core and core["cash"] and "status" in core)
f11 = json.loads(files["facts/2026-11.json"])
check("τεχνητό: γεγονότα και όρια Νοεμβρίου", f11["days"] == {"2026-11-02": [{"type": "b"}]} and f11["limits"] == {"2026-11-02": {"BG": {"to_n": 500}}})
f10 = json.loads(files["facts/2026-10.json"])
check("τεχνητό: Οκτώβριος: 31 Οκτ χωρίς γεγονότα (κενή λίστα), 1 Οκτ λείπει όπως στην ανάλυση", f10["days"] == {"2026-10-31": []} and f10["limits"] == {})
check("τεχνητό: χωρίς ανάλυση → μόνο ημέρες και manifest (γεγονότα / core μένουν όπως ήταν)",
      sorted(S.split(flows, None, meta)) == ["manifest.json", "months/2026-09.json", "months/2026-10.json", "months/2026-11.json"])

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    # 2. Μετάβαση (D48): μόνο τα παλιά ενιαία αρχεία → διαβάζονται, γράφονται οι μήνες, σβήνονται τα ενιαία
    (t / "historical_flows.json").write_text(S.days_text(flows), encoding="utf-8")
    (t / "analysis.json").write_text(json.dumps(analysis), encoding="utf-8")
    (t / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    loaded = S.load_days(t)
    check("μετάβαση: διαβάζει το παλιό ενιαίο όταν δεν υπάρχουν μήνες", [d["Date"] for d in loaded] == [d["Date"] for d in sorted(flows, key=lambda d: d["Date"], reverse=True)])
    S.write_split(loaded, analysis, meta, t, log=lambda m: None)
    check("μετάβαση: σβήνονται historical_flows.json και analysis.json", not (t / "historical_flows.json").exists() and not (t / "analysis.json").exists())
    check("μετάβαση: το meta.json μένει (το διαβάζει το hub)", (t / "meta.json").exists())
    check("μετάβαση: μετά διαβάζει από τους μήνες, ίδιες ημέρες", S.load_days(t) == loaded)

    # 3. Εγγραφή: μόνο τα αλλαγμένα· μήνας που έφυγε σβήνεται· χωρίς ανάλυση τα γεγονότα μένουν
    (t / "months" / "2026-05.json").write_text("[]", encoding="utf-8")
    (t / "months" / "notes.txt").write_text("x", encoding="utf-8")
    logs = []
    S.write_split(S.load_days(t), analysis, meta, t, log=logs.append)
    check("φάκελος: σβήνεται μόνο το 2026-05.json", not (t / "months" / "2026-05.json").exists() and (t / "months" / "notes.txt").exists())
    logs.clear()
    S.write_split(S.load_days(t), analysis, meta, t, log=logs.append)
    check("φάκελος: δεύτερη εγγραφή χωρίς αλλαγές → τίποτα δεν ξαναγράφεται", "άλλαξαν 0" in logs[-1], logs[-1])
    before = (t / "facts" / "2026-11.json").read_text(encoding="utf-8")
    S.write_split(S.load_days(t), None, dict(meta, fetched="2026-11-03T05:06:00Z"), t, log=lambda m: None)
    m2 = json.loads((t / "manifest.json").read_text(encoding="utf-8"))
    check("ανάλυση απέτυχε: γεγονότα και core ίδια, το manifest κρατά την ώρα της προηγούμενης ανάλυσης",
          (t / "facts" / "2026-11.json").read_text(encoding="utf-8") == before and (t / "analysis_core.json").exists()
          and m2["analysis_generated"] == analysis["generated"] and m2["fetched"] == "2026-11-03T05:06:00Z")
    check("φάκελος: κανένα .tmp δεν μένει", not list(t.rglob("*.tmp")))

# 4. Τα πραγματικά αρχεία του repo, σε αντίγραφο: διάβασμα → εγγραφή δίνει τα ίδια bytes
src = ROOT / "data"
if (src / "manifest.json").exists() and (src / "months").is_dir():
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp) / "data"
        shutil.copytree(src, t)
        man = json.loads((t / "manifest.json").read_text(encoding="utf-8"))
        days = S.load_days(t)
        check("repo: οι ημέρες των μηνών = οι ημέρες του manifest, ίδια σειρά", [d["Date"] for d in days] == list(man["days"]),
              f"{len(days)} ημέρες, {len(man['months'])} μήνες")
        check("repo: πληρότητα manifest = Flags.complete", man["days"] == {d["Date"]: bool(d["Flags"].get("complete")) for d in days})
        check("repo: κάθε μήνας έχει αρχείο γεγονότων", all((t / "facts" / f"{m}.json").exists() for m in man["months"]))
        before = {p: p.read_bytes() for p in t.rglob("*.json")}
        S.write_split(days, None, {"fetched": man["fetched"], "next_update": man["next_update"]}, t, log=lambda m: None)
        after = {p: p.read_bytes() for p in t.rglob("*.json")}
        check("repo: διάβασμα και ξαναγράψιμο χωρίς αλλαγές → ίδια αρχεία byte προς byte",
              {p: b for p, b in after.items() if p.name not in S.LEGACY} == {p: b for p, b in before.items() if p.name not in S.LEGACY})
        print(f"   (repo: {len(man['months'])} μήνες, {len(days)} ημέρες)")

print(f"\nΌλοι οι έλεγχοι πέρασαν ({ok}).")
