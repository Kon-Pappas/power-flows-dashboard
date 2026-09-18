let rawData = [];
let currentLang = 'en'; 

let totalsChartInstance = null;
let flowsChartInstance = null;
let mcpChartInstance = null;
let arbitrageChartInstance = null;

// Global State for the 3rd Tab interactions
let activeCountry = null;
let globalArbitrageData = {}; // Stores calculated values for the interactive view

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
        kpiLabelStatus: "Daily Status",
        kpiLabelMwh: "Total Net Volume",
        kpiLabelEur: "Total Value (€)",
        kpiLabelAvg: "Avg Price (€/MWh)",
        exporter: "EXPORTER",
        importer: "IMPORTER",
        arbitrageChartTitle: "Hourly SCADA Flows & Applicable MCP",
        arbitrageChartSub: "Click on a country below to isolate flows and view the clearing price used for financial calculations.",
        colCountry: "Country",
        colNet: "Net MWh",
        colValue: "Value (€)",
        colPrice: "Avg €/MWh"
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
        kpiLabelStatus: "Ημερησιο Καθεστως",
        kpiLabelMwh: "Συνολικος Ογκος",
        kpiLabelEur: "Αξια Ροων (€)",
        kpiLabelAvg: "Μεση Τιμη (€/MWh)",
        exporter: "ΕΞΑΓΩΓΙΚΗ",
        importer: "ΕΙΣΑΓΩΓΙΚΗ",
        arbitrageChartTitle: "Ωριαίες Ροές SCADA & Εφαρμοστέα MCP",
        arbitrageChartSub: "Επιλέξτε χώρα από τη λίστα για απομόνωση των ροών και εμφάνιση της τιμής εκκαθάρισης.",
        colCountry: "Χωρα",
        colNet: "Καθαρες MWh",
        colValue: "Αξια (€)",
        colPrice: "Μεση €/MWh"
    }
};

const countryColors = {
    AL: 'rgba(59, 130, 246, 0.8)', // Blue
    BG: 'rgba(16, 185, 129, 0.8)', // Emerald
    IT: 'rgba(168, 85, 247, 0.8)', // Purple
    MK: 'rgba(99, 102, 241, 0.8)', // Indigo
    TR: 'rgba(20, 184, 166, 0.8)'  // Teal
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

    // Tab 3
    document.getElementById('kpiLabelStatus').innerText = t.kpiLabelStatus;
    document.getElementById('kpiLabelMwh').innerText = t.kpiLabelMwh;
    document.getElementById('kpiLabelEur').innerText = t.kpiLabelEur;
    document.getElementById('kpiLabelAvg').innerText = t.kpiLabelAvg;
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

// Utility: Δίνει χρώμα ανάλογα με το πρόσημο (Red = Exporter/-, Yellow = Importer/+)
function getStatusColor(val) {
    return val >= 0 ? "text-yellow-400" : "text-rose-500";
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

    // Ωριαίες Ροές
    const flows = {
        AL: dayData.Hourly.map(h => h.SCADA_AL || 0),
        BG: dayData.Hourly.map(h => h.SCADA_BG || 0),
        IT: dayData.Hourly.map(h => h.SCADA_IT || 0),
        MK: dayData.Hourly.map(h => h.SCADA_MK || 0),
        TR: dayData.Hourly.map(h => h.SCADA_TR || 0)
    };

    // Ωριαίες Τιμές (Κανόνες Euphemia & Non-Euphemia)
    const prices = {
        AL: mcpGR,
        BG: mcpGR.map((gr, i) => (gr + mcpBG[i]) / 2), // Euphemia Avg
        IT: mcpGR.map((gr, i) => (gr + mcpIT[i]) / 2), // Euphemia Avg
        MK: mcpGR,
        TR: mcpGR
    };

    let summary = {};
    let totalMwh = 0;
    let totalEur = 0;

    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        let sumMwh = 0;
        let sumEur = 0;
        
        flows[c].forEach((mwh, i) => {
            sumMwh += mwh;
            sumEur += (mwh * prices[c][i]);
        });

        totalMwh += sumMwh;
        totalEur += sumEur;

        summary[c] = {
            mwh: sumMwh,
            eur: sumEur,
            avg: sumMwh !== 0 ? (sumEur / sumMwh) : 0,
            hourlyFlows: flows[c],
            hourlyPrices: prices[c]
        };
    });

    globalArbitrageData = {
        hours: hours,
        flows: flows,
        prices: prices,
        summary: summary,
        totalMwh: totalMwh,
        totalEur: totalEur,
        totalAvg: totalMwh !== 0 ? (totalEur / totalMwh) : 0
    };
}

