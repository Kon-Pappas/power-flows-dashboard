let rawData = [];
let currentLang = 'en';
// D04 (όπως live D10): αγγλικά από προεπιλογή· η τελευταία επιλογή του επισκέπτη κρατιέται στον browser του,
// στο κοινό κλειδί kp_lang, οπότε η γλώσσα τον ακολουθεί σε όλο το hub.
try { const l = localStorage.getItem('kp_lang'); if (l === 'el' || l === 'en') currentLang = l; } catch (e) { /* ιδιωτική περιήγηση */ }
let metaData = null;
let analysisData = null;   // data/analysis.json (D34, D36)   // data/meta.json: πότε έγινε η τελευταία λήψη και πότε η επόμενη (D06)

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
const MAX_ZERO_PRICE_HOURS = 12;

function priceSeriesOk(arr) {
    if (!arr || arr.length < 23 || arr.length > 25) return false;   // ημέρες 23 / 24 / 25 ωρών (D26)
    if (arr.some(v => v === null || v === undefined || Number.isNaN(v))) return false;
    return arr.filter(v => v === 0).length <= MAX_ZERO_PRICE_HOURS;
}

function hasScada(day) {
    if (day.Flags && typeof day.Flags.scada === 'boolean') return day.Flags.scada;
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

// Η πληρότητα υπολογίζεται στο Python (D13, Flags.complete). Ο τοπικός κανόνας από πάνω μένει
// μόνο για ημέρες που δεν έχουν ακόμη το πεδίο (πριν από την πρώτη εκτέλεση μετά το batch 3· K10).
function dayComplete(day) {
    if (day && day.Flags && typeof day.Flags.complete === 'boolean') return day.Flags.complete;
    return hasScada(day) && hasPrices(day);
}

function updateDataNotice(dayData) {
    const t = i18n[currentLang];
    let el = document.getElementById('dataNotice');
    if (!el) {
        el = document.createElement('p');
        el.id = 'dataNotice';
        el.className = 'text-amber-400 text-xs mt-2';
        const ref = document.getElementById('updateTimesRow');
        if (ref) ref.insertAdjacentElement('afterend', el);
    }
    const show = dayData && !dayComplete(dayData);
    el.innerHTML = show ? escapeHtml(t.noticeDay) + ` <button type="button" class="underline decoration-dotted underline-offset-2 hover:text-amber-200" onclick="openMethodology('m-complete')">${escapeHtml(t.methodLink)}</button>` : '';
    el.style.display = show ? 'block' : 'none';
}

// Η ειδοποίηση για ημέρες που εξαιρέθηκαν από το MTD αφορά αποκλειστικά το tab
// "MTD Position", οπότε εμφανίζεται μόνο εκεί, όχι σε όλο το dashboard.
function updateMtdExclusionNotice(excludedDates) {
    const t = i18n[currentLang];
    const el = document.getElementById('mtdExclusionNotice');
    if (!el) return;
    if (excludedDates.length > 0) {
        const list = excludedDates.map(d => d.substring(8, 10) + '/' + d.substring(5, 7)).join(', ');
        el.innerHTML = escapeHtml(t.noticeExcluded.replace('{n}', excludedDates.length) + ' (' + list + ')') + ` <button type="button" class="underline decoration-dotted underline-offset-2 hover:text-amber-200" onclick="openMethodology('m-complete')">${escapeHtml(t.methodLink)}</button>`;
        el.classList.remove('hidden');
    } else {
        el.innerText = '';
        el.classList.add('hidden');
    }
}

// ---- Helper Συνάρτηση για Δυναμικό Format στους Άξονες των Διαγραμμάτων ----
const formatAxisTick = (value, isAbsolute = false) => {
    let displayVal = isAbsolute ? Math.abs(value) : value;
    // Αν είμαστε σε Mobile View (<768px), κάνουμε τη σμίκρυνση
    if (window.innerWidth < 768) {
        let absVal = Math.abs(value);
        if (absVal >= 1000000) {
            return (displayVal / 1000000).toLocaleString('el-GR', {maximumFractionDigits: 1}) + 'Mil';
        } else if (absVal >= 1000) {
            return (displayVal / 1000).toLocaleString('el-GR', {maximumFractionDigits: 1}) + 'k';
        }
        return displayVal.toLocaleString('el-GR', {maximumFractionDigits: 1});
    }
    // Αλλιώς στο PC δίνουμε το νούμερο ολόκληρο
    return displayVal.toLocaleString('el-GR', {maximumFractionDigits: 0});
};

const i18n = {
    en: {
        title: "Greek Power Flows Analytics",
        locale: "en-GB",
        load: { title: "System Initialization", g1: "Data fetching", g2: "Building views", s1: "Reading the data", ready: "Dashboard is ready!", error: "The data could not be loaded. Reload the page in a few minutes." },
        source: "Data source: IPTO (SCADA & ISP) & ENTSO-E (MCPs)",
        lastUpdate: "Last update:",
        lastUpdateMobile: "Updated:",
        nextUpdate: "Next update:",
        nextUpdateMobile: "Next:",
        dateLabel: "Date:",
        today: "today",
        methodLink: "Methodology →",
        countries: { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" },
        priceCodes: { GR: "GR", BG: "BG", IT: "IT" },
        flowSeries: "{c} Flow (MW)",
        axisHour: "Greek time",
        tip: { hour: "Hour", deviation: "Deviation", greece: "Greece", spread: "Spread", imports: "Imports", exports: "Exports", net: "Net",
               lessExp: "Fewer exports than scheduled", moreExp: "More exports than scheduled", lessImp: "Fewer imports than scheduled", moreImp: "More imports than scheduled", opposite: "Opposite direction to the schedule",
               transit: "⇄ Transit hour {a} → {b} through Greece", netted: "⇄ Transit removed: this volume is priced once, on the other country",
               nettedNet: "⇄ Transit removed: only the net {v} MW is priced",
               flow: "Flow", applied: "Applied price", hourCash: "Cash flow of the hour", dayCash: "Cash flow of the day", cum: "Cumulative", upTo: "up to {d}" },
        appliedMcp: "Applied MCP (€/MWh)",
        mtdCumLegend: "Cum. Cash Flow (€)",
        mtdNetLegend: "Net GWh",
        mtdImpLegend: "Imports (GWh)",
        mtdExpLegend: "Exports (GWh)",
        transitInfoBtn: "How transit removal works",
        pillComplete: "Complete data",
        pillIncomplete: "Incomplete data",
        pillCompleteShort: "Complete",
        pillIncompleteShort: "Incomplete",
        btnMethodologyShort: "Methodology",
        toTop: "Back to top",
        monthLabel: "Month:",
        tabTotals: "Daily ISP vs SCADA",
        tabHourly: "Hourly Profiles",
        tabArbitrage: "Daily Arbitrage",
        tabMTD: "MTD Position",
        tabCountry: "By country",
        tabSat: "Interconnector day",
        sat: { dayTitle: "The day of the interconnections",
               subMeasured: "{d} · market prices, schedule (ADMIE ISP) and measured flow (SCADA)",
               subPrices: "{d} · final day-ahead prices only; the measured flow arrives tomorrow",
               none: "No notable events.", noData: "The analysis could not be loaded; the other tabs work normally.",
               monthTitle: "Saturation by month", monthSub: "Share of hours with a price difference of at least 1 €/MWh (market coupling broken)",
               month: "Month", pct: "Saturated", dirs: "Hours to {n} / to Greece", mwh: "MWh scheduled / measured", rent: "Congestion rent",
               ceilTitle: "Line ceilings", ceilSub: "Highest measured hourly flow per direction, with the 99th percentile; when the two almost coincide, the line keeps reaching its limit",
               imp: "Imports", exp: "Exports", p99: "P99" },
        sent: { coupled: "{L}: coupled all day.",
                dec1: "{L}: decoupled {w} ({h}), with Greece {cheap} by {avg} €/MWh on average (up to {max}).",
                other: " Opposite direction {w}.", cheaper: "cheaper", dearer: "more expensive",
                dec2: "Schedule to {to} up to {sp} MW{lim}; measured flow up to {ap} MW. Energy in the saturated hours: {sm} MWh scheduled, {am} MWh measured. Congestion rent (estimate): {rent}.",
                limIn: " ({p}% of the observed limit)", limOver: " ({p}% above the observed limit)",
                against: "{L}: {n} with flow against the price ({mwh} MWh).",
                newMax: "{L}: new period high for {dir}, {mw} MW at {h} (previous {prev} MW).", exp: "exports", imp: "imports",
                firstDec: "{L}: first decoupling after {n} days of full coupling.",
                maxSpread: "{L}: largest price difference of the month so far, {s} €/MWh.",
                deviation: "Total flow deviated from the schedule by {mw} MW per hour on average, above the usual for the last 30 days ({p90} MW).",
                h1: "1 hour", hn: "{n} hours", q1: "1 quarter-hour", qn: "{n} quarter-hours", many: "in {n} windows, from {a} to {b}",
                to: { BG: "Bulgaria", IT: "Italy", gr: "Greece" },
                limitation: "{L}: probable capacity limitation towards {to} at {cap} MW, {w} ({n}), against an observed limit of {lim} MW (estimate)." },
        hh: { title: "Hour by hour", sub: "Positive = imports, negative = exports. Bars: schedule; line: measured flow.",
              subToday: "Positive = imports, negative = exports. Schedule only; the measured flow arrives tomorrow.",
              sched: "Schedule (ISP)", meas: "Measured (SCADA)", sat: "Saturated hours", limit: "Observed limit", cap: "Probable limitation",
              spread: "Price GR − neighbour", yes: "saturated", no: "coupled" },
        lineCodes: { AL: "GR–AL", BG: "GR–BG", IT: "GR–IT", MK: "GR–MK", TR: "GR–TR" },
        zero: { day: "Zero flow all day · period {from} – {to} ({n})", dayOngoing: "Zero flow all day · since {from}, ongoing ({n} to {to})",
                restart: "Flow resumed at {h}, after {n} at zero ({from} – {to})", month: "{line}: {n} at zero this month ({ranges})",
                period: "{n} at zero in the period", start: " (start of the data)", d1: "1 day", dn: "{n} days",
                pending: "zero flow since {from}, ongoing (last measurement {to})" },
        ctry: { totalsTitle: "Net cash flow by country", sub: "{from} – {to} · {days} complete days · exports minus imports, measured flow × price",
                chartTitle: "Cash flow over time", month: "Month", week: "Week", all: "All", net: "Net", days: "{n} days",
                tableTitle: "Volumes and average prices", exports: "Exports", imports: "Imports", cash: "Cash flow",
                avg: "avg", noData: "The analysis could not be loaded; the other tabs work normally.",
                hint: "Tap a country in the list below to see its cumulative cash flow.", hintSel: "{c} selected · tap it again in the list to clear.",
                cum: "Cumulative", cumAxis: "cumulative, M€", ceil: "Line ceiling (measured, whole period)",
                satTitle: "Saturation by month (price difference ≥ 1 €/MWh)", satPct: "Saturated hours", satRent: "Congestion rent",
                satPhys: "Physically passed", satPhysHelp: "measured flow ÷ schedule in the saturated hours" },
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

        modalTitle: "Methodology, assumptions and limitations",
        modalModeShort: "Short",
        modalModeDetailed: "Detailed",
        modalCloseBtn: "Close",
        noticeDay: "⚠ Incomplete data for this date (missing SCADA or prices). Cash flow is not shown.",
        noticeExcluded: "⚠ {n} day(s) excluded from MTD (incomplete data)",
        notAvailable: "n/a",
        transitToggleLabel: "Remove BG↔IT transit",
        transitToggleTooltip: "When Greece simultaneously imports from one country and exports to the other, that shared energy is priced once, in the dominant direction, instead of twice. Import/export MWh figures never change — only the cash flow does.",
        transitInfoActive: "⇄ Transit removed in {n} hour(s) today",
        transitInfoNone: "No BG↔IT transit hours today — figures unchanged",
        transitBadgeTitle: "Transit-adjusted this day",
        transitDirLabel: "Transit Volumes Removed:",
        transitDirItToBg: "Italy → Bulgaria (via Greece):",
        transitDirBgToIt: "Bulgaria → Italy (via Greece):",
        transitDirHours: "h",
        transitChartSub: "Yellow bars = transit hours (this leg's cash removed today)."
    },
    el: {
        title: "Ανάλυση Ροών Ελληνικού Συστήματος",
        locale: "el-GR",
        load: { title: "Εκκίνηση", g1: "Λήψη δεδομένων", g2: "Προετοιμασία προβολών", s1: "Ανάγνωση δεδομένων", ready: "Το dashboard είναι έτοιμο!", error: "Τα δεδομένα δεν φορτώθηκαν. Ανανεώστε τη σελίδα σε λίγα λεπτά." },
        source: "Πηγή δεδομένων: ΑΔΜΗΕ (SCADA & ISP) & ENTSO-E",
        lastUpdate: "Τελευταία ενημέρωση:",
        lastUpdateMobile: "Ενημέρωση:",
        nextUpdate: "Επόμενη ενημέρωση:",
        nextUpdateMobile: "Επόμενη:",
        dateLabel: "Ημέρα:",
        today: "σήμερα",
        methodLink: "Μεθοδολογία →",
        countries: { AL: "Αλβανία", BG: "Βουλγαρία", IT: "Ιταλία", MK: "Β. Μακεδονία", TR: "Τουρκία" },
        priceCodes: { GR: "ΕΛ", BG: "ΒΓ", IT: "ΙΤ" },
        flowSeries: "Ροή {c} (MW)",
        axisHour: "Ώρα Ελλάδας",
        tip: { hour: "Ώρα", deviation: "Απόκλιση", greece: "Ελλάδα", spread: "Διαφορά", imports: "Εισαγωγές", exports: "Εξαγωγές", net: "Καθαρό",
               lessExp: "Λιγότερες εξαγωγές από το πρόγραμμα", moreExp: "Περισσότερες εξαγωγές από το πρόγραμμα", lessImp: "Λιγότερες εισαγωγές από το πρόγραμμα", moreImp: "Περισσότερες εισαγωγές από το πρόγραμμα", opposite: "Αντίθετη κατεύθυνση από το πρόγραμμα",
               transit: "⇄ Ώρα transit {a} → {b} μέσω Ελλάδας", netted: "⇄ Αφαίρεση transit: ο όγκος τιμολογείται μία φορά, στην άλλη χώρα",
               nettedNet: "⇄ Αφαίρεση transit: τιμολογείται μόνο το καθαρό {v} MW",
               flow: "Ροή", applied: "Εφαρμοζόμενη τιμή", hourCash: "Ταμείο ώρας", dayCash: "Ταμείο ημέρας", cum: "Σωρευτικό", upTo: "έως {d}" },
        appliedMcp: "Εφαρμοζόμενη τιμή (€/MWh)",
        mtdCumLegend: "Σωρευτικό ταμείο (€)",
        mtdNetLegend: "Καθαρό GWh",
        mtdImpLegend: "Εισαγωγές (GWh)",
        mtdExpLegend: "Εξαγωγές (GWh)",
        transitInfoBtn: "Πώς λειτουργεί η αφαίρεση transit",
        pillComplete: "Πλήρη δεδομένα",
        pillIncomplete: "Ελλιπή δεδομένα",
        pillCompleteShort: "Πλήρη",
        pillIncompleteShort: "Ελλιπή",
        btnMethodologyShort: "Μεθοδολογία",
        toTop: "Επάνω",
        monthLabel: "Μήνας:",
        tabTotals: "Ημερήσια ροή",
        tabHourly: "Ωριαία προφίλ",
        tabArbitrage: "Ημερήσιο Arbitrage",
        tabMTD: "Σωρευτική θέση",
        tabCountry: "Ανά χώρα",
        tabSat: "Ημέρα διασυνδέσεων",
        sat: { dayTitle: "Η ημέρα των διασυνδέσεων",
               subMeasured: "{d} · τιμές αγοράς, πρόγραμμα (ISP ΑΔΜΗΕ) και μετρημένη ροή (SCADA)",
               subPrices: "{d} · μόνο οι οριστικές τιμές της αγοράς επόμενης ημέρας· η μετρημένη ροή έρχεται αύριο",
               none: "Κανένα αξιοσημείωτο γεγονός.", noData: "Η ανάλυση δεν φορτώθηκε· τα υπόλοιπα tabs λειτουργούν κανονικά.",
               monthTitle: "Κορεσμός ανά μήνα", monthSub: "Ποσοστό ωρών με διαφορά τιμής από 1 €/MWh και πάνω (αποσύζευξη αγορών)",
               month: "Μήνας", pct: "Κορεσμός", dirs: "Ώρες προς {n} / προς Ελλάδα", mwh: "MWh πρόγραμμα / μετρημένα", rent: "Έσοδο συμφόρησης",
               ceilTitle: "Ταβάνι γραμμών", ceilSub: "Μέγιστη μετρημένη ωριαία ροή ανά κατεύθυνση και 99ο εκατοστημόριο· όταν σχεδόν ταυτίζονται, η γραμμή φτάνει συστηματικά το όριό της",
               imp: "Εισαγωγή", exp: "Εξαγωγή", p99: "P99" },
        sent: { coupled: "{L}: συζευγμένη όλο το 24ωρο.",
                dec1: "{L}: αποσύζευξη {w} ({h}), με την Ελλάδα {cheap} κατά {avg} €/MWh κατά μέσο όρο (έως {max}).",
                other: " Αντίθετα {w}.", cheaper: "φθηνότερη", dearer: "ακριβότερη",
                dec2: "Πρόγραμμα προς {to} έως {sp} MW{lim}· πραγματική ροή έως {ap} MW. Ενέργεια στις ώρες κορεσμού: {sm} MWh στο πρόγραμμα, {am} MWh μετρημένα. Έσοδο συμφόρησης (εκτίμηση): {rent}.",
                limIn: " ({p}% του παρατηρούμενου ορίου)", limOver: " ({p}% πάνω από το παρατηρούμενο όριο)",
                against: "{L}: {n} με ροή αντίθετα από την τιμή ({mwh} MWh).",
                newMax: "{L}: νέο μέγιστο {dir} της περιόδου, {mw} MW στις {h} (προηγούμενο {prev} MW).", exp: "εξαγωγής", imp: "εισαγωγής",
                firstDec: "{L}: πρώτη αποσύζευξη μετά από {n} ημέρες πλήρους σύζευξης.",
                maxSpread: "{L}: η μεγαλύτερη διαφορά τιμής του μήνα μέχρι σήμερα, {s} €/MWh.",
                deviation: "Η συνολική ροή απέκλινε από το πρόγραμμα κατά {mw} MW ανά ώρα κατά μέσο όρο, πάνω από το συνηθισμένο των 30 ημερών ({p90} MW).",
                h1: "1 ώρα", hn: "{n} ώρες", q1: "1 τέταρτο", qn: "{n} τέταρτα", many: "σε {n} διαστήματα, από {a} έως {b}",
                to: { BG: "Βουλγαρία", IT: "Ιταλία", gr: "Ελλάδα" },
                limitation: "{L}: πιθανός περιορισμός ικανότητας προς {to} στα {cap} MW, {w} ({n}), έναντι παρατηρούμενου ορίου {lim} MW (εκτίμηση)." },
        hh: { title: "Ώρα με την ώρα", sub: "Θετικό = εισαγωγή, αρνητικό = εξαγωγή. Μπάρες: πρόγραμμα· γραμμή: μετρημένη ροή.",
              subToday: "Θετικό = εισαγωγή, αρνητικό = εξαγωγή. Μόνο το πρόγραμμα· η μετρημένη ροή έρχεται αύριο.",
              sched: "Πρόγραμμα (ISP)", meas: "Μετρημένη (SCADA)", sat: "Ώρες κορεσμού", limit: "Παρατηρούμενο όριο", cap: "Πιθανός περιορισμός",
              spread: "Τιμή ΕΛ − γείτονα", yes: "κορεσμός", no: "σύζευξη" },
        lineCodes: { AL: "ΕΛ–ΑΛ", BG: "ΕΛ–ΒΓ", IT: "ΕΛ–ΙΤ", MK: "ΕΛ–ΒΜ", TR: "ΕΛ–ΤΡ" },
        zero: { day: "Μηδενική ροή όλη τη μέρα · διάστημα {from} – {to} ({n})", dayOngoing: "Μηδενική ροή όλη τη μέρα · από {from}, συνεχίζεται ({n} έως {to})",
                restart: "Η ροή επανήλθε στις {h}, μετά από {n} στο μηδέν ({from} – {to})", month: "{line}: {n} στο μηδέν αυτόν τον μήνα ({ranges})",
                period: "{n} στο μηδέν στην περίοδο", start: " (αρχή των δεδομένων)", d1: "1 ημέρα", dn: "{n} ημέρες",
                pending: "μηδενική ροή από {from}, συνεχίζεται (τελευταία μέτρηση {to})" },
        ctry: { totalsTitle: "Καθαρό ταμείο ανά χώρα", sub: "{from} – {to} · {days} πλήρεις ημέρες · εξαγωγές μείον εισαγωγές, μετρημένη ροή × τιμή",
                chartTitle: "Ταμείο στον χρόνο", month: "Μήνας", week: "Εβδομάδα", all: "Όλες", net: "Καθαρό", days: "{n} ημέρες",
                tableTitle: "Όγκοι και μέσες τιμές", exports: "Εξαγωγές", imports: "Εισαγωγές", cash: "Ταμείο",
                avg: "μέση", noData: "Η ανάλυση δεν φορτώθηκε· τα υπόλοιπα tabs λειτουργούν κανονικά.",
                hint: "Πατήστε μια χώρα στη λίστα από κάτω για τη σωρευτική πορεία της.", hintSel: "Επιλεγμένη: {c} · πατήστε την ξανά στη λίστα για καθαρισμό.",
                cum: "Σωρευτικό", cumAxis: "σωρευτικό, εκ. €", ceil: "Ταβάνι γραμμής (μετρημένο, όλη η περίοδος)",
                satTitle: "Κορεσμός ανά μήνα (διαφορά τιμής ≥ 1 €/MWh)", satPct: "Ώρες κορεσμού", satRent: "Έσοδο συμφόρησης",
                satPhys: "Πέρασε φυσικά", satPhysHelp: "μετρημένη ροή ÷ πρόγραμμα στις ώρες κορεσμού" },
        btnMethodology: "Μεθοδολογία & παραδοχές",
        
        totalsChartTitle: "Καθαρές ροές (ISP vs SCADA)",
        totalsChartSub: "Αρνητικές τιμές (-) = Εξαγωγές. Θετικές τιμές (+) = Εισαγωγές.",
        scheduled: "Πρόγραμμα (ISP)",
        actual: "Πραγματικό (SCADA)",
        flowsChartTitle: "Συνολικές ωριαίες καθαρές ροές",
        mcpChartTitle: "Τιμές εκκαθάρισης (MCP)",

        kpiLabelCashFlow: "Ημερήσιο ταμείο",
        kpiLabelExp: "Εξαγωγές (έσοδο)",
        kpiLabelImp: "Εισαγωγές (κόστος)",
        kpiLabelStatus: "Φυσικό ισοζύγιο",
        exporter: "Εξαγωγικό ισοζ.",
        importer: "Εισαγωγικό ισοζ.",
        arbitrageChartTitle: "Ωριαίο SCADA & MCP",
        arbitrageChartSub: "Κλικ σε χώρα για απομόνωση και προβολή της εφαρμοζόμενης τιμής.",
        colCountry: "Χώρα",
        colNet: "Εισαγωγές / εξαγωγές (MWh)",
        colValue: "Ταμείο (€)",
        colPrice: "€/MWh",

        mtdLabelCashFlow: "Σωρευτικό ταμείο μηνός",
        mtdLabelExp: "Συνολικές εξαγωγές (έσοδο)",
        mtdLabelImp: "Συνολικές εισαγωγές (κόστος)",
        mtdLabelExtremes: "Καλύτερη / χειρότερη μέρα",
        mtdChartTitleCash: "Σωρευτική οικονομική θέση (€)",
        mtdChartTitleVol: "Σωρευτικός φυσικός όγκος (GWh) – ακαθάριστος & καθαρός",

        modalTitle: "Μεθοδολογία, παραδοχές και περιορισμοί",
        modalModeShort: "Σύντομη",
        modalModeDetailed: "Αναλυτική",
        modalCloseBtn: "Κλείσιμο",
        noticeDay: "⚠ Ελλιπή δεδομένα για αυτή την ημερομηνία (λείπει SCADA ή τιμές). Το ταμείο δεν εμφανίζεται.",
        noticeExcluded: "⚠ {n} ημέρα(ες) εξαιρούνται από το MTD (ελλιπή δεδομένα)",
        notAvailable: "μ/δ",
        transitToggleLabel: "Αφαίρεση transit ΒΓ↔ΙΤ",
        transitToggleTooltip: "Όταν η Ελλάδα εισάγει ταυτόχρονα από τη μία χώρα και εξάγει προς την άλλη, η κοινή ενέργεια τιμολογείται μία φορά, στην κατεύθυνση που υπερισχύει, αντί για δύο. Τα MWh εισαγωγών/εξαγωγών δεν αλλάζουν ποτέ, μόνο το ταμείο.",
        transitInfoActive: "⇄ Αφαιρέθηκε transit σε {n} ώρα(ες) σήμερα",
        transitInfoNone: "Καμία ώρα transit ΒΓ↔ΙΤ σήμερα — τα νούμερα δεν αλλάζουν",
        transitBadgeTitle: "Προσαρμοσμένη ημέρα (transit)",
        transitDirLabel: "Αφαιρέθηκε Transit:",
        transitDirItToBg: "Ιταλία → Βουλγαρία (μέσω Ελλάδας):",
        transitDirBgToIt: "Βουλγαρία → Ιταλία (μέσω Ελλάδας):",
        transitDirHours: "ω",
        transitChartSub: "Κίτρινες μπάρες = ώρες transit (το ταμείο αυτού του σκέλους αφαιρέθηκε σήμερα)."
    }
};

// ---- Γραφήματα: ώρες, αριθμοί, tooltips (D20–D22, όπως live D21/D23/D27) ------
// Ώρα από τον αριθμό της (H01 → 0), όχι από τη θέση στη λίστα, ώστε μια ημέρα αλλαγής ώρας να μη μετακινεί τις ετικέτες.
const hourStart = (h) => { const n = parseInt(String(h).replace(/\D/g, ''), 10); return Number.isFinite(n) ? n - 1 : 0; };
const pad2 = (n) => String(n).padStart(2, '0');
const hourTick = (h) => pad2(hourStart(h));                                   // άξονας: 00 … 23
const hourRange = (h) => `${pad2(hourStart(h))}–${pad2(hourStart(h) + 1)}`;   // tooltip: 00–01 … 23–24

// Αριθμοί στη γλώσσα της σελίδας, με το σωστό σύμβολο μείον
function fmtN(v, dec = 0, signed = false) {
    if (v === null || v === undefined || Number.isNaN(v)) return '–';
    return new Intl.NumberFormat(i18n[currentLang].locale, { minimumFractionDigits: dec, maximumFractionDigits: dec, signDisplay: signed ? 'exceptZero' : 'auto' })
        .format(v).replace('-', '−');
}
const roundsToZero = (v, dec = 0) => v === null || v === undefined || Math.abs(v) < 0.5 * Math.pow(10, -dec);

// Δικό μας HTML tooltip (ίδιο με live): μένει πάντα μέσα στην οθόνη
function htmlTip(build) {
    return (ctx) => {
        let el = document.getElementById('chart-tip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'chart-tip';
            el.className = 'fixed z-[9000] pointer-events-none rounded-lg border border-slate-600 bg-slate-900/95 shadow-2xl px-4 py-3 min-w-[240px] max-w-[92vw] transition-opacity duration-100';
            document.body.appendChild(el);
        }
        const tt = ctx.tooltip;
        if (!tt || tt.opacity === 0 || !tt.dataPoints || !tt.dataPoints.length) { el.style.opacity = 0; return; }
        el.innerHTML = build(tt.dataPoints[0].dataIndex);
        el.style.opacity = 1;
        const r = ctx.chart.canvas.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight, gap = 14;
        let x = r.left + tt.caretX + gap;
        if (x + w > window.innerWidth - 8) x = r.left + tt.caretX - w - gap;
        x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
        let y = r.top + ctx.chart.chartArea.top;
        y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
        el.style.left = `${x}px`; el.style.top = `${y}px`;
    };
}
const tipOff = (build) => ({ enabled: false, external: htmlTip(build) });
function hideChartTip() { const el = document.getElementById('chart-tip'); if (el) el.style.opacity = 0; }
window.addEventListener('scroll', hideChartTip, { passive: true });

const tipHead = (left, right = '', rightColor = '#94a3b8') => `<div class="flex justify-between items-baseline gap-6 mb-2.5">
    <span class="text-acc-400 font-bold text-sm">${escapeHtml(left)}</span><span class="text-xs font-bold" style="color:${rightColor}">${escapeHtml(right)}</span></div>`;
const tipRule = '<div class="border-t border-dashed border-white/20 my-2"></div>';
function tipRow(label, value, color, opts = {}) {
    const sw = color ? `<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${color}"></span>` : '';
    return `<div class="grid grid-cols-[1fr_auto] gap-4 py-0.5 ${opts.strong ? 'text-white font-bold' : 'text-slate-300'} text-[13px]">
        <span class="flex items-center gap-2">${sw}${escapeHtml(label)}</span>
        <span class="text-right ${opts.strong ? '' : 'text-slate-100'}" style="font-variant-numeric:tabular-nums">${value}${opts.unit ? ` <span class="text-[11px] font-normal text-slate-500">${opts.unit}</span>` : ''}</span></div>`;
}
const tipGroup = (title) => `<div class="text-[11px] text-slate-400 mb-0.5">${escapeHtml(title)}</div>`;
const tipNote = (text) => `<div class="text-[11px] text-slate-400 mt-1.5">${escapeHtml(text)}</div>`;
const tipSections = (...parts) => parts.filter((x) => x).join(tipRule);

// Απόκλιση SCADA − ISP και τι σημαίνει (αρνητικό = εξαγωγές)
function deviationBlock(isp, scada, unit) {
    const T = i18n[currentLang].tip;
    if (isp === null || isp === undefined || scada === null || scada === undefined) return '';
    const dev = scada - isp;
    if (roundsToZero(dev)) return '';
    let note;
    if (isp !== 0 && scada !== 0 && Math.sign(isp) !== Math.sign(scada)) note = T.opposite;
    else if ((isp || scada) < 0) note = dev > 0 ? T.lessExp : T.moreExp;
    else note = dev > 0 ? T.moreImp : T.lessImp;
    return tipRow(T.deviation, fmtN(dev, 0, true), null, { unit }) + tipNote(note);
}

// ---- Methodology modal: content model + renderer (Short / Detailed, per tab) --------
let methodologyMode = 'short';

const methodologyData = {
    en: {
        introShort: "An independent tool for monitoring physical and financial power flows across Greece's electricity interconnections, built on open ADMIE and ENTSO-E data by a single analyst. Figures are estimates and indications, not official statistics.",
        introDetailed: "An independent tool for monitoring and analyzing physical and financial power flows across Greece's electricity interconnections, built and maintained by a single analyst on open data. Figures are estimates and indications, not official statistics.",
        sections: [
            {
                title: "All tabs",
                shortItems: [
                    ["Scope:", "the five interconnections with Albania, Bulgaria, Italy, North Macedonia and Turkey; the flow to Crete is not a cross-border flow and is not included."],
                    ["Clock:", "every hourly figure is in Greek time. Prices and the ISP schedule, which the market publishes in Central European Time (one hour behind), are shifted by one hour so that each hour shows the measured flow, the schedule and the price of the same real hour; hour 00–01 takes the last market hour of the previous day."],
                    ["Sources:", "ADMIE's SCADA & ISP reports, ENTSO-E day-ahead prices. Updated daily; the last 5 days are re-checked each run to catch late publications."],
                    ["Pending data:", "a day without SCADA yet is marked ⚠ and excluded from Month-to-Date totals until complete."]
                ],
                items: [
                    ["Scope:", "the five interconnections with Albania, Bulgaria, Italy, North Macedonia and Turkey; the flow to Crete is not a cross-border flow and is not included."],
                    ["Clock:", "every hourly figure is in Greek time. Prices and the ISP schedule, which the market publishes in Central European Time (one hour behind), are shifted by one hour so that each hour shows the measured flow, the schedule and the price of the same real hour; hour 00–01 takes the last market hour of the previous day."],
                    ["Sources:", "physical flow data is fetched daily from ADMIE's official SCADA & ISP reports; Day-Ahead Market Clearing Prices (MCPs) from ENTSO-E."],
                    ["Updates:", "daily via a scheduled job. The last 5 days are re-checked on every run to catch late publications and corrections."],
                    ["Data Completeness:", "SCADA for a given day is published by ADMIE the following morning; until then, that day is marked ⚠, its Cash Flow shown as \"n/a\", and it is excluded from Month-to-Date totals so incomplete data can't distort monthly aggregates.", "m-complete"]
                ]
            },
            {
                title: "Daily ISP vs SCADA",
                items: [
                    ["ISP vs SCADA:", "ISP is the day-ahead cross-border schedule; SCADA is what was actually measured. Differences between them are expected and can reflect intraday re-dispatch or last-minute constraint activity."],
                    ["ISP Schedule Selection:", "cross-border totals per country, and the hourly schedule, are taken from ADMIE's \"Total Market CBS (+XBID)\" section — the final schedule after intraday adjustments — rather than the day-ahead auction alone. The flow to Crete, which ADMIE's net schedule line includes, is left out, as in the SCADA figures."]
                ]
            },
            {
                title: "Hourly profiles",
                items: [
                    ["Hourly resolution:", "flows and prices are shown as hourly values; ADMIE's underlying schedule data is quarter-hourly and is averaged to the hour for display."],
                    ["Prices shown:", "Day-Ahead Market Clearing Prices for Greece, Bulgaria and Italy, for context alongside the physical flows."]
                ]
            },
            {
                title: "Daily arbitrage",
                items: [
                    ["Pricing Logic & Valuation:", "for Albania, North Macedonia and Turkey, flows are valued using the Greek price only. For Bulgaria and Italy, flows are valued using the average of the two domestic prices. This is a notional commercial valuation of the flow, not a formal congestion-rent calculation (flow × price differential, which accrues to the transmission operators, not a market participant)."],
                    ["Sign Convention:", "following ENEX standards, red denotes exports and yellow denotes imports. Exporting energy generates positive cash flow (+); importing represents a cost (–)."],
                    ["Optional Transit Adjustment (Bulgaria ↔ Italy):", "a toggle lets you view cash flow with simultaneous, opposite-direction Bulgaria–Italy flows (transit through Greece) priced once, in the dominant direction, instead of twice. Physical import/export volumes (MWh) are never altered by this toggle — only the cash-flow calculation.", "m-transit"]
                ]
            },
            {
                title: "MTD position",
                items: [
                    ["", "Only complete days (SCADA present and usable prices) count toward Month-to-Date totals, Best/Worst Day, and averages. Incomplete days are listed and excluded so they can't distort the monthly picture."]
                ]
            },
            {
                title: "By country",
                items: [
                    ["Cash flow:", "exports minus imports per country for every complete day: measured flow (SCADA) × price, with the arbitrage rule (Albania, North Macedonia and Turkey at the Greek price; Bulgaria and Italy at the mean of the two prices). Totals by month and by week (Monday to Sunday) are computed by the pipeline."],
                    ["Zero flow:", "a line is at zero on a day when every hour is below 1 MW. Notes show the period at zero of the day, the month or the whole period you are looking at."],
                    ["Selecting a country:", "tap a country in the list: the other countries fade, its cumulative cash flow appears on the right axis, with its line ceiling and, for Bulgaria and Italy, saturation by month (saturated hours, congestion rent, and the share of the schedule that physically passed)."]
                ]
            },
            {
                title: "Interconnector day",
                items: [
                    ["Coupling:", "measured on every quarter-hour of the day-ahead market. An hour counts as decoupled when the mean price difference over its decoupled quarter-hours is at least 1 €/MWh (GR–IT keeps a permanent gap of a few cents)."],
                    ["Observed limit:", "95th percentile of the scheduled flow in the same direction over the last 30 days: an estimate from the data, not the official capacity."],
                    ["Schedule and measured flow:", "the schedule is the commercial flow per border (ADMIE ISP). The measured flow (SCADA) can be much lower on the AC lines, because power spreads over parallel paths; the DC cable to Italy carries almost exactly its schedule."],
                    ["Congestion rent (estimate):", "scheduled flow × price difference in the decoupled hours. It is collected by the two system operators, it is not a profit of Greece, and it is a different measure from the arbitrage cash flow."],
                    ["Today:", "before the measurement arrives, the card shows only the final day-ahead prices."],
                    ["Ceilings:", "highest measured hourly flow per direction, with the 99th percentile."],
                    ["Hour by hour:", "for GR–BG and GR–IT, bars show the schedule and the line the measured flow; saturated hours are shaded and the observed limit is dashed."],
                    ["Probable capacity limitation (estimate):", "in saturated hours the market wants more flow; when the schedule stays stuck at the same value (at least 3 hours, ±3 MW) below 85 % of the observed limit, the commercial capacity was probably reduced to that value. It is inferred from the schedule, not read from the official capacity (NTC), which will be added from ENTSO-E."]
                ]
            },
            {
                title: "Limitations",
                items: [
                    ["Data:", "SCADA is published as preliminary by ADMIE and may be revised. ISP is a schedule, not a measurement of actual delivery."],
                    ["Pricing:", "the valuation uses a simplified average-price convention, not a formal congestion-rent or bilateral-settlement calculation, and does not reflect any single participant's realized P&L."],
                    ["Nature:", "this is an independent analysis of open data by a single analyst. It is not the official position of ADMIE, ENTSO-E, or any other organisation."]
                ]
            }
        ]
    },
    el: {
        introShort: "Ένα ανεξάρτητο εργαλείο παρακολούθησης φυσικών και οικονομικών ροών ενέργειας στις ελληνικές διασυνδέσεις, βασισμένο σε ανοιχτά δεδομένα ΑΔΜΗΕ και ENTSO-E, από έναν αναλυτή. Τα στοιχεία είναι εκτιμήσεις και ενδείξεις, όχι επίσημη στατιστική.",
        introDetailed: "Ένα ανεξάρτητο εργαλείο παρακολούθησης και ανάλυσης φυσικών και οικονομικών ροών ενέργειας στις ελληνικές διασυνδέσεις, που φτιάχνει και συντηρεί ένας αναλυτής, πάνω σε ανοιχτά δεδομένα. Τα στοιχεία είναι εκτιμήσεις και ενδείξεις, όχι επίσημη στατιστική.",
        sections: [
            {
                title: "Για όλα τα tabs",
                shortItems: [
                    ["Πεδίο:", "οι πέντε διασυνδέσεις με Αλβανία, Βουλγαρία, Ιταλία, Β. Μακεδονία και Τουρκία· η ροή προς Κρήτη δεν είναι διασυνοριακή και δεν περιλαμβάνεται."],
                    ["Ώρα:", "όλα τα ωριαία στοιχεία είναι σε ώρα Ελλάδας. Οι τιμές και το πρόγραμμα ISP, που η αγορά δίνει σε ώρα Κεντρικής Ευρώπης (μία ώρα πίσω), μετατοπίζονται κατά μία ώρα, ώστε κάθε ώρα να δείχνει τη μετρημένη ροή, το πρόγραμμα και την τιμή της ίδιας πραγματικής ώρας· η ώρα 00–01 παίρνει την τελευταία ώρα αγοράς της προηγούμενης ημέρας."],
                    ["Πηγές:", "αναφορές SCADA & ISP του ΑΔΜΗΕ, τιμές ημερήσιας αγοράς ENTSO-E. Ενημέρωση καθημερινά· οι τελευταίες 5 ημέρες επανελέγχονται σε κάθε τρέξιμο για καθυστερημένες δημοσιεύσεις."],
                    ["Εκκρεμή δεδομένα:", "μια ημέρα χωρίς SCADA ακόμα σημειώνεται με ⚠ και εξαιρείται από τα μηνιαία σύνολα μέχρι να ολοκληρωθεί."]
                ],
                items: [
                    ["Πεδίο:", "οι πέντε διασυνδέσεις με Αλβανία, Βουλγαρία, Ιταλία, Β. Μακεδονία και Τουρκία· η ροή προς Κρήτη δεν είναι διασυνοριακή και δεν περιλαμβάνεται."],
                    ["Ώρα:", "όλα τα ωριαία στοιχεία είναι σε ώρα Ελλάδας. Οι τιμές και το πρόγραμμα ISP, που η αγορά δίνει σε ώρα Κεντρικής Ευρώπης (μία ώρα πίσω), μετατοπίζονται κατά μία ώρα, ώστε κάθε ώρα να δείχνει τη μετρημένη ροή, το πρόγραμμα και την τιμή της ίδιας πραγματικής ώρας· η ώρα 00–01 παίρνει την τελευταία ώρα αγοράς της προηγούμενης ημέρας."],
                    ["Πηγές:", "τα δεδομένα φυσικής ροής αντλούνται καθημερινά από τις επίσημες αναφορές SCADA & ISP του ΑΔΜΗΕ· οι Τιμές Εκκαθάρισης Ημερήσιας Αγοράς (MCPs) από το ENTSO-E."],
                    ["Ενημερώσεις:", "καθημερινά μέσω προγραμματισμένης διαδικασίας. Οι τελευταίες 5 ημέρες επανελέγχονται σε κάθε τρέξιμο για καθυστερημένες δημοσιεύσεις και διορθώσεις."],
                    ["Πληρότητα δεδομένων:", "το SCADA μιας ημέρας δημοσιεύεται από τον ΑΔΜΗΕ το επόμενο πρωί· μέχρι τότε, η ημέρα σημειώνεται με ⚠, το Ταμείο της εμφανίζεται ως «μ/δ», και εξαιρείται από τα μηνιαία σύνολα ώστε ελλιπή δεδομένα να μην τα αλλοιώνουν.", "m-complete"]
                ]
            },
            {
                title: "Ημερήσια ροή (ISP vs SCADA)",
                items: [
                    ["ISP έναντι SCADA:", "το ISP είναι το προγραμματισμένο διασυνοριακό πρόγραμμα· το SCADA είναι η πραγματική μέτρηση. Διαφορές ανάμεσά τους είναι αναμενόμενες και μπορεί να αντανακλούν ενδοημερήσιο αναπρογραμματισμό ή δραστηριότητα περιορισμών της τελευταίας στιγμής."],
                    ["Επιλογή προγράμματος ISP:", "τα σύνολα ανά χώρα και το ωριαίο πρόγραμμα λαμβάνονται από την ενότητα «Total Market CBS (+XBID)» του ΑΔΜΗΕ — το τελικό πρόγραμμα μετά τις ενδοημερήσιες προσαρμογές — όχι μόνο από τη δημοπρασία ημερήσιου προγραμματισμού. Η ροή προς Κρήτη, που περιλαμβάνεται στη γραμμή καθαρού προγράμματος του ΑΔΜΗΕ, μένει έξω, όπως και στο SCADA."]
                ]
            },
            {
                title: "Ωριαία προφίλ",
                items: [
                    ["Ωριαία ανάλυση:", "οι ροές και οι τιμές εμφανίζονται ως ωριαίες τιμές· τα υποκείμενα δεδομένα προγράμματος του ΑΔΜΗΕ είναι τεταρτωριαία και υπολογίζεται ο μέσος όρος τους για την ωριαία προβολή."],
                    ["Τιμές που εμφανίζονται:", "Τιμές Εκκαθάρισης Ημερήσιας Αγοράς για Ελλάδα, Βουλγαρία και Ιταλία, ως πλαίσιο δίπλα στις φυσικές ροές."]
                ]
            },
            {
                title: "Ημερήσιο arbitrage",
                items: [
                    ["Λογική τιμολόγησης & αποτίμησης:", "για Αλβανία, Β. Μακεδονία και Τουρκία, η αποτίμηση γίνεται αποκλειστικά με την ελληνική τιμή. Για Βουλγαρία και Ιταλία, με τον μέσο όρο των δύο εγχώριων τιμών. Πρόκειται για ονομαστική εμπορική αποτίμηση της ροής, όχι επίσημο υπολογισμό εσόδου συμφόρησης (ροή × διαφορά τιμών, το οποίο αποδίδεται στους διαχειριστές δικτύου, όχι σε συμμετέχοντα της αγοράς)."],
                    ["Σύμβαση προσήμων:", "σύμφωνα με τα πρότυπα του ENEX, το κόκκινο αντιστοιχεί σε Εξαγωγές και το κίτρινο σε Εισαγωγές. Η εξαγωγή ενέργειας παράγει θετικό ταμείο (+), η εισαγωγή αντιπροσωπεύει κόστος (–)."],
                    ["Προαιρετική προσαρμογή transit (Βουλγαρία ↔ Ιταλία):", "ένας διακόπτης επιτρέπει να δείτε το ταμείο με τις ταυτόχρονες, αντίθετες ροές Βουλγαρίας-Ιταλίας (transit μέσω Ελλάδας) να τιμολογούνται μία φορά, στην κατεύθυνση που υπερισχύει, αντί για δύο. Οι φυσικοί όγκοι εισαγωγών/εξαγωγών (MWh) δεν αλλάζουν ποτέ από αυτόν τον διακόπτη — μόνο ο υπολογισμός του ταμείου.", "m-transit"]
                ]
            },
            {
                title: "Σωρευτική θέση (MTD)",
                items: [
                    ["", "Μόνο πλήρεις ημέρες (με διαθέσιμο SCADA και χρησιμοποιήσιμες τιμές) μετράνε στα σωρευτικά μηνιαία σύνολα, στο Best/Worst Day και στους μέσους όρους. Οι ελλιπείς ημέρες αναφέρονται και εξαιρούνται, ώστε να μην αλλοιώνουν τη μηνιαία εικόνα."]
                ]
            },
            {
                title: "Ανά χώρα",
                items: [
                    ["Ταμείο:", "εξαγωγές μείον εισαγωγές ανά χώρα για κάθε πλήρη ημέρα: μετρημένη ροή (SCADA) × τιμή, με τον κανόνα του arbitrage (Αλβανία, Β. Μακεδονία και Τουρκία με την τιμή της Ελλάδας· Βουλγαρία και Ιταλία με τον μέσο όρο των δύο τιμών). Τα σύνολα ανά μήνα και ανά εβδομάδα (Δευτέρα–Κυριακή) τα υπολογίζει η ροή δεδομένων."],
                    ["Μηδενική ροή:", "μια γραμμή είναι στο μηδέν μια ημέρα όταν κάθε ώρα είναι κάτω από 1 MW. Οι σημειώσεις δείχνουν το διάστημα στο μηδέν της ημέρας, του μήνα ή της περιόδου που βλέπετε."],
                    ["Επιλογή χώρας:", "πατήστε μια χώρα στη λίστα: οι υπόλοιπες σβήνουν, εμφανίζεται το σωρευτικό ταμείο της στον δεξιό άξονα, το ταβάνι της γραμμής και, για Βουλγαρία και Ιταλία, ο κορεσμός ανά μήνα (ώρες κορεσμού, έσοδο συμφόρησης και το ποσοστό του προγράμματος που πέρασε φυσικά)."]
                ]
            },
            {
                title: "Ημέρα διασυνδέσεων",
                items: [
                    ["Σύζευξη:", "μετριέται σε κάθε τέταρτο της αγοράς επόμενης ημέρας. Μια ώρα μετρά ως αποσυζευγμένη όταν η μέση διαφορά τιμής στα αποσυζευγμένα τέταρτά της είναι τουλάχιστον 1 €/MWh (η ΕΛ–ΙΤ κρατά μια μόνιμη διαφορά λίγων λεπτών)."],
                    ["Παρατηρούμενο όριο:", "το 95ο εκατοστημόριο της προγραμματισμένης ροής στην ίδια κατεύθυνση τις τελευταίες 30 ημέρες: εκτίμηση από τα δεδομένα, όχι η επίσημη ικανότητα."],
                    ["Πρόγραμμα και μετρημένη ροή:", "το πρόγραμμα είναι η εμπορική ροή ανά σύνορο (ISP ΑΔΜΗΕ). Η μετρημένη ροή (SCADA) μπορεί να είναι πολύ μικρότερη στις γραμμές εναλλασσόμενου ρεύματος, γιατί η ενέργεια μοιράζεται σε παράλληλες διαδρομές· το καλώδιο συνεχούς ρεύματος προς Ιταλία μεταφέρει σχεδόν ακριβώς το πρόγραμμά του."],
                    ["Έσοδο συμφόρησης (εκτίμηση):", "προγραμματισμένη ροή × διαφορά τιμής στις αποσυζευγμένες ώρες. Το εισπράττουν οι δύο διαχειριστές, δεν είναι κέρδος της Ελλάδας, και είναι διαφορετικό μέγεθος από το ταμείο του arbitrage."],
                    ["Σήμερα:", "πριν έρθει η μέτρηση, η κάρτα δείχνει μόνο τις οριστικές τιμές της αγοράς επόμενης ημέρας."],
                    ["Ταβάνι:", "η μέγιστη μετρημένη ωριαία ροή ανά κατεύθυνση, μαζί με το 99ο εκατοστημόριο."],
                    ["Ώρα με την ώρα:", "για ΕΛ–ΒΓ και ΕΛ–ΙΤ, οι μπάρες δείχνουν το πρόγραμμα και η γραμμή τη μετρημένη ροή· οι ώρες κορεσμού είναι σκιασμένες και το παρατηρούμενο όριο διακεκομμένο."],
                    ["Πιθανός περιορισμός ικανότητας (εκτίμηση):", "στις ώρες κορεσμού η αγορά θέλει περισσότερη ροή· όταν το πρόγραμμα μένει κολλημένο στην ίδια τιμή (τουλάχιστον 3 ώρες, ±3 MW) κάτω από το 85% του παρατηρούμενου ορίου, η εμπορική ικανότητα ήταν πιθανότατα μειωμένη σε αυτή την τιμή. Προκύπτει από το πρόγραμμα, δεν διαβάζεται από την επίσημη ικανότητα (NTC), που θα προστεθεί από το ENTSO-E."]
                ]
            },
            {
                title: "Περιορισμοί",
                items: [
                    ["Δεδομένα:", "το SCADA δημοσιεύεται ως προσωρινό από τον ΑΔΜΗΕ και μπορεί να αναθεωρηθεί. Το ISP είναι πρόγραμμα, όχι μέτρηση πραγματικής παράδοσης."],
                    ["Τιμολόγηση:", "η αποτίμηση χρησιμοποιεί απλοποιημένη σύμβαση μέσου όρου τιμών, όχι επίσημο υπολογισμό εσόδου συμφόρησης ή διμερούς διακανονισμού, και δεν αντανακλά το πραγματικό P&L κάποιου συγκεκριμένου συμμετέχοντα."],
                    ["Φύση:", "πρόκειται για ανεξάρτητη ανάλυση ανοιχτών δεδομένων από έναν αναλυτή. Δεν αποτελεί επίσημη θέση του ΑΔΜΗΕ, του ENTSO-E, ή άλλου οργανισμού."]
                ]
            }
        ]
    }
};

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMethodologySection(section, items) {
    const li = items.map(([lead, text, anchor]) => {
        const leadHtml = lead ? `<strong class="text-slate-200">${escapeHtml(lead)}</strong> ` : '';
        const idAttr = anchor ? ` id="${anchor}" class="scroll-mt-4"` : '';
        return `<li${idAttr}>${leadHtml}${escapeHtml(text)}</li>`;
    }).join('');
    const idAttr = section._id ? ` id="${section._id}"` : '';
    return `<div class="mb-5 last:mb-0"${idAttr}>
        <div class="text-acc-400 text-sm font-bold mb-2">${escapeHtml(section.title)}</div>
        <ul class="list-disc pl-5 space-y-2 marker:text-slate-500">${li}</ul>
    </div>`;
}

function renderMethodology() {
    const bodyEl = document.getElementById('modalBody');
    if (!bodyEl) return;
    const d = methodologyData[currentLang] || methodologyData.en;

    let html = `<p class="mb-5">${escapeHtml(methodologyMode === 'short' ? d.introShort : d.introDetailed)}</p>`;
    if (methodologyMode === 'short') {
        html += renderMethodologySection(d.sections[0], d.sections[0].shortItems);
    } else {
        d.sections.forEach((sec, i) => { html += renderMethodologySection({ ...sec, _id: `msec-${i}` }, sec.items); });
    }
    bodyEl.innerHTML = html;

    const shortBtn = document.getElementById('modalModeShortBtn');
    const detailedBtn = document.getElementById('modalModeDetailedBtn');
    const active = 'bg-acc-400 text-slate-900';
    const inactive = 'text-slate-300 hover:text-white';
    if (shortBtn && detailedBtn) {
        shortBtn.className = `flex-1 py-1.5 rounded-md text-sm font-semibold transition ${methodologyMode === 'short' ? active : inactive}`;
        detailedBtn.className = `flex-1 py-1.5 rounded-md text-sm font-semibold transition ${methodologyMode === 'detailed' ? active : inactive}`;
    }
}

// Η ενότητα της Αναλυτικής για κάθε tab (D30): η σειρά των ενοτήτων είναι ίδια σε ελληνικά και αγγλικά
const METHOD_SECTION_OF_TAB = { totals: 1, hourly: 2, arbitrage: 3, mtd: 4, country: 5, sat: 6 };

// Μετακινεί το σώμα του παραθύρου ώστε το στοιχείο να είναι στην κορυφή του, αμέσως (χωρίς χρονοκαθυστέρηση)
function scrollModalTo(el) {
    const body = document.getElementById('modalBody');
    if (!body || !el) return;
    // offsetTop μέσα στο σώμα (που είναι relative): δεν επηρεάζεται από την κίνηση ανοίγματος (scale) του παραθύρου
    let y = 0, n = el;
    while (n && n !== body) { y += n.offsetTop; n = n.offsetParent; }
    body.scrollTop = Math.max(0, y - 8);
}

function setMethodologyMode(mode) {
    methodologyMode = mode;
    const bodyEl = document.getElementById('modalBody');
    if (bodyEl) bodyEl.scrollTop = 0;
    renderMethodology();
    // D30: η «Αναλυτική» ανοίγει κατευθείαν στην ενότητα του tab που βλέπει ο επισκέπτης
    if (mode === 'detailed' && typeof currentTab !== 'undefined') {
        scrollModalTo(document.getElementById(`msec-${METHOD_SECTION_OF_TAB[currentTab]}`));
    }
}

// Χρωματική παλέτα χωρίς επικάλυψη με τα KPIs
// Χρώματα χωρών (D12): ένα χρώμα ανά χώρα σε όλη τη σελίδα· η τιμή της Ιταλίας παίρνει το ίδιο μωβ.
// Το ISP είναι steel blue #7896c0 (όχι cyan: το cyan είναι το accent, D02).
const countryColors = { AL: '#3b82f6', BG: '#f97316', IT: '#a855f7', MK: '#6366f1', TR: '#f9a8d4' };

// Όλα τα σταθερά κείμενα της σελίδας στη γλώσσα currentLang (και της οθόνης φόρτωσης).
function applyStaticText() {
    const lang = currentLang;
    const t = i18n[lang];
    document.documentElement.lang = lang === 'el' ? 'el' : 'en';
    
    document.getElementById('pageTitle').innerText = t.title;
    document.getElementById('mainTitle').innerText = t.title;
    document.getElementById('lastUpdateLabel').innerText = t.lastUpdate;
    document.getElementById('lastUpdateLabelMobile').innerText = t.lastUpdateMobile;
    document.getElementById('nextUpdateLabel').innerText = t.nextUpdate;
    document.getElementById('nextUpdateLabelMobile').innerText = t.nextUpdateMobile;
    document.getElementById('btnMethodology').innerText = t.btnMethodology;
    document.getElementById('btnMethodologyShort').innerText = t.btnMethodologyShort;
    const tt = document.getElementById('toTopBtn'); if (tt) { tt.setAttribute('aria-label', t.toTop); tt.title = t.toTop; }
    
    document.getElementById('tabBtnTotals').innerText = t.tabTotals;
    document.getElementById('tabBtnHourly').innerText = t.tabHourly;
    document.getElementById('tabBtnArbitrage').innerText = t.tabArbitrage;
    document.getElementById('tabBtnMTD').innerText = t.tabMTD;
    document.getElementById('tabBtnCountry').innerText = t.tabCountry;
    document.getElementById('tabBtnSat').innerText = t.tabSat;
    [['satDayTitle', t.sat.dayTitle], ['satChartsTitle', t.hh.title], ['satBGTitle', t.lineCodes.BG], ['satITTitle', t.lineCodes.IT]].forEach(([id, txt]) => { document.getElementById(id).textContent = txt; });
    const C = t.ctry;
    [['countryChartTitle', C.chartTitle], ['countryTableTitle', C.tableTitle],
     ['countryGranMonth', C.month], ['countryGranWeek', C.week]].forEach(([id, txt]) => { document.getElementById(id).textContent = txt; });
    
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
    document.getElementById('transitToggleTooltip').setAttribute('aria-label', t.transitInfoBtn);

    document.getElementById('mtdLabelCashFlow').innerText = t.mtdLabelCashFlow;
    document.getElementById('mtdLabelExp').innerText = t.mtdLabelExp;
    document.getElementById('mtdLabelImp').innerText = t.mtdLabelImp;
    document.getElementById('mtdLabelExtremes').innerText = t.mtdLabelExtremes;
    document.getElementById('mtdChartTitleCash').innerText = t.mtdChartTitleCash;
    document.getElementById('mtdChartTitleVol').innerText = t.mtdChartTitleVol;

    document.getElementById('modalTitle').innerText = t.modalTitle;
    document.getElementById('modalModeShortBtn').innerText = t.modalModeShort;
    document.getElementById('modalModeDetailedBtn').innerText = t.modalModeDetailed;
    document.getElementById('modalCloseBtn').innerText = t.modalCloseBtn;
    document.getElementById('modalXBtn').setAttribute('aria-label', t.modalCloseBtn);
    if (typeof renderMethodology === 'function') renderMethodology();

    // GR | EN όπως στο live (D14): ενεργό σε accent με σκούρα γράμματα
    [['btnGr', 'el'], ['btnEn', 'en']].forEach(([id, l]) => {
        const on = l === lang;
        const b = document.getElementById(id);
        b.className = `flex-1 md:flex-none flex items-center justify-center px-4 rounded transition ${on ? 'bg-acc-400 text-slate-900' : 'text-slate-400 hover:text-white'}`;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    // Οθόνη φόρτωσης: τα βήματα 2…5 παίρνουν τα ονόματα των tabs, με τη σειρά τους
    const L = t.load;
    const stepText = { 1: L.s1, 2: t.tabTotals, 3: t.tabHourly, 4: t.tabArbitrage, 5: t.tabMTD, 6: t.tabCountry, 7: t.tabSat };
    const ids = { loadTitle: L.title, loadGroup1: L.g1, loadGroup2: L.g2, loadReady: L.ready };
    Object.entries(ids).forEach(([id, txt]) => { const el = document.getElementById(id); if (el) el.textContent = txt; });
    document.querySelectorAll('.load-row').forEach(r => { r.querySelector('[data-load-label]').textContent = stepText[r.dataset.step] || ''; });
    updateHeader();
    if (rawData.length > 0) { fillPickers(); updatePicker(); }
}

function setLang(lang) {
    if (lang !== 'el' && lang !== 'en') return;
    currentLang = lang;
    try { localStorage.setItem('kp_lang', lang); } catch (e) { /* ιδιωτική περιήγηση */ }
    applyStaticText();
    if (rawData.length > 0) renderCharts();
}

// Ώρα Αθήνας, όποια κι αν είναι η ζώνη ώρας του επισκέπτη (όπως στο live).
function fmtTimeAthens(isoTs) {
    if (!isoTs) return '–';
    const d = new Date(isoTs);
    if (Number.isNaN(d.getTime())) return '–';
    return new Intl.DateTimeFormat(i18n[currentLang].locale, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Athens'
    }).format(d);
}

// Τελευταία ενημέρωση = πότε έτρεξε πραγματικά η λήψη· Επόμενη = η επόμενη προγραμματισμένη (cron-job.org, 07:02).
// Και οι δύο τιμές γράφονται από το scripts/update_flows.py στο data/meta.json· η σελίδα μόνο τις δείχνει.
function updateHeader() {
    const m = metaData;
    document.getElementById('lastUpdateVal').innerText = m ? fmtTimeAthens(m.fetched) : '–';
    document.getElementById('nextUpdateVal').innerText = m ? fmtTimeAthens(m.next_update) : '–';
}

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
    const transitDetail = []; 

    for (let i = 0; i < n; i++) {
        const bg = flows.BG[i], it = flows.IT[i];
        let bgAmt = Math.abs(bg) * prices.BG[i];
        let itAmt = Math.abs(it) * prices.IT[i];
        let isTransit = false;
        let detail = null;

        const isCrossing = bg !== 0 && it !== 0 && Math.sign(bg) !== Math.sign(it);
        if (isCrossing) {
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
        summary[c] = { ...single, hourlyFlows: flows[c], hourlyPrices: prices[c], hourlyAmount: amount[c] };
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
        mcpGR: dayData.Hourly.map(h => h.MCP_GR),
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
            if (itBg.hours > 0) rows.push(`<div>${t.transitDirItToBg} <span class="text-slate-100 font-semibold">${fmt(itBg.vol)} MWh</span> <span class="text-slate-500">(${itBg.hours}${t.transitDirHours})</span></div>`);
            if (bgIt.hours > 0) rows.push(`<div>${t.transitDirBgToIt} <span class="text-slate-100 font-semibold">${fmt(bgIt.vol)} MWh</span> <span class="text-slate-500">(${bgIt.hours}${t.transitDirHours})</span></div>`);
            dirEl.innerHTML = `<div class="text-slate-400 text-xs font-semibold mb-1">${t.transitDirLabel}</div><div class="space-y-1">${rows.join('')}</div>`;
            dirEl.style.display = 'block';
        } else {
            dirEl.innerHTML = '';
            dirEl.style.display = 'none';
        }
    }

    const cfSign = data.netCashFlow > 0 ? "+" : "";
    const cfColor = data.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500";
    if (data.complete) {
        document.getElementById('kpiCashFlowVal').innerHTML = `${cfSign}${data.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})}&nbsp;€`;
        document.getElementById('kpiCashFlowVal').className = `text-base md:text-2xl font-bold ${cfColor} whitespace-nowrap`;
        
        document.getElementById('kpiExpVol').innerHTML = data.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + "&nbsp;MWh";
        document.getElementById('kpiExpVol').className = "text-base md:text-xl font-bold text-rose-500 whitespace-nowrap";
        
        document.getElementById('kpiExpPrice').innerHTML = data.expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + "&nbsp;€/MWh";
        
        document.getElementById('kpiImpVol').innerHTML = data.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}) + "&nbsp;MWh";
        document.getElementById('kpiImpVol').className = "text-base md:text-xl font-bold text-yellow-400 whitespace-nowrap";
        
        document.getElementById('kpiImpPrice').innerHTML = data.impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + "&nbsp;€/MWh";
    } else {
        document.getElementById('kpiCashFlowVal').innerText = t.notAvailable;
        document.getElementById('kpiCashFlowVal').className = 'text-base md:text-2xl font-bold text-slate-500 whitespace-nowrap';
        ['kpiExpVol','kpiExpPrice','kpiImpVol','kpiImpPrice'].forEach(id => { document.getElementById(id).innerText = t.notAvailable; });
        document.getElementById('kpiExpVol').className = "text-base md:text-xl font-bold text-slate-500 whitespace-nowrap";
        document.getElementById('kpiImpVol').className = "text-base md:text-xl font-bold text-slate-500 whitespace-nowrap";
    }

    const isImp = data.netVol >= 0;
    if (data.complete || data.hasScada) {
        document.getElementById('kpiStatusVal').innerText = isImp ? t.importer : t.exporter;
        document.getElementById('kpiStatusVal').className = `text-base md:text-xl font-bold ${isImp ? 'text-yellow-400' : 'text-rose-500'} whitespace-nowrap`;
    } else {
        document.getElementById('kpiStatusVal').innerText = t.notAvailable;
        document.getElementById('kpiStatusVal').className = 'text-base md:text-xl font-bold text-slate-500 whitespace-nowrap';
    }

    const listContainer = document.getElementById('arbitrageListContainer');
    listContainer.innerHTML = ''; 
    const names = i18n[currentLang].countries;   // ονόματα χωρών στη γλώσσα της σελίδας (K12)
    
    // D23: πίνακας στο desktop, κάρτα δύο γραμμών ανά χώρα στο κινητό (νούμερα στοιχισμένα δεξιά).
    // Όπου δεν υπάρχει όγκος, όγκος και τιμή γράφονται «–» (όχι 0 και 0 €/MWh).
    const dash = '<span class="text-slate-600">–</span>';
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const opacity = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHover = (activeCountry === c) ? "bg-slate-700/80" : "hover:bg-slate-700/50";
        const na = !data.complete;

        const vol = (v) => !data.hasScada ? '–' : (roundsToZero(v) ? dash : fmtN(v));
        const avg = (eur, v) => (na || roundsToZero(v)) ? (na ? '–' : dash) : fmtN(eur / v, 2);
        const impVolFmt = vol(rowData.impVol), expVolFmt = vol(rowData.expVol);
        const impAvgFmt = avg(rowData.impEur, rowData.impVol), expAvgFmt = avg(rowData.expEur, rowData.expVol);
        const cfFmt = na ? t.notAvailable : fmtN(rowData.netCashFlow, 0, true);
        const cfColor = na ? "text-slate-500" : (rowData.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500");

        const transitBadge = (data.transitNetting && data.transitHourCount > 0 && (c === 'BG' || c === 'IT'))
            ? `<span class="text-slate-300 text-xs" title="${t.transitBadgeTitle}">⇄</span>` : '';
        const dot = `<span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${countryColors[c]}"></span>`;
        const unit = (u) => `<span class="text-[11px] font-normal text-slate-500">${u}</span>`;
        const side = (cls, arrow, v, p, hasVol) => hasVol
            ? `<div class="text-right ${cls}">${arrow} ${v} ${unit('MWh')}<div class="opacity-90">${p} ${unit('€/MWh')}</div></div>`
            : `<div class="text-right text-slate-600">${arrow} –</div>`;

        const zeroNote = currentDayData ? zeroNoteForDay(c, currentDayData.Date) : null;
        listContainer.insertAdjacentHTML('beforeend', `
            <div onclick="toggleCountrySelection('${c}')" class="border-b border-slate-700/50 cursor-pointer transition-all duration-300 ${opacity} ${bgHover}">
                <div class="hidden md:grid grid-cols-4 gap-4 p-4 text-center font-semibold text-sm items-center">
                    <div class="text-left pl-2 text-slate-300 flex items-center gap-2">${dot}${names[c]} ${transitBadge}</div>
                    <div class="flex flex-col gap-1">
                        <div class="text-yellow-400">↓ ${impVolFmt}</div>
                        <div class="text-rose-500">↑ ${expVolFmt}</div>
                    </div>
                    <div class="${cfColor}">${cfFmt}&nbsp;€</div>
                    <div class="flex flex-col gap-1">
                        <div class="text-yellow-400">${impAvgFmt}</div>
                        <div class="text-rose-500">${expAvgFmt}</div>
                    </div>
                </div>
                <div class="md:hidden px-4 py-3">
                    <div class="flex justify-between items-center gap-3">
                        <span class="flex items-center gap-2 text-slate-200 font-semibold text-sm whitespace-nowrap">${dot}${names[c]} ${transitBadge}</span>
                        <span class="${cfColor} font-bold text-sm whitespace-nowrap">${cfFmt}&nbsp;€</span>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mt-1.5 text-xs font-semibold" style="font-variant-numeric:tabular-nums">
                        ${side('text-yellow-400', '↓', impVolFmt, impAvgFmt, data.hasScada && !roundsToZero(rowData.impVol))}
                        ${side('text-rose-500', '↑', expVolFmt, expAvgFmt, data.hasScada && !roundsToZero(rowData.expVol))}
                    </div>
                </div>
                ${zeroNote ? `<div class="px-4 md:px-6 pb-3 -mt-1 md:-mt-2 text-xs text-amber-300 flex gap-1.5"><span aria-hidden="true">⚠</span><span>${escapeHtml(zeroNote)}</span></div>` : ''}
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
                return involvesCountry ? '#facc15' : countryColors[activeCountry];
            });
        }
        datasets.push({ type: 'bar', label: i18n[currentLang].flowSeries.replace('{c}', names[activeCountry]), data: data.summary[activeCountry].hourlyFlows, backgroundColor: barColors, yAxisID: 'y' });
        datasets.push({ type: 'line', label: i18n[currentLang].appliedMcp, data: data.summary[activeCountry].hourlyPrices, borderColor: '#ffffff', borderWidth: 3, tension: 0.2, yAxisID: 'y1' });
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
        data: { labels: data.hours.map(hourTick), datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: tipOff((i) => arbitrageTip(data, i)) },
            scales: {
                x: { stacked: true, grid: { display: false }, title: { display: true, text: i18n[currentLang].axisHour, color: '#64748b', font: { size: 11 } } },
                y: { 
                    type: 'linear', display: true, position: 'left', stacked: true, 
                    grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 },
                    title: { display: window.innerWidth < 768, text: 'MW', font: { style: 'italic', size: 11 }, color: '#64748b' },
                    ticks: { callback: function(value) { return formatAxisTick(value); } }
                },
                y1: { 
                    type: 'linear', display: activeCountry !== null, position: 'right', grid: { display: false },
                    title: { display: window.innerWidth < 768, text: '€/MWh', font: { style: 'italic', size: 11 }, color: '#64748b' },
                    ticks: { callback: function(value) { return formatAxisTick(value); } }
                }
            }
        }
    });
}

// Tooltip του Arbitrage (D22): όλες οι χώρες → εισαγωγές / εξαγωγές / καθαρό, με τη σειρά της στήλης·
// μία χώρα → ροή, εφαρμοζόμενη τιμή, ταμείο της ώρας. Οι μηδενικές γραμμές δεν εμφανίζονται.
function arbitrageTip(data, i) {
    const L = i18n[currentLang], T = L.tip, N = L.countries;
    const head = tipHead(`${T.hour} ${hourRange(data.hours[i])}`, `${L.priceCodes.GR} ${fmtN(data.mcpGR[i], 2)} €/MWh`, '#3b82f6');
    const det = data.transitDetail[i];
    const mark = (c) => (det && (c === 'BG' || c === 'IT')) ? ' ⇄' : '';
    if (activeCountry) {
        const c = activeCountry, S = data.summary[c];
        const f = S.hourlyFlows[i], amt = S.hourlyAmount[i];
        const cash = f < 0 ? amt : -amt;                      // εξαγωγή = έσοδο (+), εισαγωγή = κόστος (−)
        let netNote = '';
        if (data.transitNetting && det && (c === 'BG' || c === 'IT') && f !== 0) {
            const netVol = Math.abs((data.summary.BG.hourlyFlows[i] || 0) + (data.summary.IT.hourlyFlows[i] || 0));
            netNote = tipNote(roundsToZero(amt) ? T.netted : T.nettedNet.replace('{v}', fmtN(netVol)));
        }
        return head + tipSections(
            tipRow(`${T.flow} ${N[c]}${mark(c)}`, fmtN(f, 0, true), countryColors[c], { unit: 'MW' }) + tipRow(T.applied, fmtN(S.hourlyPrices[i], 2), '#ffffff', { unit: '€/MWh' }),
            tipRow(T.hourCash, fmtN(cash, 0, true), null, { unit: '€', strong: true }) + netNote);
    }
    const order = ["AL", "BG", "IT", "MK", "TR"];
    const imp = order.slice().reverse().filter(c => data.summary[c].hourlyFlows[i] > 0 && !roundsToZero(data.summary[c].hourlyFlows[i]));
    const exp = order.filter(c => data.summary[c].hourlyFlows[i] < 0 && !roundsToZero(data.summary[c].hourlyFlows[i]));
    const rows = (list) => list.map(c => tipRow(N[c] + mark(c), fmtN(data.summary[c].hourlyFlows[i], 0, true), countryColors[c], { unit: 'MW' })).join('');
    const net = order.reduce((a, c) => a + (data.summary[c].hourlyFlows[i] || 0), 0);
    const tnote = det ? tipNote(T.transit.replace('{a}', N[det.dir === 'BG_TO_IT' ? 'BG' : 'IT']).replace('{b}', N[det.dir === 'BG_TO_IT' ? 'IT' : 'BG'])) : '';
    return head + tipSections(
        imp.length ? tipGroup(T.imports) + rows(imp) : '',
        exp.length ? tipGroup(T.exports) + rows(exp) : '',
        tipRow(T.net, fmtN(net, 0, true), null, { unit: 'MW', strong: true }) + tnote);
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
    const dayDates = [], dayCash = [];   // για τα tooltips (D22)

    monthData.forEach(day => {
        const d = calculateDayNet(day);
        
        cumEur += d.netCashFlow;
        cumImpGwh += (d.impVol / 1000);  
        cumExpGwh -= (d.expVol / 1000);  
        
        totalExpEur += d.expEur; totalImpEur += d.impEur;
        totalExpVol += d.expVol; totalImpVol += d.impVol;

        labels.push(day.Date.substring(8, 10)); 
        dayDates.push(day.Date); dayCash.push(d.netCashFlow);
        dataEur.push(cumEur);
        dataCumImp.push(cumImpGwh);
        dataCumExp.push(cumExpGwh);
        dataCumNet.push(cumImpGwh + cumExpGwh); 

        if (d.netCashFlow > bestDay.val) { bestDay.val = d.netCashFlow; bestDay.date = day.Date; }
        if (d.netCashFlow < worstDay.val) { worstDay.val = d.netCashFlow; worstDay.date = day.Date; }
    });

    const cfSign = cumEur > 0 ? "+" : "";
    const cfColor = cumEur >= 0 ? "text-emerald-400" : "text-fuchsia-500";
    document.getElementById('mtdCashFlowVal').innerHTML = `${cfSign}${cumEur.toLocaleString('el-GR', {maximumFractionDigits:0})}&nbsp;€`;
    document.getElementById('mtdCashFlowVal').className = `text-base md:text-2xl font-bold ${cfColor} whitespace-nowrap`;

    let expGwh = totalExpVol / 1000;
    let impGwh = totalImpVol / 1000;
    let expAvg = totalExpVol > 0 ? (totalExpEur / totalExpVol) : 0;
    let impAvg = totalImpVol > 0 ? (totalImpEur / totalImpVol) : 0;

    document.getElementById('mtdExpVol').innerHTML = expGwh.toLocaleString('el-GR', {maximumFractionDigits:1}) + "&nbsp;GWh";
    document.getElementById('mtdExpVol').className = "text-base md:text-xl font-bold text-rose-500 whitespace-nowrap";
    
    document.getElementById('mtdExpPrice').innerHTML = expAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + "&nbsp;€/MWh";
    
    document.getElementById('mtdImpVol').innerHTML = impGwh.toLocaleString('el-GR', {maximumFractionDigits:1}) + "&nbsp;GWh";
    document.getElementById('mtdImpVol').className = "text-base md:text-xl font-bold text-yellow-400 whitespace-nowrap";
    
    document.getElementById('mtdImpPrice').innerHTML = impAvg.toLocaleString('el-GR', {maximumFractionDigits:2}) + "&nbsp;€/MWh";

    const formatDay = (d) => `${d.substring(8,10)}/${d.substring(5,7)}`;
    const bestSign = bestDay.val > 0 ? '+' : '';
    document.getElementById('mtdBestDay').innerHTML = `${formatDay(bestDay.date)} (${bestSign}${bestDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})}&nbsp;€)`;
    document.getElementById('mtdWorstDay').innerHTML = `${formatDay(worstDay.date)} (${worstDay.val.toLocaleString('el-GR', {maximumFractionDigits:0})}&nbsp;€)`;

    if (mtdCashFlowChartInstance) mtdCashFlowChartInstance.destroy();
    const ctxCash = document.getElementById('mtdChartCashFlow').getContext('2d');
    mtdCashFlowChartInstance = new Chart(ctxCash, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: i18n[currentLang].mtdCumLegend,
                data: dataEur,
                fill: { target: 'origin', above: 'rgba(16, 185, 129, 0.2)', below: 'rgba(217, 70, 239, 0.2)' },
                segment: { borderColor: ctx => ctx.p1.parsed.y >= 0 ? '#10b981' : '#d946ef' },
                borderWidth: 2, tension: 0.3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: tipOff((i) => {
                const T = i18n[currentLang].tip;
                return tipHead(fmtDay(dayDates[i])) + tipRow(T.dayCash, fmtN(dayCash[i], 0, true), null, { unit: '€' }) + tipRule
                    + tipRow(T.cum, fmtN(dataEur[i], 0, true), dataEur[i] >= 0 ? '#10b981' : '#d946ef', { unit: '€', strong: true });
            }) },
            scales: {
                x: { grid: { display: false } },
                y: { 
                    grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 },
                    title: { display: window.innerWidth < 768, text: '€', font: { style: 'italic', size: 11 }, color: '#64748b' },
                    ticks: { callback: function(value) { return formatAxisTick(value); } }
                }
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
                    label: i18n[currentLang].mtdNetLegend,
                    data: dataCumNet,
                    borderColor: '#ffffff', 
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 2
                },
                {
                    type: 'bar',
                    label: i18n[currentLang].mtdImpLegend,
                    data: dataCumImp,
                    backgroundColor: 'rgba(250, 204, 21, 0.7)', 
                    stacked: true
                },
                {
                    type: 'bar',
                    label: i18n[currentLang].mtdExpLegend,
                    data: dataCumExp,
                    backgroundColor: 'rgba(244, 63, 94, 0.7)', 
                    stacked: true
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: tipOff((i) => {
                const T = i18n[currentLang].tip;
                return tipHead(T.upTo.replace('{d}', fmtDay(dayDates[i]))) + tipSections(
                    tipRow(T.imports, fmtN(dataCumImp[i], 1), 'rgba(250, 204, 21, 0.9)', { unit: 'GWh' }) + tipRow(T.exports, fmtN(Math.abs(dataCumExp[i]), 1), 'rgba(244, 63, 94, 0.9)', { unit: 'GWh' }),
                    tipRow(T.net, fmtN(dataCumNet[i], 1, true), '#ffffff', { unit: 'GWh', strong: true }));
            }) },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { 
                    stacked: true, 
                    grid: { color: ctx => ctx.tick.value===0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value===0 ? 2 : 1 },
                    title: { display: window.innerWidth < 768, text: 'GWh', font: { style: 'italic', size: 11 }, color: '#64748b' },
                    ticks: { callback: function(value) { return formatAxisTick(value, true); } }
                }
            }
        }
    });
    return excludedDates;
}

// Η ημέρα που είναι επιλεγμένη στο dropdown
function selectedDayData() {
    const selectedDate = document.getElementById('dateSelect').value;
    return rawData.find(row => row.Date === selectedDate);
}

// Σχεδιάζει όλα τα tabs (αλλαγή ημερομηνίας, μήνα, γλώσσας). Στην εκκίνηση τα ίδια
// καλούνται ένα-ένα, ένα βήμα ανά tab στην οθόνη φόρτωσης (D03).
function renderCharts() {
    if (rawData.length === 0) return;
    const dayData = selectedDayData();
    updateStatusBadge(dayData);
    renderTotalsTab(dayData);
    renderHourlyTab(dayData);
    renderArbitrageTab(dayData);
    renderMTDView();
    renderCountryTab();
    renderSatTab();
    updateDayZeroNotes(dayData);
    updateDataNotice(dayData);
}

// Pill πληρότητας στην κεφαλίδα (D14): σχήμα και τόνοι όπως το pill του live· κρυφό στο MTD.
const PILL = {
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    orange: 'bg-orange-500/10 border-orange-400/40 text-orange-300'
};
function updateStatusBadge(dayData) {
    // Desktop: pill στην κεφαλίδα (D14)· κινητό: μικρό pill μέσα στο κουτί ημέρας (D29, H05)
    const head = document.getElementById('statusPill'), box = document.getElementById('statusPillBox');
    if (!head || !box) return;
    if (!dayData || currentTab === 'mtd' || currentTab === 'country') { head.className = 'hidden'; box.className = 'hidden'; return; }
    const t = i18n[currentLang], ok = dayComplete(dayData), tone = ok ? PILL.green : PILL.orange;
    head.className = `hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold ${tone}`;
    head.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current"></span>${escapeHtml(ok ? t.pillComplete : t.pillIncomplete)}`;
    box.className = `md:hidden shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${tone}`;
    box.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>${escapeHtml(ok ? t.pillCompleteShort : t.pillIncompleteShort)}`;
}

// Tab «Arbitrage»
function renderArbitrageTab(dayData) {
    if (!dayData) return;
    activeCountry = null;
    currentDayData = dayData;
    processArbitrageData(dayData, transitNettingOn);
    updateArbitrageTab();
}

// Tab «ISP vs SCADA» (σύνολα ανά χώρα)
function renderTotalsTab(dayData) {
    if (!dayData) return;
    {
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

        const t = i18n[currentLang];

        const ctxTotals = document.getElementById('totalsChart').getContext('2d');
        totalsChartInstance = new Chart(ctxTotals, {
            type: 'bar',
            data: {
                labels: ["AL", "BG", "IT", "MK", "TR"].map(c => i18n[currentLang].countries[c]),
                datasets: [
                    { label: t.scheduled, data: ispTotals, backgroundColor: 'rgba(120, 150, 192, 0.9)', borderColor: '#7896c0', borderWidth: 1, borderRadius: 4 },
                    { label: t.actual, data: scadaTotals, backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { tooltip: tipOff((i) => {
                    const c = ["AL", "BG", "IT", "MK", "TR"][i];
                    return tipHead(i18n[currentLang].countries[c]) + tipSections(
                        tipRow(t.scheduled, fmtN(ispTotals[i]), '#7896c0', { unit: 'MWh' }) + tipRow(t.actual, fmtN(scadaTotals[i]), '#f97316', { unit: 'MWh' }),
                        deviationBlock(ispTotals[i], scadaTotals[i], 'MWh'));
                }) },
                scales: { 
                    x: { grid: { display: false } }, 
                    y: { 
                        grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 },
                        title: { display: window.innerWidth < 768, text: 'MWh', font: { style: 'italic', size: 11 }, color: '#64748b' },
                        ticks: { callback: function(value) { return formatAxisTick(value); } }
                    } 
                } 
            }
        });

    }
}

// Tab «Ωριαία προφίλ» (ροές και τιμές)
function renderHourlyTab(dayData) {
    if (!dayData) return;
    {
        const hours = dayData.Hourly.map(h => h.Hour);
        const scadaHourly = dayData.Hourly.map(h => h.SCADA_Net);
        const ispHourly = dayData.Hourly.map(h => h.ISP_Net);
        const mcpGR = dayData.Hourly.map(h => h.MCP_GR);
        const mcpBG = dayData.Hourly.map(h => h.MCP_BG);
        const mcpIT = dayData.Hourly.map(h => h.MCP_IT);
        const t = i18n[currentLang];

        if (flowsChartInstance) flowsChartInstance.destroy();
        if (mcpChartInstance) mcpChartInstance.destroy();

        const ctxFlows = document.getElementById('flowsChart').getContext('2d');
        flowsChartInstance = new Chart(ctxFlows, {
            type: 'bar',
            data: {
                labels: hours.map(hourTick),
                datasets: [
                    { label: currentLang==='el' ? 'Πρόγραμμα ISP' : 'Scheduled ISP', data: ispHourly, backgroundColor: 'rgba(120, 150, 192, 0.9)', borderColor: '#7896c0', borderWidth: 1, borderRadius: 2 },
                    { label: currentLang==='el' ? 'Πραγματικό SCADA' : 'Actual SCADA', data: scadaHourly, backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 2 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { tooltip: tipOff((i) => {
                    const L = i18n[currentLang], T = L.tip;
                    return tipHead(`${T.hour} ${hourRange(hours[i])}`, `${L.priceCodes.GR} ${fmtN(mcpGR[i], 2)} €/MWh`, '#3b82f6') + tipSections(
                        tipRow(flowsChartInstance.data.datasets[0].label, fmtN(ispHourly[i]), '#7896c0', { unit: 'MW' }) + tipRow(flowsChartInstance.data.datasets[1].label, fmtN(scadaHourly[i]), '#f97316', { unit: 'MW' }),
                        deviationBlock(ispHourly[i], scadaHourly[i], 'MW'));
                }) },
                scales: { 
                    x: { grid: { display: false }, title: { display: true, text: i18n[currentLang].axisHour, color: '#64748b', font: { size: 11 } } }, 
                    y: { 
                        grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.6)' : '#334155', lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 },
                        title: { display: window.innerWidth < 768, text: 'MW', font: { style: 'italic', size: 11 }, color: '#64748b' },
                        ticks: { callback: function(value) { return formatAxisTick(value); } }
                    } 
                } 
            }
        });

        const ctxMCP = document.getElementById('mcpChart').getContext('2d');
        mcpChartInstance = new Chart(ctxMCP, {
            type: 'line',
            data: { labels: hours.map(hourTick), datasets: [
                { label: `${i18n[currentLang].priceCodes.GR} (€/MWh)`, data: mcpGR, borderColor: '#3b82f6', borderWidth: 2, tension: 0.2 },
                { label: `${i18n[currentLang].priceCodes.BG} (€/MWh)`, data: mcpBG, borderColor: '#10b981', borderWidth: 2, tension: 0.2 },
                { label: `${i18n[currentLang].priceCodes.IT} (€/MWh)`, data: mcpIT, borderColor: countryColors.IT, borderWidth: 2, tension: 0.2 }
            ]},
            options: { 
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { tooltip: tipOff((i) => {
                    const L = i18n[currentLang], T = L.tip, C = L.priceCodes;
                    const sp = (a, b) => (a === null || a === undefined || b === null || b === undefined) ? '–' : fmtN(a - b, 2, true);
                    return tipHead(`${T.hour} ${hourRange(hours[i])}`, '€/MWh') + tipSections(
                        tipRow(T.greece, fmtN(mcpGR[i], 2), '#3b82f6') + tipRow(L.countries.BG, fmtN(mcpBG[i], 2), '#10b981') + tipRow(L.countries.IT, fmtN(mcpIT[i], 2), countryColors.IT),
                        tipRow(`${T.spread} ${C.GR} − ${C.BG}`, sp(mcpGR[i], mcpBG[i])) + tipRow(`${T.spread} ${C.GR} − ${C.IT}`, sp(mcpGR[i], mcpIT[i])));
                }) },
                scales: {
                    x: { grid: { display: false }, title: { display: true, text: i18n[currentLang].axisHour, color: '#64748b', font: { size: 11 } } },
                    y: {
                        grid: { color: '#334155' },
                        title: { display: window.innerWidth < 768, text: '€/MWh', font: { style: 'italic', size: 11 }, color: '#64748b' },
                        ticks: { callback: function(value) { return formatAxisTick(value); } }
                    }
                }
            }
        });
    }

}

// Tab «Σωρευτική θέση» (MTD)
function updateMtdZeroNotice(month) {
    const el = document.getElementById('mtdZeroNotice');
    if (!el) return;
    const t = i18n[currentLang], lines = [];
    const first = `${month}-01`;
    const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const parts = []; let n = 0;
        zeroEpisodes(c).forEach(e => {
            if (e.to < first || e.from > last) return;              // το διάστημα δεν αγγίζει τον μήνα
            const a = e.from > first ? e.from : first;               // κομμένο στα όρια του μήνα
            const b = e.to < last ? e.to : last;
            n += Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
            parts.push(a === b ? fmtDayShort(a) : `${fmtDayShort(a)} – ${fmtDayShort(b)}`);
        });
        if (n) lines.push(t.zero.month.replace('{line}', t.lineCodes[c]).replace('{n}', nDays(n)).replace('{ranges}', parts.join(', ')));
    });
    el.textContent = lines.map(l => '⚠ ' + l).join(' · ');
    el.classList.toggle('hidden', !lines.length);
}

function renderMTDView() {
    const selectedMonth = document.getElementById('monthSelect').value;
    let excludedDates = [];
    if (selectedMonth) {
        excludedDates = renderMTDTab(selectedMonth) || [];
        updateMtdZeroNotice(selectedMonth);
    }
    updateMtdExclusionNotice(excludedDates);
}

// ---- Κατάσταση γραμμών (D36) --------------------------------------------------
function fmtDayShort(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n[currentLang].locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
// Διαστήματα μηδενικής ροής (D36): η σημείωση ακολουθεί την ημέρα / τον μήνα / την περίοδο που βλέπει ο επισκέπτης
function zeroEpisodes(c) {
    const st = analysisData && analysisData.status && analysisData.status[c];
    return (st && st.zero_episodes) || [];
}
function nDays(n) { const Z = i18n[currentLang].zero; return n === 1 ? Z.d1 : Z.dn.replace('{n}', n); }
// Tabs «Ημερήσια ροή» και «Ωριαία προφίλ» (D38): ίδια σημείωση με το Arbitrage, για κάθε γραμμή στο μηδέν την ημέρα αυτή
function updateDayZeroNotes(dayData) {
    const t = i18n[currentLang];
    const lines = dayData ? ["AL", "BG", "IT", "MK", "TR"].map(c => {
        const z = zeroNoteForDay(c, dayData.Date);
        return z ? `⚠ ${t.lineCodes[c]}: ${z.charAt(0).toLowerCase()}${z.slice(1)}` : null;
    }).filter(Boolean) : [];
    ['totalsZeroNote', 'hourlyZeroNote'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = lines.map(escapeHtml).join('<br>');
        el.classList.toggle('hidden', !lines.length);
    });
}

function zeroNoteForDay(c, date) {
    const Z = i18n[currentLang].zero;
    for (const e of zeroEpisodes(c)) {
        const from = fmtDayShort(e.from) + (e.from_data_start ? Z.start : '');
        if (e.from <= date && date <= e.to) {
            return (e.ongoing ? Z.dayOngoing : Z.day).replace('{from}', from).replace('{to}', fmtDayShort(e.to)).replace('{n}', nDays(e.days));
        }
        if (e.restart && e.restart.date === date) {
            return Z.restart.replace('{h}', e.restart.hour).replace('{n}', nDays(e.days)).replace('{from}', from).replace('{to}', fmtDayShort(e.to));
        }
    }
    return null;
}

// ---- Tab «Ανά χώρα» (D36) -----------------------------------------------------
let countryGran = 'month';
let countryPick = null;          // D38: μία χώρα, επιλεγμένη από τη λίστα· null = καμία
let countryChartInstance = null;
const fmtMEur = (v) => `${fmtN(v / 1e6, 1, true)} ${currentLang === 'el' ? 'εκ. €' : 'M€'}`;
function setCountryGran(g) { countryGran = g; renderCountryTab(); }
function selectCountry(c) {
    countryPick = countryPick === c ? null : c;
    renderCountryTab();
    // Στο κινητό η λίστα είναι κάτω από το γράφημα: ομαλή άνοδος για να φανεί η αλλαγή
    if (window.innerWidth < 768) document.getElementById('countryChartCard').scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' });
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function renderCountryTab() {
    const t = i18n[currentLang], C = t.ctry, N = t.countries;
    const notice = document.getElementById('countryNotice');
    const cash = analysisData && analysisData.cash;
    if (!cash || !cash.monthly) { notice.textContent = C.noData; notice.classList.remove('hidden'); return; }
    notice.classList.add('hidden');
    const order = ["AL", "BG", "IT", "MK", "TR"];
    const dates = Object.keys(cash.daily || {}).sort();
    const sub = C.sub.replace('{from}', fmtDay(dates[0])).replace('{to}', fmtDay(dates[dates.length - 1])).replace('{days}', dates.length);
    document.getElementById('countryTableSub').textContent = sub;
    document.getElementById('countryHint').textContent = countryPick ? C.hintSel.replace('{c}', N[countryPick]) : C.hint;
    [['countryGranMonth', 'month'], ['countryGranWeek', 'week']].forEach(([id, g]) => {
        document.getElementById(id).className = `px-3 py-1.5 rounded transition ${countryGran === g ? 'bg-acc-400 text-slate-900' : 'text-slate-400 hover:text-white'}`;
    });

    // Γράφημα: στοιβαγμένες μπάρες ανά χώρα· με επιλογή, οι άλλες στο 30% και σωρευτική γραμμή στον δεξιό άξονα
    const src = countryGran === 'week' ? (cash.weekly || {}) : cash.monthly;
    const keys = Object.keys(src).sort();
    const label = (k) => countryGran === 'week' ? fmtDayShort(k)
        : new Intl.DateTimeFormat(t.locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)));
    const datasets = order.map(c => ({ type: 'bar', label: N[c], data: keys.map(k => src[k][c].net / 1e6), stack: 'net', order: 2,
        backgroundColor: countryPick && countryPick !== c ? hexA(countryColors[c], 0.3) : countryColors[c] }));
    let cum = null;
    if (countryPick) {
        let run = 0;
        cum = keys.map(k => (run += src[k][countryPick].net) / 1e6);
        datasets.push({ type: 'line', label: `${C.cum} · ${N[countryPick]}`, data: cum, yAxisID: 'y2', order: 1,
            borderColor: countryColors[countryPick], backgroundColor: countryColors[countryPick], borderWidth: 2.5,
            pointRadius: countryGran === 'week' ? 0 : 3, pointHoverRadius: 4, tension: 0.2 });
    }
    if (countryChartInstance) countryChartInstance.destroy();
    countryChartInstance = new Chart(document.getElementById('countryChart').getContext('2d'), {
        data: { labels: keys.map(label), datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: tipOff((i) => {
                const k = keys[i], days = src[k][order[0]].days;
                const rows = order.slice().sort((a, b) => src[k][b].net - src[k][a].net)
                    .map(c => tipRow(N[c], fmtMEur(src[k][c].net), countryColors[c], { strong: c === countryPick })).join('');
                const total = order.reduce((a, c) => a + src[k][c].net, 0);
                const extra = countryPick ? tipRow(`${C.cum} · ${N[countryPick]}`, fmtMEur(cum[i] * 1e6), countryColors[countryPick], { strong: true }) : '';
                return tipHead(countryGran === 'week' ? `${C.week} ${fmtDayShort(k)}` : label(k), C.days.replace('{n}', days))
                    + tipSections(rows, tipRow(C.net, fmtMEur(total), null, { strong: true }) + extra);
            }) },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255,255,255,0.6)' : '#334155' },
                     ticks: { callback: v => `${fmtN(v, 0)}` }, title: { display: true, text: currentLang === 'el' ? 'εκ. €' : 'M€', color: '#64748b', font: { size: 11 } } },
                y2: { display: !!countryPick, position: 'right', grid: { display: false },
                      ticks: { color: countryPick ? countryColors[countryPick] : '#94a3b8', callback: v => `${fmtN(v, 0)}` },
                      title: { display: !!countryPick, text: C.cumAxis, color: '#64748b', font: { size: 11 } } }
            }
        }
    });

    // Λεπτομέρειες επιλεγμένης χώρας: ταβάνι, και για ΒΓ / ΙΤ ο κορεσμός ανά μήνα με τρία νούμερα
    const det = document.getElementById('countryDetail');
    if (!countryPick) { det.classList.add('hidden'); det.innerHTML = ''; }
    else {
        const ce = analysisData.ceilings && analysisData.ceilings[countryPick];
        const cl = (d, cls, lab) => d ? `<div><div class="text-slate-400">${lab}</div><div class="${cls} font-semibold">${fmtN(d.mw, 0)} MW <span class="text-[11px] font-normal text-slate-500 whitespace-nowrap">${fmtDayShort(d.date)}, ${hourSpan(d.hour)}</span></div><div class="text-[11px] text-slate-400">P99 ${fmtN(d.p99_mw, 0)} MW</div></div>` : '';
        let html = ce ? `<div class="text-xs font-semibold text-slate-300 mb-2">${escapeHtml(C.ceil)}</div>
            <div class="grid grid-cols-2 gap-3 text-xs" style="font-variant-numeric:tabular-nums">${cl(ce.imp, 'text-yellow-400', '↓ ' + t.sat.imp)}${cl(ce.exp, 'text-rose-500', '↑ ' + t.sat.exp)}</div>` : '';
        const sat = analysisData.saturation && analysisData.saturation[countryPick];
        if (sat) {
            const mlab = (k) => new Intl.DateTimeFormat(t.locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)));
            const rows = Object.keys(sat).sort().map(m => {
                const x = sat[m], sch = x.mwh_to_n + x.mwh_to_gr, act = x.act_mwh_to_n + x.act_mwh_to_gr;
                const phys = sch > 0 ? `${fmtN(100 * act / sch, 0)}%` : '–';
                return `<div class="grid grid-cols-[1fr_1fr_1.2fr_1fr] gap-2 py-1.5 border-t border-slate-700/50">
                    <span class="text-slate-300">${mlab(m)}</span><span class="text-right text-slate-200">${fmtN(x.dec_pct, 0)}%</span>
                    <span class="text-right text-emerald-400 font-semibold">${fmtEur(x.rent_eur)}</span><span class="text-right text-slate-200">${phys}</span></div>`;
            }).join('');
            html += `<div class="text-xs font-semibold text-slate-300 mt-4 mb-1">${escapeHtml(C.satTitle)}</div>
                <div class="text-xs" style="font-variant-numeric:tabular-nums">
                <div class="grid grid-cols-[1fr_1fr_1.2fr_1fr] gap-2 pb-1 text-slate-400"><span></span><span class="text-right">${escapeHtml(C.satPct)}</span><span class="text-right">${escapeHtml(C.satRent)}</span><span class="text-right">${escapeHtml(C.satPhys)}</span></div>
                ${rows}</div><p class="text-[11px] text-slate-500 mt-1">${escapeHtml(C.satPhys)}: ${escapeHtml(C.satPhysHelp)}</p>`;
        }
        det.innerHTML = `<div class="border-t border-slate-700 pt-4">${html}</div>`;
        det.classList.remove('hidden');
    }

    // Λίστα χωρών = διακόπτης του γραφήματος (D38)
    const tot = {};
    order.forEach(c => { tot[c] = { rev: 0, cost: 0, exp_mwh: 0, imp_mwh: 0, net: 0 }; });
    Object.values(cash.monthly).forEach(m => order.forEach(c => { Object.keys(tot[c]).forEach(k => { tot[c][k] += m[c][k]; }); }));
    const avg = (eur, mwh) => mwh > 0 ? `${fmtN(eur / mwh, 2)} <span class="text-[11px] font-normal text-slate-500">€/MWh</span>` : '<span class="text-slate-600">–</span>';
    const gwh = (mwh) => mwh > 0 ? `${fmtN(mwh / 1000, 1)} <span class="text-[11px] font-normal text-slate-500">GWh</span>` : '<span class="text-slate-600">–</span>';
    const rowsHtml = order.slice().sort((a, b) => tot[b].net - tot[a].net).map(c => {
        const x = tot[c], col = x.net >= 0 ? 'text-emerald-400' : 'text-fuchsia-400', on = countryPick === c;
        const dim = countryPick && !on ? ' opacity-60' : '';
        const dot = `<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${countryColors[c]}"></span>`;
        const zd = zeroEpisodes(c).reduce((a, e) => a + e.days, 0);
        const zn = zd ? `<div class="px-4 md:px-6 pb-3 -mt-1 text-xs text-amber-300">⚠ ${escapeHtml(t.zero.period.replace('{n}', nDays(zd)))}</div>` : '';
        return `<div role="button" tabindex="0" aria-pressed="${on}" onclick="selectCountry('${c}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectCountry('${c}')}"
            class="border-t border-slate-700/50 cursor-pointer transition hover:bg-slate-700/30 ${on ? 'bg-slate-700/40 shadow-[inset_3px_0_0_0_rgb(34,211,238)]' : ''}${dim}">
            <div class="hidden md:grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-6 py-3 items-center text-sm" style="font-variant-numeric:tabular-nums">
                <span class="flex items-center gap-2 text-slate-200 font-semibold">${dot}${escapeHtml(N[c])}</span>
                <span class="text-right text-rose-400 font-semibold">${gwh(x.exp_mwh)}</span><span class="text-right text-rose-300">${avg(x.rev, x.exp_mwh)}</span>
                <span class="text-right text-yellow-400 font-semibold">${gwh(x.imp_mwh)}</span><span class="text-right text-yellow-300">${avg(x.cost, x.imp_mwh)}</span>
                <span class="text-right font-bold ${col}">${fmtMEur(x.net)}</span>
            </div>
            <div class="md:hidden px-4 py-3">
                <div class="flex justify-between items-center gap-3"><span class="flex items-center gap-2 text-slate-200 font-semibold text-sm">${dot}${escapeHtml(N[c])}</span><span class="font-bold text-sm ${col}">${fmtMEur(x.net)}</span></div>
                <div class="grid grid-cols-2 gap-3 mt-1.5 text-xs font-semibold" style="font-variant-numeric:tabular-nums">
                    <div class="text-right text-yellow-400">↓ ${gwh(x.imp_mwh)}<div class="opacity-90">${avg(x.cost, x.imp_mwh)}</div></div>
                    <div class="text-right text-rose-500">↑ ${gwh(x.exp_mwh)}<div class="opacity-90">${avg(x.rev, x.exp_mwh)}</div></div>
                </div>
            </div>${zn}</div>`;
    }).join('');
    document.getElementById('countryTable').innerHTML = `<div class="hidden md:grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-6 py-2 text-xs text-slate-400 font-semibold">
        <span>${escapeHtml(t.colCountry)}</span><span class="text-right">${escapeHtml(C.exports)}</span><span class="text-right">${escapeHtml(C.avg)}</span>
        <span class="text-right">${escapeHtml(C.imports)}</span><span class="text-right">${escapeHtml(C.avg)}</span><span class="text-right">${escapeHtml(C.cash)}</span></div>` + rowsHtml;
}

