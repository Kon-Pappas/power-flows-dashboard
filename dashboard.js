let rawData = [];
let currentLang = 'en'; 

let totalsChartInstance = null;
let flowsChartInstance = null;
let mcpChartInstance = null;
let arbitrageChartInstance = null;
let mtdCashFlowChartInstance = null; 
let mtdVolumeChartInstance = null;   

let activeCountry = null;
let transitNettingOn = false;
let currentDayData = null;
let globalArbitrageData = {}; 

// ---- Έλεγχος πληρότητας δεδομένων ------------------------------------
// Μια ημέρα είναι "πλήρης" όταν έχει SCADA και αξιόπιστες τιμές MCP.
// Ημέρες που δεν είναι πλήρεις δεν μπαίνουν στα σωρευτικά (MTD) ούτε στο Best/Worst.
const MAX_ZERO_PRICE_HOURS = 12;

function priceSeriesOk(arr) {
    if (!arr || arr.length !== 24) return false;
    if (arr.some(v => v === null || v === undefined || Number.isNaN(v))) return false;
    return arr.filter(v => v === 0).length <= MAX_ZERO_PRICE_HOURS;
}

function hasScada(day) {
    if (day.Flags && typeof day.Flags.scada === 'boolean') return day.Flags.scada;
    // παλιά δεδομένα χωρίς Flags: όλο μηδέν = δεν υπάρχει SCADA
    return day.Hourly.some(h => (h.SCADA_Net || 0) !== 0);
}

function hasPrices(day) {
    const H = day.Hourly;
    const col = k => H.map(h => h[k]);
    if (!priceSeriesOk(col('MCP_GR'))) return false;
    const usesBG = H.some(h => (h.SCADA_BG || 0) !== 0);
    const usesIT = H.some(h => (h.SCADA_IT || 0) !== 0);
    if (usesBG && !priceSeriesOk(col('MCP_BG'))) return false;
    if (usesIT && !priceSeriesOk(col('MCP_IT'))) return false;
    return true;
}

function dayComplete(day) { return hasScada(day) && hasPrices(day); }

function updateDataNotice(dayData, excludedDates) {
    const t = i18n[currentLang];
    let el = document.getElementById('dataNotice');
    if (!el) {
        el = document.createElement('p');
        el.id = 'dataNotice';
        el.className = 'text-amber-400 text-xs mt-2';
        const ref = document.getElementById('dataSourceText');
        if (ref) ref.insertAdjacentElement('afterend', el);
    }
    const parts = [];
    if (dayData && !dayComplete(dayData)) parts.push(t.noticeDay);
    if (excludedDates.length > 0) {
        const list = excludedDates.map(d => d.substring(8, 10) + '/' + d.substring(5, 7)).join(', ');
        parts.push(t.noticeExcluded.replace('{n}', excludedDates.length) + ' (' + list + ')');
    }
    el.innerText = parts.join('  •  ');
    el.style.display = parts.length ? 'block' : 'none';
}

