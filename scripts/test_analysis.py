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
check("διαστήματα μηδέν (D36): ΙΤ 1–4 Οκτ, 4 ημέρες, επανεκκίνηση 5 Οκτ 00:00",
      st["zero_episodes"] == [{"from": "2026-10-01", "to": "2026-10-04", "days": 4, "ongoing": False,
                               "restart": {"date": "2026-10-05", "hour": "00:00"}, "from_data_start": False}], str(st["zero_episodes"]))
f31 = out["days"]["2026-10-01"]
check("γεγονός: μηδενισμός ΙΤ την 1η Οκτ", any(f["type"] == "zero_start" and f["line"] == "IT" for f in f31))
f35 = out["days"]["2026-10-05"]
check("γεγονός: επανεκκίνηση ΙΤ στις 5 Οκτ, 00:00", any(f["type"] == "restart" and f["line"] == "IT" and f["hour"] == "00:00" for f in f35))

# γραμμή στο μηδέν (D36): την πρώτη μέρα «μηδενισμός», από τη 2η καμία πρόταση· η κατάσταση μετρά κανονικά
it_zero_days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]
check("γραμμή στο μηδέν: καμία πρόταση αποσύζευξης ΙΤ στις ημέρες μηδέν",
      not any(f["type"] == "decoupled" and f["line"] == "IT" for d in it_zero_days for f in out["days"][d]))
check("γραμμή στο μηδέν: από τη 2η ημέρα κανένα γεγονός για την ΙΤ",
      not any(f.get("line") == "IT" for d in it_zero_days[1:] for f in out["days"][d]))

# εβδομαδιαία σύνολα (D36): Δευτέρα–Κυριακή
wk = out["cash"]["weekly"]["2026-09-07"]["AL"]
check("εβδομάδα 7–13 Σεπ: 7 ημέρες, ΑΛ +1.680.000 €", wk["days"] == 7 and wk["net"] == 7 * 240000, str(wk))

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

# 10. Πιθανός περιορισμός ικανότητας (D39): πρόγραμμα κολλημένο στα 500 MW σε 4 ώρες κορεσμού, όριο 1.000 MW
hist = [make_day((date(2026, 9, 1) + timedelta(days=k)).isoformat(), bg_sched=-1000.0) for k in range(31)]
lim_day = make_day("2026-10-02", bg_dec=(9, 10, 11, 12), bg_sched=-1000.0)
for i in (9, 10, 11, 12):
    lim_day["Hourly"][i]["ISP_BG"] = -500.0
res = A.build(hist + [lim_day])
lf = [f for f in res["days"]["2026-10-02"] if f["type"] == "limitation"]
check("περιορισμός: ΕΛ→ΒΓ στα 500 MW, 09:00–13:00, έναντι ορίου 1.000 MW",
      len(lf) == 1 and (lf[0]["dir"], lf[0]["cap_mw"], lf[0]["limit_mw"], lf[0]["hours"]) == ("to_n", 500, 1000, 4)
      and lf[0]["windows"] == [{"from": "09:00", "to": "13:00"}], str(lf))
no_lim = make_day("2026-10-02", bg_dec=(9, 10, 11, 12), bg_sched=-1000.0)
res2 = A.build(hist + [no_lim])
check("καμία ένδειξη όταν το πρόγραμμα είναι στο όριο", not any(f["type"] == "limitation" for f in res2["days"]["2026-10-02"]))
check("όρια ανά ημέρα για τα γραφήματα: ΒΓ προς γείτονα 1.000 MW", res["limits"]["2026-10-02"]["BG"]["to_n"] == 1000, str(res["limits"].get("2026-10-02")))

# 11. NTC (D41): συμπλήρωση των σημείων που λείπουν (καμπύλη A03), συμπίεση, μειωμένη / μηδενική ικανότητα
st0, en0, n0 = U.athens_window_utc("2026-10-05")
xml = ('<Publication_MarketDocument xmlns="urn:x"><TimeSeries><Period><timeInterval>'
       f'<start>{st0:%Y-%m-%dT%H:%M}Z</start><end>{en0:%Y-%m-%dT%H:%M}Z</end></timeInterval><resolution>PT60M</resolution>'
       '<Point><position>1</position><quantity>300</quantity></Point><Point><position>9</position><quantity>100</quantity></Point>'
       '<Point><position>21</position><quantity>300</quantity></Point></Period></TimeSeries></Publication_MarketDocument>')
ntc = U.parse_entsoe_series(xml, st0, n0)
check("NTC: τα κενά παίρνουν την προηγούμενη τιμή (300 / 100 στις 08–20 / 300)", ntc == [300] * 8 + [100] * 12 + [300] * 4, str(ntc))
check("NTC: συμπίεση σε αλλαγές τιμής και πίσω", U.rle(ntc) == [[0, 300], [8, 100], [20, 300]] and A.unrle(U.rle(ntc), 24) == ntc)
check("NTC: κανένα στοιχείο → κενή λίστα", U.rle([None] * 24) == [] and A.unrle([], 3) == [None, None, None])
check("NTC: απάντηση «δεν βρέθηκαν στοιχεία» → None", U.parse_entsoe_series('<Acknowledgement_MarketDocument xmlns="urn:y"/>', st0, 24) == [None] * 24)

def with_ntc(dd, exp_vals, imp_vals=None):
    for i, h in enumerate(dd["Hourly"]):
        h["NTC_EXP_AL"] = exp_vals[i]
        h["NTC_IMP_AL"] = (imp_vals or [500] * 24)[i]
    return dd

