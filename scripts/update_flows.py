import os
import sys
import subprocess

# Αυτόματη εγκατάσταση του xlrd αν λείπει (απαραίτητο για τα παλιά .xls του ΑΔΜΗΕ)
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
import json

ENTSOE_TOKEN = os.environ.get("ENTSOE_TOKEN")
if not ENTSOE_TOKEN:
    print("ΣΦΑΛΜΑ: Δεν βρέθηκε το ENTSOE_TOKEN στα Secrets!")
    sys.exit(1)

ENTSOE_DOMAINS = {
    "GR": "10YGR-HTSO-----Y",
    "BG": "10YCA-BULGARIA-R",
    "IT": "10YIT-GR1001A-V"
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
    print(f"  -> Αντληση ENTSO-E MCP για {country_code}...")
    domain = ENTSOE_DOMAINS[country_code]
    periodStart, periodEnd = get_entsoe_period(date_str)
    
    url = f"https://web-api.tp.entsoe.eu/api?securityToken={ENTSOE_TOKEN}&documentType=A44&in_Domain={domain}&out_Domain={domain}&periodStart={periodStart}&periodEnd={periodEnd}"
    
    try:
        res = requests.get(url, timeout=15)
        if "<Reason>" in res.text or res.status_code != 200:
            return [0.0] * 24
            
        root = ET.fromstring(res.text)
        ns = {'ns': root.tag.split('}')[0].strip('{')}
        
        prices_96 = [0.0] * 96
        is_15min = False
        
        for ts in root.findall('ns:TimeSeries', ns):
            period = ts.find('ns:Period', ns)
            if period is not None:
                resolution = period.find('ns:resolution', ns).text
                for point in period.findall('ns:Point', ns):
                    pos = int(point.find('ns:position', ns).text) - 1
                    price = float(point.find('ns:price.amount', ns).text)
                    
                    if resolution == "PT15M":
                        is_15min = True
                        if 0 <= pos < 96: prices_96[pos] = price
                    elif resolution == "PT60M":
                        if 0 <= pos < 24:
                            # Μετατροπή ωριαίου σε 15λεπτα για ομοιομορφία
                            for i in range(4): prices_96[pos*4 + i] = price
        
        # Μετατροπή των 96 (ή 24) τιμών σε 24 ωριαίους μέσους όρους
        prices_24 = np.array(prices_96).reshape(24, 4).mean(axis=1)
        return prices_24.round(2).tolist()
    except Exception as e:
        print(f"  [X] Σφάλμα ENTSO-E {country_code}: {e}")
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
        if not file_path: return None
        if file_path.startswith("/"): file_path = "https://www.admie.gr" + file_path
        
        file_res = requests.get(file_path, headers=headers, timeout=15)
        if file_res.status_code != 200: return None
        return io.BytesIO(file_res.content)
    except Exception as e:
        print(f"  [X] Σφάλμα λήψης {category}: {e}")
        return None

def process_day(date_str):
    print(f"\n--- Επεξεργασία: {date_str} ---")
    daily_data = []
    
    # 1. ADMIE SCADA (Net Flows 24h)
    print("  -> Αντληση ADMIE SCADA...")
    scada_flows = [0.0] * 24
    scada_file = fetch_admie_excel(date_str, "SystemRealizationSCADA")
    if scada_file:
        try:
            df_scada = pd.read_excel(scada_file, header=None)
            net_row = df_scada[df_scada[1] == 'EXPORTS-IMPORTS']
            if not net_row.empty:
                vals = net_row.iloc[0, 2:26].values
                scada_flows = np.nan_to_num(vals.astype(float)).round(2).tolist()
        except Exception as e:
            print(f"  [X] Σφάλμα ανάγνωσης SCADA: {e}")

    # 2. ADMIE ISP (Net CBS 96 -> 24h)
    print("  -> Αντληση ADMIE ISP...")
    isp_flows = [0.0] * 24
    isp_file = fetch_admie_excel(date_str, "ISP2ISPResults")
    if isp_file:
        try:
            df_isp = pd.read_excel(isp_file, header=None)
            cbs_row = df_isp[df_isp[0] == 'Net CBS Schedules']
            if not cbs_row.empty:
                vals_96 = cbs_row.iloc[0, 1:97].values
                vals_96 = np.nan_to_num(vals_96.astype(float))
                isp_flows = vals_96.reshape(24, 4).mean(axis=1).round(2).tolist()
        except Exception as e:
            print(f"  [X] Σφάλμα ανάγνωσης ISP: {e}")

    # 3. ENTSO-E MCP (GR, BG, IT)
    mcp_gr = fetch_entsoe_mcp(date_str, "GR")
    mcp_bg = fetch_entsoe_mcp(date_str, "BG")
    mcp_it = fetch_entsoe_mcp(date_str, "IT")
    
    # Κατασκευή τελικού JSON format
    for hour in range(24):
        daily_data.append({
            "Date": date_str,
            "Hour": f"H{hour+1:02d}",
            "SCADA_Net": scada_flows[hour],
            "ISP_Net": isp_flows[hour],
            "MCP_GR": mcp_gr[hour],
            "MCP_BG": mcp_bg[hour],
            "MCP_IT": mcp_it[hour]
        })
        
    return daily_data

if __name__ == "__main__":
    # Τρέχουμε το script για Σήμερα, Χθες και Προχθές (Self-Healing)
    dates_to_fetch = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(2, -1, -1)]
    
    new_data = []
    for d in dates_to_fetch:
        new_data.extend(process_day(d))
        
    new_df = pd.DataFrame(new_data)
    
    # Διαβάζουμε το υπάρχον αρχείο (αν υπάρχει)
    json_path = "data/historical_flows.json"
    if os.path.exists(json_path) and os.path.getsize(json_path) > 0:
        try:
            old_df = pd.read_json(json_path, orient='records')
            # Ενώνουμε παλιά και νέα δεδομένα
            combined_df = pd.concat([old_df, new_df], ignore_index=True)
            # Αφαιρούμε διπλοεγγραφές краτώντας τα πιο πρόσφατα (τα σημερινά)
            combined_df.drop_duplicates(subset=["Date", "Hour"], keep='last', inplace=True)
        except Exception as e:
            print(f"Σφάλμα ανάγνωσης παλιού JSON: {e}")
            combined_df = new_df
    else:
        combined_df = new_df
        
    # Ταξινομούμε βάσει ημερομηνίας και ώρας
    combined_df.sort_values(by=["Date", "Hour"], inplace=True)
    
    # Αποθήκευση!
    combined_df.to_json(json_path, orient='records', indent=2)
    print("\n✔ Η ενημέρωση της βάσης ολοκληρώθηκε επιτυχώς!")
