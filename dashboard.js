let rawData = [];
let currentLang = 'en'; 

let totalsChartInstance = null;
let flowsChartInstance = null;
let mcpChartInstance = null;
let arbitrageChartInstance = null;

let activeCountry = null;
let globalArbitrageData = {}; 

const i18n = {
    en: {
        title: "Greek Power Flows Analytics",
        source: "Data source: IPTO (SCADA & ISP) & ENTSO-E (MCPs)",
        lastUpdate: "Last Update:",
        nextUpdate: "Next Update:",
        dateLabel: "Date:",
        tabTotals: "Total Daily Isp vs Scada",
        tabHourly: "Hourly Profiles",
        tabArbitrage: "Financials & Arbitrage",
        totalsChartTitle: "Net Interconnection Flows per Country (ISP vs SCADA)",
        totalsChartSub: "Negative values (-) = Exports. Positive values (+) = Imports.",
        scheduled: "Scheduled (ISP)",
        actual: "Actual (SCADA)",
        flowsChartTitle: "Total Hourly Net Flows (ISP vs SCADA)",
        mcpChartTitle: "Day-Ahead Market Clearing Prices",
        
        // Tab 3
        kpiLabelCashFlow: "Net Cash Flow (€)",
        kpiLabelExp: "Total Exports (Income)",
        kpiLabelImp: "Total Imports (Cost)",
        kpiLabelStatus: "Physical Balance",
        exporter: "NET EXPORTER",
        importer: "NET IMPORTER",
        arbitrageChartTitle: "Hourly SCADA Flows & Applicable MCP",
        arbitrageChartSub: "Click on a country below to isolate flows and view the clearing price used for financial calculations.",
        colCountry: "Country",
        colNet: "Absolute Net MWh",
        colValue: "Cash Flow (€)",
        colPrice: "Dominant €/MWh"
    },
    el: {
        title: "Ανάλυση Ροών Ελληνικού Συστήματος",
        source: "Πηγή δεδομένων: ΑΔΜΗΕ (SCADA & ISP) & ENTSO-E",
        lastUpdate: "Τελευταία Ενημέρωση:",
        nextUpdate: "Επόμενη Ενημέρωση:",
        dateLabel: "Ημερομηνία:",
        tabTotals: "Σύνολο Ημερήσιων Ροών (Isp vs Scada)",
        tabHourly: "Ωριαία Προφίλ & MCP",
        tabArbitrage: "Οικονομικά & Arbitrage",
        totalsChartTitle: "Καθαρές Ροές Διασυνδέσεων ανά Χώρα (ISP vs SCADA)",
        totalsChartSub: "Αρνητικές τιμές (-) = Εξαγωγές. Θετικές τιμές (+) = Εισαγωγές (MWh).",
        scheduled: "Πρόγραμμα (ISP)",
        actual: "Πραγματικό (SCADA)",
        flowsChartTitle: "Συνολικές Ωριαίες Καθαρές Ροές (ISP vs SCADA)",
        mcpChartTitle: "Τιμές Εκκαθάρισης Αγοράς Επόμενης Ημέρας",

        // Tab 3
        kpiLabelCashFlow: "Καθαρό Ταμείο (€)",
        kpiLabelExp: "Συνολικές Εξαγωγές (Έσοδο)",
        kpiLabelImp: "Συνολικές Εισαγωγές (Κόστος)",
        kpiLabelStatus: "Φυσικό Ισοζύγιο",
        exporter: "ΚΑΘΑΡΟΣ ΕΞΑΓΩΓΕΑΣ",
        importer: "ΚΑΘΑΡΟΣ ΕΙΣΑΓΩΓΕΑΣ",
        arbitrageChartTitle: "Ωριαίες Ροές SCADA & Εφαρμοστέα MCP",
        arbitrageChartSub: "Επιλέξτε χώρα από τη λίστα για απομόνωση των ροών και εμφάνιση της τιμής εκκαθάρισης.",
        colCountry: "Χωρα",
        colNet: "Απολυτες MWh",
        colValue: "Ταμειο (€)",
        colPrice: "Κυρια Τιμη (€/MWh)"
    }
};

const countryColors = {
    AL: 'rgba(59, 130, 246, 0.8)', 
    BG: 'rgba(16, 185, 129, 0.8)', 
    IT: 'rgba(168, 85, 247, 0.8)', 
    MK: 'rgba(99, 102, 241, 0.8)', 
    TR: 'rgba(20, 184, 166, 0.8)'  
};