const i18n = {
    en: {
        title: "Greek Power Flows Analytics",
        source: "Data source: IPTO (SCADA & ISP) & ENTSO-E (MCPs)",
        lastUpdate: "Last Update:",
        nextUpdate: "Next Update:",
        dateLabel: "Date:",
        monthLabel: "Month:",
        tabTotals: "Daily Isp vs Scada",
        tabHourly: "Hourly Profiles",
        tabArbitrage: "Daily Arbitrage",
        tabMTD: "MTD Position",
        btnMethodology: "Methodology & Assumptions",
        
        totalsChartTitle: "Net Flows (ISP vs SCADA)",
        totalsChartSub: "Negative values (-) = Exports. Positive values (+) = Imports.",
        scheduled: "Scheduled (ISP)",
        actual: "Actual (SCADA)",
        flowsChartTitle: "Total Hourly Net Flows",
        mcpChartTitle: "Day-Ahead Market Clearing Prices",
        
        kpiLabelCashFlow: "Daily Cash Flow",
        kpiLabelExp: "Exports (Income)",
        kpiLabelImp: "Imports (Cost)",
        kpiLabelStatus: "Physical Balance",
        exporter: "NET EXPORTER",
        importer: "NET IMPORTER",
        arbitrageChartTitle: "Hourly SCADA & MCP",
        arbitrageChartSub: "Click on a country below to isolate flows and view the clearing price.",
        colCountry: "Country",
        colNet: "Imp / Exp (MWh)",
        colValue: "Cash Flow (€)",
        colPrice: "€/MWh",

        mtdLabelCashFlow: "MTD Cash Flow",
        mtdLabelExp: "MTD Total Exports (Income)",
        mtdLabelImp: "MTD Total Imports (Cost)",
        mtdLabelExtremes: "Best / Worst Day",
        mtdChartTitleCash: "Cumulative Financial Position (€)",
        mtdChartTitleVol: "Cumulative Physical Volume (GWh) - Gross & Net",

        // Modal EN
        modalTitle: "Methodology & Core Assumptions",
        modalIntro: "This Dashboard serves as an independent tool for monitoring and analyzing physical and financial power flows across the Greek interconnections.",
        modalDataTitle: "Data Sources:",
        modalDataText: "Physical flow data is fetched daily from IPTO's (ADMIE) official SCADA & ISP reports. Day-Ahead Market Clearing Prices (MCPs) are retrieved via the ENTSO-E Transparency Platform API.",
        modalPricingTitle: "Pricing Logic & Arbitrage:",
        modalPricingText: "For non-EUPHEMIA borders (Albania, North Macedonia, Turkey), the financial value is calculated using solely the Greek MCP. For EUPHEMIA-coupled borders (Italy, Bulgaria), the value is calculated using the average of the two domestic MCPs, reflecting the baseline methodology for congestion income.",
        modalSignTitle: "Sign Convention:",
        modalSignText: "Following ENEX standards, Red denotes Exports and Yellow denotes Imports. In financial calculations (Cash Flow), Exporting energy generates positive income (+), while Importing energy represents a cost (-).",
        modalCloseBtn: "Close",
        noticeDay: "⚠ Incomplete data for this date (missing SCADA or prices). Cash flow is not shown.",
        noticeExcluded: "⚠ {n} day(s) excluded from MTD (incomplete data)",
        notAvailable: "n/a",
        transitToggleLabel: "Remove BG↔IT transit",
        transitToggleTooltip: "When Greece simultaneously imports from one country and exports to the other, that shared energy is priced once, in the dominant direction, instead of twice. Import/export MWh figures never change — only the cash flow does.",
        transitInfoActive: "⇄ Transit removed in {n} hour(s) today",
        transitInfoNone: "No BG↔IT transit hours today — figures unchanged",
        transitBadgeTitle: "Transit-adjusted this day",
        transitDirLabel: "Transit energy removed from cash flow today:",
        transitDirItToBg: "Italy → Bulgaria (via Greece):",
        transitDirBgToIt: "Bulgaria → Italy (via Greece):",
        transitDirHours: "h",
        transitChartSub: "Amber bars = transit hours (this leg's cash removed today)."
    },
    el: {
        title: "Ανάλυση Ροών Ελληνικού Συστήματος",
        source: "Πηγή δεδομένων: ΑΔΜΗΕ (SCADA & ISP) & ENTSO-E",
        lastUpdate: "Τελευταία Ενημέρωση:",
        nextUpdate: "Επόμενη Ενημέρωση:",
        dateLabel: "Ημερομηνία:",
        monthLabel: "Μήνας:",
        tabTotals: "Ημερήσια Ροή",
        tabHourly: "Ωριαία Προφίλ",
        tabArbitrage: "Ημερήσιο Arbitrage",
        tabMTD: "Σωρευτική Θέση",
        btnMethodology: "Μεθοδολογία & Παραδοχές",
        
        totalsChartTitle: "Καθαρές Ροές (ISP vs SCADA)",
        totalsChartSub: "Αρνητικές τιμές (-) = Εξαγωγές. Θετικές τιμές (+) = Εισαγωγές.",
        scheduled: "Πρόγραμμα (ISP)",
        actual: "Πραγματικό (SCADA)",
        flowsChartTitle: "Συνολικές Ωριαίες Καθαρές Ροές",
        mcpChartTitle: "Τιμές Εκκαθάρισης (MCP)",

        kpiLabelCashFlow: "Ημερήσιο Ταμείο",
        kpiLabelExp: "Εξαγωγές (Έσοδο)",
        kpiLabelImp: "Εισαγωγές (Κόστος)",
        kpiLabelStatus: "Φυσικό Ισοζύγιο",
        exporter: "ΚΑΘΑΡΟΣ ΕΞΑΓΩΓΕΑΣ",
        importer: "ΚΑΘΑΡΟΣ ΕΙΣΑΓΩΓΕΑΣ",
        arbitrageChartTitle: "Ωριαίο SCADA & MCP",
        arbitrageChartSub: "Κλικ σε χώρα για απομόνωση και προβολή της εφαρμοζόμενης τιμής.",
        colCountry: "Χωρα",
        colNet: "Εισαγωγές / Εξαγωγές (MWh)",
        colValue: "Ταμειο (€)",
        colPrice: "€/MWh",

        mtdLabelCashFlow: "Σωρευτικό Ταμείο Μηνός",
        mtdLabelExp: "Συνολικές Εξαγωγές (Έσοδο)",
        mtdLabelImp: "Συνολικές Εισαγωγές (Κόστος)",
        mtdLabelExtremes: "Καλύτερη / Χειρότερη Μέρα",
        mtdChartTitleCash: "Σωρευτική Οικονομική Θέση (€)",
        mtdChartTitleVol: "Σωρευτικός Φυσικός Όγκος (GWh) - Ακαθάριστος & Καθαρός",

        // Modal EL
        modalTitle: "Μεθοδολογία & Παραδοχές",
        modalIntro: "Αυτό το Dashboard αποτελεί ένα ανεξάρτητο εργαλείο παρακολούθησης και ανάλυσης των φυσικών και οικονομικών ροών ενέργειας στις ελληνικές διασυνδέσεις.",
        modalDataTitle: "Πηγές Δεδομένων:",
        modalDataText: "Τα δεδομένα φυσικών ροών αντλούνται καθημερινά από τις επίσημες αναφορές SCADA & ISP του ΑΔΜΗΕ. Οι Τιμές Εκκαθάρισης (MCPs) αντλούνται μέσω του API της πλατφόρμας ENTSO-E.",
        modalPricingTitle: "Λογική Τιμολόγησης & Arbitrage:",
        modalPricingText: "Για τις μη-EUPHEMIA διασυνδέσεις (Αλβανία, Β. Μακεδονία, Τουρκία), η οικονομική αξία υπολογίζεται αποκλειστικά βάσει της Ελληνικής MCP. Για τις συζευγμένες διασυνδέσεις (Ιταλία, Βουλγαρία), χρησιμοποιείται ο μέσος όρος των δύο MCP, αντανακλώντας τη βασική μεθοδολογία υπολογισμού εσόδων συμφόρησης.",
        modalSignTitle: "Σύμβαση Προσήμων:",
        modalSignText: "Ακολουθώντας τα πρότυπα του ΕΝΕΧ, το Κόκκινο υποδηλώνει Εξαγωγές και το Κίτρινο Εισαγωγές. Στους οικονομικούς υπολογισμούς (Cash Flow), οι Εξαγωγές αποτελούν Έσοδο (+), ενώ οι Εισαγωγές αποτελούν Κόστος (-).",
        modalCloseBtn: "Κλείσιμο",
        noticeDay: "⚠ Ελλιπή δεδομένα για αυτή την ημερομηνία (λείπει SCADA ή τιμές). Το ταμείο δεν εμφανίζεται.",
        noticeExcluded: "⚠ {n} ημέρα(ες) εξαιρούνται από το MTD (ελλιπή δεδομένα)",
        notAvailable: "μ/δ",
        transitToggleLabel: "Αφαίρεση transit ΒΓ↔ΙΤ",
        transitToggleTooltip: "Όταν η Ελλάδα εισάγει ταυτόχρονα από τη μία χώρα και εξάγει προς την άλλη, η κοινή ενέργεια τιμολογείται μία φορά, στην κατεύθυνση που υπερισχύει, αντί για δύο. Τα MWh εισαγωγών/εξαγωγών δεν αλλάζουν ποτέ, μόνο το ταμείο.",
        transitInfoActive: "⇄ Αφαιρέθηκε transit σε {n} ώρα(ες) σήμερα",
        transitInfoNone: "Καμία ώρα transit ΒΓ↔ΙΤ σήμερα — τα νούμερα δεν αλλάζουν",
        transitBadgeTitle: "Προσαρμοσμένη ημέρα (transit)",
        transitDirLabel: "Διερχόμενη ενέργεια που αφαιρέθηκε σήμερα από το ταμείο:",
        transitDirItToBg: "Ιταλία → Βουλγαρία (μέσω Ελλάδας):",
        transitDirBgToIt: "Βουλγαρία → Ιταλία (μέσω Ελλάδας):",
        transitDirHours: "ω",
        transitChartSub: "Κίτρινες μπάρες = ώρες transit (το ταμείο αυτού του σκέλους αφαιρέθηκε σήμερα)."
    }
};

