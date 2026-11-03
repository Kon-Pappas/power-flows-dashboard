#!/usr/bin/env python3
"""Έλεγχος των ημερών αλλαγής ώρας (D26) και του ωριαίου ISP χωρίς Κρήτη (D27), χωρίς δίκτυο: όλες οι λήψεις αντικαθίστανται με αρχεία ίδιας δομής.
Τρέξε από τη ρίζα του repo:  python3 scripts/test_dst_days.py

Ελέγχει:
  1. η ημέρα αγοράς έχει 23 / 24 / 25 ώρες (28 Μαρ 2027 / κανονική / 25 Οκτ 2026)·
  2. για ΚΑΘΕ κανονική ημέρα 2026–2027 η περίοδος ENTSO-E είναι ίδια με τον παλιό τρόπο (καμία αλλαγή εκτός των ημερών αλλαγής ώρας)·
  3. οι τιμές ENTSO-E (τεταρτάωρα 92 / 96 / 100, και με παραλειπόμενα σημεία A03) δίνουν μία τιμή ανά ώρα·
  4. SCADA και ISP: όσες ώρες έχει η ημέρα· η στήλη SUM / TOTAL ποτέ ως ώρα· άθροισμα ωρών = ημερήσιο σύνολο·
  5. πληρότητα: 25ωρη ημέρα με 25 τιμές = πλήρης· 25ωρη ημέρα αποθηκευμένη με 24 ώρες = ελλιπής·
  6. συγχώνευση με παλιά εγγραφή άλλου πλήθους ωρών: δεν ανακατεύονται.
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_flows as U  # noqa: E402

ok = 0


def check(name, cond, info=""):
    global ok
    print(("✔" if cond else "✘"), name, info)
    if not cond:
        raise SystemExit(1)
    ok += 1


def old_entsoe_period(date_str):
    """Ο τρόπος πριν το D26 (σταθερά 22:00 / 23:00 UTC), για τον έλεγχο ότι οι κανονικές ημέρες δεν άλλαξαν."""
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    march = datetime(dt.year, 3, 31)
    dst_start = march - timedelta(days=(march.weekday() + 1) % 7)
    october = datetime(dt.year, 10, 31)
    dst_end = october - timedelta(days=(october.weekday() + 1) % 7)
    is_dst = dst_start <= dt < dst_end
    h = 22 if is_dst else 23
    s = (dt - timedelta(days=1)).replace(hour=h)
    e = dt.replace(hour=h)
    return s.strftime("%Y%m%d%H00"), e.strftime("%Y%m%d%H00")


DAYS = {"2027-03-28": 23, "2026-10-24": 24, "2026-10-25": 25}

# 1. πλήθος ωρών
for d, n in DAYS.items():
    check(f"ημέρα {d}: {n} ώρες", U.hours_in_day(d) == n, U.get_entsoe_period(d))
check("25 Οκτ ξεκινά 24/10 22:00 UTC (μεσάνυχτα CEST)", U.get_entsoe_period("2026-10-25")[0] == "202610242200")
check("28 Μαρ ξεκινά 27/3 23:00 UTC (μεσάνυχτα CET)", U.get_entsoe_period("2027-03-28")[0] == "202703272300")

# 2. οι κανονικές ημέρες δεν αλλάζουν
d0, diffs, dst_days = datetime(2026, 1, 1), [], []
for i in range(730):
    ds = (d0 + timedelta(days=i)).strftime("%Y-%m-%d")
    if U.hours_in_day(ds) != 24:
        dst_days.append(ds)
        continue
    if U.get_entsoe_period(ds) != old_entsoe_period(ds):
        diffs.append(ds)
check("730 ημέρες 2026–2027: η περίοδος ENTSO-E ίδια με πριν σε κάθε κανονική ημέρα", not diffs, f"ημέρες αλλαγής ώρας: {dst_days}")


# 3. ENTSO-E
def entsoe_xml(date_str, n_q, skip=()):
    s, e, _ = U.day_window_utc(date_str)
    pts = "".join(f"<Point><position>{p}</position><price.amount>{p}</price.amount></Point>"
                  for p in range(1, n_q + 1) if p not in skip)
    return (f'<Publication_MarketDocument xmlns="urn:x"><TimeSeries><businessType>A62</businessType>'
            f'<currency_Unit.name>EUR</currency_Unit.name><Period><timeInterval><start>{s:%Y-%m-%dT%H:%MZ}</start>'
            f'<end>{e:%Y-%m-%dT%H:%MZ}</end></timeInterval><resolution>PT15M</resolution>{pts}</Period></TimeSeries>'
            f'</Publication_MarketDocument>')


class Res:
    def __init__(self, text):
        self.text, self.status_code = text, 200


for d, n in DAYS.items():
    with mock.patch.object(U, "ENTSOE_TOKEN", "x"), mock.patch.object(U, "http_get", lambda *a, **k: Res(entsoe_xml(d, n * 4, skip=(6, 7)))):
        h = U.fetch_entsoe_mcp(d, "GR")
    exp_last = sum(range(n * 4 - 3, n * 4 + 1)) / 4
    check(f"ENTSO-E {d}: {n} ωριαίες τιμές, η τελευταία ώρα = μέσος των τελευταίων 4 τεταρτάωρων",
          len(h) == n and None not in h and h[-1] == round(exp_last, 2), f"τελευταία {h[-1]}")
    check(f"ENTSO-E {d}: σημεία που λείπουν (A03) παίρνουν την προηγούμενη τιμή", h[1] == round((5 + 5 + 5 + 8) / 4, 2), f"ώρα 2 = {h[1]}")


# 4. SCADA + ISP
def scada_df(n):
    # Όπως το πραγματικό αρχείο (3 Νοε 2026): ΠΑΝΤΑ 25 στήλες ωρών, όσες περισσεύουν κενές
    pad = [None] * (25 - n)
    head = [None, None] + list(range(1, 26)) + ["SUM"]
    rows = [head]
    net = [0.0] * n
    for k, (_, kw, _, _) in enumerate(U.COUNTRY_MAP):
        imp = [10.0 * (k + 1) + h for h in range(n)]
        exp = [float(h) for h in range(n)]
        rows.append([None, kw + "_IMP"] + imp + pad + [sum(imp)])
        rows.append([None, kw + "_EXP"] + exp + pad + [sum(exp)])
        net = [a + (i - e) for a, i, e in zip(net, imp, exp)]
    rows.append([None, "EXPORTS-IMPORTS"] + [-v for v in net] + pad + [-sum(net)])
    return pd.DataFrame(rows)


def isp_df(n):
    n_q = n * 4
    rows = [["Label"] + [f"Q{i}" for i in range(1, n_q + 1)] + ["TOTAL"],
            ["Total Market CBS (+XBID)"] + [None] * (n_q + 1)]
    country_q = []
    for k, (_, _, _, kw) in enumerate(U.COUNTRY_MAP):
        q = [-(10.0 * (k + 1) + i // 4) for i in range(n_q)]          # MW ανά τεταρτάωρο
        country_q.append(q)
        rows.append([kw] + q + [sum(q) / 4])                            # MWh
    rows.append(["Net Border Deviations"] + [None] * (n_q + 1))
    crete = [-280.0] * n_q                                              # ροή προς Κρήτη: μόνο στη Net CBS
    net = [sum(c[i] for c in country_q) + crete[i] for i in range(n_q)]
    rows.append(["Net CBS Schedules"] + net + [99999.0])
    return pd.DataFrame(rows)


days = {}
logs = []
for d, n in DAYS.items():
    sheets = {"SCADA": {"S": scada_df(n)}, "ISP": {"I": isp_df(n)}}
    prices = [50.0 + h for h in range(n)]
    with mock.patch.object(U, "fetch_admie_excel", lambda ds, cat: cat), \
         mock.patch.object(U, "read_excel_safe", lambda f, what: sheets[what]), \
         mock.patch.object(U, "fetch_entsoe_mcp", lambda ds, c: list(prices)), \
         mock.patch.object(U, "log", lambda m: logs.append(m)):
        day = U.process_day(d)
    days[d] = day
    H = day["Hourly"]
    check(f"{d}: αποθηκεύονται {n} ώρες H01…H{n:02d}", len(H) == n and H[-1]["Hour"] == f"H{n:02d}")
    hs = sum(h["SCADA_Net"] for h in H)
    ts = sum(day["Totals"]["SCADA"].values())
    check(f"{d}: SCADA άθροισμα ωρών = ημερήσιο σύνολο", abs(hs - ts) < 0.01, f"{hs:.0f} / {ts:.0f}")
    check(f"{d}: η στήλη SUM δεν διαβάστηκε ως ώρα", all(abs(h["SCADA_Net"]) < 1000 for h in H))
    exp_last = sum(10.0 * (k + 1) + (n - 1) for k in range(len(U.COUNTRY_MAP)))
    check(f"{d}: ISP {n} ώρες, η TOTAL δεν διαβάστηκε ως τεταρτάωρο",
          len(H) == n and H[-1]["ISP_Net"] == exp_last and all(h["ISP_Net"] < 1000 for h in H), f"τελευταία {H[-1]['ISP_Net']}")
    hi, ti = sum(h["ISP_Net"] for h in H), sum(day["Totals"]["ISP"].values())
    check(f"{d}: ISP χωρίς Κρήτη (D27): άθροισμα ωρών = σύνολο χωρών", abs(hi - ti) < 0.01, f"{hi:.0f} / {ti:.0f}")

check("επικεφαλίδα SCADA με 25 στήλες σε ημέρες 23 / 24 ωρών: καμία προειδοποίηση (D28)", not any("SCADA" in m for m in logs), str([m for m in logs if "SCADA" in m]))

# 5. πληρότητα
for d, n in DAYS.items():
    day = days[d]
    day["Flags"] = U.compute_flags(day)
    check(f"{d}: πλήρης με {n} ώρες", U.day_complete(day) is True)
old25 = {**days["2026-10-25"], "Hourly": days["2026-10-25"]["Hourly"][:24]}
old25["Flags"] = U.compute_flags(old25)
check("25 Οκτ αποθηκευμένη με 24 ώρες (πριν το D26): ελλιπής", U.day_complete(old25) is False)

# 6. συγχώνευση με παλιά εγγραφή 24 ωρών: η νέα 25ωρη δεν παίρνει τίποτα από την παλιά
new25 = {**days["2026-10-25"], "Hourly": [dict(h, MCP_GR=None) for h in days["2026-10-25"]["Hourly"]]}
merged = U.merge_with_old(new25, old25)
check("συγχώνευση 25 με 24 ώρες: δεν ανακατεύονται", len(merged["Hourly"]) == 25 and all(h["MCP_GR"] is None for h in merged["Hourly"]))

# 7. ημερομηνίες χειροκίνητης εκτέλεσης (D28): κενό END_DATE = μέχρι σήμερα
def run_dates(start, end):
    with mock.patch.dict(os.environ, {"START_DATE": start, "END_DATE": end}), mock.patch.object(U, "log", lambda m: None):
        return U.dates_from_env()


today = datetime.now(U.ATHENS).strftime("%Y-%m-%d")
r = run_dates("2026-10-28", "")
check("START_DATE χωρίς END_DATE: από την START μέχρι σήμερα", r[0] == "2026-10-28" and r[-1] == today, f"{r[0]} … {r[-1]} ({len(r)} ημέρες)")
r = run_dates("2026-10-28", "2026-10-30")
check("START και END: ακριβώς το διάστημα", r == ["2026-10-28", "2026-10-29", "2026-10-30"])
r = run_dates("", "2026-10-30")
check("END_DATE χωρίς START_DATE: κανονική εκτέλεση 5 ημερών", len(r) == 5)

print(f"\nΌλοι οι έλεγχοι πέρασαν ({ok}).")
