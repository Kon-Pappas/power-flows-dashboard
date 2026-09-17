let rawData = [];
let currentLang = 'en'; 

let totalsChartInstance = null;
let flowsChartInstance = null;
let mcpChartInstance = null;

const i18n = {
    en: {
        title: "Greek Power Flows Analytics",
        source: "Data source: IPTO (SCADA & ISP) & ENTSO-E (MCPs)",
        lastUpdate: "Last Update:",
        nextUpdate: "Next Update:",
        dateLabel: "Date:",
        tabTotals: "Total Daily Isp vs Scada",
        tabHourly: "Hourly Profiles",
        totalsChartTitle: "Net Interconnection Flows per Country (ISP vs SCADA)",
        totalsChartSub: "Negative values (-) = Exports (Load). Positive values (+) = Imports.",
        scheduled: "Scheduled (ISP)",
        actual: "Actual (SCADA)",
        flowsChartTitle: "Total Hourly Net Flows (ISP vs SCADA)",
        mcpChartTitle: "Day-Ahead Market Clearing Prices"
    },
    el: {
        title: "Ανάλυση Ροών Ελληνικού Συστήματος",
        source: "Πηγή δεδομένων: ΑΔΜΗΕ (SCADA & ISP) & ENTSO-E",
        lastUpdate: "Τελευταία Ενημέρωση:",
        nextUpdate: "Επόμενη Ενημέρωση:",
        dateLabel: "Ημερομηνία:",
        tabTotals: "Σύνολο Ημερήσιων Ροών (Isp vs Scada)",
        tabHourly: "Ωριαία Προφίλ & MCP",
        totalsChartTitle: "Καθαρές Ροές Διασυνδέσεων ανά Χώρα (ISP vs SCADA)",
        totalsChartSub: "Αρνητικές τιμές (-) = Εξαγωγές. Θετικές τιμές (+) = Εισαγωγές (MWh).",
        scheduled: "Πρόγραμμα (ISP)",
        actual: "Πραγματικό (SCADA)",
        flowsChartTitle: "Συνολικές Ωριαίες Καθαρές Ροές (ISP vs SCADA)",
        mcpChartTitle: "Τιμές Εκκαθάρισης Αγοράς Επόμενης Ημέρας"
    }
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
    document.getElementById('totalsChartTitle').innerText = t.totalsChartTitle;
    document.getElementById('totalsChartSub').innerText = t.totalsChartSub;
    document.getElementById('flowsChartTitle').innerText = t.flowsChartTitle;
    document.getElementById('mcpChartTitle').innerText = t.mcpChartTitle;

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
        // Ενημέρωση στις 07:00 αντί για 08:00
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

function renderCharts() {
    if (rawData.length === 0) return;
    
    const selectedDate = document.getElementById('dateSelect').value;
    const dayData = rawData.find(row => row.Date === selectedDate);
    
    if (!dayData) return;

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

    // --- CHART 1: TOTALS BAR CHART (Side-by-Side) ---
    const ctxTotals = document.getElementById('totalsChart').getContext('2d');
    totalsChartInstance = new Chart(ctxTotals, {
        type: 'bar',
        data: {
            labels: currentLang === 'el' ? ["Αλβανία", "Βουλγαρία", "Ιταλία", "Β. Μακεδονία", "Τουρκία"] : countries,
            datasets: [
                {
                    label: t.scheduled,
                    data: ispTotals,
                    backgroundColor: 'rgba(56, 189, 248, 0.9)', // Light Blue (Sky) για ISP
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: t.actual,
                    data: scadaTotals,
                    backgroundColor: 'rgba(249, 115, 22, 0.8)', // Orange για SCADA
                    borderColor: '#f97316',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString('el-GR')} MWh` }
                },
                datalabels: {
                    color: '#f8fafc',
                    anchor: (context) => context.dataset.data[context.dataIndex] >= 0 ? 'end' : 'start',
                    align: (context) => context.dataset.data[context.dataIndex] >= 0 ? 'top' : 'bottom',
                    formatter: (value) => Math.round(value).toLocaleString('el-GR'),
                    font: { weight: 'bold', size: 11 }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'MWh' },
                    grid: { color: '#334155' }
                },
                x: { grid: { display: false } }
            }
        }
    });

    // --- CHART 2: HOURLY FLOWS ---
    const ctxFlows = document.getElementById('flowsChart').getContext('2d');
    flowsChartInstance = new Chart(ctxFlows, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                {
                    label: currentLang === 'el' ? 'Πρόγραμμα ISP (MW)' : 'Scheduled ISP (MW)', 
                    data: ispHourly,
                    borderColor: '#38bdf8', // Light Blue (Sky) για ISP
                    borderDash: [5, 5],
                    borderWidth: 2, fill: false, tension: 0.2
                },
                {
                    label: currentLang === 'el' ? 'Πραγματικό SCADA (MW)' : 'Actual SCADA (MW)', 
                    data: scadaHourly,
                    borderColor: '#f97316', // Orange για SCADA
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2, fill: true, tension: 0.2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { datalabels: { display: false } },
            scales: { y: { title: { display: true, text: 'MW' } } }
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