const countryColors = { AL: '#3b82f6', BG: '#10b981', IT: '#a855f7', MK: '#6366f1', TR: '#14b8a6' };

function setLang(lang) {
    currentLang = lang;
    const t = i18n[lang];
    
    document.getElementById('pageTitle').innerText = t.title;
    document.getElementById('mainTitle').innerText = t.title;
    document.getElementById('dataSourceText').innerText = t.source;
    document.getElementById('lastUpdateLabel').innerText = t.lastUpdate;
    document.getElementById('nextUpdateLabel').innerText = t.nextUpdate;
    document.getElementById('dateLabel').innerText = t.dateLabel;
    document.getElementById('monthLabel').innerText = t.monthLabel;
    document.getElementById('btnMethodology').innerText = t.btnMethodology;
    
    document.getElementById('tabBtnTotals').innerText = t.tabTotals;
    document.getElementById('tabBtnHourly').innerText = t.tabHourly;
    document.getElementById('tabBtnArbitrage').innerText = t.tabArbitrage;
    document.getElementById('tabBtnMTD').innerText = t.tabMTD;
    
    document.getElementById('totalsChartTitle').innerText = t.totalsChartTitle;
    document.getElementById('totalsChartSub').innerText = t.totalsChartSub;
    document.getElementById('flowsChartTitle').innerText = t.flowsChartTitle;
    document.getElementById('mcpChartTitle').innerText = t.mcpChartTitle;

    document.getElementById('kpiLabelCashFlow').innerText = t.kpiLabelCashFlow;
    document.getElementById('kpiLabelExp').innerText = t.kpiLabelExp;
    document.getElementById('kpiLabelImp').innerText = t.kpiLabelImp;
    document.getElementById('kpiLabelStatus').innerText = t.kpiLabelStatus;
    document.getElementById('arbitrageChartTitle').innerText = t.arbitrageChartTitle;
    document.getElementById('arbitrageChartSub').innerText = t.arbitrageChartSub;
    document.getElementById('colCountry').innerText = t.colCountry;
    document.getElementById('colNet').innerText = t.colNet;
    document.getElementById('colValue').innerText = t.colValue;
    document.getElementById('colPrice').innerText = t.colPrice;
    document.getElementById('transitToggleLabel').innerText = t.transitToggleLabel;
    document.getElementById('transitToggleTooltip').title = t.transitToggleTooltip;

    document.getElementById('mtdLabelCashFlow').innerText = t.mtdLabelCashFlow;
    document.getElementById('mtdLabelExp').innerText = t.mtdLabelExp;
    document.getElementById('mtdLabelImp').innerText = t.mtdLabelImp;
    document.getElementById('mtdLabelExtremes').innerText = t.mtdLabelExtremes;
    document.getElementById('mtdChartTitleCash').innerText = t.mtdChartTitleCash;
    document.getElementById('mtdChartTitleVol').innerText = t.mtdChartTitleVol;

    // Modal translations
    document.getElementById('modalTitle').innerText = t.modalTitle;
    document.getElementById('modalIntro').innerText = t.modalIntro;
    document.getElementById('modalDataTitle').innerText = t.modalDataTitle;
    document.getElementById('modalDataText').innerText = t.modalDataText;
    document.getElementById('modalPricingTitle').innerText = t.modalPricingTitle;
    document.getElementById('modalPricingText').innerText = t.modalPricingText;
    document.getElementById('modalSignTitle').innerText = t.modalSignTitle;
    document.getElementById('modalSignText').innerText = t.modalSignText;
    document.getElementById('modalCloseBtn').innerText = t.modalCloseBtn;

    if(lang === 'el') {
        document.getElementById('btnGr').className = "px-2 py-1 rounded bg-cyan-600 text-white transition";
        document.getElementById('btnEn').className = "px-2 py-1 rounded text-slate-400 hover:text-white transition";
    } else {
        document.getElementById('btnEn').className = "px-2 py-1 rounded bg-cyan-600 text-white transition";
        document.getElementById('btnGr').className = "px-2 py-1 rounded text-slate-400 hover:text-white transition";
    }
    if (rawData.length > 0) renderCharts();
}