// Όταν κλικάρει ο χρήστης σε μια χώρα
function toggleCountrySelection(countryCode) {
    if (activeCountry === countryCode) {
        activeCountry = null; // Αποεπιλογή (Δείχνει όλα)
    } else {
        activeCountry = countryCode; // Επιλογή χώρας
    }
    updateArbitrageTab(); // Ζωγραφίζει ξανά τη λίστα και το γράφημα
}

function updateArbitrageTab() {
    const t = i18n[currentLang];
    const data = globalArbitrageData;
    if (!data) return;

    // --- 1. UPDATE KPIs (Top) ---
    const isImporter = data.totalMwh >= 0;
    const statusText = isImporter ? t.importer : t.exporter;
    const kpiColor = getStatusColor(data.totalMwh);

    document.getElementById('kpiStatusVal').innerText = statusText;
    document.getElementById('kpiStatusVal').className = `text-xl font-bold ${kpiColor}`;

    document.getElementById('kpiMwhVal').innerText = data.totalMwh.toLocaleString('el-GR', {maximumFractionDigits:0});
    document.getElementById('kpiMwhVal').className = `text-xl font-bold ${kpiColor}`;

    document.getElementById('kpiEurVal').innerText = data.totalEur.toLocaleString('el-GR', {maximumFractionDigits:0}) + " €";
    document.getElementById('kpiEurVal').className = `text-xl font-bold ${kpiColor}`;

    document.getElementById('kpiAvgVal').innerText = data.totalAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
    document.getElementById('kpiAvgVal').className = `text-xl font-bold ${kpiColor}`;

    // --- 2. UPDATE LIST (Bottom) ---
    const listContainer = document.getElementById('arbitrageListContainer');
    listContainer.innerHTML = ''; // Καθαρισμός

    const names = { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" };

    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const rowColor = getStatusColor(rowData.mwh);
        
        // Opacity logic: Αν έχει επιλεγεί άλλη χώρα, το κάνουμε 30%. Αλλιώς 100%.
        const opacityClass = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHoverClass = (activeCountry === c) ? "bg-slate-700/80" : "hover:bg-slate-700/50";

        const rowHTML = `
            <div onclick="toggleCountrySelection('${c}')" class="grid grid-cols-4 gap-4 p-4 border-b border-slate-700/50 cursor-pointer transition-all duration-300 ${opacityClass} ${bgHoverClass} text-center font-semibold text-sm">
                <div class="text-left pl-2 text-slate-300 flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${countryColors[c]}"></span>
                    ${names[c]}
                </div>
                <div class="${rowColor}">${rowData.mwh.toLocaleString('el-GR', {maximumFractionDigits:0})}</div>
                <div class="${rowColor}">${rowData.eur.toLocaleString('el-GR', {maximumFractionDigits:0})} €</div>
                <div class="${rowColor}">${rowData.avg.toLocaleString('el-GR', {maximumFractionDigits:2})}</div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', rowHTML);
    });

    // --- 3. UPDATE CHART (Middle) ---
    if (arbitrageChartInstance) arbitrageChartInstance.destroy();

    const ctxArb = document.getElementById('arbitrageChart').getContext('2d');
    
    let datasets = [];

    // Αν ΕΧΕΙ επιλεγεί χώρα -> 1 Μπάρα + 1 Γραμμή Τιμής
    if (activeCountry) {
        datasets.push({
            type: 'bar',
            label: `${names[activeCountry]} Flow (MW)`,
            data: data.summary[activeCountry].hourlyFlows,
            backgroundColor: countryColors[activeCountry],
            yAxisID: 'y' // Πάει στον αριστερό άξονα
        });
        
        datasets.push({
            type: 'line',
            label: `${names[activeCountry]} Applied MCP (€/MWh)`,
            data: data.summary[activeCountry].hourlyPrices,
            borderColor: '#f8fafc', // Λευκό για να ξεχωρίζει
            borderWidth: 3,
            tension: 0.2,
            yAxisID: 'y1' // Πάει στον δεξί άξονα (Τιμές)
        });
    } 
    // Αν ΔΕΝ έχει επιλεγεί χώρα -> Stacked Bars όλων των χωρών
    else {
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
                // Ο δεξιός άξονας εμφανίζεται ΜΟΝΟ όταν υπάρχει επιλεγμένη χώρα (άρα υπάρχει γραμμή τιμής)
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

    // Επεξεργασία για το Tab 3 (και reset selection)
    activeCountry = null;
    processArbitrageData(dayData);
    updateArbitrageTab();

    // --- Δεδομένα για Tabs 1 & 2 ---
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

    // --- CHART 1: TOTALS BAR CHART ---
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

    // --- CHART 2: HOURLY FLOWS ---
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

    // --- CHART 3: MCPs ---
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