function setLang(lang) {
    currentLang = lang;
    const t = i18n[lang];
    
    document.getElementById('pageTitle').innerText = t.title;
    document.getElementById('mainTitle').innerText = t.title;
    document.getElementById('dataSourceText').innerText = t.source;
    document.getElementById('lastUpdateLabel').innerText = t.lastUpdate;
    document.getElementById('nextUpdateLabel').innerText = t.nextUpdate;
    document.getElementById('dateLabel').innerText = t.dateLabel;
    
    document.getElementById('tabBtnTotals').innerText = t.tabTotals;
    document.getElementById('tabBtnHourly').innerText = t.tabHourly;
    document.getElementById('tabBtnArbitrage').innerText = t.tabArbitrage;
    
    document.getElementById('totalsChartTitle').innerText = t.totalsChartTitle;
    document.getElementById('totalsChartSub').innerText = t.totalsChartSub;
    document.getElementById('flowsChartTitle').innerText = t.flowsChartTitle;
    document.getElementById('flowsChartSub').innerText = t.totalsChartSub; 
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

        const dates = [...new Set(rawData.map(row => row.Date))].sort().reverse();
        const select = document.getElementById('dateSelect');
        select.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
        
        if (dates.length > 0) {
            updateUpdateTimes(dates[0]);
        }

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

function processArbitrageData(dayData) {
    const hours = dayData.Hourly.map(h => h.Hour);
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

    let expVol = 0, expEur = 0;
    let impVol = 0, impEur = 0;
    let summary = {};

    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        let cExpVol = 0, cExpEur = 0;
        let cImpVol = 0, cImpEur = 0;

        flows[c].forEach((mwh, i) => {
            let price = prices[c][i];
            if (mwh < 0) {
                // Εξαγωγή = Έσοδο (Απόλυτη τιμή MWh)
                let vol = Math.abs(mwh);
                cExpVol += vol;
                cExpEur += (vol * price);
            } else if (mwh > 0) {
                // Εισαγωγή = Κόστος
                cImpVol += mwh;
                cImpEur += (mwh * price);
            }
        });

        expVol += cExpVol;
        expEur += cExpEur;
        impVol += cImpVol;
        impEur += cImpEur;

        summary[c] = {
            expVol: cExpVol,
            expEur: cExpEur,
            impVol: cImpVol,
            impEur: cImpEur,
            netCashFlow: cExpEur - cImpEur, 
            netVol: cImpVol - cExpVol, // Positive = Net Importer, Negative = Net Exporter
            hourlyFlows: flows[c], 
            hourlyPrices: prices[c]
        };
    });

    globalArbitrageData = {
        hours: hours,
        summary: summary,
        expVol: expVol,
        expEur: expEur,
        expAvg: expVol > 0 ? (expEur / expVol) : 0,
        impVol: impVol,
        impEur: impEur,
        impAvg: impVol > 0 ? (impEur / impVol) : 0,
        netCashFlow: expEur - impEur,
        netVol: impVol - expVol
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

    // --- 1. UPDATE KPIs (Cash Flow Logic) ---
    const cashFlowSign = data.netCashFlow > 0 ? "+" : "";
    const cashFlowColor = data.netCashFlow >= 0 ? "text-emerald-400" : "text-rose-500";
    document.getElementById('kpiCashFlowVal').innerText = `${cashFlowSign}${data.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})} €`;
    document.getElementById('kpiCashFlowVal').className = `text-2xl font-bold ${cashFlowColor}`;

    document.getElementById('kpiExpVol').innerText = data.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiExpPrice').innerText = data.expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    document.getElementById('kpiImpVol').innerText = data.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiImpPrice').innerText = data.impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + " €/MWh";

    const isImporter = data.netVol >= 0;
    document.getElementById('kpiStatusVal').innerText = isImporter ? t.importer : t.exporter;
    document.getElementById('kpiStatusVal').className = `text-xl font-bold ${isImporter ? 'text-yellow-400' : 'text-rose-500'}`;

    // --- 2. UPDATE LIST ---
    const listContainer = document.getElementById('arbitrageListContainer');
    listContainer.innerHTML = ''; 

    const names = { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" };

    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const isNetImp = rowData.netVol >= 0;
        const dominantColor = isNetImp ? "text-yellow-400" : "text-rose-500";
        
        const opacityClass = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHoverClass = (activeCountry === c) ? "bg-slate-700/80" : "hover:bg-slate-700/50";

        // Βρίσκουμε τη Μέση Τιμή της ΚΥΡΙΑΣ κατεύθυνσης της χώρας
        const dominantAvg = isNetImp ? 
            (rowData.impVol > 0 ? rowData.impEur / rowData.impVol : 0) : 
            (rowData.expVol > 0 ? rowData.expEur / rowData.expVol : 0);
            
        const cashFlowFormatted = rowData.netCashFlow > 0 ? `+${rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})}` : rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0});

        const rowHTML = `
            <div onclick="toggleCountrySelection('${c}')" class="grid grid-cols-4 gap-4 p-4 border-b border-slate-700/50 cursor-pointer transition-all duration-300 ${opacityClass} ${bgHoverClass} text-center font-semibold text-sm">
                <div class="text-left pl-2 text-slate-300 flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${countryColors[c]}"></span>
                    ${names[c]}
                </div>
                <div class="${dominantColor}">${Math.abs(rowData.netVol).toLocaleString('el-GR', {maximumFractionDigits:0})}</div>
                <div class="${dominantColor}">${cashFlowFormatted} €</div>
                <div class="${dominantColor}">${dominantAvg.toLocaleString('el-GR', {maximumFractionDigits:2})}</div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', rowHTML);
    });

    // --- 3. UPDATE CHART ---
    if (arbitrageChartInstance) arbitrageChartInstance.destroy();

    const ctxArb = document.getElementById('arbitrageChart').getContext('2d');
    let datasets = [];

    if (activeCountry) {
        datasets.push({
            type: 'bar',
            label: `${names[activeCountry]} Flow (MW)`,
            data: data.summary[activeCountry].hourlyFlows,
            backgroundColor: countryColors[activeCountry],
            yAxisID: 'y'
        });
        datasets.push({
            type: 'line',
            label: `${names[activeCountry]} Applied MCP (€/MWh)`,
            data: data.summary[activeCountry].hourlyPrices,
            borderColor: '#f8fafc',
            borderWidth: 3,
            tension: 0.2,
            yAxisID: 'y1'
        });
    } else {
        ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
            datasets.push({
                type: 'bar',
                label: names[c],
                data: data.summary[c].hourlyFlows,
                backgroundColor: countryColors[c],
                yAxisID: 'y'
            });
        });
    }

    arbitrageChartInstance = new Chart(ctxArb, {
        data: { labels: data.hours, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let val = context.raw;
                            if (label.includes('MCP')) {
                                return `${label}: ${val.toLocaleString('el-GR', {maximumFractionDigits:2})} €/MWh`;
                            } else {
                                return `${label}: ${Math.round(val).toLocaleString('el-GR')} MW`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { 
                    type: 'linear', display: true, position: 'left', stacked: true,
                    title: { display: true, text: 'Flow (MW)' },
                    grid: { 
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                },
                y1: {
                    type: 'linear', display: activeCountry !== null, position: 'right',
                    title: { display: true, text: 'Price (€/MWh)' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderCharts() {
    if (rawData.length === 0) return;
    const selectedDate = document.getElementById('dateSelect').value;
    const dayData = rawData.find(row => row.Date === selectedDate);
    if (!dayData) return;

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

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

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
                {
                    label: t.scheduled,
                    data: ispTotals,
                    backgroundColor: 'rgba(6, 182, 212, 0.9)',
                    borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4
                },
                {
                    label: t.actual,
                    data: scadaTotals,
                    backgroundColor: 'rgba(249, 115, 22, 0.9)',
                    borderColor: '#f97316', borderWidth: 1, borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString('el-GR')} MWh` } },
                datalabels: {
                    color: '#f8fafc',
                    anchor: (context) => context.dataset.data[context.dataIndex] >= 0 ? 'end' : 'start',
                    align: (context) => context.dataset.data[context.dataIndex] >= 0 ? 'top' : 'bottom',
                    formatter: (value) => Math.round(value).toLocaleString('el-GR'),
                    font: { weight: 'bold', size: 11 }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    title: { display: true, text: 'MWh' },
                    grid: { 
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                }
            }
        }
    });

    const ctxFlows = document.getElementById('flowsChart').getContext('2d');
    flowsChartInstance = new Chart(ctxFlows, {
        type: 'bar',
        data: {
            labels: hours,
            datasets: [
                {
                    label: currentLang === 'el' ? 'Πρόγραμμα ISP (MW)' : 'Scheduled ISP (MW)', 
                    data: ispHourly,
                    backgroundColor: 'rgba(6, 182, 212, 0.9)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 2
                },
                {
                    label: currentLang === 'el' ? 'Πραγματικό SCADA (MW)' : 'Actual SCADA (MW)', 
                    data: scadaHourly,
                    backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                datalabels: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString('el-GR')} MW` } }
            },
            scales: {
                x: { grid: { display: false } },
                y: { 
                    title: { display: true, text: 'MW' },
                    grid: { 
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                }
            }
        }
    });

    const ctxMCP = document.getElementById('mcpChart').getContext('2d');
    mcpChartInstance = new Chart(ctxMCP, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                { label: 'GR (€/MWh)', data: mcpGR, borderColor: '#3b82f6', borderWidth: 2, tension: 0.2 },
                { label: 'BG (€/MWh)', data: mcpBG, borderColor: '#10b981', borderWidth: 2, tension: 0.2 },
                { label: 'IT (€/MWh)', data: mcpIT, borderColor: '#eab308', borderWidth: 2, tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { datalabels: { display: false } },
            scales: { y: { title: { display: true, text: '€/MWh' } } }
        }
    });
}

document.addEventListener('DOMContentLoaded', fetchLocalData);
