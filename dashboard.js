// =========================================================================
// POWER FLOWS DASHBOARD LOGIC (dashboard.js)
// =========================================================================

let rawData = [];
let currentLang = 'en'; 

let flowsChartInstance = null;
let mcpChartInstance = null;

// --- Dictionaries για Αγγλικά / Ελληνικά ---
const i18n = {
    en: {
        title: "Greek Power Flows Analytics",
        source: "Data source: IPTO (SCADA & ISP) & ENTSO-E (MCPs)",
        lastUpdate: "Latest Available Data:",
        dateLabel: "Date:",
        tabOverview: "Daily Flows & MCP",
        tabHistory: "Monthly Trends (Soon)",
        btnMethodology: "Methodology & Assumptions",
        btnClose: "Close",
        modalTitle: "Methodology & Core Assumptions",
        modalBody: `
            <p class="mb-3">This Dashboard analyzes the cross-border electricity flows of the Greek Interconnected System.</p>
            <ul class="list-disc pl-5 space-y-2 mb-4 text-slate-400">
                <li><strong class="text-slate-200">Data Source:</strong> Updated daily from the local GitHub JSON file, populated by automated Python scripts querying IPTO and ENTSO-E.</li>
                <li><strong class="text-slate-200">Sign Convention:</strong> Following standard analytical practices, <span class="text-rose-400 font-bold">Negative values</span> represent net Imports into the system, and <span class="text-emerald-400 font-bold">Positive values</span> represent net Exports out of the system.</li>
                <li><strong class="text-slate-200">ISP vs SCADA:</strong> The dashboard plots the scheduled flows (ISP/CBS) against the actual physical realization (SCADA) to visualize border deviations.</li>
            </ul>
        `
    },
    el: {
        title: "Ανάλυση Ροών Ελληνικού Συστήματος",
        source: "Πηγή δεδομένων: ΑΔΜΗΕ (SCADA & ISP) & ENTSO-E",
        lastUpdate: "Τελευταία Διαθέσιμα Δεδομένα:",
        dateLabel: "Ημερομηνία:",
        tabOverview: "Ημερήσιες Ροές & MCP",
        tabHistory: "Μηνιαίες Τάσεις (Σύντομα)",
        btnMethodology: "Μεθοδολογία & Παραδοχές",
        btnClose: "Κλείσιμο",
        modalTitle: "Μεθοδολογία & Βασικές Παραδοχές",
        modalBody: `
            <p class="mb-3">Το παρόν Dashboard αναλύει τις διασυνοριακές ροές ηλεκτρικής ενέργειας (Εισαγωγές/Εξαγωγές) του Ελληνικού Συστήματος.</p>
            <ul class="list-disc pl-5 space-y-2 mb-4 text-slate-400">
                <li><strong class="text-slate-200">Αποθήκευση Δεδομένων:</strong> Τα δεδομένα διαβάζονται τοπικά από το GitHub, αντλούνται μέσω Python API scripts (ΑΔΜΗΕ, ENTSO-E) και κανονικοποιούνται σε ωριαία βάση.</li>
                <li><strong class="text-slate-200">Σύμβαση Προσήμων:</strong> Οι <span class="text-rose-400 font-bold">Αρνητικές τιμές (-)</span> υποδηλώνουν Καθαρές Εισαγωγές στο σύστημα, ενώ οι <span class="text-emerald-400 font-bold">Θετικές τιμές (+)</span> υποδηλώνουν Καθαρές Εξαγωγές.</li>
                <li><strong class="text-slate-200">Πρόγραμμα vs Πραγματικότητα:</strong> Συγκρίνεται το Πρόγραμμα Αγοράς (ISP / Net CBS) με την πραγματική φυσική ροή των διασυνδέσεων (SCADA).</li>
            </ul>
        `
    }
};

function setLang(lang) {
    currentLang = lang;
    const t = i18n[lang];
    
    document.getElementById('pageTitle').innerText = t.title;
    document.getElementById('mainTitle').innerText = t.title;
    document.getElementById('dataSourceText').innerText = t.source;
    document.getElementById('lastUpdateLabel').innerText = t.lastUpdate;
    
    if(document.getElementById('btnMethodologyText')) document.getElementById('btnMethodologyText').innerText = t.btnMethodology;
    if(document.getElementById('modalTitle')) document.getElementById('modalTitle').innerText = t.modalTitle;
    if(document.getElementById('modalBody')) document.getElementById('modalBody').innerHTML = t.modalBody;
    if(document.getElementById('btnClose')) document.getElementById('btnClose').innerText = t.btnClose;

    document.getElementById('tabBtnOverview').innerText = t.tabOverview;
    document.getElementById('tabBtnHistory').innerText = t.tabHistory;
    document.getElementById('dateLabel').innerText = t.dateLabel;

    // Toggle button styles
    if(lang === 'el') {
        document.getElementById('btnGr').className = "px-2 py-1 rounded bg-cyan-600 text-white transition";
        document.getElementById('btnEn').className = "px-2 py-1 rounded text-slate-400 hover:text-white transition";
    } else {
        document.getElementById('btnEn').className = "px-2 py-1 rounded bg-cyan-600 text-white transition";
        document.getElementById('btnGr').className = "px-2 py-1 rounded text-slate-400 hover:text-white transition";
    }

    if (rawData.length > 0) renderCharts();
}