function updateUpdateTimes(latestDateStr) {
    if (!latestDateStr) return;
    let parts = latestDateStr.split('-');
    if (parts.length === 3) {
        let lastStr = `${parts[2]}/${parts[1]}/${parts[0]} 08:00`;
        let d = new Date(parts[0], parts[1] - 1, parseInt(parts[2]) + 1);
        let day = String(d.getDate()).padStart(2, '0');
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let year = d.getFullYear();
        let nextStr = `${day}/${month}/${year} 08:00`;
        document.getElementById('lastUpdateVal').innerText = lastStr;
        document.getElementById('nextUpdateVal').innerText = nextStr;
    }
}

async function fetchLocalData() {
    const overlay = document.getElementById('loading-overlay');
    const progressBar = document.getElementById('loading-progress-bar');
    const progressPercentage = document.getElementById('loading-percentage');
    setTimeout(() => { progressBar.style.width = '60%'; progressPercentage.innerText = '60%'; }, 200);

    try {
        const response = await fetch('data/historical_flows.json');
        if (!response.ok) throw new Error("JSON file not found.");
        rawData = await response.json();
        
        setTimeout(() => { progressBar.style.width = '90%'; progressPercentage.innerText = '90%'; }, 400);

        const dates = [...new Set(rawData.map(row => row.Date))].sort().reverse();
        const byDate = {};
        rawData.forEach(r => { byDate[r.Date] = r; });
        document.getElementById('dateSelect').innerHTML = dates.map(d => `<option value="${d}">${d}${dayComplete(byDate[d]) ? '' : ' ⚠'}</option>`).join('');
        const latestComplete = dates.find(d => dayComplete(byDate[d])) || dates[0];
        if (latestComplete) document.getElementById('dateSelect').value = latestComplete;
        
        const months = [...new Set(rawData.map(row => row.Date.substring(0, 7)))].sort().reverse();
        document.getElementById('monthSelect').innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');

        if (dates.length > 0) updateUpdateTimes(dates[0]);

        progressBar.style.width = '100%'; 
        progressPercentage.innerText = '100%';
        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.style.display = 'none', 500);
            Chart.register(ChartDataLabels);
            setLang('en');
        }, 500);
    } catch (error) {
        console.error("Error fetching local data:", error);
    }
}

// ---- Οικονομικά ανά ώρα, με προαιρετική αφαίρεση transit Βουλγαρίας↔Ιταλίας --------
// Όταν η Ελλάδα εισάγει ταυτόχρονα από τη μία χώρα ΚΑΙ εξάγει προς την άλλη, μέρος της
// ενέργειας απλώς διέρχεται (transit) και σήμερα τιμολογείται ΔΙΠΛΑ (μία φορά ως εισαγωγή
// Ιταλίας, μία ως εξαγωγή Βουλγαρίας). Με το transitNetting=true, τις ώρες αυτές η κοινή
// ενέργεια τιμολογείται ΜΙΑ φορά, στην κατεύθυνση που υπερισχύει σε όγκο, με τη δική της
// τιμή (μέσος όρος MCP GR + της χώρας που υπερισχύει). Τα MWh εισαγωγών/εξαγωγών που
// βλέπει ο χρήστης ΔΕΝ αλλάζουν ποτέ· αλλάζει μόνο το ταμείο.
function computeHourlyEconomics(dayData, transitNetting) {
    const mcpGR = dayData.Hourly.map(h => h.MCP_GR);
    const mcpBG = dayData.Hourly.map(h => h.MCP_BG);
    const mcpIT = dayData.Hourly.map(h => h.MCP_IT);

    const flows = {
        AL: dayData.Hourly.map(h => h.SCADA_AL || 0),
        BG: dayData.Hourly.map(h => h.SCADA_BG || 0),
        IT: dayData.Hourly.map(h => h.SCADA_IT || 0),
        MK: dayData.Hourly.map(h => h.SCADA_MK || 0),
        TR: dayData.Hourly.map(h => h.SCADA_TR || 0)
    };
    const prices = {
        AL: mcpGR,
        BG: mcpGR.map((gr, i) => (gr + mcpBG[i]) / 2),
        IT: mcpGR.map((gr, i) => (gr + mcpIT[i]) / 2),
        MK: mcpGR,
        TR: mcpGR
    };

    const n = flows.AL.length;
    const amount = { AL: [], BG: [], IT: [], MK: [], TR: [] };
    const transitHours = [];
    const transitDetail = []; // null, or { dir: 'IT_TO_BG'|'BG_TO_IT', vol }

    for (let i = 0; i < n; i++) {
        const bg = flows.BG[i], it = flows.IT[i];
        let bgAmt = Math.abs(bg) * prices.BG[i];
        let itAmt = Math.abs(it) * prices.IT[i];
        let isTransit = false;
        let detail = null;

        const isCrossing = bg !== 0 && it !== 0 && Math.sign(bg) !== Math.sign(it);
        if (isCrossing) {
            // Το πραγματικά "διερχόμενο" ποσό είναι το μικρότερο από τα δύο σκέλη·
            // αυτό μπαίνει από τη μία χώρα και βγαίνει προς την άλλη χωρίς να αφήνει
            // καθαρό εμπορικό ίχνος. Η κατεύθυνση ακολουθεί ποια χώρα εισάγει.
            detail = { dir: it > 0 ? 'IT_TO_BG' : 'BG_TO_IT', vol: Math.min(Math.abs(bg), Math.abs(it)) };
        }
        if (transitNetting && isCrossing) {
            isTransit = true;
            const netVol = Math.abs(bg + it);
            if (Math.abs(it) >= Math.abs(bg)) { itAmt = netVol * prices.IT[i]; bgAmt = 0; }
            else { bgAmt = netVol * prices.BG[i]; itAmt = 0; }
        }

        amount.AL.push(Math.abs(flows.AL[i]) * prices.AL[i]);
        amount.BG.push(bgAmt);
        amount.IT.push(itAmt);
        amount.MK.push(Math.abs(flows.MK[i]) * prices.MK[i]);
        amount.TR.push(Math.abs(flows.TR[i]) * prices.TR[i]);
        transitHours.push(isTransit);
        transitDetail.push(detail);
    }
    return { flows, prices, amount, transitHours, transitDetail };
}

