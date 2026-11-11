#!/usr/bin/env python3
"""
Ανίχνευση (D40): ποια στοιχεία ικανότητας μεταφοράς δημοσιεύει το ENTSO-E για τα ελληνικά σύνορα.
ΔΕΝ γράφει τίποτα στα δεδομένα· τυπώνει μόνο στο log ό,τι βρει, ώστε να επιλεγεί η σωστή πηγή για το batch του NTC.

Τρέχει από το workflow «Probe ENTSO-E capacity» (workflow_dispatch) με το ίδιο ENTSOE_TOKEN.
Ημέρες: PROBE_DATES (π.χ. "2026-10-05,2026-10-29,2026-11-10"). Το token δεν τυπώνεται ποτέ.

Για κάθε σύνορο και κατεύθυνση δοκιμάζει:
  A61  Forecasted transfer capacity, day ahead (NTC)            contract_MarketAgreement.Type=A01
  A31  Offered capacity, implicit auction (σύζευξη αγορών)        auction.Type=A01, contract=A01
  A31  Offered capacity, explicit auction (ρητή δημοπρασία)       auction.Type=A02, contract=A01
  A09  Finalised schedule, day ahead (εμπορικό πρόγραμμα)        contract_MarketAgreement.Type=A01
Έλεγχος αναφοράς: στις 5 Οκτ 2026 το ΕΛ→ΒΓ αναμένεται 500 MW περίπου 08:00–18:00 ώρα Ελλάδας (D39).
"""
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_flows as U  # noqa: E402

GR = "10YGR-HTSO-----Y"
BORDERS = {
    "BG": "10YCA-BULGARIA-R",
    "IT": "10Y1001A1001A788",          # IT-South, όπως οι τιμές του Flows
    "IT-GR": "10Y1001A1001A66F",       # εναλλακτικός κωδικός της διασύνδεσης (δοκιμή)
    "AL": "10YAL-KESH-----5",
    "MK": "10YMK-MEPSO----8",
    "TR": "10YTR-TEIAS----W",
}
QUERIES = [
    ("A61 NTC d-a", "documentType=A61&contract_MarketAgreement.Type=A01"),
    ("A31 offered impl.", "documentType=A31&auction.Type=A01&contract_MarketAgreement.Type=A01"),
    ("A31 offered expl.", "documentType=A31&auction.Type=A02&contract_MarketAgreement.Type=A01"),
    ("A09 schedule d-a", "documentType=A09&contract_MarketAgreement.Type=A01"),
]


def parse(xml_text, start_utc, n_hours):
    """Ωριαίες τιμές (μέσος όρος των σημείων κάθε ώρας, ώρα Ελλάδας) ή ο λόγος που δεν υπάρχουν."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None, "μη αναγνώσιμη απάντηση"
    ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
    if "Acknowledgement" in root.tag:
        txt = " ".join((e.text or "").strip() for e in root.iter() if e.tag.endswith("text"))
        return None, ("ack: " + txt)[:120]
    buckets = [[] for _ in range(n_hours)]
    res_seen = set()
    for period in root.iter(ns + "Period"):
        st = period.find(f"{ns}timeInterval/{ns}start")
        rs = period.find(f"{ns}resolution")
        if st is None or rs is None:
            continue
        t0 = datetime.strptime(st.text.replace("Z", ""), "%Y-%m-%dT%H:%M")
        step = {"PT15M": 15, "PT30M": 30, "PT60M": 60, "P1D": 1440}.get(rs.text, 60)
        res_seen.add(rs.text)
        for pt in period.findall(ns + "Point"):
            pos = int(pt.find(ns + "position").text)
            q = pt.find(ns + "quantity")
            if q is None:
                continue
            t = t0 + timedelta(minutes=(pos - 1) * step)
            span = max(1, step // 60) if step >= 60 else 1
            for k in range(span if step >= 60 else 1):
                h = int((t - start_utc).total_seconds() // 3600) + k
                if 0 <= h < n_hours:
                    buckets[h].append(float(q.text))
    hourly = [round(sum(b) / len(b)) if b else None for b in buckets]
    if all(v is None for v in hourly):
        return None, f"χωρίς σημεία ({','.join(sorted(res_seen)) or '–'})"
    return hourly, ",".join(sorted(res_seen))


def main():
    if not U.ENTSOE_TOKEN:
        print("Λείπει το ENTSOE_TOKEN")
        return
    dates = [d.strip() for d in (os.environ.get("PROBE_DATES") or "2026-10-05,2026-10-29,2026-11-10").split(",") if d.strip()]
    for date in dates:
        start, end, n = U.athens_window_utc(date)          # ώρα Ελλάδας, όπως τα υπόλοιπα (D33)
        ps, pe = start.strftime("%Y%m%d%H00"), end.strftime("%Y%m%d%H00")
        print(f"\n===== {date} (ώρα Ελλάδας, {n} ώρες) =====")
        for code, eic in BORDERS.items():
            for direction, (out_d, in_d) in (("ΕΛ→" + code, (GR, eic)), (code + "→ΕΛ", (eic, GR))):
                for name, q in QUERIES:
                    url = (f"https://web-api.tp.entsoe.eu/api?securityToken={U.ENTSOE_TOKEN}&{q}"
                           f"&in_Domain={in_d}&out_Domain={out_d}&periodStart={ps}&periodEnd={pe}")
                    r = U.http_get(url, what=f"{name} {direction}")
                    if r is None:
                        print(f"{direction:9s} {name:18s} σφάλμα σύνδεσης")
                        continue
                    hourly, info = parse(r.text, start, n) if r.status_code == 200 else (None, f"HTTP {r.status_code}")
                    if hourly is None:
                        print(f"{direction:9s} {name:18s} — {info}")
                    else:
                        vals = [v for v in hourly if v is not None]
                        day = " ".join("·" if v is None else str(v) for v in hourly)
                        print(f"{direction:9s} {name:18s} ✔ {len(vals)}/{n} ώρες, {info}, min {min(vals)} max {max(vals)} | {day}")
                    time.sleep(0.4)
    print("\nΤέλος ανίχνευσης. Τίποτα δεν γράφτηκε στα δεδομένα.")


if __name__ == "__main__":
    main()
