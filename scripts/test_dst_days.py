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
def entsoe_period(date_str, base, skip=()):
    s_, e_, n = U.day_window_utc(date_str)
    pts = "".join(f"<Point><position>{p}</position><price.amount>{base + p}</price.amount></Point>"
                  for p in range(1, n * 4 + 1) if p not in skip)
    return (f'<TimeSeries><businessType>A62</businessType><currency_Unit.name>EUR</currency_Unit.name><Period><timeInterval>'
            f'<start>{s_:%Y-%m-%dT%H:%MZ}</start><end>{e_:%Y-%m-%dT%H:%MZ}</end></timeInterval><resolution>PT15M</resolution>{pts}</Period></TimeSeries>')


def entsoe_xml(date_str, skip=()):
    """Δύο ημέρες αγοράς: χθες τιμές 500+θέση, σήμερα τιμές = θέση (D33)."""
    return ('<Publication_MarketDocument xmlns="urn:x">' + entsoe_period(U.prev_day(date_str), 500)
            + entsoe_period(date_str, 0, skip) + '</Publication_MarketDocument>')


class Res:
    def __init__(self, text):
        self.text, self.status_code = text, 200


for d, n in DAYS.items():
    with mock.patch.object(U, "ENTSOE_TOKEN", "x"), mock.patch.object(U, "http_get", lambda *a, **k: Res(entsoe_xml(d, skip=(6, 7)))):
        h = U.fetch_entsoe_mcp(d, "GR")
    n_prev = U.hours_in_day(U.prev_day(d))
    first = round(500 + sum(range(n_prev * 4 - 3, n_prev * 4 + 1)) / 4, 2)            # χθεσινή τελευταία ώρα αγοράς
    last = round(sum(range((n - 2) * 4 + 1, (n - 1) * 4 + 1)) / 4, 2)                   # σημερινή ώρα αγοράς n−1
    check(f"ENTSO-E {d}: {n} τιμές σε ώρα Ελλάδας· η 00–01 = η χθεσινή 23–24 CET (D33)",
          len(h) == n and None not in h and h[0] == first and h[-1] == last, f"πρώτη {h[0]}, τελευταία {h[-1]}")
    check(f"ENTSO-E {d}: σημεία που λείπουν (A03) παίρνουν την προηγούμενη τιμή", h[2] == round((5 + 5 + 5 + 8) / 4, 2), f"ώρα 2 = {h[2]}")


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
    # Όπως το πραγματικό αρχείο από 18 Ιουν 2026: άλλη γραμμή με τιμή και στη 25η στήλη (δεν τη διαβάζουμε)
    rows.append([None, "OTHER_LINE"] + [1.0] * 25 + [25.0])
    return pd.DataFrame(rows)


