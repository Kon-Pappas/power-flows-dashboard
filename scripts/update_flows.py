import os
import sys
import subprocess
import time

try:
    import xlrd
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "xlrd"])

try:
    import pytz
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pytz"])

import requests
import pandas as pd
import numpy as np
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import io

ENTSOE_TOKEN = os.environ.get("ENTSOE_TOKEN")

# Η ΝΕΑ "ΑΤΡΩΤΗ" ΣΥΝΑΡΤΗΣΗ ΤΟΥ ENTSO-E
def fetch_entsoe_mcp(domain, target_date_str, token):
    if not token: 
        return [0.0] * 24
        
    gr_tz = pytz.timezone('Europe/Athens')
    local_start = gr_tz.localize(datetime.strptime(target_date_str, "%Y-%m-%d"))
    local_end = local_start + timedelta(days=1)
    
    utc_start = local_start.astimezone(pytz.utc)
    utc_end = local_end.astimezone(pytz.utc)
    
    periodStart = utc_start.strftime("%Y%m%d%H00")
    periodEnd = utc_end.strftime("%Y%m%d%H00")
    
    url = "https://web-api.tp.entsoe.eu/api"
    params = {
        'securityToken': token,
        'documentType': 'A44', 
        'in_Domain': domain,
        'out_Domain': domain,
        'periodStart': periodStart,
        'periodEnd': periodEnd
    }
    
    try:
        response = requests.get(url, params=params, timeout=15)
        if response.status_code != 200:
            return [0.0] * 24
            
        ns = {'ns': 'urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:0'}
        try:
            root = ET.fromstring(response.content)
        except ET.ParseError:
            return [0.0] * 24

        quarters = [None] * 96
        target_start_utc = utc_start.replace(tzinfo=None)
        
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
                pos_text = point.find('ns:position', ns).text
                price_text = point.find('ns:price.amount', ns).text
                
                if pos_text is None or price_text is None:
                    continue
                    
                pos = int(pos_text)
                price = float(price_text)
                
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

        hourly_prices = []
        for h in range(24):
            q_slice = quarters[h*4 : h*4+4]
            valid_qs = [q for q in q_slice if q is not None]
            if len(valid_qs) > 0:
                hourly_prices.append(round(sum(valid_qs) / len(valid_qs), 2))
            else:
                hourly_prices.append(0.0)

        return hourly_prices
    except: 
        return [0.0] * 24

# ΟΙ ΣΥΝΑΡΤΗΣΕΙΣ ΤΟΥ ΑΔΜΗΕ (Όπως τις είχες, απείραχτες)
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

def extract_hourly_vals(df, keyword, col_index):
    try:
        row = df[df[col_index].astype(str).str.contains(keyword, case=False, na=False)]
        if not row.empty:
            return np.nan_to_num(row.iloc[0, 2:26].values.astype(float))
    except: pass
    return np.zeros(24)

def process_day(date_str):
    print(f"Επεξεργασία: {date_str}")
    
    scada_net = {"Albania": 0, "Bulgaria": 0, "Italy": 0, "North Macedonia": 0, "Turkey": 0}
    scada_hourly_net = [0.0] * 24
    
    scada_al_h = np.zeros(24)
    scada_bg_h = np.zeros(24)
    scada_it_h = np.zeros(24)
    scada_mk_h = np.zeros(24)
    scada_tr_h = np.zeros(24)
    
    scada_file = fetch_admie_excel(date_str, "SystemRealizationSCADA")
    if scada_file:
        df_scada = pd.read_excel(scada_file, header=None)
        
        scada_net["Albania"] = extract_last_col_val(df_scada, "ΑΛΒΑΝΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΑΛΒΑΝΙΑ_EXP", 1)
        scada_net["Bulgaria"] = extract_last_col_val(df_scada, "ΒΟΥΛΓΑΡΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΒΟΥΛΓΑΡΙΑ_EXP", 1)
        scada_net["Italy"] = extract_last_col_val(df_scada, "ΙΤΑΛΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΙΤΑΛΙΑ_EXP", 1)
        scada_net["North Macedonia"] = extract_last_col_val(df_scada, "FYROM_IMP", 1) - extract_last_col_val(df_scada, "FYROM_EXP", 1)
        scada_net["Turkey"] = extract_last_col_val(df_scada, "ΤΟΥΡΚΙΑ_IMP", 1) - extract_last_col_val(df_scada, "ΤΟΥΡΚΙΑ_EXP", 1)
        
        net_row = df_scada[df_scada[1] == 'EXPORTS-IMPORTS']
        if not net_row.empty: 
            vals_24 = np.nan_to_num(net_row.iloc[0, 2:26].values.astype(float))
            scada_hourly_net = (vals_24 * -1).round(2).tolist()
            
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

    # Κλήσεις στη νέα συνάρτηση του ENTSO-E
    mcp_gr = fetch_entsoe_mcp('10YGR-HTSO-----Y', date_str, ENTSOE_TOKEN)
    mcp_bg = fetch_entsoe_mcp('10YCA-BULGARIA-R', date_str, ENTSOE_TOKEN)
    mcp_it = fetch_entsoe_mcp('10YIT-GRTN-----B', date_str, ENTSOE_TOKEN)
    
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
            "SCADA_AL": float(round(scada_al_h[hour], 2)),
            "SCADA_BG": float(round(scada_bg_h[hour], 2)),
            "SCADA_IT": float(round(scada_it_h[hour], 2)),
            "SCADA_MK": float(round(scada_mk_h[hour], 2)),
            "SCADA_TR": float(round(scada_tr_h[hour], 2))
        })
        
    return daily_data

if __name__ == "__main__":
    # --- ΦΑΣΗ 1: THE GREAT BACKFILL (Από 10/06/2026 έως Σήμερα) ---
    start_date = datetime(2026, 6, 10)
    end_date = datetime.now()
    
    dates_to_fetch = []
    current_date = start_date
    while current_date <= end_date:
        dates_to_fetch.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(days=1)
    
    json_path = "data/historical_flows.json"
    
    # Ξεκινάμε με ένα εντελώς καθαρό αρχείο δεδομένων
    all_data = []
            
    for d in dates_to_fetch:
        new_day = process_day(d)
        all_data.append(new_day)
        # Μικρή καθυστέρηση για να μην φάμε ban (2 δευτερόλεπτα)
        time.sleep(2)
        
    all_data.sort(key=lambda x: x["Date"], reverse=True)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        import json
        json.dump(all_data, f, indent=2)
