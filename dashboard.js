let rawData = [];
let currentLang = 'en'; 

let totalsChartInstance = null;
let flowsChartInstance = null;
let mcpChartInstance = null;
let arbitrageChartInstance = null;
let mtdCashFlowChartInstance = null; 
let mtdVolumeChartInstance = null;   

let activeCountry = null;
let globalArbitrageData = {}; 

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

        modalTitle: "Methodology & Core Assumptions",
        modalIntro: "This Dashboard serves as an independent tool for monitoring and analyzing physical and financial power flows across the Greek interconnections.",
        modalDataTitle: "Data Sources:",
        modalDataText: "Physical flow data is fetched daily from IPTO's (ADMIE) official SCADA & ISP reports. Day-Ahead Market Clearing Prices (MCPs) are retrieved via the ENTSO-E Transparency Platform API.",
        modalPricingTitle: "Pricing Logic & Arbitrage:",
        modalPricingText: "For non-EUPHEMIA borders (Albania, North Macedonia, Turkey), the financial value is calculated using solely the Greek MCP. For EUPHEMIA-coupled borders (Italy, Bulgaria), the value is calculated using the average of the two domestic MCPs, reflecting the baseline methodology for congestion income.",
        modalSignTitle: "Sign Convention:",
        modalSignText: "Following ENEX standards, Red denotes Exports and Yellow denotes Imports. In financial calculations (Cash Flow), Exporting energy generates positive income (+), while Importing energy represents a cost (-).",
        modalCloseBtn: "Close"
    },
    el: {
        title: "Ανάλυση Ροών Ελληνικού Συστήματος",
        source: "Πηγή δεδομένων: ΑΔΜΗΕ (SCADA & ISP) & ENTSO-E",
        lastUpdate: "Τελευταία Ενημέρωση:",
        nextUpdate: "Επόμενη Ενημέρωση:",
        dateLabel: "Ημερομηνία:",
        monthLabel: "Μήνας:",
        tabTotals: "Daily Isp vs Scada",
        tabHourly: "Hourly Profiles",
        tabArbitrage: "Daily Arbitrage",
        tabMTD: "MTD Position",
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

        modalTitle: "Μεθοδολογία & Παραδοχές",
        modalIntro: "Αυτό το Dashboard αποτελεί ένα ανεξάρτητο εργαλείο παρακολούθησης και ανάλυσης των φυσικών και οικονομικών ροών ενέργειας στις ελληνικές διασυνδέσεις.",
        modalDataTitle: "Πηγές Δεδομένων:",
        modalDataText: "Τα δεδομένα φυσικών ροών αντλούνται καθημερινά από τις επίσημες αναφορές SCADA & ISP του ΑΔΜΗΕ. Οι Τιμές Εκκαθάρισης (MCPs) αντλούνται μέσω του API της πλατφόρμας ENTSO-E.",
        modalPricingTitle: "Λογική Τιμολόγησης & Arbitrage:",
        modalPricingText: "Για τις μη-EUPHEMIA διασυνδέσεις (Αλβανία, Β. Μακεδονία, Τουρκία), η οικονομική αξία υπολογίζεται αποκλειστικά βάσει της Ελληνικής MCP. Για τις συζευγμένες διασυνδέσεις (Ιταλία, Βουλγαρία), χρησιμοποιείται ο μέσος όρος των δύο MCP, αντανακλώντας τη βασική μεθοδολογία υπολογισμού εσόδων συμφόρησης.",
        modalSignTitle: "Σύμβαση Προσήμων:",
        modalSignText: "Ακολουθώντας τα πρότυπα του ΕΝΕΧ, το Κόκκινο υποδηλώνει Εξαγωγές και το Κίτρινο Εισαγωγές. Στους οικονομικούς υπολογισμούς (Cash Flow), οι Εξαγωγές αποτελούν Έσοδο (+), ενώ οι Εισαγωγές αποτελούν Κόστος (-).",
        modalCloseBtn: "Κλείσιμο"
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

    document.getElementById('mtdLabelCashFlow').innerText = t.mtdLabelCashFlow;
    document.getElementById('mtdLabelExp').innerText = t.mtdLabelExp;
    document.getElementById('mtdLabelImp').innerText = t.mtdLabelImp;
    document.getElementById('mtdLabelExtremes').innerText = t.mtdLabelExtremes;
    document.getElementById('mtdChartTitleCash').innerText = t.mtdChartTitleCash;
    document.getElementById('mtdChartTitleVol').innerText = t.mtdChartTitleVol;

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
        document.getElementById('btnGr').className = "px-2.5 py-1 rounded bg-cyan-600 text-white transition text-xs font-bold";
        document.getElementById('btnEn').className = "px-2.5 py-1 rounded text-slate-400 hover:text-white transition text-xs font-bold";
    } else {
        document.getElementById('btnEn').className = "px-2.5 py-1 rounded bg-cyan-600 text-white transition text-xs font-bold";
        document.getElementById('btnGr').className = "px-2.5 py-1 rounded text-slate-400 hover:text-white transition text-xs font-bold";
    }
    if (rawData.length > 0) renderCharts();
}

