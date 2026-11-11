import os
import io
import json
import math
import time
import re
import requests
import pandas as pd
import numpy as np
import warnings
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

warnings.filterwarnings("ignore", message="Workbook contains no default style")

# ---------------------------------------------------------------------------
# ΑΡΧΗ ΛΕΙΤΟΥΡΓΙΑΣ ΑΥΤΟΥ ΤΟΥ ΑΡΧΕΙΟΥ
#   * Ό,τι ΔΕΝ βρίσκεται / δεν διαβάζεται γράφεται ως null (κενό), ΠΟΤΕ ως 0.
#   * Μια ημέρα που είχε ήδη σωστά δεδομένα ΔΕΝ αντικαθίσταται από κενά.
#   * Κάθε αποτυχία γράφεται στο log του GitHub Actions (χωρίς το token).
# ---------------------------------------------------------------------------

ENTSOE_TOKEN = os.environ.get("ENTSOE_TOKEN")

ENTSOE_DOMAINS = {
    "GR": "10YGR-HTSO-----Y",
    "BG": "10YCA-BULGARIA-R",
    "IT": "10Y1001A1001A788",
}

COUNTRIES = ["Albania", "Bulgaria", "Italy", "North Macedonia", "Turkey"]
# (όνομα χώρας, λέξη-κλειδί στο SCADA, κωδικός στο JSON, λέξη-κλειδί στο ISP)
COUNTRY_MAP = [
    ("Albania", "ΑΛΒΑΝΙΑ", "AL", "ALBANIA"),
    ("Bulgaria", "ΒΟΥΛΓΑΡΙΑ", "BG", "BULGARIA"),
    ("Italy", "ΙΤΑΛΙΑ", "IT", "ITALY"),
    ("North Macedonia", "FYROM", "MK", "MACEDONIA"),
    ("Turkey", "ΤΟΥΡΚΙΑ", "TR", "TURKEY"),
]
SCADA_FIELDS = ["SCADA_Net", "SCADA_AL", "SCADA_BG", "SCADA_IT", "SCADA_MK", "SCADA_TR"]
ISP_FIELDS = ["ISP_Net"]
MCP_FIELDS = ["MCP_GR", "MCP_BG", "MCP_IT"]

# Η ενημέρωση ξεκινά ΜΟΝΟ από το εξωτερικό cron-job.org, κάθε μέρα στις 07:02 ώρα Ελλάδος (D05).
# Αν αλλάξει η ώρα στο cron-job.org, αλλάζει και εδώ (το «Επόμενη ενημέρωση» της σελίδας βγαίνει από αυτήν).
ATHENS = ZoneInfo("Europe/Athens")
UPDATE_TIME_ATHENS = (7, 2)
META_PATH = "data/meta.json"

# Αν μια "ημέρα τιμών" έχει πάνω από τόσες μηδενικές ώρες θεωρείται χαλασμένη
MAX_ZERO_PRICE_HOURS = 12


def log(msg):
    print(msg, flush=True)


def http_get(url, headers=None, tries=3, what=""):
    """GET με επανάληψη. Δεν τυπώνει ποτέ το URL (περιέχει το token)."""
    for attempt in range(1, tries + 1):
        try:
            res = requests.get(url, headers=headers, timeout=20)
            return res
        except Exception as e:
            log(f"   ! {what}: αποτυχία σύνδεσης ({type(e).__name__}), προσπάθεια {attempt}/{tries}")
            time.sleep(2 * attempt)
    return None


# ---------------------------------------------------------------------------
# ENTSO-E
# ---------------------------------------------------------------------------
# Η ημέρα της αγοράς (SDAC) ορίζεται σε ώρα CET/CEST (Βρυξέλλες). Οι ημέρες αλλαγής ώρας έχουν
# 23 (τελευταία Κυριακή Μαρτίου) ή 25 ώρες (τελευταία Κυριακή Οκτωβρίου)· ίδια ημερομηνία και για την Ελλάδα (D26).
MARKET_TZ = ZoneInfo("Europe/Brussels")


def day_window_utc(date_str):
    """(start_utc, end_utc, n_hours) της ημέρας αγοράς· naive UTC datetimes, όπως τα χρησιμοποιεί ο κώδικας ENTSO-E."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    nxt = d + timedelta(days=1)
    start = datetime(d.year, d.month, d.day, tzinfo=MARKET_TZ).astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime(nxt.year, nxt.month, nxt.day, tzinfo=MARKET_TZ).astimezone(timezone.utc).replace(tzinfo=None)
    return start, end, int(round((end - start).total_seconds() / 3600))


def hours_in_day(date_str):
    return day_window_utc(date_str)[2]


def athens_window_utc(date_str):
    """(start_utc, end_utc, n_hours) της ημέρας σε ώρα Ελλάδας (D33). Όλα τα ωριαία αποθηκεύονται σε αυτό το 24ωρο:
    ώρα 00–01 Ελλάδας = 23:00–24:00 CET της προηγούμενης ημέρας αγοράς. Ίδιο πλήθος ωρών με την ημέρα αγοράς
    (η αλλαγή ώρας γίνεται την ίδια στιγμή σε Ελλάδα και Βρυξέλλες)."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    nxt = d + timedelta(days=1)
    start = datetime(d.year, d.month, d.day, tzinfo=ATHENS).astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime(nxt.year, nxt.month, nxt.day, tzinfo=ATHENS).astimezone(timezone.utc).replace(tzinfo=None)
    return start, end, int(round((end - start).total_seconds() / 3600))


