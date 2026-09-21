import os
import sys
import subprocess

try:
    import xlrd
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "xlrd"])

import requests
import pandas as pd
import numpy as np
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import io

ENTSOE_TOKEN = os.environ.get("ENTSOE_TOKEN")

ENTSOE_DOMAINS = {
    "GR": "10YGR-HTSO-----Y",
    "BG": "10YCA-BULGARIA-R",
    "IT": "10Y1001A1001A788" 
}

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
    if not ENTSOE_TOKEN: return [0.0] * 24
    domain = ENTSOE_DOMAINS[country_code]
    periodStart, periodEnd = get_entsoe_period(date_str)
    
    # Το απόλυτο σημείο μηδέν σε UTC για τον υπολογισμό των index
    target_start_utc = datetime.strptime(periodStart, "%Y%m%d%H00")
    
    url = f"https://web-api.tp.entsoe.eu/api?securityToken={ENTSOE_TOKEN}&documentType=A44&in_Domain={domain}&out_Domain={domain}&periodStart={periodStart}&periodEnd={periodEnd}"
    try:
        res = requests.get(url, timeout=15)
        if "<Reason>" in res.text or res.status_code != 200: return [0.0] * 24
        
        root = ET.fromstring(res.text)
        ns = {'ns': root.tag.split('}')[0].strip('{')}
        
        # Πίνακας με 96 άδεια slots
        quarters = [None] * 96
        
        for ts in root.findall('ns:TimeSeries', ns):
            # ΦΙΛΤΡΟ 1: Μόνο Day-Ahead (Αποφυγή Intraday σκουπιδιών)
            business_type = ts.find('ns:businessType', ns)
            if business_type is not None and business_type.text != "A62":
                continue
                
            # ΦΙΛΤΡΟ 2: Μόνο Ευρώ (Λύνει το θέμα διπλού νομίσματος της Βουλγαρίας)
            currency = ts.find('ns:currency_Unit.name', ns)
            if currency is not None and currency.text != "EUR":
                continue

            period = ts.find('ns:Period', ns)
            if period is None: continue
            
            # Εύρεση absolute χρόνου για το συγκεκριμένο TimeSeries block
            period_start_str = period.find('ns:timeInterval/ns:start', ns).text.replace('Z', '')
            if len(period_start_str) == 16:
                period_start_utc = datetime.strptime(period_start_str, "%Y-%m-%dT%H:%M")
            else:
                period_start_utc = datetime.strptime(period_start_str[:19], "%Y-%m-%dT%H:%M:%S")
                
            resolution = period.find('ns:resolution', ns).text
            
            for point in period.findall('ns:Point', ns):
                pos = int(point.find('ns:position', ns).text)
                price = float(point.find('ns:price.amount', ns).text)
                
                # ΦΙΛΤΡΟ 3 & 4: Υπολογισμός index με βάση τον απόλυτο χρόνο
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
                            # Εγγραφή ΜΟΝΟ αν το slot είναι άδειο (το PT15M έχει προτεραιότητα)
                            if quarters[start_idx + i] is None:
                                quarters[start_idx + i] = price

        # Εξαγωγή 24 καθαρών ωριαίων τιμών
        hourly_prices = []
        for h in range(24):
            q_slice = quarters[h*4 : h*4+4]
            valid_qs = [q for q in q_slice if q is not None]
            
            if len(valid_qs) > 0:
                hourly_prices.append(round(sum(valid_qs) / len(valid_qs), 2))
            else:
                hourly_prices.append(0.0)
                
        return hourly_prices
        
    except Exception as e:
        return [0.0] * 24

def fetch_admie_excel(date_str, category):
    url = f"https://www.admie.gr/getOperationMarketFile?dateStart={date_str}&dateEnd={date_str}&FileCategory={category}"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code != 200: return None
        data = res.json()
        if not data: return None
        file_path = data[0].get("file_path")
        if file_path.startswith("/"): file_path = "https://www.admie.gr" + file_path
        file_res = requests.get(file_path, headers=headers, timeout=15)
        return io.BytesIO(file_res.content)
    except: return None

def extract_last_col_val(df, keyword, col_index):
    try:
        row = df[df[col_index].astype(str).str.contains(keyword, case=False, na=False)]
        if not row.empty:
            vals = row.iloc[0].dropna().values
            val = vals[-1]
            if isinstance(val, (int, float)): return float(val)
    except: pass
    return 0.0

# ΝΕΑ ΣΥΝΑΡΤΗΣΗ: Τραβάει και τις 24 ώρες για μια συγκεκριμένη γραμμή
def extract_hourly_vals(df, keyword, col_index):
    try:
        row = df[df[col_index].astype(str).str.contains(keyword, case=False, na=False)]
        if not row.empty:
            # Οι ώρες 1-24 βρίσκονται συνήθως στις στήλες 2 έως 25 (index)
            return np.nan_to_num(row.iloc[0, 2:26].values.astype(float))
    except: pass
    return np.zeros(24)