// ---- Tab «Κορεσμός» (D37) ------------------------------------------------------
const fmtEur = (v) => v >= 1e6 ? `${fmtN(v / 1e6, 1)} ${currentLang === 'el' ? 'εκ. €' : 'M€'}` : `${fmtN(v, 0)} €`;
function hourSpan(hhmm) { const h = parseInt(hhmm, 10); return `${String(h).padStart(2, '0')}–${String(h + 1).padStart(2, '0')}`; }

// Οι προτάσεις της ημέρας από τα γεγονότα του analysis.json (D34, D35): πρώτα τιμές, μετά πρόγραμμα / μέτρηση / χρήματα
function factSentences(f) {
    const t = i18n[currentLang], S = t.sent, L = t.lineCodes[f.line] || '';
    const dur = (h) => { const q = Math.round(h * 4); if (q < 4) return q === 1 ? S.q1 : S.qn.replace('{n}', q);
        const hh = q / 4; return hh === 1 ? S.h1 : S.hn.replace('{n}', Number.isInteger(hh) ? hh : fmtN(hh, 2).replace(/0+$/, '').replace(/[.,]$/, '')); };
    const wins = (ws) => ws.length <= 3 ? ws.map(w => `${w.from}–${w.to}`).join(', ')
        : S.many.replace('{n}', ws.length).replace('{a}', ws[0].from).replace('{b}', ws[ws.length - 1].to);
    switch (f.type) {
        case 'coupled_all_day': return [S.coupled.replace('{L}', L)];
        case 'decoupled': {
            const main = f.main_dir || f.windows.slice().sort((a, b) => b.hours - a.hours)[0].dir;
            const mw = f.windows.filter(w => w.dir === main), ow = f.windows.filter(w => w.dir !== main);
            const hm = mw.reduce((a, w) => a + w.hours, 0);
            const avg = mw.reduce((a, w) => a + w.avg_spread * w.hours, 0) / hm, mx = Math.max(...mw.map(w => w.max_spread));
            let s1 = S.dec1.replace('{L}', L).replace('{w}', wins(mw)).replace('{h}', dur(hm)).replace('{cheap}', main === 'to_n' ? S.cheaper : S.dearer)
                .replace('{avg}', fmtN(avg, 0)).replace('{max}', fmtN(mx, 0));
            if (ow.length) s1 += S.other.replace('{w}', wins(ow));
            if (!f.measured || !f.sched_peak_mw) return [s1];
            const p = f.pct_of_limit;
            const lim = f.limit_mw ? (p <= 100 ? S.limIn.replace('{p}', p) : S.limOver.replace('{p}', p - 100)) : '';
            const s2 = S.dec2.replace('{to}', S.to[main === 'to_gr' ? 'gr' : f.line]).replace('{sp}', fmtN(f.sched_peak_mw, 0)).replace('{lim}', lim)
                .replace('{ap}', fmtN(f.act_peak_mw, 0)).replace('{sm}', fmtN(f.sched_mwh, 0)).replace('{am}', fmtN(f.act_mwh, 0)).replace('{rent}', fmtEur(f.rent_eur || 0));
            return [s1, s2];
        }
        case 'against': return [S.against.replace('{L}', L).replace('{n}', f.hours === 1 ? S.h1 : S.hn.replace('{n}', f.hours)).replace('{mwh}', fmtN(f.mwh, 0))];
        case 'new_max': return [S.newMax.replace('{L}', L).replace('{dir}', f.dir === 'exp' ? S.exp : S.imp).replace('{mw}', fmtN(f.mw, 0)).replace('{h}', hourSpan(f.hour)).replace('{prev}', fmtN(f.prev_mw, 0))];
        case 'first_decoupling': return [S.firstDec.replace('{L}', L).replace('{n}', f.days)];
        case 'max_spread_month': return [S.maxSpread.replace('{L}', L).replace('{s}', fmtN(f.spread, 0))];
        case 'limitation': return [S.limitation.replace('{L}', L).replace('{to}', S.to[f.dir === 'to_gr' ? 'gr' : f.line]).replace('{cap}', fmtN(f.cap_mw, 0))
            .replace('{w}', f.windows.map(w => `${w.from}–${w.to}`).join(', ')).replace('{n}', f.hours === 1 ? S.h1 : S.hn.replace('{n}', f.hours)).replace('{lim}', fmtN(f.limit_mw, 0))];
        case 'deviation': return [S.deviation.replace('{mw}', fmtN(f.mw, 0)).replace('{p90}', fmtN(f.p90_mw, 0))];
        default: return [];      // zero_start / restart: γράφονται ως σημείωση μηδενικής ροής (D36)
    }
}