async function fetchLocalData() {
    const overlay = document.getElementById('loading-overlay');
    const progressBar = document.getElementById('loading-progress-bar');
    const progressPercentage = document.getElementById('loading-percentage');
    
    // Simulate initial loading sequence for UX
    setTimeout(() => { progressBar.style.width = '60%'; progressPercentage.innerText = '60%'; }, 200);

    try {
        // Διαβάζουμε απευθείας το JSON που παράγει το Python Action
        const response = await fetch('data/historical_flows.json');
        if (!response.ok) throw new Error("JSON file not found.");
        
        rawData = await response.json();
        
        setTimeout(() => { progressBar.style.width = '90%'; progressPercentage.innerText = '90%'; }, 400);

        // Find unique dates for the dropdown
        const dates = [...new Set(rawData.map(row => row.Date))].sort().reverse();
        const select = document.getElementById('dateSelect');
        select.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
        
        if (dates.length > 0) {
            document.getElementById('lastUpdateVal').innerText = dates[0];
        }

        progressBar.style.width = '100%'; 
        progressPercentage.innerText = '100%';

        // Hide overlay smoothly
        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.style.display = 'none', 500);
            
            // Set default language and render
            setLang('en');
        }, 500);

    } catch (error) {
        console.error("Error fetching local data:", error);
        document.getElementById('loading-subtitle').innerText = "Waiting for daily GitHub Action run. No data found yet.";
        document.getElementById('loading-subtitle').classList.add('text-rose-400');
    }
}

function renderCharts() {
    if (rawData.length === 0) return;
    
    const selectedDate = document.getElementById('dateSelect').value;
    const dayData = rawData.filter(row => row.Date === selectedDate);
    
    if (dayData.length === 0) return;

    // --- Prepare Arrays ---
    const hours = dayData.map(r => r.Hour);
    const scadaNet = dayData.map(r => r.SCADA_Net);
    const ispNet = dayData.map(r => r.ISP_Net);
    const mcpGR = dayData.map(r => r.MCP_GR);
    const mcpBG = dayData.map(r => r.MCP_BG);
    const mcpIT = dayData.map(r => r.MCP_IT);

    // --- Compute KPIs (SCADA based) ---
    let totalImports = 0;
    let totalExports = 0;
    scadaNet.forEach(val => {
        if (val < 0) totalImports += Math.abs(val);
        else totalExports += val;
    });
    const netBalance = totalExports - totalImports;

    document.getElementById('kpiTotalImports').innerText = totalImports.toLocaleString(undefined, {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiTotalExports').innerText = totalExports.toLocaleString(undefined, {maximumFractionDigits:0}) + " MWh";
    document.getElementById('kpiNetBalance').innerText = netBalance.toLocaleString(undefined, {maximumFractionDigits:0}) + " MWh";
    
    // Coloring logic for Net Balance
    const balEl = document.getElementById('kpiNetBalance');
    if (netBalance < 0) { balEl.className = "text-xl font-bold text-rose-400"; }
    else if (netBalance > 0) { balEl.className = "text-xl font-bold text-emerald-400"; }
    else { balEl.className = "text-xl font-bold text-white"; }

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    // --- Destroy existing charts if any ---
    if (flowsChartInstance) flowsChartInstance.destroy();
    if (mcpChartInstance) mcpChartInstance.destroy();

    // --- CHART 1: FLOWS ---
    const ctxFlows = document.getElementById('flowsChart').getContext('2d');
    flowsChartInstance = new Chart(ctxFlows, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                {
                    label: currentLang === 'el' ? 'Πραγματική Ροή SCADA (MW)' : 'Actual SCADA Net (MW)',
                    data: scadaNet,
                    borderColor: '#06b6d4', // Cyan
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2
                },
                {
                    label: currentLang === 'el' ? 'Πρόγραμμα ISP (MW)' : 'Scheduled ISP Net (MW)',
                    data: ispNet,
                    borderColor: '#f43f5e', // Rose
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { cornerRadius: 4 } },
            scales: { y: { title: { display: true, text: 'Megawatts (MW)' } } }
        }
    });

    // --- CHART 2: MCPs ---
    const ctxMCP = document.getElementById('mcpChart').getContext('2d');
    mcpChartInstance = new Chart(ctxMCP, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                {
                    label: 'Greece MCP (€/MWh)',
                    data: mcpGR,
                    borderColor: '#3b82f6', // Blue
                    borderWidth: 2, tension: 0.2
                },
                {
                    label: 'Bulgaria MCP (€/MWh)',
                    data: mcpBG,
                    borderColor: '#10b981', // Emerald
                    borderWidth: 2, tension: 0.2
                },
                {
                    label: 'Italy (Sud) MCP (€/MWh)',
                    data: mcpIT,
                    borderColor: '#eab308', // Yellow
                    borderWidth: 2, tension: 0.2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { cornerRadius: 4 } },
            scales: { y: { title: { display: true, text: 'Price (€/MWh)' } } }
        }
    });
}

// Εκκίνηση της διαδικασίας φόρτωσης
document.addEventListener('DOMContentLoaded', fetchLocalData);
