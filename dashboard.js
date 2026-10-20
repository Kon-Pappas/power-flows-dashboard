let rawData = [];
let currentLang = 'en';
// D04 (όπως live D10): αγγλικά από προεπιλογή· η τελευταία επιλογή του επισκέπτη κρατιέται στον browser του,
// στο κοινό κλειδί kp_lang, οπότε η γλώσσα τον ακολουθεί σε όλο το hub.
try { const l = localStorage.getItem('kp_lang'); if (l === 'el' || l === 'en') currentLang = l; } catch (e) { /* ιδιωτική περιήγηση */ }
let metaData = null;   // data/meta.json: πότε έγινε η τελευταία λήψη και πότε η επόμενη (D06)

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
    if (!arr || arr.length !== 24) return false;
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
    el.innerText = show ? t.noticeDay : '';
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
        el.innerText = t.noticeExcluded.replace('{n}', excludedDates.length) + ' (' + list + ')';
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
        lastUpdate: "Last Update:",
        lastUpdateMobile: "Updated:",
        nextUpdate: "Next Update:",
        nextUpdateMobile: "Next:",
        dateLabel: "Date:",
        today: "today",
        pillComplete: "Complete data",
        pillIncomplete: "Incomplete data",
        monthLabel: "Month:",
        tabTotals: "Daily ISP vs SCADA",
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
        lastUpdate: "Τελευταία Ενημέρωση:",
        lastUpdateMobile: "Ενημέρωση:",
        nextUpdate: "Επόμενη Ενημέρωση:",
        nextUpdateMobile: "Επόμενη:",
        dateLabel: "Ημέρα:",
        today: "σήμερα",
        pillComplete: "Πλήρη δεδομένα",
        pillIncomplete: "Ελλιπή δεδομένα",
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
        exporter: "Εξαγωγικό Ισοζ.",
        importer: "Εισαγωγικό Ισοζ.",
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

// ---- Methodology modal: content model + renderer (Short / Detailed, per tab) --------
let methodologyMode = 'short';

