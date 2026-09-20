import os
import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import pytz

def fetch_entsoe_mcp(domain, target_date_str, token):
    """
    Φέρνει τις Τιμές Εκκαθάρισης (MCP) από το ENTSO-E.
    Είναι 'άτρωτη' σε:
    1. Διπλά νομίσματα (π.χ. BGN/EUR στη Βουλγαρία).
    2. Σκουπίδια Intraday (Δέχεται μόνο A62 - Day Ahead).
    3. Λανθασμένα positions (Υπολογίζει absolute time).
    4. Overlap PT15M/PT60M (Γεμίζει 96 slots με προτεραιότητα στο PT15M).
    
    Επιστρέφει ΠΑΝΤΑ μια λίστα 24 ωριαίων τιμών.
    """
    # 1. Υπολογισμός Ακριβούς UTC παραθύρου για την Ελληνική Ώρα
    gr_tz = pytz.timezone('Europe/Athens')
    local_start = gr_tz.localize(datetime.strptime(target_date_str, "%Y-%m-%d"))
    local_end = local_start + timedelta(days=1)
    
    utc_start = local_start.astimezone(pytz.utc)
    utc_end = local_end.astimezone(pytz.utc)
    
    periodStart = utc_start.strftime("%Y%m%d%H00")
    periodEnd = utc_end.strftime("%Y%m%d%H00")
    
    # 2. Κλήση στο ENTSO-E API
    url = "https://web-api.tp.entsoe.eu/api"
    params = {
        'securityToken': token,
        'documentType': 'A44', # Price Document
        'in_Domain': domain,
        'out_Domain': domain,
        'periodStart': periodStart,
        'periodEnd': periodEnd
    }
    
    response = requests.get(url, params=params)
    if response.status_code != 200:
        print(f"[ENTSO-E] Σφάλμα στο API για το domain {domain} (Status {response.status_code})")
        return [0.0] * 24
        
    ns = {'ns': 'urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:0'}
    try:
        root = ET.fromstring(response.content)
    except ET.ParseError:
        print(f"[ENTSO-E] Απέτυχε το XML parse για το domain {domain}.")
        return [0.0] * 24

    # 3. Αρχικοποίηση 96 slots (4 τέταρτα x 24 ώρες)
    quarters = [None] * 96
    
    # Το target_start_utc είναι το απόλυτο σημείο μηδέν της ημέρας σε UTC
    target_start_utc = utc_start.replace(tzinfo=None)
    
    # 4. Parsing του XML με βάση τα αυστηρά φίλτρα
    for ts in root.findall('ns:TimeSeries', ns):
        
        # ΦΙΛΤΡΟ 1: Μόνο Day-Ahead
        business_type = ts.find('ns:businessType', ns)
        if business_type is not None and business_type.text != "A62":
            continue
            
        # ΦΙΛΤΡΟ 2: Μόνο Ευρώ
        currency = ts.find('ns:currency_Unit.name', ns)
        if currency is not None and currency.text != "EUR":
            continue

        period = ts.find('ns:Period', ns)
        if period is None: 
            continue
        
        # Εξαγωγή του απόλυτου χρόνου εκκίνησης του TimeSeries
        period_start_str = period.find('ns:timeInterval/ns:start', ns).text.replace('Z', '')
        if len(period_start_str) == 16:
            period_start_utc = datetime.strptime(period_start_str, "%Y-%m-%dT%H:%M")
        else:
            period_start_utc = datetime.strptime(period_start_str[:19], "%Y-%m-%dT%H:%M:%S")
            
        resolution = period.find('ns:resolution', ns).text
        
        # Επεξεργασία των Points
        for point in period.findall('ns:Point', ns):
            pos_text = point.find('ns:position', ns).text
            price_text = point.find('ns:price.amount', ns).text
            
            if pos_text is None or price_text is None:
                continue
                
            pos = int(pos_text)
            price = float(price_text)
            
            if resolution == "PT15M":
                # Υπολογισμός απόλυτου χρόνου σημείου
                point_time = period_start_utc + timedelta(minutes=15 * (pos - 1))
                diff_minutes = int((point_time - target_start_utc).total_seconds() // 60)
                idx = diff_minutes // 15
                
                # Άμεση εγγραφή/overwrite στο slot (τα 15λεπτα έχουν προτεραιότητα)
                if 0 <= idx < 96:
                    quarters[idx] = price
                    
            elif resolution == "PT60M":
                # Υπολογισμός απόλυτου χρόνου σημείου
                point_time = period_start_utc + timedelta(hours=(pos - 1))
                diff_hours = int((point_time - target_start_utc).total_seconds() // 3600)
                
                if 0 <= diff_hours < 24:
                    start_idx = diff_hours * 4
                    # Fallback Λογική: Γράφει ΜΟΝΟ αν το slot είναι None
                    for i in range(4):
                        if quarters[start_idx + i] is None:
                            quarters[start_idx + i] = price

    # 5. Εξαγωγή 24 ωρών
    hourly_prices = []
    for h in range(24):
        # Απομονώνουμε τα 4 τέταρτα της κάθε ώρας
        q_slice = quarters[h*4 : h*4+4]
        # Κρατάμε μόνο τις έγκυρες τιμές (όχι None)
        valid_qs = [q for q in q_slice if q is not None]
        
        if len(valid_qs) > 0:
            # Βγάζουμε τον μέσο όρο των έγκυρων τετάρτων
            hourly_prices.append(round(sum(valid_qs) / len(valid_qs), 2))
        else:
            # Αν λείπουν εντελώς τα δεδομένα (π.χ. βλάβη ENTSO-E)
            hourly_prices.append(0.0)

    return hourly_prices

if __name__ == "__main__":
    print("Εκκίνηση διαδικασίας: Λήψη τιμών MCP από ENTSO-E...")
    
    entsoe_token = os.environ.get('ENTSOE_API_TOKEN')
    
    if not entsoe_token:
        print("ΣΦΑΛΜΑ: Δεν βρέθηκε το ENTSOE_API_TOKEN στα environment variables.")
        print("Αν τρέχεις τοπικά: set ENTSOE_API_TOKEN=το_κλειδί_σου")
        print("Αν τρέχεις σε GitHub Actions: Βάλε το στα Repository Secrets.")
    else:
        # Χρησιμοποιούμε τη σημερινή ημερομηνία για την αναζήτηση.
        # Αν θες αυστηρά την αυριανή (Day-Ahead), το αλλάζεις σε: datetime.now() + timedelta(days=1)
        target_date = datetime.now()
        target_date_str = target_date.strftime("%Y-%m-%d")

        # EIC Codes για τις χώρες
        dom_GR = '10YGR-HTSO-----Y'
        dom_BG = '10YCA-BULGARIA-R'
        dom_IT = '10YIT-GRTN-----B' # Κεντρική Ιταλία/Εθνικό

        mcp_data = {
            "date": target_date_str,
            "GR": fetch_entsoe_mcp(dom_GR, target_date_str, entsoe_token),
            "BG": fetch_entsoe_mcp(dom_BG, target_date_str, entsoe_token),
            "IT": fetch_entsoe_mcp(dom_IT, target_date_str, entsoe_token)
        }

        # Αποθήκευση στο αρχείο market_prices.json
        with open('market_prices.json', 'w', encoding='utf-8') as f:
            json.dump(mcp_data, f, ensure_ascii=False, indent=2)
        
        print(f"Επιτυχία: Οι τιμές MCP για {target_date_str} αποθηκεύτηκαν στο 'market_prices.json'.")
        
        # ---------------------------------------------------------
        # Σημείωση: Αν υπάρχει παλιός κώδικας σε αυτό το αρχείο 
        # που ενημέρωνε το historical_flows.json με δεδομένα ΑΔΜΗΕ,
        # μπορείς να τον προσθέσεις ακριβώς από κάτω.
        # ---------------------------------------------------------