// ---- Γραφήματα 24ώρου ΕΛ–ΒΓ / ΕΛ–ΙΤ (D39) --------------------------------------
const satHourCharts = {};
const satOverlay = {
    id: 'satOverlay',
    beforeDatasetsDraw(chart, _a, o) {             // σκιασμένες στήλες στις ώρες κορεσμού
        const { ctx, chartArea: ca, scales: { x } } = chart;
        if (!o || !o.sat) return;
        const w = x.getPixelForValue(1) - x.getPixelForValue(0);
        ctx.save(); ctx.fillStyle = 'rgba(34,211,238,0.13)';
        o.sat.forEach((on, i) => { if (on) ctx.fillRect(x.getPixelForValue(i) - w / 2, ca.top, w, ca.bottom - ca.top); });
        ctx.restore();
    },
    afterDatasetsDraw(chart, _a, o) {              // διακεκομμένες: παρατηρούμενο όριο· πορτοκαλί: πιθανός περιορισμός
        const { ctx, chartArea: ca, scales: { x, y } } = chart;
        if (!o) return;
        const w = x.getPixelForValue(1) - x.getPixelForValue(0);
        ctx.save(); ctx.lineWidth = 1.5;
        (o.limits || []).forEach(v => { const py = y.getPixelForValue(v); if (py < ca.top || py > ca.bottom) return;
            ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(226,232,240,0.7)'; ctx.beginPath(); ctx.moveTo(ca.left, py); ctx.lineTo(ca.right, py); ctx.stroke(); });
        (o.caps || []).forEach(c => {
            const py = y.getPixelForValue(c.v), x0 = x.getPixelForValue(c.a) - w / 2, x1 = x.getPixelForValue(c.b - 1) + w / 2;
            ctx.setLineDash([]); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;          // σκούρο περίγραμμα για να ξεχωρίζει
            ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
            ctx.setLineDash([6, 4]); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
            ctx.setLineDash([]); ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(`${fmtN(Math.abs(c.v), 0)} MW`, (x0 + x1) / 2, c.v < 0 ? py + 15 : py - 7);
        });
        ctx.restore();
    }
};

function renderSatHourCharts(date, facts, measured) {
    const t = i18n[currentLang], H = t.hh, day = currentDayData;
    document.getElementById('satChartsSub').textContent = measured ? H.sub : H.subToday;
    const anyCap = facts.some(f => f.type === 'limitation');
    const sw = (style) => `<span class="inline-block align-middle mr-1.5" style="${style}"></span>`;
    document.getElementById('satLegend').innerHTML = [
        sw(`width:10px;height:10px;border-radius:2px;background:linear-gradient(90deg,${countryColors.BG} 50%,${countryColors.IT} 50%)`) + H.sched,
        measured ? sw('width:14px;height:2px;background:#f8fafc') + H.meas : '',
        sw('width:12px;height:10px;background:rgba(34,211,238,0.3);border-radius:2px') + H.sat,
        sw('width:14px;height:0;border-top:2px dashed rgba(226,232,240,0.8)') + H.limit,
        anyCap ? sw('width:14px;height:0;border-top:3px dashed #fde047') + H.cap : ''
    ].filter(Boolean).map(x => `<span class="whitespace-nowrap">${x}</span>`).join('');
    ['BG', 'IT'].forEach(c => {
        const M = day && day.Market && day.Market[c];
        const n = day ? day.Hourly.length : 0;
        const sched = M ? M.isp : [], cpl = M ? M.cpl : [], spr = M ? M.spr : [];
        const meas = day ? day.Hourly.map(h => h['SCADA_' + c]) : [];
        const sat = Array.from({ length: n }, (_, i) => cpl[i] != null && cpl[i] < 4 && spr[i] != null && Math.abs(spr[i]) >= 1);
        const lim = (analysisData && analysisData.limits && analysisData.limits[date] && analysisData.limits[date][c]) || {};
        const limits = [lim.to_gr, lim.to_n != null ? -lim.to_n : null].filter(v => v != null);
        const caps = facts.filter(f => f.type === 'limitation' && f.line === c)
            .flatMap(f => f.windows.map(w => ({ v: (f.dir === 'to_n' ? -1 : 1) * f.cap_mw, a: parseInt(w.from, 10), b: parseInt(w.to, 10) })));
        const labels = day ? day.Hourly.map(h => hourTick(h.Hour)) : [];
        const ext = Math.max(10, ...limits.map(Math.abs), ...sched.filter(v => v != null).map(Math.abs), ...(measured ? meas.filter(v => v != null).map(Math.abs) : []));
        if (satHourCharts[c]) satHourCharts[c].destroy();
        const ds = [{ type: 'bar', label: H.sched, data: sched, backgroundColor: hexA(countryColors[c], 0.85), order: 2, barPercentage: 0.9, categoryPercentage: 0.9 }];
        if (measured) ds.push({ type: 'line', label: H.meas, data: meas, borderColor: '#f8fafc', backgroundColor: '#f8fafc', borderWidth: 2, pointRadius: 1.5, order: 1, tension: 0.2 });
        satHourCharts[c] = new Chart(document.getElementById('satChart' + c).getContext('2d'), {
            data: { labels, datasets: ds },
            plugins: [satOverlay],
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, satOverlay: { sat, limits, caps },
                    tooltip: tipOff((i) => {
                        const h = day.Hourly[i], rows = [tipRow(H.sched, `${fmtN(sched[i], 0, true)} MW`, countryColors[c])];
                        if (measured) rows.push(tipRow(H.meas, `${fmtN(meas[i], 0, true)} MW`, '#f8fafc'));
                        if (spr[i] != null) rows.push(tipRow(H.spread, `${fmtN(spr[i], 1, true)} €/MWh · ${sat[i] ? H.yes : H.no}`, null));
                        return tipHead(`${t.tip.hour} ${hourRange(h.Hour)}`) + tipSections(rows.join(''));
                    }) },
                scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
                          y: { suggestedMin: -ext * 1.1, suggestedMax: ext * 1.1, grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(255,255,255,0.6)' : '#334155' },
                               ticks: { callback: v => fmtN(v, 0) }, title: { display: true, text: 'MW', color: '#64748b', font: { size: 11 } } } }
            }
        });
    });
}