function switchTab(tabName) {
    ['totals', 'hourly', 'arbitrage', 'mtd'].forEach(t => {
        document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.add('hidden');
        document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`).className = "px-4 py-2 text-xs font-bold rounded-t-lg bg-slate-900 text-slate-400 hover:text-white transition whitespace-nowrap";
    });
    document.getElementById(`tabContent${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.remove('hidden');
    document.getElementById(`tabBtn${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).className = "px-4 py-2 text-xs font-bold rounded-t-lg bg-cyan-600 text-white transition whitespace-nowrap";
    if (rawData.length > 0) renderCharts();
}

function openModal() { document.getElementById('methodologyModal').classList.remove('hidden'); }
function closeModal() { document.getElementById('methodologyModal').classList.add('hidden'); }

function updateUpdateTimes(latestDateStr) {
    if (!latestDateStr) return;
    let parts = latestDateStr.split('-');
    if (parts.length === 3) {
        let lastStr = `${parts[2]}/${parts[1]}/${parts[0]} 07:00`;
        let d = new Date(parts[0], parts[1] - 1, parseInt(parts[2]) + 1);
        let day = String(d.getDate()).padStart(2, '0');
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let year = d.getFullYear();
        let nextStr = `${day}/${month}/${year} 07:00`;
        document.getElementById('lastUpdateVal').innerText = lastStr;
        document.getElementById('nextUpdateVal').innerText = nextStr;
    }
}

function calculateDayNet(dayData) {
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

    let expEur = 0, impEur = 0;
    let expVol = 0, impVol = 0;

    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        flows[c].forEach((mwh, i) => {
            let price = prices[c][i];
            if (mwh < 0) {
                let vol = Math.abs(mwh);
                expVol += vol;
                expEur += (vol * price);
            } else if (mwh > 0) {
                impVol += mwh;
                impEur += (mwh * price);
            }
        });
    });

    return {
        netCashFlow: expEur - impEur,
        netVol: impVol - expVol, 
        expEur, impEur, expVol, impVol,
        hourlyFlows: flows, hourlyPrices: prices
    };
}

function processArbitrageData(dayData) {
    const d = calculateDayNet(dayData);
    let summary = {};
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        let cExpVol = 0, cExpEur = 0, cImpVol = 0, cImpEur = 0;
        d.hourlyFlows[c].forEach((mwh, i) => {
            let price = d.hourlyPrices[c][i];
            if (mwh < 0) { let v = Math.abs(mwh); cExpVol += v; cExpEur += (v*price); }
            else if (mwh > 0) { cImpVol += mwh; cImpEur += (mwh*price); }
        });
        summary[c] = {
            expVol: cExpVol, expEur: cExpEur, impVol: cImpVol, impEur: cImpEur,
            netCashFlow: cExpEur - cImpEur, netVol: cImpVol - cExpVol,
            hourlyFlows: d.hourlyFlows[c], hourlyPrices: d.hourlyPrices[c]
        };
    });

    globalArbitrageData = {
        hours: dayData.Hourly.map(h => h.Hour),
        summary: summary,
        expVol: d.expVol, expEur: d.expEur, expAvg: d.expVol > 0 ? (d.expEur/d.expVol) : 0,
        impVol: d.impVol, impEur: d.impEur, impAvg: d.impVol > 0 ? (d.impEur/d.impVol) : 0,
        netCashFlow: d.netCashFlow, netVol: d.netVol
    };
}

function toggleCountrySelection(countryCode) {
    if (activeCountry === countryCode) activeCountry = null; 
    else activeCountry = countryCode; 
    updateArbitrageTab(); 
}

function updateArbitrageTab() {
    const t = i18n[currentLang];
    const data = globalArbitrageData;
    if (!data) return;

    const cfSign = data.netCashFlow > 0 ? "+" : "";
    const cfColor = data.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500";
    document.getElementById('kpiCashFlowVal').innerText = `${cfSign}${data.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
    document.getElementById('kpiCashFlowVal').className = `text-lg sm:text-xl font-bold ${cfColor}`;
    
    document.getElementById('kpiExpVol').innerText = data.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiExpPrice').innerText = data.expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";
    document.getElementById('kpiImpVol').innerText = data.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiImpPrice').innerText = data.impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    const isImp = data.netVol >= 0;
    document.getElementById('kpiStatusVal').innerText = isImp ? t.importer : t.exporter;
    document.getElementById('kpiStatusVal').className = `text-base sm:text-lg font-bold ${isImp ? 'text-yellow-400' : 'text-rose-500'}`;

    const listContainer = document.getElementById('arbitrageListContainer');
    listContainer.innerHTML = ''; 
    const names = { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" };
    
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const opacity = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHover = (activeCountry === c) ? "bg-slate-800/80" : "hover:bg-slate-800/50";
        
        const impAvg = rowData.impVol > 0 ? (rowData.impEur / rowData.impVol) : 0;
        const expAvg = rowData.expVol > 0 ? (rowData.expEur / rowData.expVol) : 0;
        
        const impVolFmt = rowData.impVol.toLocaleString('el-GR', {maximumFractionDigits:0});
        const expVolFmt = rowData.expVol.toLocaleString('el-GR', {maximumFractionDigits:0});
        const impAvgFmt = impAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
        const expAvgFmt = expAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
        
        const cfFmt = rowData.netCashFlow > 0 ? `+${rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})}` : rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0});
        const cfColorRow = rowData.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500";

        listContainer.insertAdjacentHTML('beforeend', `
            <div onclick="toggleCountrySelection('${c}')" class="grid grid-cols-4 gap-2 p-3 border-b border-slate-800/50 cursor-pointer transition-all duration-300 ${opacity} ${bgHover} text-center font-semibold text-xs items-center">
                <div class="text-left pl-1 text-slate-300 flex items-center gap-1.5 truncate">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${countryColors[c]}"></span>
                    <span class="truncate">${names[c]}</span>
                </div>
                <div class="flex flex-col gap-0.5">
                    <div class="text-yellow-400">↓ ${impVolFmt}</div>
                    <div class="text-rose-500">↑ ${expVolFmt}</div>
                </div>
                <div class="${cfColorRow} truncate">
                    ${cfFmt} €
                </div>
                <div class="flex flex-col gap-0.5">
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
        datasets.push({ type: 'bar', label: `${names[activeCountry]} Flow (MW)`, data: data.summary[activeCountry].hourlyFlows, backgroundColor: countryColors[activeCountry], yAxisID: 'y' });
        datasets.push({ type: 'line', label: `Applied MCP (€/MWh)`, data: data.summary[activeCountry].hourlyPrices, borderColor: '#f8fafc', borderWidth: 2, tension: 0.2, yAxisID: 'y1' });
    } else {
        ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
            datasets.push({ type: 'bar', label: names[c], data: data.summary[c].hourlyFlows, backgroundColor: countryColors[c], yAxisID: 'y' });
        });
    }

    arbitrageChartInstance = new Chart(ctxArb, {
        data: { labels: data.hours, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { datalabels: { display: false } },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { type: 'linear', display: true, position: 'left', stacked: true, grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.5)' : '#1e293b', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 }, ticks: { font: { size: 10 } } },
                y1: { type: 'linear', display: activeCountry !== null, position: 'right', grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

function renderMTDTab(selectedMonth) {
    const monthData = rawData.filter(r => r.Date.startsWith(selectedMonth)).sort((a,b) => a.Date.localeCompare(b.Date));
    if(monthData.length === 0) return;

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
    const cfColor = cumEur >= 0 ? "text-emerald-400" : "text-fuchsia-500";
    document.getElementById('mtdCashFlowVal').innerText = `${cfSign}${cumEur.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
    document.getElementById('mtdCashFlowVal').className = `text-lg sm:text-xl font-bold ${cfColor}`;

    let expGwh = totalExpVol / 1000;
    let impGwh = totalImpVol / 1000;
    let expAvg = totalExpVol > 0 ? (totalExpEur / totalExpVol) : 0;
    let impAvg = totalImpVol > 0 ? (totalImpEur / totalImpVol) : 0;

    document.getElementById('mtdExpVol').innerText = expGwh.toLocaleString('el-GR', {maximumFractionDigits:1}) + " GWh";
    document.getElementById('mtdExpPrice').innerText = expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";
    document.getElementById('mtdImpVol').innerText = impGwh.toLocaleString('el-GR', {maximumFractionDigits:1}) + " GWh";
    document.getElementById('mtdImpPrice').innerText = impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    const formatDay = (d) => `${d.substring(8,10)}/${d.substring(5,7)}`;
    document.getElementById('mtdBestDay').innerText = `${formatDay(bestDay.date)} (+${bestDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})} €)`;
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
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.5)' : '#1e293b', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 }, ticks: { font: { size: 10 } } }
            }
        }
    });

    if (mtdVolumeChartInstance) mtdVolumeChartInstance.destroy();
    const ctxVol = document.getElementById('mtdChartVolume').getContext('2d');
    mtdVolumeChartInstance = new Chart(ctxVol, {
        data: {
            labels: labels,
            datasets: [
                { type: 'line', label: 'Net MWh', data: dataCumNet, borderColor: '#ffffff', borderWidth: 2, tension: 0.3, pointRadius: 2 },
                { type: 'bar', label: 'Imports (GWh)', data: dataCumImp, backgroundColor: 'rgba(250, 204, 21, 0.7)', stacked: true },
                { type: 'bar', label: 'Exports (GWh)', data: dataCumExp, backgroundColor: 'rgba(244, 63, 94, 0.7)', stacked: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                datalabels: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Math.abs(ctx.raw).toLocaleString('el-GR', {maximumFractionDigits:1})} GWh` } }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { stacked: true, grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.5)' : '#1e293b', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 }, ticks: { font: { size: 10 }, callback: v => Math.abs(v) } }
            }
        }
    });
}

function renderCharts() {
    if (rawData.length === 0) return;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#1e293b';

    const selectedDate = document.getElementById('dateSelect').value;
    const dayData = rawData.find(row => row.Date === selectedDate);
    
    if (dayData) {
        activeCountry = null;
        processArbitrageData(dayData);
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
            options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.5)' : '#1e293b', lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 }, ticks: { font: { size: 10 } } } } }
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
            options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.5)' : '#1e293b', lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 }, ticks: { font: { size: 10 } } } } }
        });

        const ctxMCP = document.getElementById('mcpChart').getContext('2d');
        mcpChartInstance = new Chart(ctxMCP, {
            type: 'line',
            data: { labels: hours, datasets: [
                { label: 'GR (€/MWh)', data: mcpGR, borderColor: '#3b82f6', borderWidth: 2, tension: 0.2 },
                { label: 'BG (€/MWh)', data: mcpBG, borderColor: '#10b981', borderWidth: 2, tension: 0.2 },
                { label: 'IT (€/MWh)', data: mcpIT, borderColor: '#eab308', borderWidth: 2, tension: 0.2 }
            ]},
            options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } }
        });
    }

    const selectedMonth = document.getElementById('monthSelect').value;
    if (selectedMonth) renderMTDTab(selectedMonth);
}

// --- WATERFALL BOOT SEQUENCE LOGIC ---

function animateStep(stepNum, nextAction) {
    const row = document.getElementById(`loadRow${stepNum}`);
    const bar = document.getElementById(`loadBar${stepNum}`);
    const pct = document.getElementById(`loadPct${stepNum}`);
    
    if (row) row.classList.remove('opacity-0');
    
    setTimeout(() => {
        if (bar) bar.style.width = '100%';
        let start = 0;
        const interval = setInterval(() => {
            start += 15;
            if (start >= 100) {
                start = 100;
                clearInterval(interval);
                if (pct) pct.innerHTML = `<svg class="w-3.5 h-3.5 text-emerald-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`;
                if (bar) {
                    if(stepNum === 1) bar.classList.replace('bg-blue-500', 'bg-emerald-500');
                    else bar.classList.replace('bg-purple-500', 'bg-emerald-500');
                }
            } else {
                if (pct) pct.innerText = start + '%';
            }
        }, 25);
        
        setTimeout(() => { if (nextAction) nextAction(); }, 300);
    }, 40);
}