def prev_day(date_str):
    return (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")


def get_entsoe_period(date_str):
    start, end, _ = day_window_utc(date_str)
    return start.strftime("%Y%m%d%H00"), end.strftime("%Y%m%d%H00")


def parse_entsoe_time(txt):
    txt = txt.replace('Z', '')
    if len(txt) == 16:
        return datetime.strptime(txt, "%Y-%m-%dT%H:%M")
    return datetime.strptime(txt[:19], "%Y-%m-%dT%H:%M:%S")


# Τεταρτάωρα τιμών ανά (ημέρα, χώρα), σε ώρα Ελλάδας: για τη σύζευξη ανά τέταρτο (D34)
MCP_QUARTERS = {}


def fetch_entsoe_mcp(date_str, country_code):
    """Μία τιμή ανά ώρα της ημέρας σε ώρα ΕΛΛΑΔΑΣ (23, 24 ή 25· D33). Όπου λείπει τιμή -> None (όχι 0).
    Η αγορά δίνει τιμές ανά ημέρα CET· ζητούνται δύο ημέρες αγοράς (χθες και σήμερα) και κρατιούνται οι θέσεις
    από τα μεσάνυχτα Ελλάδας (= 23:00 CET χθες) για n_hours ώρες."""
    target_start_utc, _, n_hours = athens_window_utc(date_str)
    n_q = n_hours * 4
    empty = [None] * n_hours
    if not ENTSOE_TOKEN:
        log(f"   ! MCP {country_code}: δεν υπάρχει ENTSOE_TOKEN")
        return empty
    domain = ENTSOE_DOMAINS[country_code]
    periodStart = get_entsoe_period(prev_day(date_str))[0]
    periodEnd = get_entsoe_period(date_str)[1]

    url = (f"https://web-api.tp.entsoe.eu/api?securityToken={ENTSOE_TOKEN}&documentType=A44"
           f"&in_Domain={domain}&out_Domain={domain}&periodStart={periodStart}&periodEnd={periodEnd}")
    res = http_get(url, what=f"MCP {country_code}")
    if res is None:
        return empty
    try:
        if res.status_code != 200 or "<Reason>" in res.text:
            m = re.search(r"<text>(.*?)</text>", res.text, re.S)
            reason = m.group(1).strip()[:120] if m else ""
            log(f"   ! MCP {country_code}: ENTSO-E status {res.status_code} {reason}")
            return empty

        root = ET.fromstring(res.text)
        ns = {'ns': root.tag.split('}')[0].strip('{')}
        quarters = [None] * n_q

        for ts in root.findall('ns:TimeSeries', ns):
            business_type = ts.find('ns:businessType', ns)
            if business_type is not None and business_type.text != "A62":
                continue
            currency = ts.find('ns:currency_Unit.name', ns)
            if currency is not None and currency.text != "EUR":
                continue
            period = ts.find('ns:Period', ns)
            if period is None:
                continue

            period_start_utc = parse_entsoe_time(period.find('ns:timeInterval/ns:start', ns).text)
            resolution = period.find('ns:resolution', ns).text
            if resolution == "PT15M":
                step_min = 15
            elif resolution == "PT60M":
                step_min = 60
            else:
                continue

            # Το ENTSO-E ΔΕΝ στέλνει τα σημεία όπου η τιμή είναι ίδια με το προηγούμενο
            # σημείο (curve type A03). Οι θέσεις που λείπουν παίρνουν την προηγούμενη τιμή.
            points = {}
            for point in period.findall('ns:Point', ns):
                points[int(point.find('ns:position', ns).text)] = float(point.find('ns:price.amount', ns).text)
            if not points:
                continue
            try:
                period_end_utc = parse_entsoe_time(period.find('ns:timeInterval/ns:end', ns).text)
                n_pos = int((period_end_utc - period_start_utc).total_seconds() // 60 // step_min)
            except Exception:
                n_pos = max(points)
            n_pos = max(n_pos, max(points))

            last_price = None
            for pos in range(1, n_pos + 1):
                if pos in points:
                    last_price = points[pos]
                if last_price is None:
                    continue
                point_time = period_start_utc + timedelta(minutes=step_min * (pos - 1))
                diff_minutes = int((point_time - target_start_utc).total_seconds() // 60)
                if step_min == 15:
                    idx = diff_minutes // 15
                    if 0 <= idx < n_q:
                        quarters[idx] = last_price
                else:
                    if 0 <= diff_minutes < n_hours * 60:
                        start_idx = (diff_minutes // 60) * 4
                        for i in range(4):
                            if quarters[start_idx + i] is None:
                                quarters[start_idx + i] = last_price

        hourly = []
        for h in range(n_hours):
            q_slice = quarters[h * 4: h * 4 + 4]
            valid = [q for q in q_slice if q is not None]
            # Ώρα θεωρείται έγκυρη ΜΟΝΟ αν έχουμε και τα 4 τεταρτάωρα
            hourly.append(round(sum(valid) / 4, 2) if len(valid) == 4 else None)

        missing = sum(1 for v in hourly if v is None)
        if missing:
            log(f"   ! MCP {country_code}: λείπουν {missing} από {n_hours} ώρες")
        MCP_QUARTERS[(date_str, country_code)] = quarters
        return hourly
    except Exception as e:
        log(f"   ! MCP {country_code}: σφάλμα ανάγνωσης ({type(e).__name__})")
        return empty


# ---------------------------------------------------------------------------
# ADMIE
# ---------------------------------------------------------------------------
LAST_ADMIE_FILE = {}


def fetch_admie_excel(date_str, category):
    url = f"https://www.admie.gr/getOperationMarketFile?dateStart={date_str}&dateEnd={date_str}&FileCategory={category}"
    headers = {"User-Agent": "Mozilla/5.0"}
    res = http_get(url, headers=headers, what=f"ADMIE {category}")
    if res is None:
        return None
    try:
        if res.status_code != 200:
            log(f"   ! ADMIE {category}: status {res.status_code}")
            return None
        data = res.json()
        if not data:
            log(f"   ! ADMIE {category}: δεν υπάρχει αρχείο για {date_str} (ίσως δεν έχει δημοσιευτεί ακόμα)")
            return None
        file_path = data[0].get("file_path")
        LAST_ADMIE_FILE[category] = f"{len(data)} αρχείο(α) για την ημέρα, χρησιμοποιείται το πρώτο: {os.path.basename(str(file_path))}"
        if file_path.startswith("/"):
            file_path = "https://www.admie.gr" + file_path
        file_res = http_get(file_path, headers=headers, what=f"ADMIE {category} αρχείο")
        if file_res is None or file_res.status_code != 200:
            log(f"   ! ADMIE {category}: αποτυχία λήψης αρχείου")
            return None
        return io.BytesIO(file_res.content)
    except Exception as e:
        log(f"   ! ADMIE {category}: σφάλμα ({type(e).__name__})")
        return None


def extract_last_col_val(df, keyword, col_index):
    """Τελευταία μη-κενή τιμή της γραμμής. None αν δεν βρεθεί / δεν είναι αριθμός."""
    try:
        row = df[df[col_index].astype(str).str.contains(keyword, case=False, na=False)]
        if row.empty:
            return None
        vals = row.iloc[0].dropna().values
        if len(vals) == 0:
            return None
        return float(vals[-1])
    except Exception:
        return None


ISP_CBS_SECTION = "Total Market CBS (+XBID)"
ISP_CBS_SECTION_END_LABELS = ["Net Border Deviations", "Total Market Schedules"]


def extract_isp_country_totals(df):
    """Οι χώρες εμφανίζονται 3 φορές στο αρχείο ISP (Auction CBS, Total Market CBS +XBID,
    Net Border Deviations) με το ΙΔΙΟ όνομα. Θέλουμε μόνο το 'Total Market CBS (+XBID)',
    που είναι το τελικό πρόγραμμα (περιλαμβάνει και τις προσαρμογές ενδοημερήσιας αγοράς).
    Η πρώτη εμφάνιση (Auction CBS) είναι μόνο η ημερήσια δημοπρασία, ΠΡΙΝ το XBID, και
    διαφέρει από το τελικό όταν υπήρξε ενδοημερήσιο trading σε μια χώρα εκείνη τη μέρα."""
    headers = df.index[df[0].astype(str) == ISP_CBS_SECTION].tolist()
    if not headers:
        return None, "δεν βρέθηκε η ενότητα 'Total Market CBS (+XBID)'"
    start = headers[0] + 1
    end_candidates = df.index[(df.index > headers[0]) & (df[0].astype(str).isin(ISP_CBS_SECTION_END_LABELS))]
    end = min(end_candidates.min(), start + 10) if len(end_candidates) else start + 10
    window = df.iloc[start:end]

    totals = {}
    for name, _, _, kw in COUNTRY_MAP:
        match = window[window[0].astype(str).str.contains(kw, case=False, na=False)]
        if match.empty:
            return None, f"δεν βρέθηκε η {name} μέσα στην ενότητα 'Total Market CBS (+XBID)'"
        vals = match.iloc[0].dropna().values
        if len(vals) == 0:
            return None, f"η γραμμή της {name} είναι κενή"
        totals[name] = float(vals[-1]) * -1
    return totals, None


def extract_isp_country_quarters(df, n_hours, totals):
    """Τα τεταρτάωρα (MW) κάθε χώρας από τις ΙΔΙΕΣ γραμμές με τα σύνολα ('Total Market CBS (+XBID)'), D27.
    Η γραμμή 'Net CBS Schedules' περιλαμβάνει και τη ροή προς Κρήτη (AC + DC, ≈ 280 MW), που ΔΕΝ είναι
    διασυνοριακή ροή· εδώ μένει έξω, όπως στα σύνολα και στο SCADA. Κάθε χώρα ελέγχεται ότι
    Σ(τεταρτάωρα)/4 = σύνολο (MWh). Επιστρέφει ({χώρα: τεταρτάωρα}, None) ή (None, λόγος). Ρολόι: ημέρα αγοράς (CET)."""
    headers = df.index[df[0].astype(str) == ISP_CBS_SECTION].tolist()
    if not headers or totals is None:
        return None, "δεν υπάρχουν σύνολα χωρών από την ενότητα 'Total Market CBS (+XBID)'"
    start = headers[0] + 1
    end_candidates = df.index[(df.index > headers[0]) & (df[0].astype(str).isin(ISP_CBS_SECTION_END_LABELS))]
    end = min(end_candidates.min(), start + 10) if len(end_candidates) else start + 10
    window = df.iloc[start:end]
    q_cols = isp_quarter_cols(df, n_hours)
    out = {}
    for name, _, _, kw in COUNTRY_MAP:
        match = window[window[0].astype(str).str.contains(kw, case=False, na=False)]
        if match.empty:
            return None, f"δεν βρέθηκε η {name}"
        q = np.nan_to_num(match.iloc[0, q_cols].values.astype(float))
        mwh = float(q.sum()) / 4 * -1
        tot = totals.get(name)
        if tot is None or abs(mwh - tot) > max(2.0, 0.01 * abs(tot)):
            return None, f"{name}: Σ τεταρτάωρων/4 = {mwh:.0f} ≠ σύνολο {tot} MWh"
        out[name] = q
    return out, None


ISP_CACHE = {}


def isp_market_day(date_str):
    """Το ISP μιας ημέρας αγοράς (CET), μία λήψη ανά τρέξιμο: τεταρτάωρα ανά χώρα (χωρίς Κρήτη) ή, εφεδρικά,
    η γραμμή Net CBS Schedules (με Κρήτη). Επιστρέφει dict ή None αν δεν υπάρχει αρχείο."""
    if date_str in ISP_CACHE:
        return ISP_CACHE[date_str]
    out = None
    n = hours_in_day(date_str)
    f = fetch_admie_excel(date_str, "ISP2ISPResults")
    if f:
        sheets = read_excel_safe(f, "ISP")
        df = pick_sheet(sheets, 0, "Net CBS Schedules", "ISP")
        if df is not None:
            totals, err = extract_isp_country_totals(df)
            cq, why = extract_isp_country_quarters(df, n, totals)
            net_q = None
            cbs_row = df[df[0] == 'Net CBS Schedules']
            if not cbs_row.empty:
                net_q = np.nan_to_num(cbs_row.iloc[0, isp_quarter_cols(df, n)].values.astype(float))
            out = {"n": n, "country_q": cq, "why": why or err, "net_q": net_q}
    ISP_CACHE[date_str] = out
    return out


def find_header_cols(df, marker):
    """Η γραμμή επικεφαλίδας που περιέχει το marker ('SUM' / 'TOTAL'): (λίστα κελιών, στήλη του marker)."""
    for idx in range(len(df)):
        cells = [str(c).strip().upper() for c in df.iloc[idx].tolist()]
        if marker in cells:
            return df.iloc[idx].tolist(), cells.index(marker)
    return None, None


def scada_hour_cols(df, n_hours, used_labels=None):
    """Οι στήλες των ωρών του SCADA, με τη σειρά (D26, D28). Από την επικεφαλίδα: οι αριθμοί 1…25 πριν από τη στήλη SUM,
    που δεν διαβάζεται ποτέ ως ώρα· το αρχείο έχει ΠΑΝΤΑ 25 στήλες ωρών (η 25η κενή στις κανονικές ημέρες), οπότε
    κρατούνται οι πρώτες n_hours. Χωρίς επικεφαλίδα: οι n_hours στήλες μετά το όνομα (στήλη 2 και μετά)."""
    header, sum_col = find_header_cols(df, "SUM")
    cols = []
    if header is not None:
        for c, v in enumerate(header[:sum_col]):
            try:
                n = float(v)
            except (TypeError, ValueError):
                continue
            if n.is_integer() and 1 <= n <= 25:
                cols.append(c)
    if len(cols) >= n_hours:
        extra = cols[n_hours:]
        if extra:
            hdr_row = next(i for i in range(len(df)) if "SUM" in [str(c).strip().upper() for c in df.iloc[i].tolist()])
            rows = df.iloc[hdr_row + 1:]
            if used_labels:
                # D31: μόνο οι γραμμές που διαβάζουμε (εισαγωγές / εξαγωγές ανά χώρα, EXPORTS-IMPORTS)·
                # από τις 18 Ιουν 2026 το αρχείο έχει κι άλλες γραμμές με τιμή στη 25η στήλη
                lab = rows[1].astype(str).str.upper()
                rows = rows[lab.apply(lambda v: any(k in v for k in used_labels))]
            vals = pd.to_numeric(rows.iloc[:, extra].stack(), errors="coerce").dropna()
            if (vals != 0).any():
                log(f"   ! SCADA: οι στήλες ωρών πέρα από την {n_hours}η έχουν τιμές· κρατούνται οι πρώτες {n_hours}")
        return cols[:n_hours]
    if header is not None:
        log(f"   ! SCADA: η επικεφαλίδα έχει {len(cols)} ώρες, η ημέρα {n_hours}· χρησιμοποιούνται οι {n_hours} στήλες μετά το όνομα")
    return list(range(2, 2 + n_hours))


def extract_hourly_vals(df, keyword, col_index, hour_cols):
    """Μία τιμή ανά ώρα της ημέρας για μια γραμμή. None αν δεν βρεθεί η γραμμή."""
    try:
        row = df[df[col_index].astype(str).str.contains(keyword, case=False, na=False)]
        if row.empty:
            return None
        return np.nan_to_num(row.iloc[0, hour_cols].values.astype(float))
    except Exception:
        return None


def isp_quarter_cols(df, n_hours):
    """Οι στήλες των τεταρτάωρων του ISP (D26): από τη στήλη 1 μέχρι πριν από τη στήλη TOTAL, αν υπάρχει
    επικεφαλίδα και δίνει n_hours × 4 τεταρτάωρα· αλλιώς οι n_hours × 4 στήλες μετά το όνομα."""
    n_q = n_hours * 4
    _, total_col = find_header_cols(df, "TOTAL")
    if total_col is not None and total_col - 1 == n_q:
        return list(range(1, total_col))
    return list(range(1, 1 + n_q))


def read_excel_safe(fileobj, what):
    """Διαβάζει ΟΛΑ τα φύλλα του αρχείου (τα ADMIE .xls έχουν πάνω από ένα,
    π.χ. System_Production + XDO_METADATA, και η σειρά τους ΔΕΝ είναι σταθερή)."""
    try:
        return pd.read_excel(fileobj, header=None, sheet_name=None)
    except Exception as e:
        log(f"   ! {what}: το αρχείο δεν διαβάστηκε ({type(e).__name__})")
        return None


def pick_sheet(sheets, anchor_col, anchor_value, what):
    """Επιστρέφει το φύλλο που περιέχει πραγματικά τα δεδομένα, ψάχνοντας
    για μια γνωστή ετικέτα (π.χ. 'EXPORTS-IMPORTS'), ΟΧΙ με βάση τη θέση του φύλλου."""
    if sheets is None:
        return None
    for sheet_name, df in sheets.items():
        try:
            if anchor_col not in df.columns:
                continue
            if (df[anchor_col].astype(str) == anchor_value).any():
                return df
        except Exception:
            continue
    log(f"   ! {what}: καμία από τις καρτέλες του αρχείου ({list(sheets.keys())}) δεν περιέχει '{anchor_value}'")
    return None


_LAYOUT_LOGGED = {"done": False}


def log_layout(df):
    """Διάγνωση (μία φορά ανά εκτέλεση): τι περιέχει το αρχείο όταν δεν βρίσκουμε τις γραμμές που περιμένουμε."""
    if _LAYOUT_LOGGED["done"]:
        return
    _LAYOUT_LOGGED["done"] = True
    try:
        log(f"     (διάγνωση) αρχείο: {LAST_ADMIE_FILE.get('SystemRealizationSCADA', '?')}")
        log(f"     (διάγνωση) διαστάσεις πίνακα: {df.shape}")
        for c in (0, 1):
            labels = [str(v)[:30] for v in df[c].dropna().unique()[:40]]
            log(f"     (διάγνωση) στήλη {c}, πρώτες τιμές: {labels}")
    except Exception:
        pass


def none_list(n):
    return [None] * n


# Διασυνδέσεις με σύζευξη αγορών (SDAC): μόνο εκεί έχει νόημα ο κορεσμός με βάση τις τιμές (D34)
COUPLED_CODES = ("BG", "IT")
COUPLING_EUR = 0.01          # |ΕΛ − γείτονας| < 0,01 €/MWh = συζευγμένο τέταρτο


ALL_CODES = ("AL", "BG", "IT", "MK", "TR")
NTC_DOMAINS = {"AL": "10YAL-KESH-----5", "BG": "10YCA-BULGARIA-R", "IT": "10Y1001A1001A788",
               "MK": "10YMK-MEPSO----8", "TR": "10YTR-TEIAS----W"}


def parse_entsoe_series(xml_text, start_utc, n_hours):
    """Ωριαίες τιμές (ώρα Ελλάδας) από έγγραφο ENTSO-E με quantity. Συμπληρώνει τα σημεία που λείπουν (καμπύλη A03:
    το ENTSO-E στέλνει τιμή μόνο όταν αλλάζει) μέχρι το επόμενο σημείο ή το τέλος της περιόδου. None όπου δεν υπάρχει τιμή."""
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return [None] * n_hours
    if "Acknowledgement" in root.tag:
        return [None] * n_hours
    ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
    buckets = [[] for _ in range(n_hours)]
    for period in root.iter(ns + "Period"):
        st, en = period.find(f"{ns}timeInterval/{ns}start"), period.find(f"{ns}timeInterval/{ns}end")
        rs = period.find(f"{ns}resolution")
        if st is None or en is None or rs is None:
            continue
        t0 = datetime.strptime(st.text.replace("Z", ""), "%Y-%m-%dT%H:%M")
        t1 = datetime.strptime(en.text.replace("Z", ""), "%Y-%m-%dT%H:%M")
        step = {"PT15M": 15, "PT30M": 30, "PT60M": 60}.get(rs.text)
        if not step:
            continue
        n_steps = int((t1 - t0).total_seconds() // 60 // step)
        vals = {}
        for pt in period.findall(ns + "Point"):
            q = pt.find(ns + "quantity")
            if q is not None:
                vals[int(pt.find(ns + "position").text)] = float(q.text)
        last = None
        for pos in range(1, n_steps + 1):
            last = vals.get(pos, last)
            if last is None:
                continue
            t = t0 + timedelta(minutes=(pos - 1) * step)
            h = int((t - start_utc).total_seconds() // 3600)
            if 0 <= h < n_hours:
                buckets[h].append(last)
    return [round(sum(b) / len(b)) if b else None for b in buckets]


NTC_CACHE = {}
NTC_CHUNK_DAYS = 31


def ntc_url(out_d, in_d, start, end):
    return (f"https://web-api.tp.entsoe.eu/api?securityToken={ENTSOE_TOKEN}&documentType=A61"
            f"&contract_MarketAgreement.Type=A01&in_Domain={in_d}&out_Domain={out_d}"
            f"&periodStart={start:%Y%m%d%H00}&periodEnd={end:%Y%m%d%H00}")


def prefetch_ntc(dates):
    """D42: το NTC όλων των ημερών του τρεξίματος με ΕΝΑ αίτημα ανά σύνορο και κατεύθυνση (κομμάτια ≤ 31 ημερών),
    αντί για 10 αιτήματα ανά ημέρα (≈ 2 λεπτά / ημέρα στο ENTSO-E). Γεμίζει το NTC_CACHE[(ημέρα, χώρα)]."""
    if not ENTSOE_TOKEN or not dates:
        return
    days = sorted(set(dates))
    for k in range(0, len(days), NTC_CHUNK_DAYS):
        chunk = days[k:k + NTC_CHUNK_DAYS]
        c_start = athens_window_utc(chunk[0])[0]
        c_end = athens_window_utc(chunk[-1])[1]
        total = int((c_end - c_start).total_seconds() // 3600)
        for code in ALL_CODES:
            series = []
            for out_d, in_d in ((ENTSOE_DOMAINS["GR"], NTC_DOMAINS[code]), (NTC_DOMAINS[code], ENTSOE_DOMAINS["GR"])):
                r = http_get(ntc_url(out_d, in_d, c_start, c_end), what=f"NTC {code}")
                series.append(parse_entsoe_series(r.text, c_start, total) if (r is not None and r.status_code == 200) else [None] * total)
            for dd in chunk:
                d_start, _, n = athens_window_utc(dd)
                off = int((d_start - c_start).total_seconds() // 3600)
                NTC_CACHE[(dd, code)] = (series[0][off:off + n], series[1][off:off + n])
    log(f"NTC: {len(days)} ημέρες × {len(ALL_CODES)} σύνορα από το ENTSO-E σε {((len(days) - 1) // NTC_CHUNK_DAYS + 1) * len(ALL_CODES) * 2} αιτήματα")


def fetch_entsoe_ntc(date_str, code):
    """D41: ικανότητα μεταφοράς επόμενης ημέρας (Forecasted Transfer Capacity, A61) για ΕΛ→χώρα και χώρα→ΕΛ, ανά ώρα
    σε ώρα Ελλάδας. Επιστρέφει (εξαγωγή, εισαγωγή)· λίστες με None αν δεν υπάρχει. Πρώτα από το NTC_CACHE (D42)."""
    if (date_str, code) in NTC_CACHE:
        exp_h, imp_h = NTC_CACHE[(date_str, code)]
        if all(v is None for v in exp_h + imp_h):
            log(f"   ! NTC {code}: χωρίς στοιχεία")
        return exp_h, imp_h
    start, end, n = athens_window_utc(date_str)
    empty = ([None] * n, [None] * n)
    if not ENTSOE_TOKEN:
        return empty
    ps, pe = start.strftime("%Y%m%d%H00"), end.strftime("%Y%m%d%H00")
    out = []
    for out_d, in_d in ((ENTSOE_DOMAINS["GR"], NTC_DOMAINS[code]), (NTC_DOMAINS[code], ENTSOE_DOMAINS["GR"])):
        url = (f"https://web-api.tp.entsoe.eu/api?securityToken={ENTSOE_TOKEN}&documentType=A61"
               f"&contract_MarketAgreement.Type=A01&in_Domain={in_d}&out_Domain={out_d}&periodStart={ps}&periodEnd={pe}")
        r = http_get(url, what=f"NTC {code}")
        out.append(parse_entsoe_series(r.text, start, n) if (r is not None and r.status_code == 200) else [None] * n)
    if all(v is None for v in out[0] + out[1]):
        log(f"   ! NTC {code}: χωρίς στοιχεία")
    return out[0], out[1]


def rle(values):
    """Συμπίεση ωριαίας λίστας σε αλλαγές τιμής: [[ώρα, τιμή], …] (το NTC αλλάζει λίγες φορές τη μέρα). [] = καμία τιμή."""
    out, prev = [], object()
    for i, v in enumerate(values):
        if v != prev:
            out.append([i, v])
            prev = v
    return [] if all(v is None for v in values) else out


def unrle(pairs, n):
    """Αντίστροφο του rle: ωριαία λίστα n θέσεων."""
    vals, cur, j = [], None, 0
    for i in range(n):
        while j < len(pairs) and pairs[j][0] <= i:
            cur = pairs[j][1]
            j += 1
        vals.append(cur)
    return vals if pairs else [None] * n


def coupling_by_hour(q_gr, q_x, n_hours):
    """Για κάθε ώρα: (συζευγμένα τέταρτα 0–4, μέση διαφορά ΕΛ − γείτονας στα ΑΠΟσυζευγμένα τέταρτα, €/MWh).
    Αρνητική διαφορά = η Ελλάδα φθηνότερη (αναμενόμενη ροή προς τον γείτονα). (None, None) αν λείπει τιμή."""
    out = []
    for h in range(n_hours):
        if not q_gr or not q_x:
            out.append((None, None))
            continue
        g, x = q_gr[h * 4: h * 4 + 4], q_x[h * 4: h * 4 + 4]
        if len(g) < 4 or len(x) < 4 or any(v is None for v in g + x):
            out.append((None, None))
            continue
        dec = [a - b for a, b in zip(g, x) if abs(a - b) >= COUPLING_EUR]
        out.append((4 - len(dec), round(sum(dec) / len(dec), 2) if dec else 0.0))
    return out


def to_list(arr):
    return [None if v is None else float(round(float(v), 2)) for v in arr]


# ---------------------------------------------------------------------------
# Επεξεργασία μιας ημέρας
# ---------------------------------------------------------------------------
def process_day(date_str):
    n_hours = hours_in_day(date_str)
    log(f"Επεξεργασία: {date_str}" + ("" if n_hours == 24 else f"  (ημέρα αλλαγής ώρας: {n_hours} ώρες)"))

    # ---- SCADA -------------------------------------------------------------
    scada_totals = {c: None for c in COUNTRIES}
    scada_net_h = none_list(n_hours)
    scada_country_h = {code: none_list(n_hours) for _, _, code, _ in COUNTRY_MAP}

    scada_file = fetch_admie_excel(date_str, "SystemRealizationSCADA")
    if scada_file:
        sheets = read_excel_safe(scada_file, "SCADA")
        df = pick_sheet(sheets, 1, "EXPORTS-IMPORTS", "SCADA")
        if df is not None:
            used = [kw.upper() + sfx for _, kw, _, _ in COUNTRY_MAP for sfx in ("_IMP", "_EXP")] + ["EXPORTS-IMPORTS"]
            hour_cols = scada_hour_cols(df, n_hours, used)
            tot, hourly, ok = {}, {}, True
            for name, kw, code, _ in COUNTRY_MAP:
                imp_t = extract_last_col_val(df, kw + "_IMP", 1)
                exp_t = extract_last_col_val(df, kw + "_EXP", 1)
                imp_h = extract_hourly_vals(df, kw + "_IMP", 1, hour_cols)
                exp_h = extract_hourly_vals(df, kw + "_EXP", 1, hour_cols)
                if None in (imp_t, exp_t) or imp_h is None or exp_h is None:
                    ok = False
                    log(f"   ! SCADA: δεν βρέθηκαν γραμμές για {name}")
                    log_layout(df)
                    break
                tot[name] = imp_t - exp_t
                hourly[code] = imp_h - exp_h
            net_row = df[df[1] == 'EXPORTS-IMPORTS']
            net_vals = None
            if not net_row.empty:
                try:
                    net_vals = np.nan_to_num(net_row.iloc[0, hour_cols].values.astype(float)) * -1
                except Exception:
                    net_vals = None
            if net_vals is None:
                ok = False
                log("   ! SCADA: δεν βρέθηκε η γραμμή EXPORTS-IMPORTS")
            if ok:
                # Έλεγχος: το άθροισμα των ωρών πρέπει να είναι το ημερήσιο σύνολο του αρχείου
                h_sum = float(sum(sum(hourly[c]) for c in hourly))
                t_sum = float(sum(tot.values()))
                if abs(h_sum - t_sum) > 2:
                    log(f"   ! SCADA: άθροισμα ωρών {h_sum:.0f} ≠ ημερήσιο σύνολο {t_sum:.0f} MWh")
                scada_totals = tot
                scada_net_h = to_list(net_vals)
                scada_country_h = {code: to_list(hourly[code]) for code in hourly}
            else:
                log("   ! SCADA: η ημέρα καταχωρείται ως ΜΗ ΔΙΑΘΕΣΙΜΗ (κενή)")

    # ---- ISP (σε ώρα Ελλάδας, D33) -------------------------------------------
    # Ώρα 00–01 Ελλάδας = η τελευταία ώρα της προηγούμενης ημέρας αγοράς· οι υπόλοιπες = οι πρώτες n−1 ώρες
    # της σημερινής. Τα σύνολα ανά χώρα είναι το άθροισμα αυτών των ωρών, ίδιο 24ωρο με το SCADA.
    isp_totals = {c: None for c in COUNTRIES}
    isp_net_h = none_list(n_hours)
    isp_country_h = {code: none_list(n_hours) for code in ALL_CODES}
    cur, prv = isp_market_day(date_str), isp_market_day(prev_day(date_str))
    k = (n_hours - 1) * 4
    isp_country_h = {code: none_list(n_hours) for code in ALL_CODES}
    if cur and prv and cur["country_q"] and prv["country_q"]:
        net = np.zeros(n_hours)
        name_to_code = {name: code for name, _, code, _ in COUNTRY_MAP}
        for name in COUNTRIES:
            q = np.concatenate([prv["country_q"][name][-4:], cur["country_q"][name][:k]])
            h = q.reshape(n_hours, 4).mean(axis=1) * -1
            isp_totals[name] = float(round(h.sum(), 2))
            net += h
            if name_to_code[name] in isp_country_h:
                isp_country_h[name_to_code[name]] = to_list(h)       # D34 / D41: πρόγραμμα ανά ώρα, όλα τα σύνορα
        isp_net_h = to_list(net)
    elif cur and prv and cur["net_q"] is not None and prv["net_q"] is not None:
        why = (cur["why"] if not cur["country_q"] else prv["why"])
        log(f"   ! ISP ωριαίο από τις χώρες: {why} — χρησιμοποιείται η Net CBS Schedules (ΜΕ τη ροή προς Κρήτη), χωρίς σύνολα χωρών")
        q = np.concatenate([prv["net_q"][-4:], cur["net_q"][:k]])
        isp_net_h = to_list(q.reshape(n_hours, 4).mean(axis=1) * -1)
    else:
        log("   ! ISP: λείπει το αρχείο της ημέρας ή της προηγούμενης (χρειάζονται και τα δύο για την ώρα Ελλάδας)")

    # ---- Τιμές -------------------------------------------------------------
    mcp = {
        "MCP_GR": fetch_entsoe_mcp(date_str, "GR"),
        "MCP_BG": fetch_entsoe_mcp(date_str, "BG"),
        "MCP_IT": fetch_entsoe_mcp(date_str, "IT"),
    }

    day = {
        "Date": date_str,
        "Totals": {"SCADA": scada_totals, "ISP": isp_totals},
        "Hourly": [],
    }
    coupling = {c: coupling_by_hour(MCP_QUARTERS.get((date_str, "GR")), MCP_QUARTERS.get((date_str, c)), n_hours)
                for c in COUPLED_CODES}
    for hour in range(n_hours):
        row = {
            "Hour": f"H{hour + 1:02d}",
            "SCADA_Net": scada_net_h[hour],
            "ISP_Net": isp_net_h[hour],
            "MCP_GR": mcp["MCP_GR"][hour],
            "MCP_BG": mcp["MCP_BG"][hour],
            "MCP_IT": mcp["MCP_IT"][hour],
        }
        for _, _, code, _ in COUNTRY_MAP:
            row["SCADA_" + code] = scada_country_h[code][hour]
        day["Hourly"].append(row)
    # D34: πρόγραμμα ανά ώρα και σύζευξη ΒΓ / ΙΤ, ως λίστες ανά ημέρα (μικρότερο αρχείο από πεδία σε κάθε ώρα).
    # isp: προγραμματισμένη ροή (MW, + εισαγωγή)· cpl: συζευγμένα τέταρτα 0–4· spr: μέση διαφορά ΕΛ − γείτονας
    # στα αποσυζευγμένα τέταρτα (€/MWh, − = Ελλάδα φθηνότερη). Όλα σε ώρα Ελλάδας.
    day["Market"] = {c: {"isp": isp_country_h[c], "cpl": [v[0] for v in coupling[c]], "spr": [v[1] for v in coupling[c]]}
                     for c in COUPLED_CODES}
    # D41: η ικανότητα μεταφοράς (NTC) όλων των συνόρων από το ENTSO-E, συμπιεσμένη σε αλλαγές τιμής (≈ 1 KB για όλο το
    # ιστορικό). Το πρόγραμμα ΑΛ / ΒΜ / ΤΡ ΔΕΝ αποθηκεύεται (≈ 28 KB gzip, δεν το χρειάζεται καμία ανάλυση· το λέει το NTC).
    for c in ALL_CODES:
        m = day["Market"].setdefault(c, {})
        exp_h, imp_h = fetch_entsoe_ntc(date_str, c)
        m["ntc_exp"], m["ntc_imp"] = rle(exp_h), rle(imp_h)

    day["Flags"] = compute_flags(day)
    return day


# ---------------------------------------------------------------------------
# Βοηθητικά για έλεγχο ποιότητας και συγχώνευση με παλιά δεδομένα
# ---------------------------------------------------------------------------
def series(day, field):
    return [h.get(field) for h in day["Hourly"]]


def set_series(day, field, values):
    for h, v in zip(day["Hourly"], values):
        h[field] = v


def n_valid(vals):
    return sum(1 for v in vals if v is not None)


def any_nonzero(vals):
    return any(v not in (None, 0, 0.0) for v in vals)


def prices_plausible(vals):
    """Τιμές που φαίνονται αληθινές: σχεδόν πλήρεις και όχι γεμάτες μηδενικά."""
    if n_valid(vals) < 20:
        return False
    return sum(1 for v in vals if v == 0) <= MAX_ZERO_PRICE_HOURS


def scada_ok(day):
    t = day["Totals"]["SCADA"]
    return all(t.get(c) is not None for c in COUNTRIES) and n_valid(series(day, "SCADA_Net")) == len(day["Hourly"])


def isp_ok(day):
    t = day["Totals"]["ISP"]
    return all(t.get(c) is not None for c in COUNTRIES) and n_valid(series(day, "ISP_Net")) == len(day["Hourly"])


def price_series_ok(vals, n_hours=None):
    """Μία τιμή για κάθε ώρα της ημέρας (23, 24 ή 25), χωρίς κενά, το πολύ MAX_ZERO_PRICE_HOURS μηδενικά (D10, D26)."""
    if n_hours is None:
        n_hours = len(vals)
    if n_hours not in (23, 24, 25) or len(vals) != n_hours or any(v is None or (isinstance(v, float) and math.isnan(v)) for v in vals):
        return False
    return sum(1 for v in vals if v == 0) <= MAX_ZERO_PRICE_HOURS


def day_complete(day):
    """Ο ΜΟΝΑΔΙΚΟΣ ορισμός της «πλήρους ημέρας» (D13): SCADA, τιμή GR, και τιμή BG / IT
    όταν υπάρχει ροή προς αυτές. Η σελίδα διαβάζει μόνο το Flags.complete."""
    f = day.get("Flags") or {}
    scada = f["scada"] if isinstance(f.get("scada"), bool) else scada_ok(day)
    n = hours_in_day(day["Date"])
    if len(day.get("Hourly", [])) != n:
        return False                                  # π.χ. 25ωρη ημέρα αποθηκευμένη με 24 ώρες (πριν το D26)
    if not scada or not price_series_ok(series(day, "MCP_GR"), n):
        return False
    for c in ("BG", "IT"):
        if any_nonzero(series(day, f"SCADA_{c}")) and not price_series_ok(series(day, f"MCP_{c}"), n):
            return False
    return True


def compute_flags(day):
    return {
        "scada": scada_ok(day),
        "isp": isp_ok(day),
        "mcp_gr": n_valid(series(day, "MCP_GR")),
        "mcp_bg": n_valid(series(day, "MCP_BG")),
        "mcp_it": n_valid(series(day, "MCP_IT")),
    }


def old_scada_good(old):
    t = old.get("Totals", {}).get("SCADA", {})
    return any_nonzero(list(t.values())) or any_nonzero(series(old, "SCADA_Net"))


def old_isp_good(old):
    t = old.get("Totals", {}).get("ISP", {})
    return any_nonzero(list(t.values())) or any_nonzero(series(old, "ISP_Net"))


def merge_with_old(new, old):
    """Δεν αφήνουμε μια αποτυχημένη λήψη να σβήσει σωστά παλιά δεδομένα."""
    d = new["Date"]

    same_hours = len(old.get("Hourly", [])) == len(new["Hourly"])
    if not scada_ok(new) and old_scada_good(old) and same_hours:
        log(f"   → {d}: κρατάω τα προηγούμενα SCADA (η νέα λήψη απέτυχε)")
        new["Totals"]["SCADA"] = old["Totals"]["SCADA"]
        for f in SCADA_FIELDS:
            set_series(new, f, series(old, f))

    if not isp_ok(new) and old_isp_good(old) and same_hours:
        log(f"   → {d}: κρατάω τα προηγούμενα ISP (η νέα λήψη απέτυχε)")
        new["Totals"]["ISP"] = old["Totals"]["ISP"]
        for f in ISP_FIELDS:
            set_series(new, f, series(old, f))

    for f in MCP_FIELDS:
        new_s, old_s = series(new, f), series(old, f)
        if len(old_s) != len(new_s):
            continue                                  # παλιά εγγραφή με άλλο πλήθος ωρών: δεν ανακατεύεται
        if n_valid(new_s) < len(new_s) and prices_plausible(old_s) and n_valid(old_s) > n_valid(new_s):
            log(f"   → {d}: κρατάω τις προηγούμενες τιμές {f} (η νέα λήψη ήταν ελλιπής)")
            set_series(new, f, old_s)

    new["Flags"] = compute_flags(new)
    return new


def load_existing(json_path):
    if os.path.exists(json_path) and os.path.getsize(json_path) > 0:
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)   # αν το αρχείο είναι χαλασμένο, σταματάει (ασφαλές)
    return []


def save_atomic(json_path, data):
    """Ατομική εγγραφή. Λίστα ημερών → μία ημέρα ανά γραμμή, χωρίς κενά (D34: ≈ −25 % gzip, ευανάγνωστο diff ανά ημέρα)."""
    tmp = json_path + ".tmp"
    with open(tmp, 'w', encoding='utf-8') as f:
        if isinstance(data, list):
            f.write("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in data) + "\n]\n")
        else:
            json.dump(data, f, indent=2)
    os.replace(tmp, json_path)


def next_update_utc(now_utc):
    """Η επόμενη προγραμματισμένη εκτέλεση (07:02 Αθήνας) μετά από τώρα, σε UTC.
    Η ώρα Αθήνας λογαριάζεται με τη ζώνη ώρας, άρα σωστά και πριν/μετά την αλλαγή ώρας."""
    now_ath = now_utc.astimezone(ATHENS)
    h, m = UPDATE_TIME_ATHENS
    day = now_ath.date()
    for _ in range(3):
        cand = datetime(day.year, day.month, day.day, h, m, tzinfo=ATHENS)
        if cand > now_ath:
            return cand.astimezone(timezone.utc)
        day = day + timedelta(days=1)
    return None


def write_meta(now_utc):
    """data/meta.json (D06): μοναδικός writer αυτό το script. Η σελίδα το διαβάζει για τα
    «Τελευταία / Επόμενη ενημέρωση». Γράφεται ΜΟΝΟ αφού γραφτούν επιτυχώς τα δεδομένα."""
    nxt = next_update_utc(now_utc)
    meta = {
        "fetched": now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "next_update": nxt.replace(microsecond=0).isoformat().replace("+00:00", "Z") if nxt else None,
    }
    save_atomic(META_PATH, meta)
    log(f"meta.json: fetched={meta['fetched']} next_update={meta['next_update']}")


def dates_from_env():
    """Οι ημέρες της εκτέλεσης (D28): START_DATE … END_DATE· κενό END_DATE = μέχρι σήμερα (Αθήνα)·
    χωρίς START_DATE = κανονική εκτέλεση, οι τελευταίες 5 ημέρες."""
    start_env = (os.environ.get("START_DATE") or "").strip()
    end_env = (os.environ.get("END_DATE") or "").strip()
    if start_env and not end_env:
        end_env = datetime.now(ATHENS).strftime("%Y-%m-%d")        # D28: κενό END_DATE = μέχρι σήμερα
        log(f"--- Δεν δόθηκε END_DATE: έως σήμερα ({end_env}) ---")
    elif end_env and not start_env:
        log("--- Δόθηκε END_DATE χωρίς START_DATE: αγνοείται, κανονική εκτέλεση ---")
        end_env = ""

    if start_env and end_env:
        start_dt = datetime.strptime(start_env, "%Y-%m-%d")
        end_dt = datetime.strptime(end_env, "%Y-%m-%d")
        delta = end_dt - start_dt
        dates_to_fetch = [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(delta.days + 1)]
        log(f"--- Χειροκίνητη εκτέλεση για {len(dates_to_fetch)} ημέρες: από {start_env} έως {end_env} ---")
    else:
        dates_to_fetch = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(4, -1, -1)]
        log("--- Κανονική εκτέλεση (τελευταίες 5 ημέρες) ---")
    return dates_to_fetch


if __name__ == "__main__":
    dates_to_fetch = dates_from_env()

    json_path = "data/historical_flows.json"
    all_data = load_existing(json_path)
    by_date = {x["Date"]: x for x in all_data}

    day_delay = float(os.environ.get("DAY_DELAY_SECONDS", "2"))     # D31: ευγένεια προς ΑΔΜΗΕ / ENTSO-E, όπως στο BESS
    prefetch_ntc(dates_to_fetch)                                    # D42: NTC όλου του διαστήματος με λίγα αιτήματα
    for i, d in enumerate(dates_to_fetch):
        if i:
            time.sleep(day_delay)
        new_day = process_day(d)
        if d in by_date:
            new_day = merge_with_old(new_day, by_date[d])
        by_date[d] = new_day

    result = sorted(by_date.values(), key=lambda x: x["Date"], reverse=True)
    # Η πληρότητα ξαναϋπολογίζεται για ΟΛΟ το ιστορικό σε κάθε εκτέλεση (D13)
    for day in result:
        day.setdefault("Flags", {})["complete"] = day_complete(day)
    save_atomic(json_path, result)
    write_meta(datetime.now(timezone.utc))

    # Ανάλυση διασυνδέσεων (D34) από όλο το ιστορικό → data/analysis.json. Αν αποτύχει, τα δεδομένα μένουν σωστά.
    try:
        import analysis
        analysis.main()
    except Exception as e:
        log(f"   ! analysis.json: δεν ενημερώθηκε ({type(e).__name__}: {e})")

    log("--- Σύνοψη ---")
    for d in dates_to_fetch:
        fl = by_date[d]["Flags"]
        nh = len(by_date[d]["Hourly"])
        status = "OK" if (fl["scada"] and fl["isp"] and min(fl["mcp_gr"], fl["mcp_bg"], fl["mcp_it"]) == nh) else "ΕΛΛΙΠΕΣ"
        log(f"{d}: {status}  SCADA={fl['scada']} ISP={fl['isp']} MCP(GR/BG/IT)={fl['mcp_gr']}/{fl['mcp_bg']}/{fl['mcp_it']}")