function renderSatTab() {
    const t = i18n[currentLang], T = t.sat, N = t.countries;
    const notice = document.getElementById('satNotice');
    if (!analysisData || !analysisData.days) { notice.textContent = T.noData; notice.classList.remove('hidden'); return; }
    notice.classList.add('hidden');

    // 1. Η ημέρα των διασυνδέσεων — ακολουθεί το κουτί «Ημέρα»
    const date = currentDayData ? currentDayData.Date : null;
    const facts = (date && analysisData.days[date]) || [];
    const measured = !!(currentDayData && currentDayData.Flags && currentDayData.Flags.scada);
    document.getElementById('satDaySub').textContent = date ? (measured ? T.subMeasured : T.subPrices).replace('{d}', fmtDay(date)) : '';
    const blocks = [];
    // Ημέρα χωρίς μέτρηση: γραμμή με ανοιχτό διάστημα στο μηδέν → σημείωση αντί για πρόταση τιμών (D37)
    const pending = {};
    if (date && !measured) ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const e = zeroEpisodes(c).find(x => x.ongoing && x.to < date);
        if (e) pending[c] = e;
    });
    // Σειρά: κατά βαθμό, αλλά η «μεγαλύτερη διαφορά του μήνα» ακριβώς μετά την αποσύζευξη της ίδιας γραμμής
    let list = facts.filter(f => f.type !== 'zero_start' && f.type !== 'restart' && !pending[f.line]);
    const spreads = list.filter(f => f.type === 'max_spread_month');
    list = list.filter(f => f.type !== 'max_spread_month');
    spreads.forEach(f => { const i = list.findIndex(x => x.type === 'decoupled' && x.line === f.line); i >= 0 ? list.splice(i + 1, 0, f) : list.push(f); });
    list.slice(0, 5).forEach(f => {
        const ss = factSentences(f);
        if (!ss.length) return;
        blocks.push(`<div class="text-sm leading-relaxed"><p class="text-slate-200">${escapeHtml(ss[0])}</p>${ss[1] ? `<p class="text-slate-400 mt-1">${escapeHtml(ss[1])}</p>` : ''}</div>`);
    });
    Object.entries(pending).forEach(([c, e]) => blocks.push(`<p class="text-sm text-amber-300">⚠ ${escapeHtml(t.lineCodes[c])}: ${escapeHtml(t.zero.pending
        .replace('{from}', fmtDayShort(e.from)).replace('{to}', fmtDayShort(e.to)))}</p>`));
    if (date) ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const z = zeroNoteForDay(c, date);
        if (z) blocks.push(`<p class="text-sm text-amber-300">⚠ ${escapeHtml(t.lineCodes[c])}: ${escapeHtml(z.charAt(0).toLowerCase() + z.slice(1))}</p>`);
    });
    document.getElementById('satDayBody').innerHTML = blocks.length ? blocks.join('<div class="border-t border-slate-700/50"></div>')
        : `<p class="text-sm text-slate-400">${escapeHtml(T.none)}</p>`;
    if (date) renderSatHourCharts(date, facts, measured);

}