function runBootSequence() {
    // Step 1: Data Fetching
    animateStep(1, async () => {
        try {
            const response = await fetch('data/historical_flows.json');
            if (!response.ok) throw new Error("JSON file not found.");
            rawData = await response.json();
            
            const dates = [...new Set(rawData.map(row => row.Date))].sort().reverse();
            document.getElementById('dateSelect').innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
            
            const months = [...new Set(rawData.map(row => row.Date.substring(0, 7)))].sort().reverse();
            document.getElementById('monthSelect').innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');

            if (dates.length > 0) updateUpdateTimes(dates[0]);

            // Step 2: Daily Isp vs Scada
            animateStep(2, () => {
                Chart.register(ChartDataLabels);
                
                // Step 3: Hourly Profiles
                animateStep(3, () => {
                    
                    // Step 4: Daily Arbitrage
                    animateStep(4, () => {
                        
                        // Step 5: MTD Position
                        animateStep(5, () => {
                            
                            setLang('en');
                            
                            const finalRow = document.getElementById('loadRow_FINAL');
                            const spinner = document.getElementById('mainSpinner');
                            
                            if (spinner) spinner.classList.add('hidden');
                            if (finalRow) {
                                finalRow.classList.remove('opacity-0', 'translate-y-2');
                                finalRow.classList.add('opacity-100', 'translate-y-0');
                            }
                            
                            setTimeout(() => {
                                const overlay = document.getElementById('loading-overlay');
                                if (overlay) {
                                    overlay.classList.add('opacity-0');
                                    setTimeout(() => overlay.style.display = 'none', 500); 
                                }
                            }, 600);
                            
                        }); 
                    }); 
                }); 
            }); 
            
        } catch (error) {
            console.error("Error during boot sequence:", error);
            document.getElementById('loadRow1').innerHTML = '<span class="text-rose-500 text-xs font-bold">Error loading data</span>';
        }
    }); 
}

window.addEventListener('load', () => {
    setTimeout(runBootSequence, 150);
});