h11 = [with_ntc(make_day((date(2026, 9, 1) + timedelta(days=k)).isoformat()), [300] * 24) for k in range(31)]
d11 = with_ntc(make_day("2026-10-02"), ntc)
r11 = A.build(h11 + [d11])
nf = [f for f in r11["days"]["2026-10-02"] if f["type"] == "ntc_reduced"]
check("μειωμένο NTC ΕΛ→ΑΛ: 100 MW, 08:00–20:00, έναντι συνήθους 300 (ένα γεγονός ανά γραμμή)", len(nf) == 1
      and nf[0]["dirs"] == [{"dir": "to_n", "windows": [{"from": "08:00", "to": "20:00", "min": 100, "max": 100}], "usual_mw": 300}], str(nf))
z1 = with_ntc(make_day("2026-10-02"), [0] * 24)
z2 = with_ntc(make_day("2026-10-03"), [0] * 24)
r12 = A.build(h11 + [z1, z2])
z1b = [f for f in r12["days"]["2026-10-02"] if f["type"] == "ntc_zero"]
check("μηδενικό NTC μόνο προς ΑΛ: ένα γεγονός, μία κατεύθυνση", len(z1b) == 1 and z1b[0]["dirs"] == ["to_n"], str(z1b))
check("μηδενικό NTC: γεγονός μόνο την πρώτη ημέρα", any(f["type"] == "ntc_zero" for f in r12["days"]["2026-10-02"])
      and not any(f["type"] == "ntc_zero" for f in r12["days"]["2026-10-03"]))

# ποσοστό ικανότητας στις ώρες κορεσμού: πρόγραμμα 500 MW, NTC 500 MW → 100 %
h13 = [make_day((date(2026, 9, 1) + timedelta(days=k)).isoformat()) for k in range(31)]
d13 = make_day("2026-10-02", bg_dec=(6, 7), bg_sched=-500.0)
for h in d13["Hourly"]:
    h["NTC_EXP_BG"], h["NTC_IMP_BG"] = 500, 900
f13 = next(f for f in A.build(h13 + [d13])["days"]["2026-10-02"] if f["type"] == "decoupled" and f["line"] == "BG")
check("χρήση NTC στις ώρες κορεσμού: 100 % των 500 MW", (f13["ntc_util_pct"], f13["ntc_mw"]) == (100, 500), str((f13.get("ntc_util_pct"), f13.get("ntc_mw"))))
lim_ntc = make_day("2026-10-02", bg_dec=(9, 10, 11, 12), bg_sched=-1000.0)
for i in (9, 10, 11, 12):
    lim_ntc["Hourly"][i]["ISP_BG"] = -500.0
for h in lim_ntc["Hourly"]:
    h["NTC_EXP_BG"] = 1000
check("με NTC, χωρίς εκτίμηση «κολλημένου» προγράμματος", not any(f["type"] == "limitation" for f in A.build(hist + [lim_ntc])["days"]["2026-10-02"]))

# 12. NTC με ένα αίτημα για όλο το τρέξιμο (D42): 24 / 25 / 24 ώρες, σωστό κόψιμο στην αλλαγή ώρας, 10 αιτήματα
from unittest import mock
rs, _, _ = U.athens_window_utc("2026-10-24")
_, re_, _ = U.athens_window_utc("2026-10-26")
tot = int((re_ - rs).total_seconds() // 3600)          # 73 ώρες
xml3 = ('<Publication_MarketDocument xmlns="urn:x"><TimeSeries><Period><timeInterval>'
        f'<start>{rs:%Y-%m-%dT%H:%M}Z</start><end>{re_:%Y-%m-%dT%H:%M}Z</end></timeInterval><resolution>PT60M</resolution>'
        '<Point><position>1</position><quantity>1000</quantity></Point>'
        '<Point><position>33</position><quantity>500</quantity></Point>'      # 25 Οκτ, ώρα 08 (μετά από 24 ώρες της 24ης)
        '<Point><position>45</position><quantity>1000</quantity></Point>'     # 25 Οκτ, ώρα 20
        '</Period></TimeSeries></Publication_MarketDocument>')
class _R:
    status_code, text = 200, xml3
calls = []
U.NTC_CACHE.clear()
with mock.patch.object(U, "ENTSOE_TOKEN", "x"), mock.patch.object(U, "http_get", lambda url, what="": calls.append(what) or _R()), \
     mock.patch.object(U, "log", lambda m: None):
    U.prefetch_ntc(["2026-10-24", "2026-10-25", "2026-10-26"])
    e25, i25 = U.fetch_entsoe_ntc("2026-10-25", "BG")
check("NTC ανά τρέξιμο: 10 αιτήματα για 3 ημέρες × 5 σύνορα", len(calls) == 10, str(len(calls)))
check("NTC ανά τρέξιμο: 24 / 25 / 24 ώρες", [len(U.NTC_CACHE[(d, "AL")][0]) for d in ("2026-10-24", "2026-10-25", "2026-10-26")] == [24, 25, 24] and tot == 73)
check("NTC ανά τρέξιμο: 25 Οκτ 500 MW ακριβώς 08:00–20:00", e25 == [1000] * 8 + [500] * 12 + [1000] * 5, str(e25))

# 13. Τιμή αποτίμησης (D44): όλα τα σύνορα με την τιμή ΕΛ, και ΒΓ / ΙΤ (όχι μέσος όρος)
hp = {"MCP_GR": 100.0, "MCP_BG": 200.0, "MCP_IT": 50.0}
check("ταμείο: ΒΓ, ΙΤ, ΑΛ με την τιμή ΕΛ (100 €/MWh), όχι μέσο όρο", [A.price_for(hp, c) for c in ("BG", "IT", "AL")] == [100.0, 100.0, 100.0])

print(f"\nΌλοι οι έλεγχοι πέρασαν ({ok}).")