// ---- Οθόνη φόρτωσης (D03, όπως live-greekpower D47) ----------------------
// Πρώτα η δουλειά, μετά το γέμισμα της μπάρας, μετά το ✓. Χρόνοι ίδιοι με το live.
const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const LOAD_STEP = REDUCE_MOTION ? 120 : 350, LOAD_MIN_READ = REDUCE_MOTION ? 200 : 650, LOAD_READY = REDUCE_MOTION ? 200 : 650;
const pause = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const loadRow = (i) => document.querySelector(`.load-row[data-step="${i}"]`);
function loadActivate(i) { const r = loadRow(i); if (r) r.classList.remove('opacity-50'); }
function loadSet(i, pct) { const b = loadRow(i) && loadRow(i).querySelector('[data-load-bar]'); if (b) b.style.width = `${pct}%`; }
function loadDone(i) {
    const r = loadRow(i); if (!r) return;
    const b = r.querySelector('[data-load-bar]');
    b.style.width = '100%'; b.classList.remove('bg-blue-500', 'bg-acc-500'); b.classList.add('bg-emerald-500');
    r.querySelector('[data-load-ck]').classList.remove('opacity-0');
}
async function loadStep(i, work) {          // βήματα 2…5: δουλειά → γέμισμα → ✓
    loadActivate(i);
    await pause(20);
    await work();
    const b = loadRow(i).querySelector('[data-load-bar]');
    b.style.transitionDuration = `${LOAD_STEP}ms`; b.style.transitionTimingFunction = 'linear'; b.style.width = '100%';
    await pause(LOAD_STEP);
    loadDone(i);
}