def isp_df(n, tag=0):
    n_q = n * 4
    rows = [["Label"] + [f"Q{i}" for i in range(1, n_q + 1)] + ["TOTAL"],
            ["Total Market CBS (+XBID)"] + [None] * (n_q + 1)]
    country_q = []
    for k, (_, _, _, kw) in enumerate(U.COUNTRY_MAP):
        q = [-(10.0 * (k + 1) + i // 4 + tag) for i in range(n_q)]    # MW ανά τεταρτάωρο (tag: 100 για τη χθεσινή ημέρα)
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
    pd_ = U.prev_day(d)
    files = {("SCADA", d): {"S": scada_df(n)}, ("ISP", d): {"I": isp_df(n)},
             ("ISP", pd_): {"I": isp_df(U.hours_in_day(pd_), tag=100)}}
    prices = [50.0 + h for h in range(n)]
    U.ISP_CACHE.clear()
    with mock.patch.object(U, "fetch_admie_excel", lambda ds, cat: ("ISP" if cat.startswith("ISP") else "SCADA", ds)), \
         mock.patch.object(U, "read_excel_safe", lambda f, what: files[f]), \
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
    K = len(U.COUNTRY_MAP)
    n_prev = U.hours_in_day(pd_)
    exp_first = sum(10.0 * (k + 1) + (n_prev - 1) + 100 for k in range(K))          # χθεσινή τελευταία ώρα αγοράς
    exp_second = sum(10.0 * (k + 1) + 0 for k in range(K))                          # σημερινή πρώτη ώρα αγοράς
    exp_last = sum(10.0 * (k + 1) + (n - 2) for k in range(K))                      # σημερινή ώρα αγοράς n−1
    check(f"{d}: ISP {n} ώρες σε ώρα Ελλάδας (D33): 00–01 = χθεσινή 23–24 CET, μετά η σημερινή από 00:00 CET",
          len(H) == n and H[0]["ISP_Net"] == exp_first and H[1]["ISP_Net"] == exp_second and H[-1]["ISP_Net"] == exp_last
          and all(h["ISP_Net"] < 1000 for h in H), f"{H[0]['ISP_Net']} / {H[1]['ISP_Net']} / {H[-1]['ISP_Net']}")
    hi, ti = sum(h["ISP_Net"] for h in H), sum(day["Totals"]["ISP"].values())
    check(f"{d}: ISP χωρίς Κρήτη (D27): άθροισμα ωρών = σύνολο χωρών (ίδιο 24ωρο με το SCADA, D33)", abs(hi - ti) < 0.05, f"{hi:.0f} / {ti:.0f}")

check("επικεφαλίδα SCADA με 25 στήλες σε ημέρες 23 / 24 ωρών: καμία προειδοποίηση (D28)", not any("SCADA" in m for m in logs), str([m for m in logs if "SCADA" in m]))

# η 25η στήλη έχει τιμή σε γραμμή που ΔΙΑΒΑΖΟΥΜΕ: πρέπει να προειδοποιήσει (D31)
df_bad = scada_df(24)
imp_row = df_bad.index[df_bad[1] == U.COUNTRY_MAP[0][1] + "_IMP"][0]
df_bad.iloc[imp_row, 2 + 24] = 99.0
logs2 = []
with mock.patch.object(U, "log", lambda m: logs2.append(m)):
    used = [kw.upper() + sfx for _, kw, _, _ in U.COUNTRY_MAP for sfx in ("_IMP", "_EXP")] + ["EXPORTS-IMPORTS"]
    cols = U.scada_hour_cols(df_bad, 24, used)
check("τιμή στη 25η στήλη γραμμής που διαβάζουμε: προειδοποίηση (D31)", len(cols) == 24 and any("πέρα από" in m for m in logs2), str(logs2))

# μνήμη ISP (D33): δύο συνεχόμενες ημέρες → 3 αρχεία ISP, όχι 4
calls = []
def fake_fetch(ds, cat):
    calls.append((cat, ds))
    return ("ISP" if cat.startswith("ISP") else "SCADA", ds)
F2 = {("ISP", x): {"I": isp_df(U.hours_in_day(x))} for x in ("2026-10-28", "2026-10-29", "2026-10-30")}
F2.update({("SCADA", x): {"S": scada_df(24)} for x in ("2026-10-29", "2026-10-30")})
U.ISP_CACHE.clear()
with mock.patch.object(U, "fetch_admie_excel", fake_fetch), mock.patch.object(U, "read_excel_safe", lambda f, what: F2[f]), \
     mock.patch.object(U, "fetch_entsoe_mcp", lambda ds, c: [50.0] * 24), mock.patch.object(U, "log", lambda m: None):
    U.process_day("2026-10-29"); U.process_day("2026-10-30")
n_isp = sum(1 for c, _ in calls if c.startswith("ISP"))
check("δύο συνεχόμενες ημέρες: 3 λήψεις ISP (η κοινή μία φορά)", n_isp == 3, f"{n_isp} λήψεις")

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
