#!/usr/bin/env python3
"""
Ανάλυση διασυνδέσεων (D34) → data/analysis.json. Υπολογίζεται από ΟΛΟ το ιστορικό σε κάθε εκτέλεση
(ο κανόνας «το Python υπολογίζει, η σελίδα δείχνει»). Η σελίδα γράφει τις προτάσεις από τα «γεγονότα».

Περιέχει:
  cash      ταμείο ανά χώρα και ημέρα / μήνα (εξαγωγές − εισαγωγές, SCADA × τιμή, ίδιος κανόνας με το Arbitrage)
  status    κατάσταση γραμμών: μηδενική ροή (όλο το 24ωρο < 1 MW), από πότε, σύνολο, τελευταία επανεκκίνηση
  saturation κορεσμός ΕΛ–ΒΓ / ΕΛ–ΙΤ ανά μήνα: ώρες αποσύζευξης, κατεύθυνση, MWh, έσοδο συμφόρησης (εκτίμηση)
  ceilings  «ταβάνι» κάθε γραμμής ανά κατεύθυνση: μέγιστο και P99 με ημερομηνία και ώρα (SCADA)
  days      γεγονότα κάθε ημέρας με βαθμό (η σελίδα δείχνει τα 3–5 σημαντικότερα)

Όλες οι ώρες σε ώρα Ελλάδας (D33). Δεν χρειάζεται δίκτυο· καλείται από το update_flows.py ή μόνο του:
    python3 scripts/analysis.py
"""
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

COUNTRIES = ["AL", "BG", "IT", "MK", "TR"]
COUPLED = ["BG", "IT"]
ZERO_MW = 1.0              # μηδενική ροή: |ροή| < 1 MW
USUAL_DAYS = 30            # «παρατηρούμενο όριο» (D35) = P95 της ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΗΣ ροής, ίδια κατεύθυνση, 30 ημέρες
USUAL_PCT = 95
DEV_PCT = 90               # «εξαιρετική απόκλιση» από το πρόγραμμα: πάνω από το P90 των 30 ημερών
MIN_HISTORY_NEW_MAX = 30   # νέο μέγιστο μόνο αφού υπάρχουν τουλάχιστον 30 ημέρες πριν
FIRST_DEC_DAYS = 7         # «πρώτη αποσύζευξη μετά από Ν ημέρες πλήρους σύζευξης»
SIG_SPREAD = 1.0           # D35: ώρα με μέση διαφορά < 1 €/MWh στα αποσυζευγμένα τέταρτα = συζευγμένη για στατιστικά
                           # και κείμενα (στην ΕΛ–ΙΤ μένει σχεδόν πάντα μια διαφορά λίγων λεπτών). Τα δεδομένα κρατούν
                           # την ακριβή μέτρηση (0,01 €/MWh).

ROOT = Path(__file__).resolve().parent.parent


def r2(v):
    return None if v is None else round(float(v), 2)


def r0(v):
    return None if v is None else int(round(float(v)))