// Αν τα δεδομένα δεν φορτώσουν: η οθόνη μένει, σταματά το spinner και γράφει μήνυμα (όπως στο live).
function loadFailed(err) {
    console.error(err);
    document.getElementById('mainSpinner').classList.add('hidden');
    const el = document.getElementById('loadError');
    el.textContent = i18n[currentLang].load.error;
    el.classList.remove('hidden');
}

// Λήψη JSON (D32, όπως BESS D53 / live D54). «no-cache»: ο browser ρωτά τον server αν το αρχείο άλλαξε (ETag)·
// αν όχι, χρησιμοποιεί το αντίγραφο που έχει (απάντηση 304, λίγα bytes)· αν ναι, κατεβάζει το νέο.
// Πριν: το meta.json κατέβαινε ολόκληρο κάθε φορά (?v=<ώρα>) και τα δεδομένα μπορούσαν να δείχνουν
// έως 10 λεπτά το παλιό αντίγραφο μετά την ενημέρωση των 07:02.
async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
}

// Ημερομηνίες στη γλώσσα του επισκέπτη (D14, όπως fmtDate του live)
function fmtDay(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n[currentLang].locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
function fmtMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const s = new Intl.DateTimeFormat(i18n[currentLang].locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function todayAthens() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date());   // YYYY-MM-DD
}

