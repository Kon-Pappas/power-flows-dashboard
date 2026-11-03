#!/usr/bin/env python3
"""Έλεγχος της ανάλυσης διασυνδέσεων (D34), χωρίς δίκτυο, με τεχνητές ημέρες γνωστής απάντησης.
Τρέξε από τη ρίζα του repo:  python3 scripts/test_analysis.py
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analysis as A        # noqa: E402
import update_flows as U    # noqa: E402

ok = 0


def check(name, cond, info=""):
    global ok
    print(("✔" if cond else "✘"), name, info)
    if not cond:
        raise SystemExit(1)
    ok += 1


# 1. Σύζευξη ανά τέταρτο (update_flows.coupling_by_hour)
gr = [100.0] * 96
bg = [100.0] * 96
for q in range(24, 32):            # ώρες 06–08: ΒΓ ακριβότερη κατά 30 → Ελλάδα φθηνότερη
    bg[q] = 130.0
bg[40] = 100.005                   # διαφορά 0,005 < 0,01: συζευγμένο
bg[41] = 120.0                     # ένα μόνο τέταρτο στην ώρα 10
c = U.coupling_by_hour(gr, bg, 24)
check("σύζευξη: ώρες 06–08 πλήρως αποσυζευγμένες, ΕΛ φθηνότερη κατά 30", c[6] == (0, -30.0) and c[7] == (0, -30.0), str(c[6:8]))
check("σύζευξη: διαφορά 0,005 €/MWh = συζευγμένο τέταρτο", c[10] == (3, -20.0), str(c[10]))
check("σύζευξη: συζευγμένη ώρα = (4, 0)", c[0] == (4, 0.0))
check("σύζευξη: λείπει τιμή → (None, None)", U.coupling_by_hour(gr, None, 24)[0] == (None, None))


# 2. Τεχνητό ιστορικό
def make_day(d, it_zero=False, bg_dec=(), bg_flow=-500.0, bg_sched=-500.0, scada=True, al_peak=None, spread=-30.0):
    hours = []
    for i in range(24):
        dec = i in bg_dec
        h = {"Hour": f"H{i + 1:02d}", "MCP_GR": 100.0, "MCP_BG": 100.0 - spread if dec else 100.0, "MCP_IT": 100.0,
             "SCADA_Net": -800.0, "ISP_Net": -800.0,
             "SCADA_AL": -100.0, "SCADA_BG": bg_flow, "SCADA_IT": 0.0 if it_zero else -300.0, "SCADA_MK": -100.0, "SCADA_TR": 50.0,
             "ISP_BG": bg_sched, "ISP_IT": 0.0 if it_zero else -300.0,
             "CPL_BG": 0 if dec else 4, "SPR_BG": spread if dec else 0.0, "CPL_IT": 4, "SPR_IT": 0.0}
        if al_peak and i == 12:
            h["SCADA_AL"] = -al_peak
        hours.append(h)
    return {"Date": d, "Hourly": hours, "Flags": {"scada": scada, "isp": True, "complete": scada}}


start = date(2026, 9, 1)
days = []
for k in range(40):
    d = (start + timedelta(days=k)).isoformat()
    days.append(make_day(d, it_zero=(30 <= k <= 33), bg_dec=(6, 7) if k == 39 else (),
                         bg_sched=-600.0 if k == 39 else -500.0, al_peak=900.0 if k == 38 else None))
days.append(make_day((start + timedelta(days=40)).isoformat(), bg_dec=range(9, 12), scada=False))   # «σήμερα»: μόνο τιμές
out = A.build(days)

# 3. Κατάσταση γραμμών
st = out["status"]["IT"]
check("κατάσταση: 4 ημέρες στο μηδέν συνολικά", st["zero_days"] == 4, str(st))
check("κατάσταση: τελευταία επανεκκίνηση 5 Οκτ στις 00:00", st["last_restart"] == {"date": "2026-10-05", "hour": "00:00"}, str(st["last_restart"]))
check("κατάσταση: καμία τρέχουσα σειρά", st["zero_streak"] == 0)
f31 = out["days"]["2026-10-01"]
check("γεγονός: μηδενισμός ΙΤ την 1η Οκτ", any(f["type"] == "zero_start" and f["line"] == "IT" for f in f31))
f35 = out["days"]["2026-10-05"]
check("γεγονός: επανεκκίνηση ΙΤ στις 5 Οκτ, 00:00", any(f["type"] == "restart" and f["line"] == "IT" and f["hour"] == "00:00" for f in f35))

# 4. Αποσύζευξη μιας ημέρας με μέτρηση (k=39): ώρες 06–08, πρόγραμμα 600 MW, σύνηθες 500
f39 = out["days"]["2026-10-10"]
dec = next(f for f in f39 if f["type"] == "decoupled" and f["line"] == "BG")
w = dec["windows"][0]
check("παράθυρο ΕΛ–ΒΓ 06:00–08:00 προς Βουλγαρία", (w["from"], w["to"], w["dir"]) == ("06:00", "08:00", "to_n") and len(dec["windows"]) == 1, str(w))
check("έσοδο συμφόρησης = 2 ώρες × 600 MW × 30 € = 36.000 €", dec["rent_eur"] == 36000, str(dec["rent_eur"]))
check("αιχμή προγράμματος 600 MW, παρατηρούμενο όριο 500 MW (P95 30 ημερών) → 120%",
      (dec["sched_peak_mw"], dec["limit_mw"], dec["pct_of_limit"]) == (600, 500, 120), str((dec["sched_peak_mw"], dec["limit_mw"], dec["pct_of_limit"])))
check("πρόγραμμα έναντι πραγματικής (D35): 600 / 500 MW, 1.200 / 1.000 MWh στις ώρες κορεσμού",
      (dec["sched_peak_mw"], dec["act_peak_mw"], dec["sched_mwh"], dec["act_mwh"]) == (600, 500, 1200, 1000),
      str((dec["sched_peak_mw"], dec["act_peak_mw"], dec["sched_mwh"], dec["act_mwh"])))
check("πρώτη αποσύζευξη μετά από 7 ημέρες πλήρους σύζευξης", any(f["type"] == "first_decoupling" for f in f39))
check("τα γεγονότα είναι ταξινομημένα κατά βαθμό", [f["score"] for f in f39] == sorted((f["score"] for f in f39), reverse=True))

# 5. «Σήμερα»: μόνο τιμές, χωρίς MW / χρήματα
ft = out["days"]["2026-10-11"]
dt = next(f for f in ft if f["type"] == "decoupled")
check("σήμερα: παράθυρο 09:00–12:00 από τις τιμές, χωρίς μέτρηση", dt["measured"] is False and "rent_eur" not in dt
      and (dt["windows"][0]["from"], dt["windows"][0]["to"]) == ("09:00", "12:00"), str(dt))

# 6. Νέο μέγιστο (Αλβανία 900 MW εξαγωγή την 9η Οκτ, μετά από 38 ημέρες)
f38 = out["days"]["2026-10-09"]
check("νέο μέγιστο εξαγωγής ΑΛ 900 MW στις 12:00", any(f["type"] == "new_max" and f["line"] == "AL" and f["dir"] == "exp"
                                                     and f["mw"] == 900 and f["hour"] == "12:00" for f in f38))
check("συζευγμένη ημέρα: «συζευγμένη όλο το 24ωρο»", any(f["type"] == "coupled_all_day" and f["line"] == "BG" for f in out["days"]["2026-09-15"]))

# 7. Ταμείο ανά χώρα: ΑΛ εξάγει 100 MW × 24 ώρες × 100 € = 240.000 €
check("ταμείο ΑΛ ημέρας = +240.000 €", out["cash"]["daily"]["2026-09-15"]["AL"]["net"] == 240000)
check("ταμείο ΤΡ ημέρας = −120.000 € (εισαγωγή 50 MW)", out["cash"]["daily"]["2026-09-15"]["TR"]["net"] == -120000)
check("χωρίς μέτρηση η ημέρα δεν μπαίνει στο ταμείο", "2026-10-11" not in out["cash"]["daily"])

# 8. Μικρές διαφορές (D35): κάτω από 1 €/MWh = συζευγμένη για στατιστικά και κείμενα
mini = A.build([make_day("2026-09-01"), make_day("2026-09-02", bg_dec=(5,), spread=-0.5)])
f2 = mini["days"]["2026-09-02"]
check("διαφορά 0,5 €/MWh: «συζευγμένη όλο το 24ωρο», καμία αποσύζευξη", any(f["type"] == "coupled_all_day" and f["line"] == "BG" for f in f2)
      and not any(f["type"] == "decoupled" for f in f2))
check("διαφορά 0,5 €/MWh: δεν μετρά στον μηνιαίο κορεσμό", mini["saturation"]["BG"]["2026-09"]["dec_hours"] == 0)

# 9. Η μορφή του αρχείου: λίστες ανά ημέρα (Market) → ίδιο αποτέλεσμα με τα ωριαία πεδία
src = make_day("2026-09-03", bg_dec=(6, 7))
packed = {"Date": src["Date"], "Flags": src["Flags"], "Hourly": [{k: v for k, v in h.items() if k[:4] not in ("ISP_", "CPL_", "SPR_")} for h in src["Hourly"]],
          "Market": {c: {"isp": [h["ISP_" + c] for h in src["Hourly"]], "cpl": [h["CPL_" + c] for h in src["Hourly"]],
                         "spr": [h["SPR_" + c] for h in src["Hourly"]]} for c in ("BG", "IT")}}
a1 = A.build([make_day("2026-09-02"), src])["days"]["2026-09-03"]
a2 = A.build([make_day("2026-09-02"), packed])["days"]["2026-09-03"]
check("λίστες ανά ημέρα (Market) = ίδια γεγονότα με τα ωριαία πεδία", a1 == a2)

print(f"\nΌλοι οι έλεγχοι πέρασαν ({ok}).")