def pct(values, p):
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    k = (len(vals) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return vals[lo] + (vals[hi] - vals[lo]) * (k - lo)


def hhmm(i):
    return f"{i:02d}:00"


def price_for(h, c):
    """Ο κανόνας του Arbitrage (D11): ΑΛ, ΒΜ, ΤΡ με την τιμή ΕΛ· ΒΓ, ΙΤ με τον μέσο όρο ΕΛ και γείτονα."""
    g = h.get("MCP_GR")
    if g is None:
        return None
    if c in COUPLED:
        n = h.get("MCP_" + c)
        return None if n is None else (g + n) / 2
    return g


def has_scada(day):
    return bool((day.get("Flags") or {}).get("scada"))


def is_zero_day(day, c):
    return has_scada(day) and all(abs(h.get("SCADA_" + c) or 0) < ZERO_MW for h in day["Hourly"])


# ---------------------------------------------------------------------------
# Ταμείο
# ---------------------------------------------------------------------------
def day_cash(day):
    out = {}
    for c in COUNTRIES:
        rev = cost = exp = imp = 0.0
        for h in day["Hourly"]:
            f, p = h.get("SCADA_" + c), price_for(h, c)
            if f is None or p is None:
                continue
            if f < 0:
                rev += -f * p
                exp += -f
            else:
                cost += f * p
                imp += f
        out[c] = {"rev": r0(rev), "cost": r0(cost), "exp_mwh": r0(exp), "imp_mwh": r0(imp), "net": r0(rev - cost)}
    return out


# ---------------------------------------------------------------------------
# Σύζευξη: παράθυρα αποσύζευξης μιας ημέρας
# ---------------------------------------------------------------------------
def prices_known(day, c):
    return all(h.get("CPL_" + c) is not None for h in day["Hourly"]) and len(day["Hourly"]) > 0


def is_dec(cpl, spr):
    """Ουσιαστική αποσύζευξη (D35): αποσυζευγμένα τέταρτα ΚΑΙ μέση διαφορά ≥ 1 €/MWh."""
    return cpl is not None and cpl < 4 and spr is not None and abs(spr) >= SIG_SPREAD


def direction(spr):
    """SPR = ΕΛ − γείτονας. Αρνητικό: η Ελλάδα φθηνότερη → ροή προς τον γείτονα ('to_n')."""
    return "to_n" if spr < 0 else "to_gr"


def windows(day, c):
    """Συνεχόμενες ώρες με αποσυζευγμένα τέταρτα και ίδια κατεύθυνση → παράθυρα."""
    out, cur = [], None
    for i, h in enumerate(day["Hourly"]):
        cpl, spr = h.get("CPL_" + c), h.get("SPR_" + c)
        if not is_dec(cpl, spr):
            cur = None
            continue
        d = direction(spr)
        frac = (4 - cpl) / 4
        if cur and cur["dir"] == d and cur["_end"] == i:
            cur["_end"] = i + 1
            cur["hours"] += frac
            cur["_s"].append((abs(spr), frac))
        else:
            cur = {"dir": d, "_start": i, "_end": i + 1, "hours": frac, "_s": [(abs(spr), frac)]}
            out.append(cur)
    for w in out:
        tot = sum(f for _, f in w["_s"])
        w["from"], w["to"] = hhmm(w.pop("_start")), hhmm(w.pop("_end"))
        w["avg_spread"] = r2(sum(s * f for s, f in w["_s"]) / tot if tot else 0)
        w["max_spread"] = r2(max(s for s, _ in w.pop("_s")))
        w["hours"] = r2(w["hours"])
    return out


def usual_limit(history, c, d):
    """P95 της |προγραμματισμένης ροής| στην ίδια κατεύθυνση, τελευταίες USUAL_DAYS ημέρες πριν την ημέρα."""
    vals = []
    for day in history[-USUAL_DAYS:]:
        for h in day["Hourly"]:
            f = h.get("ISP_" + c)
            if f is None:
                continue
            if d == "to_n" and f < 0:
                vals.append(-f)
            elif d == "to_gr" and f > 0:
                vals.append(f)
    return pct(vals, USUAL_PCT) if len(vals) >= 24 else None


# ---------------------------------------------------------------------------
# Γεγονότα ημέρας
# ---------------------------------------------------------------------------
def day_facts(day, history):
    """Τα γεγονότα μιας ημέρας με βαθμό. history = οι προηγούμενες ημέρες (χρονολογικά)."""
    facts = []
    measured = has_scada(day)
    prev = history[-1] if history else None

    for c in COUPLED:
        if not prices_known(day, c):
            continue
        ws = windows(day, c)
        if measured and is_zero_day(day, c):
            continue        # D36: γραμμή στο μηδέν όλη τη μέρα — το λένε τα γεγονότα μηδενισμού / επανεκκίνησης και η ειδοποίηση
        if not ws:
            facts.append({"type": "coupled_all_day", "line": c, "score": 5})
        else:
            f = {"type": "decoupled", "line": c, "windows": ws, "hours": r2(sum(w["hours"] for w in ws)),
                 "max_spread": max(w["max_spread"] for w in ws), "measured": measured, "line_zero": is_zero_day(day, c)}
            score = 20
            if measured:
                main = max(ws, key=lambda w: w["hours"])["dir"]
                sign = -1 if main == "to_n" else 1          # προς γείτονα = εξαγωγή = αρνητική ροή
                rent = sched_mwh = act_mwh = 0.0
                sched_peak = act_peak = 0.0
                against_h, against_mwh = 0, 0.0
                for h in day["Hourly"]:
                    cpl, spr = h.get("CPL_" + c), h.get("SPR_" + c)
                    if not is_dec(cpl, spr):
                        continue
                    frac, d = (4 - cpl) / 4, direction(spr)
                    sched, meas = h.get("ISP_" + c), h.get("SCADA_" + c)
                    if sched is not None:
                        rent += abs(sched) * abs(spr) * frac          # έσοδο συμφόρησης: με το ΠΡΟΓΡΑΜΜΑ (εκχωρημένη ροή)
                        if d == main and sign * sched > 0:
                            sched_mwh += sign * sched * frac
                            sched_peak = max(sched_peak, sign * sched)
                    if meas is not None:
                        if d == main and sign * meas > 0:
                            act_mwh += sign * meas * frac
                            act_peak = max(act_peak, sign * meas)
                        if abs(meas) >= ZERO_MW and ((d == "to_n" and meas > 0) or (d == "to_gr" and meas < 0)):
                            against_h += 1
                            against_mwh += abs(meas)
                limit = usual_limit(history, c, main)
                f.update({"main_dir": main, "rent_eur": r0(rent),
                          "sched_peak_mw": r0(sched_peak), "act_peak_mw": r0(act_peak),
                          "sched_mwh": r0(sched_mwh), "act_mwh": r0(act_mwh),
                          "limit_mw": r0(limit), "pct_of_limit": r0(100 * sched_peak / limit) if limit else None})
                score += min(rent / 1000, 80)
                if against_h:
                    facts.append({"type": "against", "line": c, "hours": against_h, "mwh": r0(against_mwh),
                                  "score": 30 + 3 * against_h})
            f["score"] = r2(score)
            facts.append(f)
            # πρώτη αποσύζευξη μετά από Ν ημέρες πλήρους σύζευξης
            last = [x for x in history[-FIRST_DEC_DAYS:] if prices_known(x, c)]
            if len(last) == FIRST_DEC_DAYS and all(not windows(x, c) for x in last):
                facts.append({"type": "first_decoupling", "line": c, "days": FIRST_DEC_DAYS, "score": 60})
            # μεγαλύτερη διαφορά τιμής του μήνα μέχρι σήμερα
            month = [x for x in history if x["Date"][:7] == day["Date"][:7] and prices_known(x, c)]
            if len(month) >= 3:
                prev_max = max((w["max_spread"] for x in month for w in windows(x, c)), default=0)
                if f["max_spread"] > prev_max:
                    facts.append({"type": "max_spread_month", "line": c, "spread": f["max_spread"], "score": 50})

    if measured:
        for c in COUNTRIES:
            # μηδενισμός / επανεκκίνηση
            if prev is not None and has_scada(prev):
                if is_zero_day(day, c) and not is_zero_day(prev, c):
                    facts.append({"type": "zero_start", "line": c, "score": 90})
                elif not is_zero_day(day, c) and is_zero_day(prev, c):
                    first = next(i for i, h in enumerate(day["Hourly"]) if abs(h.get("SCADA_" + c) or 0) >= ZERO_MW)
                    facts.append({"type": "restart", "line": c, "hour": hhmm(first), "score": 90})
            # νέο μέγιστο της περιόδου, ανά κατεύθυνση
            past = [x for x in history if has_scada(x)]
            if len(past) >= MIN_HISTORY_NEW_MAX:
                for d, sign in (("imp", 1), ("exp", -1)):
                    vals = [(sign * (h.get("SCADA_" + c) or 0), i) for i, h in enumerate(day["Hourly"])]
                    best, hour = max(vals)
                    prev_best = max((sign * (h.get("SCADA_" + c) or 0) for x in past for h in x["Hourly"]), default=0)
                    if best > prev_best and best >= ZERO_MW:
                        facts.append({"type": "new_max", "line": c, "dir": d, "mw": r0(best), "hour": hhmm(hour),
                                      "prev_mw": r0(prev_best), "score": 70})
        # εξαιρετική απόκλιση από το πρόγραμμα (καθαρή ροή)
        def mean_dev(x):
            v = [abs(h["SCADA_Net"] - h["ISP_Net"]) for h in x["Hourly"]
                 if h.get("SCADA_Net") is not None and h.get("ISP_Net") is not None]
            return sum(v) / len(v) if v else None
        today = mean_dev(day)
        ref = [m for m in (mean_dev(x) for x in history[-USUAL_DAYS:] if has_scada(x)) if m is not None]
        if today is not None and len(ref) >= 10:
            p90 = pct(ref, DEV_PCT)
            if today > p90:
                facts.append({"type": "deviation", "mw": r0(today), "p90_mw": r0(p90), "score": 40})

    facts.sort(key=lambda f: -f["score"])
    return facts


# ---------------------------------------------------------------------------
# Κατάσταση γραμμών, κορεσμός ανά μήνα, ταβάνια
# ---------------------------------------------------------------------------
def line_status(days):
    measured = [d for d in days if has_scada(d)]
    out = {}
    for c in COUNTRIES:
        streak, since = 0, None
        for d in reversed(measured):
            if is_zero_day(d, c):
                streak, since = streak + 1, d["Date"]
            else:
                break
        last_restart = None
        for a, b in zip(measured, measured[1:]):
            if is_zero_day(a, c) and not is_zero_day(b, c):
                first = next(i for i, h in enumerate(b["Hourly"]) if abs(h.get("SCADA_" + c) or 0) >= ZERO_MW)
                last_restart = {"date": b["Date"], "hour": hhmm(first)}
        # D36: όλα τα διαστήματα μηδενικής ροής, για να δείχνει η σελίδα το διάστημα της ΗΜΕΡΑΣ που βλέπει ο επισκέπτης
        episodes, cur = [], None
        for i, d in enumerate(measured):
            if is_zero_day(d, c):
                if cur is None:
                    cur = {"from": d["Date"], "to": d["Date"], "days": 0, "ongoing": False, "restart": None,
                           "from_data_start": i == 0}      # ίσως ξεκίνησε πριν από τα δεδομένα μας
                    episodes.append(cur)
                cur["to"], cur["days"] = d["Date"], cur["days"] + 1
            elif cur is not None:
                first = next(j for j, h in enumerate(d["Hourly"]) if abs(h.get("SCADA_" + c) or 0) >= ZERO_MW)
                cur["restart"] = {"date": d["Date"], "hour": hhmm(first)}
                cur = None
        if cur is not None:
            cur["ongoing"] = True
        out[c] = {"zero_streak": streak, "zero_since": since, "zero_days": sum(1 for d in measured if is_zero_day(d, c)),
                  "last_restart": last_restart, "zero_episodes": episodes, "as_of": measured[-1]["Date"] if measured else None}
    return out


def saturation_monthly(days):
    out = {c: {} for c in COUPLED}
    for day in days:
        if not has_scada(day):
            continue
        for c in COUPLED:
            if not prices_known(day, c):
                continue
            m = out[c].setdefault(day["Date"][:7], {"hours": 0, "dec_hours": 0.0, "to_n_hours": 0.0, "to_gr_hours": 0.0,
                                                     "mwh_to_n": 0.0, "mwh_to_gr": 0.0, "act_mwh_to_n": 0.0, "act_mwh_to_gr": 0.0,
                                                     "rent_eur": 0.0, "_spread": 0.0, "against_hours": 0, "days": 0})
            m["days"] += 1
            for h in day["Hourly"]:
                cpl, spr = h.get("CPL_" + c), h.get("SPR_" + c)
                m["hours"] += 1
                if not is_dec(cpl, spr):
                    continue
                frac, d = (4 - cpl) / 4, direction(spr)
                m["dec_hours"] += frac
                m[d + "_hours"] += frac
                m["_spread"] += abs(spr) * frac
                sched = h.get("ISP_" + c)
                if sched is not None:
                    m["rent_eur"] += abs(sched) * abs(spr) * frac
                    if d == "to_n" and sched < 0:
                        m["mwh_to_n"] += -sched * frac
                    elif d == "to_gr" and sched > 0:
                        m["mwh_to_gr"] += sched * frac
                meas = h.get("SCADA_" + c)
                if meas is not None:
                    if d == "to_n" and meas < 0:
                        m["act_mwh_to_n"] += -meas * frac
                    elif d == "to_gr" and meas > 0:
                        m["act_mwh_to_gr"] += meas * frac
                    if abs(meas) >= ZERO_MW and ((d == "to_n" and meas > 0) or (d == "to_gr" and meas < 0)):
                        m["against_hours"] += 1
    for c in COUPLED:
        for m in out[c].values():
            m["avg_spread"] = r2(m.pop("_spread") / m["dec_hours"]) if m["dec_hours"] else 0.0
            m["dec_pct"] = r2(100 * m["dec_hours"] / m["hours"]) if m["hours"] else None
            for k in ("dec_hours", "to_n_hours", "to_gr_hours"):
                m[k] = r2(m[k])
            for k in ("mwh_to_n", "mwh_to_gr", "act_mwh_to_n", "act_mwh_to_gr", "rent_eur"):
                m[k] = r0(m[k])
    return out


def ceilings(days):
    out = {}
    for c in COUNTRIES:
        vals = [(h.get("SCADA_" + c), d["Date"], i) for d in days if has_scada(d)
                for i, h in enumerate(d["Hourly"]) if h.get("SCADA_" + c) is not None]
        if not vals:
            continue
        imp = max(vals, key=lambda v: v[0])
        exp = min(vals, key=lambda v: v[0])
        out[c] = {"imp": {"mw": r0(imp[0]), "date": imp[1], "hour": hhmm(imp[2]),
                          "p99_mw": r0(pct([v[0] for v in vals if v[0] > 0], 99))},
                  "exp": {"mw": r0(-exp[0]), "date": exp[1], "hour": hhmm(exp[2]),
                          "p99_mw": r0(pct([-v[0] for v in vals if v[0] < 0], 99))}}
    return out


def expand_market(day):
    """Οι λίστες day["Market"][χώρα] (isp / cpl / spr) → πεδία ISP_X / CPL_X / SPR_X ανά ώρα, μόνο στη μνήμη."""
    for c, m in (day.get("Market") or {}).items():
        for i, h in enumerate(day["Hourly"]):
            for key, field in (("isp", "ISP_"), ("cpl", "CPL_"), ("spr", "SPR_")):
                arr = m.get(key) or []
                h[field + c] = arr[i] if i < len(arr) else None
    return day


def build(days):
    days = sorted((expand_market(d) for d in days), key=lambda d: d["Date"])
    cash_daily = {d["Date"]: day_cash(d) for d in days if (d.get("Flags") or {}).get("complete")}
    cash_monthly = {}
    for date, per in cash_daily.items():
        mm = cash_monthly.setdefault(date[:7], {c: {"rev": 0, "cost": 0, "exp_mwh": 0, "imp_mwh": 0, "net": 0, "days": 0}
                                               for c in COUNTRIES})
        for c in COUNTRIES:
            for k in ("rev", "cost", "exp_mwh", "imp_mwh", "net"):
                mm[c][k] += per[c][k]
            mm[c]["days"] += 1
    cash_weekly = {}                     # εβδομάδα Δευτέρα–Κυριακή, κλειδί = η Δευτέρα (D36)
    for date, per in cash_daily.items():
        dd = datetime.strptime(date, "%Y-%m-%d")
        wk = (dd - timedelta(days=dd.weekday())).strftime("%Y-%m-%d")
        ww = cash_weekly.setdefault(wk, {c: {"rev": 0, "cost": 0, "exp_mwh": 0, "imp_mwh": 0, "net": 0, "days": 0}
                                         for c in COUNTRIES})
        for c in COUNTRIES:
            for k in ("rev", "cost", "exp_mwh", "imp_mwh", "net"):
                ww[c][k] += per[c][k]
            ww[c]["days"] += 1
    facts = {}
    for i, d in enumerate(days):
        facts[d["Date"]] = day_facts(d, days[:i])
    return {
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "params": {"zero_mw": ZERO_MW, "coupling_eur": 0.01, "significant_spread_eur": SIG_SPREAD,
                   "observed_limit": f"P{USUAL_PCT} of the scheduled flow, same direction, last {USUAL_DAYS} days",
                   "usual_days": USUAL_DAYS, "usual_pct": USUAL_PCT,
                   "deviation_pct": DEV_PCT, "price_rule": "AL/MK/TR: GR price; BG/IT: mean of GR and neighbour (D11)"},
        "countries": COUNTRIES, "coupled": COUPLED,
        "cash": {"daily": cash_daily, "weekly": cash_weekly, "monthly": cash_monthly},
        "status": line_status(days),
        "saturation": saturation_monthly(days),
        "ceilings": ceilings(days),
        "days": facts,
    }


def main():
    days = json.loads((ROOT / "data" / "historical_flows.json").read_text(encoding="utf-8"))
    out = build(days)
    tmp = ROOT / "data" / "analysis.json.tmp"
    tmp.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(ROOT / "data" / "analysis.json")
    n = sum(len(v) for v in out["days"].values())
    print(f"analysis.json: {len(out['days'])} days, {n} facts, status {[(c, s['zero_streak']) for c, s in out['status'].items()]}")


if __name__ == "__main__":
    main()