// Γεμίζει τις επιλογές· κρατά την τρέχουσα επιλογή (π.χ. όταν αλλάζει η γλώσσα).
// Πρώτη φορά: τελευταία ΠΛΗΡΗΣ ημέρα και τελευταίος μήνας.
function fillPickers() {
    const dSel = document.getElementById('dateSelect'), mSel = document.getElementById('monthSelect');
    const keepDay = rawData.some(r => r.Date === dSel.value) ? dSel.value : null;
    const keepMonth = /^\d{4}-\d{2}$/.test(mSel.value) ? mSel.value : null;
    const t = i18n[currentLang], today = todayAthens();
    const dates = [...new Set(rawData.map(row => row.Date))].sort().reverse();
    const byDate = {};
    rawData.forEach(r => { byDate[r.Date] = r; });
    dSel.innerHTML = dates.map(d => `<option value="${d}">${fmtDay(d)}${d === today ? ` (${t.today})` : ''}${dayComplete(byDate[d]) ? '' : ' ⚠'}</option>`).join('');
    dSel.value = keepDay || dates.find(d => dayComplete(byDate[d])) || dates[0] || '';
    const months = [...new Set(rawData.map(row => row.Date.substring(0, 7)))].sort().reverse();
    mSel.innerHTML = months.map(m => `<option value="${m}">${fmtMonth(m)}</option>`).join('');
    mSel.value = keepMonth || months[0] || '';
}

