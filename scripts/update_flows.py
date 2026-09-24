import os
import io
import json
import time
import re
import requests
import pandas as pd
import numpy as np
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

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
def get_entsoe_period(date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    march = datetime(dt.year, 3, 31)
    dst_start = march - timedelta(days=(march.weekday() + 1) % 7)
    october = datetime(dt.year, 10, 31)
    dst_end = october - timedelta(days=(october.weekday() + 1) % 7)
    is_dst = dst_start <= dt < dst_end
    start_hour = 22 if is_dst else 23
    start_utc = (dt - timedelta(days=1)).replace(hour=start_hour, minute=0, second=0)
    end_utc = dt.replace(hour=start_hour, minute=0, second=0)
    return start_utc.strftime("%Y%m%d%H00"), end_utc.strftime("%Y%m%d%H00")


def fetch_entsoe_mcp(date_str, country_code):
    """Επιστρέφει λίστα 24 τιμών. Όπου λείπει τιμή -> None (όχι 0)."""
    empty = [None] * 24
    if not ENTSOE_TOKEN:
        log(f"   ! MCP {country_code}: δεν υπάρχει ENTSOE_TOKEN")
        return empty
    domain = ENTSOE_DOMAINS[country_code]
    periodStart, periodEnd = get_entsoe_period(date_str)
    target_start_utc = datetime.strptime(periodStart, "%Y%m%d%H00")

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
        quarters = [None] * 96

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

            period_start_str = period.find('ns:timeInterval/ns:start', ns).text.replace('Z', '')
            if len(period_start_str) == 16:
                period_start_utc = datetime.strptime(period_start_str, "%Y-%m-%dT%H:%M")
            else:
                period_start_utc = datetime.strptime(period_start_str[:19], "%Y-%m-%dT%H:%M:%S")

            resolution = period.find('ns:resolution', ns).text
            for point in period.findall('ns:Point', ns):
                pos = int(point.find('ns:position', ns).text)
                price = float(point.find('ns:price.amount', ns).text)
                if resolution == "PT15M":
                    point_time = period_start_utc + timedelta(minutes=15 * (pos - 1))
                    diff_minutes = int((point_time - target_start_utc).total_seconds() // 60)
                    idx = diff_minutes // 15
                    if 0 <= idx < 96:
                        quarters[idx] = price
                elif resolution == "PT60M":
                    point_time = period_start_utc + timedelta(hours=(pos - 1))
                    diff_hours = int((point_time - target_start_utc).total_seconds() // 3600)
                    if 0 <= diff_hours < 24:
                        start_idx = diff_hours * 4
                        for i in range(4):
                            if quarters[start_idx + i] is None:
                                quarters[start_idx + i] = price

        hourly = []
        for h in range(24):
            q_slice = quarters[h * 4: h * 4 + 4]
            valid = [q for q in q_slice if q is not None]
            # Ώρα θεωρείται έγκυρη ΜΟΝΟ αν έχουμε και τα 4 τεταρτάωρα
            hourly.append(round(sum(valid) / 4, 2) if len(valid) == 4 else None)

        missing = sum(1 for v in hourly if v is None)
        if missing:
            log(f"   ! MCP {country_code}: λείπουν {missing} από 24 ώρες")
        return hourly
    except Exception as e:
        log(f"   ! MCP {country_code}: σφάλμα ανάγνωσης ({type(e).__name__})")
        return empty


# ---------------------------------------------------------------------------
# ADMIE
# ---------------------------------------------------------------------------
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


def extract_hourly_vals(df, keyword, col_index):
    """24 ωριαίες τιμές μιας γραμμής. None αν δεν βρεθεί η γραμμή."""
    try:
        row = df[df[col_index].astype(str).str.contains(keyword, case=False, na=False)]
        if row.empty:
            return None
        return np.nan_to_num(row.iloc[0, 2:26].values.astype(float))
    except Exception:
        return None


def read_excel_safe(fileobj, what):
    try:
        return pd.read_excel(fileobj, header=None)
    except Exception as e:
        log(f"   ! {what}: το αρχείο δεν διαβάστηκε ({type(e).__name__})")
        return None


def none_list(n=24):
    return [None] * n


def to_list(arr):
    return [None if v is None else float(round(float(v), 2)) for v in arr]


# ---------------------------------------------------------------------------
# Επεξεργασία μιας ημέρας
# ---------------------------------------------------------------------------
def process_day(date_str):
    log(f"Επεξεργασία: {date_str}")

    # ---- SCADA -------------------------------------------------------------
    scada_totals = {c: None for c in COUNTRIES}
    scada_net_h = none_list()
    scada_country_h = {code: none_list() for _, _, code, _ in COUNTRY_MAP}

    scada_file = fetch_admie_excel(date_str, "SystemRealizationSCADA")
    if scada_file:
        df = read_excel_safe(scada_file, "SCADA")
        if df is not None:
            tot, hourly, ok = {}, {}, True
            for name, kw, code, _ in COUNTRY_MAP:
                imp_t = extract_last_col_val(df, kw + "_IMP", 1)
                exp_t = extract_last_col_val(df, kw + "_EXP", 1)
                imp_h = extract_hourly_vals(df, kw + "_IMP", 1)
                exp_h = extract_hourly_vals(df, kw + "_EXP", 1)
                if None in (imp_t, exp_t) or imp_h is None or exp_h is None:
                    ok = False
                    log(f"   ! SCADA: δεν βρέθηκαν γραμμές για {name}")
                    break
                tot[name] = imp_t - exp_t
                hourly[code] = imp_h - exp_h
            net_row = df[df[1] == 'EXPORTS-IMPORTS']
            net_vals = None
            if not net_row.empty:
                try:
                    net_vals = np.nan_to_num(net_row.iloc[0, 2:26].values.astype(float)) * -1
                except Exception:
                    net_vals = None
            if net_vals is None:
                ok = False
                log("   ! SCADA: δεν βρέθηκε η γραμμή EXPORTS-IMPORTS")
            if ok:
                scada_totals = tot
                scada_net_h = to_list(net_vals)
                scada_country_h = {code: to_list(hourly[code]) for code in hourly}
            else:
                log("   ! SCADA: η ημέρα καταχωρείται ως ΜΗ ΔΙΑΘΕΣΙΜΗ (κενή)")

    # ---- ISP ---------------------------------------------------------------
    isp_totals = {c: None for c in COUNTRIES}
    isp_net_h = none_list()

    isp_file = fetch_admie_excel(date_str, "ISP2ISPResults")
    if isp_file:
        df = read_excel_safe(isp_file, "ISP")
        if df is not None:
            for name, _, _, kw in COUNTRY_MAP:
                v = extract_last_col_val(df, kw, 0)
                isp_totals[name] = None if v is None else v * -1
            try:
                cbs_row = df[df[0] == 'Net CBS Schedules']
                if not cbs_row.empty:
                    vals_96 = np.nan_to_num(cbs_row.iloc[0, 1:97].values.astype(float))
                    isp_net_h = to_list(vals_96.reshape(24, 4).mean(axis=1) * -1)
                else:
                    log("   ! ISP: δεν βρέθηκε η γραμμή Net CBS Schedules")
            except Exception as e:
                log(f"   ! ISP: σφάλμα ωριαίου ({type(e).__name__})")

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
    for hour in range(24):
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
    return all(t.get(c) is not None for c in COUNTRIES) and n_valid(series(day, "SCADA_Net")) == 24


def isp_ok(day):
    t = day["Totals"]["ISP"]
    return all(t.get(c) is not None for c in COUNTRIES) and n_valid(series(day, "ISP_Net")) == 24


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

    if not scada_ok(new) and old_scada_good(old):
        log(f"   → {d}: κρατάω τα προηγούμενα SCADA (η νέα λήψη απέτυχε)")
        new["Totals"]["SCADA"] = old["Totals"]["SCADA"]
        for f in SCADA_FIELDS:
            set_series(new, f, series(old, f))

    if not isp_ok(new) and old_isp_good(old):
        log(f"   → {d}: κρατάω τα προηγούμενα ISP (η νέα λήψη απέτυχε)")
        new["Totals"]["ISP"] = old["Totals"]["ISP"]
        for f in ISP_FIELDS:
            set_series(new, f, series(old, f))

    for f in MCP_FIELDS:
        new_s, old_s = series(new, f), series(old, f)
        if n_valid(new_s) < 24 and prices_plausible(old_s) and n_valid(old_s) > n_valid(new_s):
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
    tmp = json_path + ".tmp"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, json_path)


if __name__ == "__main__":
    start_env = os.environ.get("START_DATE")
    end_env = os.environ.get("END_DATE")

    if start_env and end_env:
        start_dt = datetime.strptime(start_env, "%Y-%m-%d")
        end_dt = datetime.strptime(end_env, "%Y-%m-%d")
        delta = end_dt - start_dt
        dates_to_fetch = [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(delta.days + 1)]
        log(f"--- Χειροκίνητη εκτέλεση για {len(dates_to_fetch)} ημέρες: από {start_env} έως {end_env} ---")
    else:
        dates_to_fetch = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(4, -1, -1)]
        log("--- Κανονική εκτέλεση (τελευταίες 5 ημέρες) ---")

    json_path = "data/historical_flows.json"
    all_data = load_existing(json_path)
    by_date = {x["Date"]: x for x in all_data}

    for d in dates_to_fetch:
        new_day = process_day(d)
        if d in by_date:
            new_day = merge_with_old(new_day, by_date[d])
        by_date[d] = new_day

    result = sorted(by_date.values(), key=lambda x: x["Date"], reverse=True)
    save_atomic(json_path, result)

    log("--- Σύνοψη ---")
    for d in dates_to_fetch:
        fl = by_date[d]["Flags"]
        status = "OK" if (fl["scada"] and fl["isp"] and min(fl["mcp_gr"], fl["mcp_bg"], fl["mcp_it"]) == 24) else "ΕΛΛΙΠΕΣ"
        log(f"{d}: {status}  SCADA={fl['scada']} ISP={fl['isp']} MCP(GR/BG/IT)={fl['mcp_gr']}/{fl['mcp_bg']}/{fl['mcp_it']}")