function aggregateEconomics(flows, amount) {
    let expEur = 0, impEur = 0, expVol = 0, impVol = 0;
    Object.keys(flows).forEach(c => {
        flows[c].forEach((mwh, i) => {
            if (mwh < 0) { expVol += Math.abs(mwh); expEur += amount[c][i]; }
            else if (mwh > 0) { impVol += mwh; impEur += amount[c][i]; }
        });
    });
    return { netCashFlow: expEur - impEur, netVol: impVol - expVol, expEur, impEur, expVol, impVol };
}

// Το MTD tab χρησιμοποιεί ΠΑΝΤΑ τη συνηθισμένη μέθοδο (χωρίς transit netting),
// ανεξάρτητα από το toggle του 3ου tab — το toggle αφορά αποκλειστικά το Daily Arbitrage.
function calculateDayNet(dayData, transitNetting) {
    const { flows, prices, amount } = computeHourlyEconomics(dayData, !!transitNetting);
    const overall = aggregateEconomics(flows, amount);
    return { ...overall, hourlyFlows: flows, hourlyPrices: prices };
}

function processArbitrageData(dayData, transitNetting) {
    const { flows, prices, amount, transitHours, transitDetail } = computeHourlyEconomics(dayData, !!transitNetting);
    const overall = aggregateEconomics(flows, amount);
    const complete = dayComplete(dayData);

    const transitByDirection = {
        IT_TO_BG: { vol: 0, hours: 0 },
        BG_TO_IT: { vol: 0, hours: 0 }
    };
    transitDetail.forEach(d => {
        if (!d) return;
        transitByDirection[d.dir].vol += d.vol;
        transitByDirection[d.dir].hours += 1;
    });

    let summary = {};
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const single = aggregateEconomics({ [c]: flows[c] }, { [c]: amount[c] });
        summary[c] = { ...single, hourlyFlows: flows[c], hourlyPrices: prices[c] };
    });

    globalArbitrageData = {
        complete: complete,
        hasScada: hasScada(dayData),
        transitNetting: !!transitNetting,
        transitHours: transitHours,
        transitHourCount: transitHours.filter(Boolean).length,
        transitByDirection: transitByDirection,
        transitDetail: transitDetail,
        hours: dayData.Hourly.map(h => h.Hour),
        summary: summary,
        expVol: overall.expVol, expEur: overall.expEur, expAvg: overall.expVol > 0 ? (overall.expEur/overall.expVol) : 0,
        impVol: overall.impVol, impEur: overall.impEur, impAvg: overall.impVol > 0 ? (overall.impEur/overall.impVol) : 0,
        netCashFlow: overall.netCashFlow, netVol: overall.netVol
    };
}

function toggleCountrySelection(countryCode) {
    if (activeCountry === countryCode) activeCountry = null; 
    else activeCountry = countryCode; 
    updateArbitrageTab(); 
}

function toggleTransitNetting() {
    transitNettingOn = document.getElementById('transitNettingToggle').checked;
    if (currentDayData) {
        processArbitrageData(currentDayData, transitNettingOn);
        updateArbitrageTab();
    }
}

