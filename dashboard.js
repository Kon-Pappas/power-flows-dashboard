let rawData = [];
let currentLang = 'en'; 

let totalsChartInstance = null;
let flowsChartInstance = null;
let mcpChartInstance = null;
let arbitrageChartInstance = null;
let mtdChartInstance = null; // Νέο γράφημα MTD

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
        
        // Tab 1 & 2
        totalsChartTitle: "Net Flows (ISP vs SCADA)",
        totalsChartSub: "Negative values (-) = Exports. Positive values (+) = Imports.",
        scheduled: "Scheduled (ISP)",
        actual: "Actual (SCADA)",
        flowsChartTitle: "Total Hourly Net Flows",
        mcpChartTitle: "Day-Ahead Market Clearing Prices",
        
        // Tab 3
        kpiLabelCashFlow: "Daily Cash Flow",
        kpiLabelExp: "Exports (Income)",
        kpiLabelImp: "Imports (Cost)",
        kpiLabelStatus: "Physical Balance",
        exporter: "NET EXPORTER",
        importer: "NET IMPORTER",
        arbitrageChartTitle: "Hourly SCADA & MCP",
        arbitrageChartSub: "Click on a country below to isolate flows and view the clearing price.",
        colCountry: "Country",
        colNet: "Abs. Net MWh",
        colValue: "Cash Flow (€)",
        colPrice: "Dominant €/MWh",

        // Tab 4 (MTD)
        mtdLabelCashFlow: "MTD Cash Flow",
        mtdLabelVolume: "MTD Net Volume",
        mtdLabelAvgPrice: "MTD Avg. Price",
        mtdLabelExtremes: "Best / Worst Day",
        mtdChartTitle: "Cumulative Financial & Physical Position",
        mtdChartSub: "Building the monthly balance day by day.",
        volExport: "Net Exporter (Total)",
        volImport: "Net Importer (Total)"
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
        colNet: "Απολυτες MWh",
        colValue: "Ταμειο (€)",
        colPrice: "Κυρια Τιμη (€/MWh)",

        // Tab 4
        mtdLabelCashFlow: "Σωρευτικό Ταμείο Μηνός",
        mtdLabelVolume: "Συνολικός Όγκος Μηνός",
        mtdLabelAvgPrice: "Μέση Σταθμική Τιμή",
        mtdLabelExtremes: "Καλύτερη / Χειρότερη Μέρα",
        mtdChartTitle: "Σωρευτική Οικονομική & Φυσική Θέση",
        mtdChartSub: "Ημερήσια απεικόνιση της εξέλιξης του μήνα.",
        volExport: "Καθαρός Εξαγωγέας Μηνός",
        volImport: "Καθαρός Εισαγωγέας Μηνός"
    }
};

const countryColors = { AL: '#3b82f6', BG: '#10b981', IT: '#a855f7', MK: '#6366f1', TR: '#14b8a6' };