const methodologyData = {
    en: {
        introShort: "An independent tool for monitoring physical and financial power flows across Greece's electricity interconnections, built on open ADMIE and ENTSO-E data by a single analyst. Figures are estimates and indications, not official statistics.",
        introDetailed: "An independent tool for monitoring and analyzing physical and financial power flows across Greece's electricity interconnections, built and maintained by a single analyst on open data. Figures are estimates and indications, not official statistics.",
        sections: [
            {
                title: "ALL TABS",
                shortItems: [
                    ["Scope:", "the five interconnections with Albania, Bulgaria, Italy, North Macedonia and Turkey."],
                    ["Sources:", "ADMIE's SCADA & ISP reports, ENTSO-E day-ahead prices. Updated daily; the last 5 days are re-checked each run to catch late publications."],
                    ["Pending data:", "a day without SCADA yet is marked ⚠ and excluded from Month-to-Date totals until complete."]
                ],
                items: [
                    ["Scope:", "the five interconnections with Albania, Bulgaria, Italy, North Macedonia and Turkey."],
                    ["Sources:", "physical flow data is fetched daily from ADMIE's official SCADA & ISP reports; Day-Ahead Market Clearing Prices (MCPs) from ENTSO-E."],
                    ["Updates:", "daily via a scheduled job. The last 5 days are re-checked on every run to catch late publications and corrections."],
                    ["Data Completeness:", "SCADA for a given day is published by ADMIE the following morning; until then, that day is marked ⚠, its Cash Flow shown as \"n/a\", and it is excluded from Month-to-Date totals so incomplete data can't distort monthly aggregates."]
                ]
            },
            {
                title: "DAILY ISP vs SCADA",
                items: [
                    ["ISP vs SCADA:", "ISP is the day-ahead cross-border schedule; SCADA is what was actually measured. Differences between them are expected and can reflect intraday re-dispatch or last-minute constraint activity."],
                    ["ISP Schedule Selection:", "cross-border totals per country are taken from ADMIE's \"Total Market CBS (+XBID)\" section — the final schedule after intraday adjustments — rather than the day-ahead auction alone."]
                ]
            },
            {
                title: "HOURLY PROFILES",
                items: [
                    ["Hourly resolution:", "flows and prices are shown as hourly values; ADMIE's underlying schedule data is quarter-hourly and is averaged to the hour for display."],
                    ["Prices shown:", "Day-Ahead Market Clearing Prices for Greece, Bulgaria and Italy, for context alongside the physical flows."]
                ]
            },
            {
                title: "DAILY ARBITRAGE",
                items: [
                    ["Pricing Logic & Valuation:", "for Albania, North Macedonia and Turkey, flows are valued using the Greek price only. For Bulgaria and Italy, flows are valued using the average of the two domestic prices. This is a notional commercial valuation of the flow, not a formal congestion-rent calculation (flow × price differential, which accrues to the transmission operators, not a market participant)."],
                    ["Sign Convention:", "following ENEX standards, red denotes exports and yellow denotes imports. Exporting energy generates positive cash flow (+); importing represents a cost (–)."],
                    ["Optional Transit Adjustment (Bulgaria ↔ Italy):", "a toggle lets you view cash flow with simultaneous, opposite-direction Bulgaria–Italy flows (transit through Greece) priced once, in the dominant direction, instead of twice. Physical import/export volumes (MWh) are never altered by this toggle — only the cash-flow calculation."]
                ]
            },
            {
                title: "MTD POSITION",
                items: [
                    ["", "Only complete days (SCADA present and usable prices) count toward Month-to-Date totals, Best/Worst Day, and averages. Incomplete days are listed and excluded so they can't distort the monthly picture."]
                ]
            },
            {
                title: "LIMITATIONS",
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
                title: "ΟΛΑ ΤΑ TABS",
                shortItems: [
                    ["Πεδίο:", "οι πέντε διασυνδέσεις με Αλβανία, Βουλγαρία, Ιταλία, Β. Μακεδονία και Τουρκία."],
                    ["Πηγές:", "αναφορές SCADA & ISP του ΑΔΜΗΕ, τιμές ημερήσιας αγοράς ENTSO-E. Ενημέρωση καθημερινά· οι τελευταίες 5 ημέρες επανελέγχονται σε κάθε τρέξιμο για καθυστερημένες δημοσιεύσεις."],
                    ["Εκκρεμή δεδομένα:", "μια ημέρα χωρίς SCADA ακόμα σημειώνεται με ⚠ και εξαιρείται από τα μηνιαία σύνολα μέχρι να ολοκληρωθεί."]
                ],
                items: [
                    ["Πεδίο:", "οι πέντε διασυνδέσεις με Αλβανία, Βουλγαρία, Ιταλία, Β. Μακεδονία και Τουρκία."],
                    ["Πηγές:", "τα δεδομένα φυσικής ροής αντλούνται καθημερινά από τις επίσημες αναφορές SCADA & ISP του ΑΔΜΗΕ· οι Τιμές Εκκαθάρισης Ημερήσιας Αγοράς (MCPs) από το ENTSO-E."],
                    ["Ενημερώσεις:", "καθημερινά μέσω προγραμματισμένης διαδικασίας. Οι τελευταίες 5 ημέρες επανελέγχονται σε κάθε τρέξιμο για καθυστερημένες δημοσιεύσεις και διορθώσεις."],
                    ["Πληρότητα Δεδομένων:", "το SCADA μιας ημέρας δημοσιεύεται από τον ΑΔΜΗΕ το επόμενο πρωί· μέχρι τότε, η ημέρα σημειώνεται με ⚠, το Ταμείο της εμφανίζεται ως «μ/δ», και εξαιρείται από τα μηνιαία σύνολα ώστε ελλιπή δεδομένα να μην τα αλλοιώνουν."]
                ]
            },
            {
                title: "DAILY ISP vs SCADA",
                items: [
                    ["ISP έναντι SCADA:", "το ISP είναι το προγραμματισμένο διασυνοριακό πρόγραμμα· το SCADA είναι η πραγματική μέτρηση. Διαφορές ανάμεσά τους είναι αναμενόμενες και μπορεί να αντανακλούν ενδοημερήσιο αναπρογραμματισμό ή δραστηριότητα περιορισμών της τελευταίας στιγμής."],
                    ["Επιλογή Προγράμματος ISP:", "τα σύνολα ανά χώρα λαμβάνονται από την ενότητα «Total Market CBS (+XBID)» του ΑΔΜΗΕ — το τελικό πρόγραμμα μετά τις ενδοημερήσιες προσαρμογές — όχι μόνο από τη δημοπρασία ημερήσιου προγραμματισμού."]
                ]
            },
            {
                title: "HOURLY PROFILES",
                items: [
                    ["Ωριαία ανάλυση:", "οι ροές και οι τιμές εμφανίζονται ως ωριαίες τιμές· τα υποκείμενα δεδομένα προγράμματος του ΑΔΜΗΕ είναι τεταρτωριαία και υπολογίζεται ο μέσος όρος τους για την ωριαία προβολή."],
                    ["Τιμές που εμφανίζονται:", "Τιμές Εκκαθάρισης Ημερήσιας Αγοράς για Ελλάδα, Βουλγαρία και Ιταλία, ως πλαίσιο δίπλα στις φυσικές ροές."]
                ]
            },
            {
                title: "DAILY ARBITRAGE",
                items: [
                    ["Λογική Τιμολόγησης & Αποτίμησης:", "για Αλβανία, Β. Μακεδονία και Τουρκία, η αποτίμηση γίνεται αποκλειστικά με την ελληνική τιμή. Για Βουλγαρία και Ιταλία, με τον μέσο όρο των δύο εγχώριων τιμών. Πρόκειται για ονομαστική εμπορική αποτίμηση της ροής, όχι επίσημο υπολογισμό εσόδου συμφόρησης (ροή × διαφορά τιμών, το οποίο αποδίδεται στους διαχειριστές δικτύου, όχι σε συμμετέχοντα της αγοράς)."],
                    ["Σύμβαση Προσήμων:", "σύμφωνα με τα πρότυπα του ENEX, το κόκκινο αντιστοιχεί σε Εξαγωγές και το κίτρινο σε Εισαγωγές. Η εξαγωγή ενέργειας παράγει θετικό ταμείο (+), η εισαγωγή αντιπροσωπεύει κόστος (–)."],
                    ["Προαιρετική Προσαρμογή Transit (Βουλγαρία ↔ Ιταλία):", "ένας διακόπτης επιτρέπει να δείτε το ταμείο με τις ταυτόχρονες, αντίθετες ροές Βουλγαρίας-Ιταλίας (transit μέσω Ελλάδας) να τιμολογούνται μία φορά, στην κατεύθυνση που υπερισχύει, αντί για δύο. Οι φυσικοί όγκοι εισαγωγών/εξαγωγών (MWh) δεν αλλάζουν ποτέ από αυτόν τον διακόπτη — μόνο ο υπολογισμός του ταμείου."]
                ]
            },
            {
                title: "MTD POSITION",
                items: [
                    ["", "Μόνο πλήρεις ημέρες (με διαθέσιμο SCADA και χρησιμοποιήσιμες τιμές) μετράνε στα σωρευτικά μηνιαία σύνολα, στο Best/Worst Day και στους μέσους όρους. Οι ελλιπείς ημέρες αναφέρονται και εξαιρούνται, ώστε να μην αλλοιώνουν τη μηνιαία εικόνα."]
                ]
            },
            {
                title: "LIMITATIONS",
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
    const li = items.map(([lead, text]) => {
        const leadHtml = lead ? `<strong class="text-slate-200">${escapeHtml(lead)}</strong> ` : '';
        return `<li>${leadHtml}${escapeHtml(text)}</li>`;
    }).join('');
    return `<div class="mb-5 last:mb-0">
        <div class="text-acc-400 text-xs font-bold uppercase tracking-wide mb-2">${escapeHtml(section.title)}</div>
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
        d.sections.forEach(sec => { html += renderMethodologySection(sec, sec.items); });
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

function setMethodologyMode(mode) {
    methodologyMode = mode;
    const bodyEl = document.getElementById('modalBody');
    if (bodyEl) bodyEl.scrollTop = 0;
    renderMethodology();
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

    document.getElementById('modalTitle').innerText = t.modalTitle;
    document.getElementById('modalModeShortBtn').innerText = t.modalModeShort;
    document.getElementById('modalModeDetailedBtn').innerText = t.modalModeDetailed;
    document.getElementById('modalCloseBtn').innerText = t.modalCloseBtn;
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
    const stepText = { 1: L.s1, 2: t.tabTotals, 3: t.tabHourly, 4: t.tabArbitrage, 5: t.tabMTD };
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
    const names = { AL: "Albania", BG: "Bulgaria", IT: "Italy", MK: "North Macedonia", TR: "Turkey" };
    
    const na0 = v => (data.hasScada ? v : '-');
    ["AL", "BG", "IT", "MK", "TR"].forEach(c => {
        const rowData = data.summary[c];
        const opacity = (activeCountry && activeCountry !== c) ? "opacity-30" : "opacity-100";
        const bgHover = (activeCountry === c) ? "bg-slate-700/80" : "hover:bg-slate-700/50";
        
        const impAvg = rowData.impVol > 0 ? (rowData.impEur / rowData.impVol) : 0;
        const expAvg = rowData.expVol > 0 ? (rowData.expEur / rowData.expVol) : 0;
        
        const impVolFmt = na0(rowData.impVol.toLocaleString('el-GR', {maximumFractionDigits:0}));
        const expVolFmt = na0(rowData.expVol.toLocaleString('el-GR', {maximumFractionDigits:0}));
        const impAvgFmt = !data.complete ? '-' : impAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
        const expAvgFmt = !data.complete ? '-' : expAvg.toLocaleString('el-GR', {maximumFractionDigits:2});
        
        const na = !data.complete;
        const cfFmt = na ? t.notAvailable : rowData.netCashFlow > 0 ? `+${rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0})}` : rowData.netCashFlow.toLocaleString('el-GR', {maximumFractionDigits:0});
        const cfColor = na ? "text-slate-500" : (rowData.netCashFlow >= 0 ? "text-emerald-400" : "text-fuchsia-500");

        const transitBadge = (data.transitNetting && data.transitHourCount > 0 && (c === 'BG' || c === 'IT'))
            ? `<span class="text-slate-300 text-xs" title="${t.transitBadgeTitle}">⇄</span>` : '';

        listContainer.insertAdjacentHTML('beforeend', `
            <div onclick="toggleCountrySelection('${c}')" class="grid grid-cols-4 gap-4 p-4 border-b border-slate-700/50 cursor-pointer transition-all duration-300 ${opacity} ${bgHover} text-center font-semibold text-sm items-center">
                <div class="text-left pl-2 text-slate-300 flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${countryColors[c]}"></span>${names[c]} ${transitBadge}
                </div>
                <div class="flex flex-col gap-1">
                    <div class="text-yellow-400" title="Imports">↓ ${impVolFmt}</div>
                    <div class="text-rose-500" title="Exports">↑ ${expVolFmt}</div>
                </div>
                <div class="${cfColor}">
                    ${cfFmt}&nbsp;€
                </div>
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
                return involvesCountry ? '#facc15' : countryColors[activeCountry];
            });
        }
        datasets.push({ type: 'bar', label: `${names[activeCountry]} Flow (MW)`, data: data.summary[activeCountry].hourlyFlows, backgroundColor: barColors, yAxisID: 'y' });
        datasets.push({ type: 'line', label: `Applied MCP (€/MWh)`, data: data.summary[activeCountry].hourlyPrices, borderColor: '#ffffff', borderWidth: 3, tension: 0.2, yAxisID: 'y1' });
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
    updateDataNotice(dayData);
}

