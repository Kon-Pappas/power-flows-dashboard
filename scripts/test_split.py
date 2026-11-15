#!/usr/bin/env python3
"""Έλεγχος των μηνιαίων αρχείων (D46), χωρίς δίκτυο: τα μηνιαία πρέπει να λένε ΑΚΡΙΒΩΣ ό,τι και τα ενιαία.
Τρέχει (α) σε τεχνητό ιστορικό γνωστής απάντησης και (β) στα πραγματικά αρχεία του repo, σε προσωρινό φάκελο
(τα αρχεία του repo δεν αλλάζουν).
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


def reassemble(data_dir):
    """Ξαναφτιάχνει τα ενιαία από τα μηνιαία, όπως θα τα δει η σελίδα."""
    man = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    flows, facts, limits = [], {}, {}
    for m in man["months"]:
        part = json.loads((data_dir / "months" / f"{m}.json").read_text(encoding="utf-8"))
        assert all(d["Date"][:7] == m for d in part), m
        flows += part
        fa = json.loads((data_dir / "facts" / f"{m}.json").read_text(encoding="utf-8"))
        assert fa["month"] == m and all(k[:7] == m for k in list(fa["days"]) + list(fa["limits"])), m
        facts.update(fa["days"])
        limits.update(fa["limits"])
    core_p = data_dir / "analysis_core.json"
    core = json.loads(core_p.read_text(encoding="utf-8")) if core_p.exists() else None
    return man, flows, facts, limits, core


# 1. Τεχνητό ιστορικό: 3 μήνες, μία ελλιπής ημέρα, μία ημέρα χωρίς γεγονότα
def day(date, complete=True):
    return {"Date": date, "Totals": {"SCADA": {"BG": 1}}, "Hourly": [{"SCADA_BG": 1.5}] * 24,
            "Flags": {"scada": True, "complete": complete}}


flows = [day("2026-09-30"), day("2026-10-01", complete=False), day("2026-10-31"), day("2026-11-01"), day("2026-11-02")]
analysis = {"generated": "2026-11-02T05:00:00Z", "cash": {"daily": {"2026-09-30": 1}}, "status": {"IT": {}},
            "days": {"2026-09-30": [{"type": "a"}], "2026-10-31": [], "2026-11-02": [{"type": "b"}]},
            "limits": {"2026-11-02": {"BG": {"to_n": 500}}}}
meta = {"fetched": "2026-11-02T05:06:00Z", "next_update": "2026-11-03T05:02:00Z"}
files = S.split(flows, analysis, meta)
check("τεχνητό: 3 μήνες, νεότερος πρώτος", json.loads(files["manifest.json"])["months"] == ["2026-11", "2026-10", "2026-09"])
check("τεχνητό: 3 + 3 μηνιαία + manifest + core = 8 αρχεία", len(files) == 8, str(sorted(files)))
m10 = json.loads(files["months/2026-10.json"])
check("τεχνητό: Οκτώβριος = 31 Οκτ, 1 Οκτ (νεότερη πρώτη)", [d["Date"] for d in m10] == ["2026-10-31", "2026-10-01"])
man = json.loads(files["manifest.json"])
check("τεχνητό: πληρότητα στο manifest (1 Οκτ ελλιπής)", man["days"]["2026-10-01"] is False and man["days"]["2026-11-02"] is True)
check("τεχνητό: ημέρες manifest νεότερη πρώτη", list(man["days"]) == ["2026-11-02", "2026-11-01", "2026-10-31", "2026-10-01", "2026-09-30"])
check("τεχνητό: τελευταία / επόμενη ενημέρωση στο manifest", man["fetched"] == meta["fetched"] and man["next_update"] == meta["next_update"])
core = json.loads(files["analysis_core.json"])
check("τεχνητό: core χωρίς days / limits, με cash και status", "days" not in core and "limits" not in core and core["cash"] and "status" in core)
f11 = json.loads(files["facts/2026-11.json"])
check("τεχνητό: γεγονότα και όρια Νοεμβρίου", f11["days"] == {"2026-11-02": [{"type": "b"}]} and f11["limits"] == {"2026-11-02": {"BG": {"to_n": 500}}})
f10 = json.loads(files["facts/2026-10.json"])
check("τεχνητό: Οκτώβριος: 31 Οκτ χωρίς γεγονότα (κενή λίστα), 1 Οκτ λείπει όπως στο analysis", f10["days"] == {"2026-10-31": []} and f10["limits"] == {})
check("τεχνητό: χωρίς analysis → ημέρες, κενά γεγονότα, manifest, χωρίς core", sorted(S.split(flows, None, None)) ==
      sorted(["manifest.json", "months/2026-11.json", "months/2026-10.json", "months/2026-09.json",
              "facts/2026-11.json", "facts/2026-10.json", "facts/2026-09.json"]))

# 2. Εγγραφή σε φάκελο: μόνο τα αλλαγμένα ξαναγράφονται· μήνας που έφυγε σβήνεται
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    (t / "historical_flows.json").write_text(S.days_text(flows), encoding="utf-8")
    (t / "analysis.json").write_text(json.dumps(analysis), encoding="utf-8")
    (t / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    (t / "months").mkdir()
    (t / "months" / "2026-05.json").write_text("[]", encoding="utf-8")       # μήνας που δεν υπάρχει πια
    (t / "months" / "notes.txt").write_text("x", encoding="utf-8")           # ό,τι δεν είναι ΕΕΕΕ-ΜΜ.json μένει
    logs = []
    S.write_split(t, log=logs.append)
    check("φάκελος: σβήνεται μόνο το 2026-05.json", not (t / "months" / "2026-05.json").exists() and (t / "months" / "notes.txt").exists())
    logs.clear()
    S.write_split(t, log=logs.append)
    check("φάκελος: δεύτερη εκτέλεση χωρίς αλλαγές → τίποτα δεν ξαναγράφεται", "άλλαξαν 0" in logs[-1], logs[-1])
    check("φάκελος: κανένα .tmp δεν μένει", not list(t.rglob("*.tmp")))

# 3. Τα πραγματικά αρχεία του repo, σε αντίγραφο
src = ROOT / "data"
if (src / "historical_flows.json").exists():
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        for n in ("historical_flows.json", "analysis.json", "meta.json"):
            if (src / n).exists():
                shutil.copy(src / n, t / n)
        S.write_split(t, log=lambda m: None)
        flows = json.loads((t / "historical_flows.json").read_text(encoding="utf-8"))
        an = json.loads((t / "analysis.json").read_text(encoding="utf-8")) if (t / "analysis.json").exists() else {}
        man, flows2, facts2, limits2, core2 = reassemble(t)
        check("repo: ίδιες ημέρες, ίδια σειρά (νεότερη πρώτη)", [d["Date"] for d in flows2] == [d["Date"] for d in flows],
              f"{len(flows2)} ημέρες, {len(man['months'])} μήνες")
        check("repo: κάθε ημέρα ίδια byte προς byte", all(S._dump(a) == S._dump(b) for a, b in zip(flows, flows2)))
        check("repo: πληρότητα manifest = Flags.complete", man["days"] == {d["Date"]: bool(d["Flags"].get("complete")) for d in flows})
        if an:
            check("repo: γεγονότα ίδια", facts2 == an.get("days", {}), f"{len(facts2)} ημέρες")
            check("repo: παρατηρούμενα όρια ίδια", limits2 == an.get("limits", {}), f"{len(limits2)} ημέρες")
            check("repo: core + μηνιαία = analysis.json", dict(core2, days=facts2, limits=limits2) == an)
        print(f"   (repo: {len(man['months'])} μήνες, {len(flows2)} ημέρες)")

print(f"\nΌλοι οι έλεγχοι πέρασαν ({ok}).")