function setLang(lang) {
    currentLang = lang;
    const t = i18n[lang];
    
    // Header & Tabs
    document.getElementById('pageTitle').innerText = t.title;
    document.getElementById('mainTitle').innerText = t.title;
    document.getElementById('dataSourceText').innerText = t.source;
    document.getElementById('lastUpdateLabel').innerText = t.lastUpdate;
    document.getElementById('nextUpdateLabel').innerText = t.nextUpdate;
    document.getElementById('dateLabel').innerText = t.dateLabel;
    document.getElementById('monthLabel').innerText = t.monthLabel;
    document.getElementById('tabBtnTotals').innerText = t.tabTotals;
    document.getElementById('tabBtnHourly').innerText = t.tabHourly;
    document.getElementById('tabBtnArbitrage').innerText = t.tabArbitrage;
    document.getElementById('tabBtnMTD').innerText = t.tabMTD;
    
    // Tab 1 & 2
    document.getElementById('totalsChartTitle').innerText = t.totalsChartTitle;
    document.getElementById('totalsChartSub').innerText = t.totalsChartSub;
    document.getElementById('flowsChartTitle').innerText = t.flowsChartTitle;
    document.getElementById('mcpChartTitle').innerText = t.mcpChartTitle;

    // Tab 3
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

    // Tab 4
    document.getElementById('mtdLabelCashFlow').innerText = t.mtdLabelCashFlow;
    document.getElementById('mtdLabelVolume').innerText = t.mtdLabelVolume;
    document.getElementById('mtdLabelAvgPrice').innerText = t.mtdLabelAvgPrice;
    document.getElementById('mtdLabelExtremes').innerText = t.mtdLabelExtremes;
    document.getElementById('mtdChartTitle').innerText = t.mtdChartTitle;
    document.getElementById('mtdChartSub').innerText = t.mtdChartSub;

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

        // Daily Options
        const dates = [...new Set(rawData.map(row => row.Date))].sort().reverse();
        document.getElementById('dateSelect').innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
        
        // Monthly Options (Extract YYYY-MM)
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

// Υπολογισμός Net Ημέρας (Επαναχρησιμοποιήσιμο)
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

    // 1. KPIs
    const cfSign = data.netCashFlow > 0 ? "+" : "";
    const cfColor = data.netCashFlow >= 0 ? "text-emerald-400" : "text-rose-500";
    document.getElementById('kpiCashFlowVal').innerText = `${cfSign}${data.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
    document.getElementById('kpiCashFlowVal').className = `text-2xl font-bold ${cfColor}`;
    document.getElementById('kpiExpVol').innerText = data.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiExpPrice').innerText = data.expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";
    document.getElementById('kpiImpVol').innerText = data.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiImpPrice').innerText = data.impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    const isImp = data.netVol >= 0;
    document.getElementById('kpiStatusVal').innerText = isImp ? t.importer : t.exporter;
    document.getElementById('kpiStatusVal').className = `text-xl font-bold ${isImp ? 'text-yellow-400' : 'text-rose-500'}`;

    // 2. LIST
    const listContainer = document.getElementById('arbitrageListContainer');
    listContainer.innerHTML = ''; 
    const names = { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" };
    
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const isNetImp = rowData.netVol >= 0;
        const domColor = isNetImp ? "text-yellow-400" : "text-rose-500";
        const opacity = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHover = (activeCountry === c) ? "bg-slate-700/80" : "hover:bg-slate-700/50";
        const domAvg = isNetImp ? (rowData.impVol > 0 ? rowData.impEur/rowData.impVol : 0) : (rowData.expVol > 0 ? rowData.expEur/rowData.expVol : 0);
        const cfFmt = rowData.netCashFlow > 0 ? `+${rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})}` : rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0});

        listContainer.insertAdjacentHTML('beforeend', `
            <div onclick="toggleCountrySelection('${c}')" class="grid grid-cols-4 gap-4 p-4 border-b border-slate-700/50 cursor-pointer transition-all duration-300 ${opacity} ${bgHover} text-center font-semibold text-sm">
                <div class="text-left pl-2 text-slate-300 flex items-center gap-2"><span class="w-3 h-3 rounded-full" style="background-color: ${countryColors[c]}"></span>${names[c]}</div>
                <div class="${domColor}">${Math.abs(rowData.netVol).toLocaleString('el-GR', {maximumFractionDigits:0})}</div>
                <div class="${domColor}">${cfFmt} €</div>
                <div class="${domColor}">${domAvg.toLocaleString('el-GR', {maximumFractionDigits:2})}</div>
            </div>
        `);
    });

    // 3. CHART
    if (arbitrageChartInstance) arbitrageChartInstance.destroy();
    const ctxArb = document.getElementById('arbitrageChart').getContext('2d');
    let datasets = [];
    if (activeCountry) {
        datasets.push({ type: 'bar', label: `${names[activeCountry]} Flow (MW)`, data: data.summary[activeCountry].hourlyFlows, backgroundColor: countryColors[activeCountry], yAxisID: 'y' });
        datasets.push({ type: 'line', label: `Applied MCP (€/MWh)`, data: data.summary[activeCountry].hourlyPrices, borderColor: '#f8fafc', borderWidth: 3, tension: 0.2, yAxisID: 'y1' });
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
                x: { stacked: true, grid: { display: false } },
                y: { type: 'linear', display: true, position: 'left', stacked: true, grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 } },
                y1: { type: 'linear', display: activeCountry !== null, position: 'right', grid: { display: false } }
            }
        }
    });
}

function renderMTDTab(selectedMonth) {
    const t = i18n[currentLang];
    // Filter data for the month and sort ascending (Day 1 -> Day 31)
    const monthData = rawData.filter(r => r.Date.startsWith(selectedMonth)).sort((a,b) => a.Date.localeCompare(b.Date));
    if(monthData.length === 0) return;

    let cumEur = 0;
    let cumVol = 0;
    let totalExpEur = 0, totalImpEur = 0, totalExpVol = 0, totalImpVol = 0;
    let bestDay = { date: '', val: -Infinity };
    let worstDay = { date: '', val: Infinity };

    let labels = [];
    let dataEur = [];
    let dataVol = [];

    monthData.forEach(day => {
        const d = calculateDayNet(day);
        
        cumEur += d.netCashFlow;
        cumVol += d.netVol;
        
        totalExpEur += d.expEur; totalImpEur += d.impEur;
        totalExpVol += d.expVol; totalImpVol += d.impVol;

        labels.push(day.Date.substring(8, 10)); // Keep only DD
        dataEur.push(cumEur);
        dataVol.push(cumVol);

        if (d.netCashFlow > bestDay.val) { bestDay.val = d.netCashFlow; bestDay.date = day.Date; }
        if (d.netCashFlow < worstDay.val) { worstDay.val = d.netCashFlow; worstDay.date = day.Date; }
    });

    // 1. UPDATE KPIs
    const cfSign = cumEur > 0 ? "+" : "";
    const cfColor = cumEur >= 0 ? "text-emerald-400" : "text-rose-500";
    document.getElementById('mtdCashFlowVal').innerText = `${cfSign}${cumEur.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
    document.getElementById('mtdCashFlowVal').className = `text-2xl font-bold ${cfColor}`;

    const volColor = cumVol >= 0 ? "text-yellow-400" : "text-rose-500";
    document.getElementById('mtdVolumeVal').innerText = Math.abs(cumVol).toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('mtdVolumeVal').className = `text-2xl font-bold ${volColor}`;
    document.getElementById('mtdVolumeSub').innerText = cumVol >= 0 ? t.volImport : t.volExport;

    const totalMoney = totalExpEur + totalImpEur;
    const totalVolume = totalExpVol + totalImpVol;
    const avgPrice = totalVolume > 0 ? (totalMoney / totalVolume) : 0;
    document.getElementById('mtdAvgPriceVal').innerText = avgPrice.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    const formatDay = (d) => `${d.substring(8,10)}/${d.substring(5,7)}`;
    document.getElementById('mtdBestDay').innerText = `${formatDay(bestDay.date)} (+${bestDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})} €)`;
    document.getElementById('mtdWorstDay').innerText = `${formatDay(worstDay.date)} (${worstDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})} €)`;

    // 2. MTD CHART
    if (mtdChartInstance) mtdChartInstance.destroy();
    const ctxMTD = document.getElementById('mtdChart').getContext('2d');
    
    mtdChartInstance = new Chart(ctxMTD, {
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Cum. Cash Flow (€)',
                    data: dataEur,
                    yAxisID: 'yEur',
                    fill: {
                        target: 'origin',
                        above: 'rgba(16, 185, 129, 0.2)', // Emerald (Profit)
                        below: 'rgba(244, 63, 94, 0.2)'   // Rose (Loss)
                    },
                    segment: { borderColor: ctx => ctx.p1.parsed.y >= 0 ? '#10b981' : '#f43f5e' },
                    borderWidth: 2, tension: 0.3
                },
                {
                    type: 'line',
                    label: 'Cum. Net Volume (MWh)',
                    data: dataVol,
                    yAxisID: 'yMwh',
                    borderColor: '#cbd5e1', // Slate-300
                    borderDash: [5, 5],
                    borderWidth: 2, fill: false, tension: 0.3
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { datalabels: { display: false } },
            scales: {
                x: { grid: { display: false } },
                yEur: { 
                    type: 'linear', position: 'left',
                    title: { display: true, text: 'Cash Flow (€)' },
                    grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 }
                },
                yMwh: { 
                    type: 'linear', position: 'right',
                    title: { display: true, text: 'Volume (MWh)' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderCharts() {
    if (rawData.length === 0) return;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    // 1. Daily Data (Tabs 1, 2, 3)
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

    // 2. Monthly Data (Tab 4)
    const selectedMonth = document.getElementById('monthSelect').value;
    if (selectedMonth) {
        renderMTDTab(selectedMonth);
    }
}

document.addEventListener('DOMContentLoaded', fetchLocalData);