// Pill πληρότητας στην κεφαλίδα (D14): σχήμα και τόνοι όπως το pill του live· κρυφό στο MTD.
const PILL = {
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    orange: 'bg-orange-500/10 border-orange-400/40 text-orange-300'
};
function updateStatusBadge(dayData) {
    const el = document.getElementById('statusPill');
    if (!el) return;
    if (!dayData || currentTab === 'mtd') { el.className = 'hidden'; return; }
    const t = i18n[currentLang], ok = dayComplete(dayData);
    el.className = `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold ${ok ? PILL.green : PILL.orange}`;
    el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current"></span>${escapeHtml(ok ? t.pillComplete : t.pillIncomplete)}`;
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
                labels: currentLang === 'el' ? ["Αλβανία", "Βουλγαρία", "Ιταλία", "Β. Μακεδονία", "Τουρκία"] : countries,
                datasets: [
                    { label: t.scheduled, data: ispTotals, backgroundColor: 'rgba(120, 150, 192, 0.9)', borderColor: '#7896c0', borderWidth: 1, borderRadius: 4 },
                    { label: t.actual, data: scadaTotals, backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { datalabels: { display: false } }, 
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
                labels: hours,
                datasets: [
                    { label: currentLang==='el' ? 'Πρόγραμμα ISP' : 'Scheduled ISP', data: ispHourly, backgroundColor: 'rgba(120, 150, 192, 0.9)', borderColor: '#7896c0', borderWidth: 1, borderRadius: 2 },
                    { label: currentLang==='el' ? 'Πραγματικό SCADA' : 'Actual SCADA', data: scadaHourly, backgroundColor: 'rgba(249, 115, 22, 0.9)', borderColor: '#f97316', borderWidth: 1, borderRadius: 2 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { datalabels: { display: false } }, 
                scales: { 
                    x: { grid: { display: false } }, 
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
            data: { labels: hours, datasets: [
                { label: 'GR (€/MWh)', data: mcpGR, borderColor: '#3b82f6', borderWidth: 2, tension: 0.2 },
                { label: 'BG (€/MWh)', data: mcpBG, borderColor: '#10b981', borderWidth: 2, tension: 0.2 },
                { label: 'IT (€/MWh)', data: mcpIT, borderColor: countryColors.IT, borderWidth: 2, tension: 0.2 }
            ]},
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { datalabels: { display: false } },
                scales: {
                    x: { grid: { display: false } },
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
function renderMTDView() {
    const selectedMonth = document.getElementById('monthSelect').value;
    let excludedDates = [];
    if (selectedMonth) {
        excludedDates = renderMTDTab(selectedMonth) || [];
    }
    updateMtdExclusionNotice(excludedDates);
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

// Λήψη JSON. Το meta.json αλλάζει κάθε μέρα, οπότε παίρνει cache-busting.
async function getJSON(path, bust = false) {
    const r = await fetch(path + (bust ? `?v=${Date.now()}` : ''));
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
}

async function boot() {
    applyStaticText();
    try {
        Chart.register(ChartDataLabels);
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = '#334155';

        // Βήμα 1: πραγματική πρόοδος (2 αρχεία: meta + ροές), με ελάχιστο χρόνο ανάγνωσης
        loadActivate(1);
        const t0 = Date.now();
        const files = [
            getJSON('data/meta.json', true).catch((e) => { console.warn('meta.json', e); return null; }),   // όχι κρίσιμο
            getJSON('data/historical_flows.json')
        ];
        let done = 0;
        const [meta, flows] = await Promise.all(files.map((p) => p.then((v) => { loadSet(1, Math.round(++done / files.length * 100)); return v; })));
        if (!Array.isArray(flows) || flows.length === 0) throw new Error('historical_flows.json is empty');
        rawData = flows;
        metaData = meta;
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

// Τα scripts είναι defer, οπότε το Chart.js και το plugin έχουν ήδη φορτώσει εδώ.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