function updateArbitrageTab() {
    const t = i18n[currentLang];
    const data = globalArbitrageData;
    if (!data) return;

    const toggleEl = document.getElementById('transitNettingToggle');
    if (toggleEl) toggleEl.checked = !!data.transitNetting;
    const infoEl = document.getElementById('transitInfoLine');
    if (infoEl) {
        if (data.transitNetting && data.transitHourCount > 0) {
            infoEl.innerText = t.transitInfoActive.replace('{n}', data.transitHourCount);
        } else if (data.transitNetting) {
            infoEl.innerText = t.transitInfoNone;
        } else {
            infoEl.innerText = '';
        }
    }

    const dirEl = document.getElementById('transitDirectionPanel');
    if (dirEl) {
        if (data.transitNetting && data.transitHourCount > 0) {
            const fmt = v => v.toLocaleString('el-GR', { maximumFractionDigits: 0 });
            const itBg = data.transitByDirection.IT_TO_BG;
            const bgIt = data.transitByDirection.BG_TO_IT;
            const rows = [];
            if (itBg.hours > 0) rows.push(`<div>${t.transitDirItToBg} <span class="text-cyan-300 font-semibold">${fmt(itBg.vol)} MWh</span> <span class="text-slate-500">(${itBg.hours}${t.transitDirHours})</span></div>`);
            if (bgIt.hours > 0) rows.push(`<div>${t.transitDirBgToIt} <span class="text-cyan-300 font-semibold">${fmt(bgIt.vol)} MWh</span> <span class="text-slate-500">(${bgIt.hours}${t.transitDirHours})</span></div>`);
            dirEl.innerHTML = `<div class="text-slate-400 mb-1">${t.transitDirLabel}</div>${rows.join('')}`;
            dirEl.style.display = 'block';
        } else {
            dirEl.innerHTML = '';
            dirEl.style.display = 'none';
        }
    }

    const cfSign = data.netCashFlow > 0 ? "+" : "";
    // ΑΛΛΑΓΗ 1: fuchsia-500 για αρνητικό Cash Flow 
    const cfColor = data.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500";
    if (data.complete) {
        document.getElementById('kpiCashFlowVal').innerText = `${cfSign}${data.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
        document.getElementById('kpiCashFlowVal').className = `text-2xl font-bold ${cfColor}`;
        document.getElementById('kpiExpVol').innerText = data.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
        document.getElementById('kpiExpPrice').innerText = data.expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";
        document.getElementById('kpiImpVol').innerText = data.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
        document.getElementById('kpiImpPrice').innerText = data.impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";
    } else {
        document.getElementById('kpiCashFlowVal').innerText = t.notAvailable;
        document.getElementById('kpiCashFlowVal').className = 'text-2xl font-bold text-slate-500';
        ['kpiExpVol','kpiExpPrice','kpiImpVol','kpiImpPrice'].forEach(id => { document.getElementById(id).innerText = t.notAvailable; });
    }

    const isImp = data.netVol >= 0;
    // Εδώ αφήνουμε το κόκκινο (rose-500) γιατί αφορά το Φυσικό Ισοζύγιο (Net Exporter = Εξαγωγές = Κόκκινο)
    if (data.complete || data.hasScada) {
        document.getElementById('kpiStatusVal').innerText = isImp ? t.importer : t.exporter;
        document.getElementById('kpiStatusVal').className = `text-xl font-bold ${isImp ? 'text-yellow-400' : 'text-rose-500'}`;
    } else {
        document.getElementById('kpiStatusVal').innerText = t.notAvailable;
        document.getElementById('kpiStatusVal').className = 'text-xl font-bold text-slate-500';
    }

    const listContainer = document.getElementById('arbitrageListContainer');
    listContainer.innerHTML = ''; 
    const names = { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" };
    
    const na0 = v => (data.hasScada ? v : '-');
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const opacity = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHover = (activeCountry === c) ? "bg-slate-700/80" : "hover:bg-slate-700/50";
        
        // Υπολογισμός Μέσων Τιμών για Εισαγωγές (Imp) και Εξαγωγές (Exp)
        const impAvg = rowData.impVol > 0 ? (rowData.impEur / rowData.impVol) : 0;
        const expAvg = rowData.expVol > 0 ? (rowData.expEur / rowData.expVol) : 0;
        
        // Μορφοποίηση νούμερων
        const impVolFmt = na0(rowData.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}));
        const expVolFmt = na0(rowData.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}));
        const impAvgFmt = !data.complete ? '-' : impAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
        const expAvgFmt = !data.complete ? '-' : expAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
        
        // Ταμείο (Παραμένει net cash flow στο κέντρο)
        const na = !data.complete;
        const cfFmt = na ? t.notAvailable : rowData.netCashFlow > 0 ? `+${rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})}` : rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0});
        const cfColor = na ? "text-slate-500" : (rowData.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500");

        const transitBadge = (data.transitNetting && data.transitHourCount > 0 && (c === 'BG' || c === 'IT'))
            ? `<span class="text-cyan-400 text-xs" title="${t.transitBadgeTitle}">⇄</span>` : '';

        listContainer.insertAdjacentHTML('beforeend', `
            <div onclick="toggleCountrySelection('${c}')" class="grid grid-cols-4 gap-4 p-4 border-b border-slate-700/50 cursor-pointer transition-all duration-300 ${opacity} ${bgHover} text-center font-semibold text-sm items-center">
                <div class="text-left pl-2 text-slate-300 flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${countryColors[c]}"></span>${names[c]} ${transitBadge}
                </div>
                
                <!-- ΝΕΟ: 2 γραμμές MWh (Imports / Exports) -->
                <div class="flex flex-col gap-1">
                    <div class="text-yellow-400" title="Imports">↓ ${impVolFmt}</div>
                    <div class="text-rose-500" title="Exports">↑ ${expVolFmt}</div>
                </div>
                
                <div class="${cfColor}">
                    ${cfFmt} €
                </div>
                
                <!-- ΝΕΟ: 2 γραμμές €/MWh (Imports / Exports) -->
                <div class="flex flex-col gap-1">
                    <div class="text-yellow-400">${impAvgFmt}</div>
                    <div class="text-rose-500">${expAvgFmt}</div>
                </div>
            </div>
        `);
    });

    if (arbitrageChartInstance) arbitrageChartInstance.destroy();
    const ctxArb = document.getElementById('arbitrageChart').getContext('2d');
    let datasets = [];
    if (activeCountry) {
        let barColors = countryColors[activeCountry];
        const showTransitColors = data.transitNetting && (activeCountry === 'BG' || activeCountry === 'IT');
        if (showTransitColors) {
            barColors = data.hours.map((_, i) => {
                const d = data.transitDetail[i];
                const involvesCountry = d && ((activeCountry === 'IT' && d.dir === 'IT_TO_BG') || (activeCountry === 'BG' && d.dir === 'BG_TO_IT'));
                return involvesCountry ? '#fbbf24' : countryColors[activeCountry];
            });
        }
        datasets.push({ type: 'bar', label: `${names[activeCountry]} Flow (MW)`, data: data.summary[activeCountry].hourlyFlows, backgroundColor: barColors, yAxisID: 'y' });
        datasets.push({ type: 'line', label: `Applied MCP (€/MWh)`, data: data.summary[activeCountry].hourlyPrices, borderColor: '#f8fafc', borderWidth: 3, tension: 0.2, yAxisID: 'y1' });
    } else {
        ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
            datasets.push({ type: 'bar', label: names[c], data: data.summary[c].hourlyFlows, backgroundColor: countryColors[c], yAxisID: 'y' });
        });
    }

    const showTransitColors = data.transitNetting && (activeCountry === 'BG' || activeCountry === 'IT');
    const arbSubEl = document.getElementById('arbitrageChartSub');
    if (arbSubEl) {
        arbSubEl.innerText = showTransitColors ? t.transitChartSub : t.arbitrageChartSub;
    }

    arbitrageChartInstance = new Chart(ctxArb, {
        data: { labels: data.hours, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { datalabels: { display: false } },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { type: 'linear', display: true, position: 'left', stacked: true, grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 } },
                y1: { type: 'linear', display: activeCountry !== null, position: 'right', grid: { display: false } }
            }
        }
    });
}

function renderMTDTab(selectedMonth) {
    const t = i18n[currentLang];
    const allMonthData = rawData.filter(r => r.Date.startsWith(selectedMonth)).sort((a,b) => a.Date.localeCompare(b.Date));
    const monthData = allMonthData.filter(dayComplete);
    const excludedDates = allMonthData.filter(r => !dayComplete(r)).map(r => r.Date);
    if(monthData.length === 0) {
        ['mtdCashFlowVal','mtdExpVol','mtdExpPrice','mtdImpVol','mtdImpPrice','mtdBestDay','mtdWorstDay'].forEach(id => { document.getElementById(id).innerText = '-'; });
        return excludedDates;
    }

    let cumEur = 0;
    let cumImpGwh = 0; 
    let cumExpGwh = 0; 

    let totalExpEur = 0, totalImpEur = 0, totalExpVol = 0, totalImpVol = 0;
    let bestDay = { date: '', val: -Infinity };
    let worstDay = { date: '', val: Infinity };

    let labels = [];
    let dataEur = [];
    let dataCumImp = []; 
    let dataCumExp = []; 
    let dataCumNet = [];

    monthData.forEach(day => {
        const d = calculateDayNet(day);
        
        cumEur += d.netCashFlow;
        cumImpGwh += (d.impVol / 1000);  
        cumExpGwh -= (d.expVol / 1000);  
        
        totalExpEur += d.expEur; totalImpEur += d.impEur;
        totalExpVol += d.expVol; totalImpVol += d.impVol;

        labels.push(day.Date.substring(8, 10)); 
        dataEur.push(cumEur);
        dataCumImp.push(cumImpGwh);
        dataCumExp.push(cumExpGwh);
        dataCumNet.push(cumImpGwh + cumExpGwh); 

        if (d.netCashFlow > bestDay.val) { bestDay.val = d.netCashFlow; bestDay.date = day.Date; }
        if (d.netCashFlow < worstDay.val) { worstDay.val = d.netCashFlow; worstDay.date = day.Date; }
    });

    const cfSign = cumEur > 0 ? "+" : "";
    // ΑΛΛΑΓΗ 2: fuchsia-500 για αρνητικό MTD Cash Flow
    const cfColor = cumEur >= 0 ? "text-emerald-400" : "text-fuchsia-500";
    document.getElementById('mtdCashFlowVal').innerText = `${cfSign}${cumEur.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
    document.getElementById('mtdCashFlowVal').className = `text-2xl font-bold ${cfColor}`;

    let expGwh = totalExpVol / 1000;
    let impGwh = totalImpVol / 1000;
    let expAvg = totalExpVol > 0 ? (totalExpEur / totalExpVol) : 0;
    let impAvg = totalImpVol > 0 ? (totalImpEur / totalImpVol) : 0;

    document.getElementById('mtdExpVol').innerText = expGwh.toLocaleString('el-GR', {maximumFractionDigits:1}) + " GWh";
    document.getElementById('mtdExpPrice').innerText = expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";
    document.getElementById('mtdImpVol').innerText = impGwh.toLocaleString('el-GR', {maximumFractionDigits:1}) + " GWh";
    document.getElementById('mtdImpPrice').innerText = impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    const formatDay = (d) => `${d.substring(8,10)}/${d.substring(5,7)}`;
    const bestSign = bestDay.val > 0 ? '+' : '';
    document.getElementById('mtdBestDay').innerText = `${formatDay(bestDay.date)} (${bestSign}${bestDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})} €)`;
    document.getElementById('mtdWorstDay').innerText = `${formatDay(worstDay.date)} (${worstDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})} €)`;

    if (mtdCashFlowChartInstance) mtdCashFlowChartInstance.destroy();
    const ctxCash = document.getElementById('mtdChartCashFlow').getContext('2d');
    mtdCashFlowChartInstance = new Chart(ctxCash, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cum. Cash Flow (€)',
                data: dataEur,
                // ΑΛΛΑΓΗ 3: Μωβ (fuchsia) fill και γραμμή κάτω από το μηδέν (rgba(217, 70, 239, 0.2) και #d946ef)
                fill: { target: 'origin', above: 'rgba(16, 185, 129, 0.2)', below: 'rgba(217, 70, 239, 0.2)' },
                segment: { borderColor: ctx => ctx.p1.parsed.y >= 0 ? '#10b981' : '#d946ef' },
                borderWidth: 2, tension: 0.3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { datalabels: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 } }
            }
        }
    });

    if (mtdVolumeChartInstance) mtdVolumeChartInstance.destroy();
    const ctxVol = document.getElementById('mtdChartVolume').getContext('2d');
    mtdVolumeChartInstance = new Chart(ctxVol, {
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Net GWh',
                    data: dataCumNet,
                    borderColor: '#ffffff', 
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 2
                },
                {
                    type: 'bar',
                    label: 'Imports (GWh)',
                    data: dataCumImp,
                    backgroundColor: 'rgba(250, 204, 21, 0.7)', 
                    stacked: true
                },
                {
                    type: 'bar',
                    label: 'Exports (GWh)',
                    data: dataCumExp,
                    backgroundColor: 'rgba(244, 63, 94, 0.7)', 
                    stacked: true
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let val = Math.abs(context.raw); 
                            return `${label}: ${val.toLocaleString('el-GR', {maximumFractionDigits:1})} GWh`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { 
                    stacked: true, 
                    grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 },
                    ticks: { callback: function(value) { return Math.abs(value); } }
                }
            }
        }
    });
    return excludedDates;
}