def process_day(date_str):
    print(f"Επεξεργασία: {date_str}")
    
    scada_net = {"Albania": 0, "Bulgaria": 0, "Italy": 0, "North Macedonia": 0, "Turkey": 0}
    scada_hourly_net = [0.0] * 24
    
    # Πίνακες για τις ωριαίες ροές ανά χώρα
    scada_al_h = np.zeros(24)
    scada_bg_h = np.zeros(24)
    scada_it_h = np.zeros(24)
    scada_mk_h = np.zeros(24)
    scada_tr_h = np.zeros(24)
    
    scada_file = fetch_admie_excel(date_str, "SystemRealizationSCADA")
    if scada_file:
        df_scada = pd.read_excel(scada_file, header=None)
        
        # Συνολικά (Ημερήσια)
        scada_net["Albania"] = extract_last_col_val(df_scada, "ΑΛΒΑΝΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΑΛΒΑΝΙΑ_EXP", 1)
        scada_net["Bulgaria"] = extract_last_col_val(df_scada, "ΒΟΥΛΓΑΡΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΒΟΥΛΓΑΡΙΑ_EXP", 1)
        scada_net["Italy"] = extract_last_col_val(df_scada, "ΙΤΑΛΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΙΤΑΛΙΑ_EXP", 1)
        scada_net["North Macedonia"] = extract_last_col_val(df_scada, "FYROM_IMP", 1) - extract_last_col_val(df_scada, "FYROM_EXP", 1)
        scada_net["Turkey"] = extract_last_col_val(df_scada, "ΤΟΥΡΚΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΤΟΥΡΚΙΑ_EXP", 1)
        
        # Ωριαία Net (Συνολικά)
        net_row = df_scada[df_scada[1] == 'EXPORTS-IMPORTS']
        if not net_row.empty: 
            vals_24 = np.nan_to_num(net_row.iloc[0, 2:26].values.astype(float))
            scada_hourly_net = (vals_24 * -1).round(2).tolist()
            
        # Ωριαία Net ανά Χώρα (IMPORTS - EXPORTS)
        scada_al_h = extract_hourly_vals(df_scada, "ΑΛΒΑΝΙΑ_IMP", 1) - extract_hourly_vals(df_scada, "ΑΛΒΑΝΙΑ_EXP", 1)
        scada_bg_h = extract_hourly_vals(df_scada, "ΒΟΥΛΓΑΡΙΑ_IMP", 1) - extract_hourly_vals(df_scada, "ΒΟΥΛΓΑΡΙΑ_EXP", 1)
        scada_it_h = extract_hourly_vals(df_scada, "ΙΤΑΛΙΑ_IMP", 1) - extract_hourly_vals(df_scada, "ΙΤΑΛΙΑ_EXP", 1)
        scada_mk_h = extract_hourly_vals(df_scada, "FYROM_IMP", 1) - extract_hourly_vals(df_scada, "FYROM_EXP", 1)
        scada_tr_h = extract_hourly_vals(df_scada, "ΤΟΥΡΚΙΑ_IMP", 1) - extract_hourly_vals(df_scada, "ΤΟΥΡΚΙΑ_EXP", 1)

    isp_net = {"Albania": 0, "Bulgaria": 0, "Italy": 0, "North Macedonia": 0, "Turkey": 0}
    isp_hourly_net = [0.0] * 24
    isp_file = fetch_admie_excel(date_str, "ISP2ISPResults")
    if isp_file:
        df_isp = pd.read_excel(isp_file, header=None)
        isp_net["Albania"] = extract_last_col_val(df_isp, "ALBANIA", 0) * -1
        isp_net["Bulgaria"] = extract_last_col_val(df_isp, "BULGARIA", 0) * -1
        isp_net["Italy"] = extract_last_col_val(df_isp, "ITALY", 0) * -1
        isp_net["North Macedonia"] = extract_last_col_val(df_isp, "MACEDONIA", 0) * -1
        isp_net["Turkey"] = extract_last_col_val(df_isp, "TURKEY", 0) * -1
        
        cbs_row = df_isp[df_isp[0] == 'Net CBS Schedules']
        if not cbs_row.empty:
            vals_96 = np.nan_to_num(cbs_row.iloc[0, 1:97].values.astype(float))
            isp_hourly_net = (vals_96.reshape(24, 4).mean(axis=1) * -1).round(2).tolist()

    mcp_gr = fetch_entsoe_mcp(date_str, "GR")
    mcp_bg = fetch_entsoe_mcp(date_str, "BG")
    mcp_it = fetch_entsoe_mcp(date_str, "IT")
    
    daily_data = {
        "Date": date_str,
        "Totals": {
            "SCADA": scada_net,
            "ISP": isp_net
        },
        "Hourly": []
    }
    
    for hour in range(24):
        daily_data["Hourly"].append({
            "Hour": f"H{hour+1:02d}",
            "SCADA_Net": scada_hourly_net[hour],
            "ISP_Net": isp_hourly_net[hour],
            "MCP_GR": mcp_gr[hour],
            "MCP_BG": mcp_bg[hour],
            "MCP_IT": mcp_it[hour],
            # Προσθέτουμε τα νέα δεδομένα στο JSON
            "SCADA_AL": float(round(scada_al_h[hour], 2)),
            "SCADA_BG": float(round(scada_bg_h[hour], 2)),
            "SCADA_IT": float(round(scada_it_h[hour], 2)),
            "SCADA_MK": float(round(scada_mk_h[hour], 2)),
            "SCADA_TR": float(round(scada_tr_h[hour], 2))
        })
        
    return daily_data

if __name__ == "__main__":
    # --- ΚΑΝΟΝΙΚΗ ΚΑΘΗΜΕΡΙΝΗ ΛΕΙΤΟΥΡΓΙΑ (Τελευταίες 3 ημέρες) ---
    dates_to_fetch = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(2, -1, -1)]
    
    json_path = "data/historical_flows.json"
    all_data = []
    
    if os.path.exists(json_path) and os.path.getsize(json_path) > 0:
        import json
        with open(json_path, 'r', encoding='utf-8') as f:
            all_data = json.load(f)
            
    for d in dates_to_fetch:
        new_day = process_day(d)
        all_data = [x for x in all_data if x.get("Date") != d]
        all_data.append(new_day)
        
    all_data.sort(key=lambda x: x["Date"], reverse=True)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        import json
        json.dump(all_data, f, indent=2)