// Ένα κουτί: «Ημέρα» στα τρία πρώτα tabs, «Μήνας» στο MTD
function updatePicker() {
    const t = i18n[currentLang], mtd = currentTab === 'mtd';
    const label = document.getElementById('pickerLabel');
    label.textContent = mtd ? t.monthLabel : t.dateLabel;
    label.setAttribute('for', mtd ? 'monthSelect' : 'dateSelect');
    document.getElementById('dateSelect').classList.toggle('hidden', mtd);
    document.getElementById('monthSelect').classList.toggle('hidden', !mtd);
    // Το tab «Ανά χώρα» δείχνει όλη την περίοδο: χωρίς κουτί επιλογής (όπως στο live, όπου ένα tab δεν το χρειάζεται)
    document.getElementById('pickerBox').classList.toggle('hidden', currentTab === 'country');
}

async function boot() {
    applyStaticText();
    try {
        // Βασικές ρυθμίσεις γραφημάτων όπως στο live (D20)
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = '#334155';
        Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
        Chart.defaults.font.size = 12;
        Chart.defaults.plugins.legend.labels.boxWidth = 12;
        Chart.defaults.plugins.legend.labels.boxHeight = 12;
        Chart.defaults.animation.duration = REDUCE_MOTION ? 0 : 400;

        // Βήμα 1: πραγματική πρόοδος (2 αρχεία: meta + ροές), με ελάχιστο χρόνο ανάγνωσης
        loadActivate(1);
        const t0 = Date.now();
        const files = [
            getJSON('data/meta.json').catch((e) => { console.warn('meta.json', e); return null; }),   // όχι κρίσιμο
            getJSON('data/historical_flows.json'),
            getJSON('data/analysis.json').catch((e) => { console.warn('analysis.json', e); return null; })   // όχι κρίσιμο (D36)
        ];
        let done = 0;
        const [meta, flows, analysis] = await Promise.all(files.map((p) => p.then((v) => { loadSet(1, Math.round(++done / files.length * 100)); return v; })));
        if (!Array.isArray(flows) || flows.length === 0) throw new Error('historical_flows.json is empty');
        rawData = flows;
        metaData = meta;
        analysisData = analysis;
        updateHeader();
        await pause(Math.max(0, LOAD_MIN_READ - (Date.now() - t0)));
        loadDone(1);
        await pause(LOAD_STEP);

        // Βήματα 2…5: ένα ανά tab, με τη σειρά των tabs
        let day = null;
        await loadStep(2, async () => { fillPickers(); updatePicker(); day = selectedDayData(); updateStatusBadge(day); updateDataNotice(day); renderTotalsTab(day); });
        await loadStep(3, async () => { renderHourlyTab(day); });
        await loadStep(4, async () => { renderArbitrageTab(day); });
        await loadStep(5, async () => { renderMTDView(); });
        await loadStep(6, async () => { renderCountryTab(); });
        await loadStep(7, async () => { renderSatTab(); });

        document.getElementById('mainSpinner').classList.add('hidden');
        document.getElementById('loadRowFinal').classList.remove('opacity-0', 'translate-y-2');
        await pause(LOAD_READY);
        const ov = document.getElementById('loading-overlay');
        ov.classList.add('opacity-0');
        setTimeout(() => { ov.style.display = 'none'; }, 500);
    } catch (err) { loadFailed(err); }
}

document.getElementById('dateSelect').addEventListener('change', renderCharts);
document.getElementById('monthSelect').addEventListener('change', renderCharts);

// ---- Κουμπί «επάνω» (κινητό, D29 / BESS D72) ----
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
}
(function initToTop() {
    const btn = document.getElementById('toTopBtn');
    const first = document.querySelector('[role="tab"]');
    const nav = first && first.parentElement;
    if (!btn || !nav) return;
    let ticking = false;
    const update = () => {
        ticking = false;
        const show = nav.getBoundingClientRect().bottom < 0;      // τα tabs έχουν περάσει πάνω από την οθόνη
        btn.classList.toggle('opacity-0', !show);
        btn.classList.toggle('pointer-events-none', !show);
        btn.tabIndex = show ? 0 : -1;
        btn.setAttribute('aria-hidden', show ? 'false' : 'true');
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
})();

// Τα scripts είναι defer, οπότε το Chart.js και το plugin έχουν ήδη φορτώσει εδώ.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