function renderCharts() {
    if (rawData.length === 0) return;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    const selectedDate = document.getElementById('dateSelect').value;
    const dayData = rawData.find(row => row.Date === selectedDate);
    
    if (dayData) {
        activeCountry = null;
        currentDayData = dayData;
        processArbitrageData(dayData, transitNettingOn);
        updateArbitrageTab();

        const countries = ["Albania", "Bulgaria", "Italy", "North Macedonia", "Turkey"];
        const ispTotals = countries.map(c => dayData.Totals.ISP[c] || 0);
        const scadaTotals = countries.map(c => dayData.Totals.SCADA[c] || 0);
        const hours = dayData.Hourly.map(h => h.Hour);
        const scadaHourly = dayData.Hourly.map(h => h.SCADA_Net);
        const ispHourly = dayData.Hourly.map(h => h.ISP_Net);
        const mcpGR = dayData.Hourly.map(h => h.MCP_GR);
        const mcpBG = dayData.Hourly.map(h => h.MCP_BG);
        const mcpIT = dayData.Hourly.map(h => h.MCP_IT);

        if (totalsChartInstance) totalsChartInstance.destroy();
        if (flowsChartInstance) flowsChartInstance.destroy();
        if (mcpChartInstance) mcpChartInstance.destroy();

        const t = i18n[currentLang];

        const ctxTotals = document.getElementById('totalsChart').getContext('2d');
        totalsChartInstance = new Chart(ctxTotals, {
            type: 'bar',
            data: {
                labels: currentLang === 'el' ? ["Αλβανία", "Βουλγαρία", "Ιταλία", "Β. Μακεδονία", "Τουρκία"] : countries,
                datasets: [
                    { label: t.scheduled, data: ispTotals, backgroundColor: 'rgba(6, 182, 212, 0.9)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4 },
                    { label: t.actual, data: scadaTotals, backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 } } } }
        });

        const ctxFlows = document.getElementById('flowsChart').getContext('2d');
        flowsChartInstance = new Chart(ctxFlows, {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [
                    { label: currentLang==='el' ? 'Πρόγραμμα ISP' : 'Scheduled ISP', data: ispHourly, backgroundColor: 'rgba(6, 182, 212, 0.9)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 2 },
                    { label: currentLang==='el' ? 'Πραγματικό SCADA' : 'Actual SCADA', data: scadaHourly, backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 2 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 } } } }
        });

        const ctxMCP = document.getElementById('mcpChart').getContext('2d');
        mcpChartInstance = new Chart(ctxMCP, {
            type: 'line',
            data: { labels: hours, datasets: [
                { label: 'GR (€/MWh)', data: mcpGR, borderColor: '#3b82f6', borderWidth: 2, tension: 0.2 },
                { label: 'BG (€/MWh)', data: mcpBG, borderColor: '#10b981', borderWidth: 2, tension: 0.2 },
                { label: 'IT (€/MWh)', data: mcpIT, borderColor: '#eab308', borderWidth: 2, tension: 0.2 }
            ]},
            options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } } }
        });
    }

    const selectedMonth = document.getElementById('monthSelect').value;
    let excludedDates = [];
    if (selectedMonth) {
        excludedDates = renderMTDTab(selectedMonth) || [];
    }
    updateDataNotice(dayData, excludedDates);
}

document.addEventListener('DOMContentLoaded', fetchLocalData);
