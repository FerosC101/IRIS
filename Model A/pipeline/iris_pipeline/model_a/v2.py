"""Phase 2 of Model A v2: freeze thresholds and probabilities on 2019, then score the 2020 test year once.

Reads selection.json (written by select.py from 2016-2019 only). Produces outputs/model_a_v2/: scores_v2.csv
(the contract Model B reads), metrics.json, config.json, eval_report.md, fallback_log.csv and figures/.
"""

from __future__ import annotations

import hashlib
import json
import platform
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import scipy
import sklearn
import statsmodels

from .. import __version__, config
from ..baselines import BASELINES, baseline_scores
from ..contract import validate
from ..data import Inputs, fl, input_hashes, measles_injections
from ..evaluation.metrics import bootstrap_ci, coverage, evaluate, period_no
from ..paths import MODEL_A_V2_DIR
from .calibrate import PFail, tune_high, tune_low, tune_tau_f1
from .countmodel import CountModel, design, mid_p_low, nb_dist
from .labels import ok_scored
from .pooling import add_hub_pool, add_region_pool, estimate_rho, fisher
from .run import cached_run_weekly
from .select import CACHE, run_candidate

LABEL = {"v1": "Model A v1", "v2": "Model A v2", "covid": "Model A v1 + covid flag (sensitivity)",
         "rolling_median": "Rolling median", "ewma": "EWMA", "cusum": "CUSUM"}
MAIN = ["v1", "v2"] + BASELINES


def _hub(d):
    d = d.copy()
    d["hub_id"] = np.where(d.region_id.notna(), "RESU-" + d.region_id.astype(str), np.nan)
    return d


class Frozen:
    """Thresholds frozen on 2019. score(d, m) / thr(m) give the (score, threshold) pair evaluate() expects."""

    def __init__(self, taus: dict, H: dict):
        self.taus, self.H = taus, H

    def methods(self, frames: dict, names=MAIN) -> dict:
        out = {}
        for m in names:
            if m in self.taus:
                out[LABEL[m]] = (-frames[m].p_low.to_numpy(float), -self.taus[m])
            else:
                out[LABEL[m]] = (frames["v1"]["s_" + m].to_numpy(float), self.H[m])
        return out


def _aligned(frames: dict) -> None:
    keys = [f[["location_id", "week_start"]].reset_index(drop=True) for f in frames.values()]
    for k in keys[1:]:
        if not k.equals(keys[0]):
            raise RuntimeError("scored frames are not row-aligned")


def region_eval(labs: dict, rw_taus: dict | None = None) -> tuple[pd.DataFrame, dict]:
    """Region-week detection with Fisher (v1 pooling) vs correlation-adjusted Stouffer (v2), per model.
    A region-week threshold is tuned at 1% of clean 2019 region-weeks for every (model, pooling) pair."""
    rows, taus = [], rw_taus or {}
    sets = {
        "real swaps 2017": ("prod", lambda l: l.is_swap & (l.week_start.dt.year == 2017)),
        "real swaps 2020 (test)": ("prod", lambda l: l.is_swap & (l.week_start.dt.year == 2020)),
        "regional gap filled with 0, 2017 + 2020": ("eval", lambda l: l.is_gap & l.week_start.dt.year.isin([2017, 2020])),
        "injected region outage, 2019 + 2020": ("eval", lambda l: l.is_inj & (l.scenario == "region_outage")),
    }
    for model in ("v1", "v2"):
        for pool, col in (("Fisher", "pooled_region_p"), ("Stouffer, correlation-adjusted", "hub_p")):
            def rw_table(lab, pos_rows):
                bad = (lab.qa_label != "ok") | lab.get("is_inj", False) | lab.get("is_gap", False)
                t = lab[lab.p_low.notna()].assign(_bad=bad).groupby(["region_id", "week_start"]).agg(
                    pooled=(col, "first"), bad=("_bad", "any")).reset_index()
                key = pos_rows.groupby(["region_id", "week_start"]).size().rename("n_pos").reset_index()
                t = t.merge(key, on=["region_id", "week_start"], how="left")
                t["is_pos"] = t.n_pos.notna()
                return t
            k = (model, pool)
            if k not in taus:
                base = rw_table(labs[(model, "prod")], labs[(model, "prod")].iloc[0:0])
                clean19 = base[~base.bad & (base.week_start.dt.year == 2019)]
                taus[k] = tune_low(clean19.pooled, config.V1["ALERT_BUDGET"])
            for name, (src, sel) in sets.items():
                lab = labs[(model, src)]
                t = rw_table(lab, lab[sel(lab)])
                years = sorted(lab[sel(lab)].week_start.dt.year.unique())
                p = t[t.is_pos]
                ng = t[~t.is_pos & ~t.bad & t.week_start.dt.year.isin(years)]
                rows.append({"model": LABEL[model], "pooling": pool, "failure set": name, "region-weeks": len(p),
                             "detected": float((p.pooled < taus[k]).mean()),
                             "false region alerts (clean region-weeks)": float((ng.pooled < taus[k]).mean())})
    return pd.DataFrame(rows), taus


def score_edcs_and_tb(inp: Inputs, opts: dict, tag: str, workers=None):
    """National runs: 18 EDCS diseases (weekly) and TB (monthly), as in v1 cells 14 and 29."""
    edcs, log_e = cached_run_weekly(CACHE, f"{tag}_edcs", inp.X_edcs, "disease", inp.cal, config.V1, opts,
                                    label=f"{tag} EDCS", workers=workers)
    pdz = fisher(edcs, ["week_start"], out_col="pooled_disease_p")
    edcs = edcs.merge(pdz, on="week_start", how="left")
    edcs.loc[edcs.p_low.isna(), "pooled_disease_p"] = np.nan

    cfg = config.V1
    tb = inp.X_tb.sort_values("month_start").reset_index(drop=True)
    y = np.where(tb.report_status.eq("reported"), tb.cases, np.nan).astype(float)
    annual = inp.X_tb_annual.set_index("year").notified

    def base_year(yr):
        return max(a for a in annual.index if a < yr and a not in cfg["TB_EXCLUDED_BASE_YEARS"])

    a_lo, a_hi = cfg["ALPHA_BOUNDS"]
    tb["expected_m1"] = tb.year.map(base_year).map(annual) / 12
    later = (tb.month_start >= cfg["TB_COUNT_MODEL_START"]) & ~np.isnan(y)
    mu1 = tb.expected_m1[later].to_numpy()
    alpha_m1 = float(np.clip(np.sum((y[later] - mu1) ** 2 - y[later]) / np.sum(mu1 ** 2), a_lo, a_hi))
    m1 = pd.DataFrame({"expected": tb.expected_m1, "alpha": alpha_m1})
    m1["pi_low"] = nb_dist(m1.expected, alpha_m1).ppf(0.05)
    m1["pi_high"] = nb_dist(m1.expected, alpha_m1).ppf(0.95)
    m1["p_low"] = np.where(~np.isnan(y), mid_p_low(np.nan_to_num(y), m1.expected, alpha_m1), np.nan)
    m1["level"] = "tb_prev_year"
    sub = (tb.month_start >= cfg["TB_COUNT_MODEL_START"]).to_numpy()
    log_tb: list[dict] = []
    Xtb = design(int(sub.sum()), cfg["PERIODS_PER_YEAR"]["month"], tb.loc[sub, ["is_december"]].reset_index(drop=True))
    m2_sc = CountModel(cfg, opts).score_series(y[sub], Xtb, "tb", log_tb, years=tb.year.to_numpy()[sub])
    m2 = pd.DataFrame(index=tb.index, columns=["expected", "alpha", "level", "pi_low", "pi_high", "p_low"], dtype=object)
    m2.loc[sub, ["expected", "alpha", "level", "pi_low", "pi_high", "p_low"]] = \
        m2_sc[["expected", "alpha", "level", "pi_low", "pi_high", "p_low"]].to_numpy()
    m2.loc[~sub, "level"] = "not_fitted_before_2021"
    for c in ("expected", "alpha", "pi_low", "pi_high", "p_low"):
        m2[c] = pd.to_numeric(m2[c])
    tb_b = baseline_scores(y, cfg)
    return edcs, log_e, tb, m1, m2, sub, tb_b, pd.DataFrame(log_tb)


def measles_eval(inp: Inputs, edcs_by: dict, frozen: Frozen, opts_by: dict, workers=None) -> dict:
    """v1 cell 27: measles/rubella 2019 W8 group zero, blank weeks filled with 0, injected failures."""
    R = {}
    Ym = inp.Y_measles
    names = ["v1", "v2"] + BASELINES
    mea = {k: v[v.disease.isin(["measles", "rubella"])].merge(Ym, on=["disease", "week_start"], how="left")
           for k, v in edcs_by.items()}
    care_in = inp.X_measles.copy()
    blank = care_in.report_status.eq("missing")
    care_in.loc[blank, ["cases", "report_status"]] = [0, "reported"]
    inj = measles_injections(inp)
    minj_in = inp.X_measles.merge(inj[["disease", "week_start", "cases_injected"]], on=["disease", "week_start"], how="left")
    minj_in["cases"] = minj_in.cases_injected.combine_first(minj_in.cases)
    minj_in = minj_in.drop(columns="cases_injected")
    care, minj = {}, {}
    for k, opts in opts_by.items():
        c, _ = cached_run_weekly(CACHE, f"{k}_measles_careless", care_in, "disease", inp.cal, config.V1, opts, workers=workers)
        care[k] = c.merge(Ym, on=["disease", "week_start"], how="left").merge(
            inp.X_measles.assign(filled=blank)[["disease", "week_start", "filled"]], on=["disease", "week_start"], how="left")
        m, _ = cached_run_weekly(CACHE, f"{k}_measles_injected", minj_in, "disease", inp.cal, config.V1, opts, workers=workers)
        minj[k] = m.merge(Ym, on=["disease", "week_start"], how="left").merge(
            inj[["disease", "week_start", "event_id", "cases_true", "cases_injected"]], on=["disease", "week_start"], how="left")
    for dis in ("measles", "rubella"):
        s = {k: v[v.disease == dis].reset_index(drop=True) for k, v in mea.items()}
        b = s["v1"]
        R[f"{dis}: 2019 W8 group zero (real)"] = evaluate(
            frozen.methods(s, names), b.qa_label.eq("suspect"), (b.qa_label == "ok") & b.p_low.notna(),
            b.disease, period_no(b.week_start))
        c = {k: v[v.disease == dis].reset_index(drop=True) for k, v in care.items()}
        b = c["v1"]
        R[f"{dis}: blank weeks filled with 0"] = evaluate(
            frozen.methods(c, names), b.filled.fillna(False), (b.qa_label == "ok") & b.p_low.notna(),
            b.disease + "-" + b.week_start.astype(str), period_no(b.week_start))
    mi = {k: v[v.disease == "measles"].reset_index(drop=True) for k, v in minj.items()}
    b = mi["v1"]
    pos = b.event_id.notna() & (b.cases_injected != b.cases_true)
    R["measles 2017 + 2021: injected, all types"] = evaluate(
        frozen.methods(mi, names), pos, (b.qa_label == "ok") & b.event_id.isna() & b.p_low.notna(),
        b.event_id.fillna(""), period_no(b.week_start))
    return R


def tb_eval(inp: Inputs, tb_by: dict, frozen: Frozen) -> dict:
    R = {}
    for k_label, (tb, m1, m2_by, tb_b) in tb_by.items():
        ev = tb.merge(inp.Y_tb, on="month_start")
        pn = (ev.year * 12 + ev.month).to_numpy()
        pos = ev.qa_label.eq("suspect")
        for mname, mm_by in (("method 1 (previous year / 12)", {"v1": m1, "v2": m1}), ("method 2 (count model, 2021 on)", m2_by)):
            frames = {k: ev.assign(p_low=mm.p_low.to_numpy()) for k, mm in mm_by.items()}
            for b, arr in zip(BASELINES, tb_b):
                frames["v1"]["s_" + b] = arr
            neg = ev.qa_label.eq("ok") & frames["v1"].p_low.notna()
            if mname.startswith("method 2"):
                neg = ev.qa_label.eq("ok") & frames["v2"].p_low.notna()
            R[f"TB: 8 suspect months, {mname}"] = evaluate(frozen.methods(frames, ["v1", "v2"] + BASELINES), pos, neg,
                                                         ev.month_start.astype(str), pn)
    return R


def reliability(p, label, bins=(0, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0)) -> pd.DataFrame:
    p, label = np.asarray(p, float), np.asarray(label, bool)
    ok = ~np.isnan(p)
    p, label = p[ok], label[ok]
    cut = pd.cut(p, bins=list(bins), include_lowest=True)
    t = pd.DataFrame({"bin": cut, "p": p, "y": label}).groupby("bin", observed=False).agg(
        rows=("y", "size"), mean_p_fail=("p", "mean"), observed_failure_share=("y", "mean")).reset_index()
    t["bin"] = t.bin.astype(str)
    return t


def calib_by_year(lab: pd.DataFrame, tau: float) -> pd.DataFrame:
    okk = lab[ok_scored(lab)]
    return okk.groupby(okk.week_start.dt.year).apply(lambda g: pd.Series({
        "ok weeks scored": len(g), "inside 90% range": coverage(g.cases, g.pi_low, g.pi_high),
        "p_low < 0.05": (g.p_low < 0.05).mean(), "p_low > 0.95": (g.p_low > 0.95).mean(),
        "alerts (p_low < tau)": (g.p_low < tau).mean()}), include_groups=False).reset_index().rename(columns={"week_start": "year"})


def run_test(inp: Inputs, workers=None) -> dict:
    t0 = time.time()
    sel = json.loads((MODEL_A_V2_DIR / "selection.json").read_text(encoding="utf-8"))
    chosen = sel["chosen"]
    opts_v2 = config.options(chosen)
    lp_v1, le_v1 = run_candidate("v1", inp, workers)
    lp_v2, le_v2 = run_candidate(chosen, inp, workers)
    lp_cv, le_cv = run_candidate("covid+uncertainty", inp, workers)
    P = {"v1": _hub(lp_v1), "v2": _hub(lp_v2), "covid": _hub(lp_cv)}
    E = {"v1": _hub(le_v1), "v2": _hub(le_v2), "covid": _hub(le_cv)}
    _aligned(P)
    _aligned(E)

    # ---- freeze thresholds on 2019 -----------------------------------------------------------------------
    B = config.V1["ALERT_BUDGET"]
    y_p = P["v1"].week_start.dt.year
    tune_ok = (y_p == 2019) & ok_scored(P["v1"])
    taus = {"v1": tune_low(P["v1"].loc[tune_ok, "p_low"], B),
            "covid": tune_low(P["covid"].loc[(y_p == 2019) & ok_scored(P["covid"]), "p_low"], B)}
    H = {b: tune_high(P["v1"].loc[tune_ok, "s_" + b], B) for b in BASELINES}
    e19 = E["v2"][E["v2"].week_start.dt.year == 2019]
    p_pos = e19.loc[e19.is_inj, "p_low"].fillna(np.inf).to_numpy()
    # The budget is about the real reporting stream, so false alerts are counted on the production run's 2019
    # normal weeks (as v1 does). Test run 1 counted them on the evaluation copy instead, whose injected failures
    # widen the model, and its tau let 1.7% of real 2019 normal weeks through (see test_runs/).
    p_neg = P["v2"].loc[(y_p == 2019) & ok_scored(P["v2"]), "p_low"].to_numpy()
    taus["v2"], curve = tune_tau_f1(p_pos, p_neg, B)
    taus["v2_budget"] = tune_low(P["v2"].loc[(y_p == 2019) & ok_scored(P["v2"]), "p_low"], B)
    frozen = Frozen(taus, H)

    # ---- p_fail: isotonic on 2019, prior-shifted to the real failure share of 2016-2018 -------------------
    yl = inp.Y_dengue.week_start.dt.year
    tr_lab = inp.Y_dengue[yl.isin(config.V2["CALIBRATION_PRIOR_YEARS"])]
    real_share = float((fl(tr_lab, "swap_cases_deaths") | fl(tr_lab, "regional_gap")).mean())
    fit_rows = e19[(e19.is_inj | e19.neg) & e19.p_low.notna()]
    pf = PFail(train_share=float(fit_rows.is_inj.mean()), real_share=real_share).fit(fit_rows.p_low, fit_rows.is_inj)

    # ---- pooling: rho on 2016-2018 normal weeks (production run), then Fisher + Stouffer --------------------
    rho = {}
    for k in ("v1", "v2"):
        normal = P[k].week_start.dt.year.isin(config.V2["STOUFFER_RHO_YEARS"]) & ok_scored(P[k])
        rho[k] = estimate_rho(P[k], "hub_id", "location_id", normal)
        for D in (P, E):
            D[k] = add_hub_pool(add_region_pool(D[k]), rho[k])
    labs = {(k, "prod"): P[k] for k in ("v1", "v2")} | {(k, "eval"): E[k] for k in ("v1", "v2")}
    region_tbl, rw_taus = region_eval(labs)
    # v1's own report used tau on the Fisher p directly; reproduce that row for reference
    v1_ref = []
    for name, src, selfn in (("real swaps 2020 (test)", "prod", lambda l: l.is_swap & (l.week_start.dt.year == 2020)),):
        lab = labs[("v1", src)]
        bad = (lab.qa_label != "ok")
        t = lab[lab.p_low.notna()].assign(_bad=bad).groupby(["region_id", "week_start"]).agg(
            pooled=("pooled_region_p", "first"), bad=("_bad", "any")).reset_index()
        pos_rw = lab[selfn(lab)].groupby(["region_id", "week_start"]).size().rename("n").reset_index()
        t = t.merge(pos_rw, on=["region_id", "week_start"], how="left")
        ng = t[t.n.isna() & ~t.bad & (t.week_start.dt.year == 2020)]
        v1_ref.append({"model": "Model A v1 (as in its report: Fisher p < tau)", "pooling": "Fisher", "failure set": name,
                       "region-weeks": int(t.n.notna().sum()), "detected": float((t[t.n.notna()].pooled < taus["v1"]).mean()),
                       "false region alerts (clean region-weeks)": float((ng.pooled < taus["v1"]).mean())})
    region_tbl = pd.concat([pd.DataFrame(v1_ref), region_tbl], ignore_index=True)

    # ---- dengue evaluation sets --------------------------------------------------------------------------
    R, CI = {}, {}
    pv1, ev1 = P["v1"], E["v1"]
    for year in (2016, 2017, 2020):
        sel_ = pv1.week_start.dt.year == year
        R[f"dengue {year}: real swaps"] = evaluate(frozen.methods(P), sel_ & pv1.is_swap,
                                                   sel_ & ok_scored(pv1) & ok_scored(P["v2"]),
                                                   pv1.location_id + f"-{year}", period_no(pv1.week_start))
    for year in (2016, 2017, 2020):
        sel_ = ev1.week_start.dt.year == year
        R[f"dengue {year}: regional gap filled with 0"] = evaluate(
            frozen.methods(E), sel_ & ev1.is_gap, sel_ & ev1.neg & E["v2"].neg, ev1.location_id + "-gap",
            period_no(ev1.week_start))
    for year, tag in ((2019, "tuning"), (2020, "test")):
        sel_ = ev1.week_start.dt.year == year
        for scen in ("zero_fill", "partial", "outage", "region_outage"):
            R[f"dengue {year} ({tag}): injected {scen}"] = evaluate(
                frozen.methods(E), sel_ & ev1.is_inj & (ev1.scenario == scen), sel_ & ev1.neg & E["v2"].neg,
                ev1.event_id.fillna(""), period_no(ev1.week_start))
        R[f"dengue {year} ({tag}): injected, all types"] = evaluate(
            frozen.methods(E), sel_ & ev1.is_inj, sel_ & ev1.neg & E["v2"].neg, ev1.event_id.fillna(""),
            period_no(ev1.week_start))
    # covid sensitivity (2020 only)
    for key, D, pos_fn, neg_fn in (
            ("dengue 2020: real swaps", P, lambda d: d.is_swap, lambda d: ok_scored(d)),
            ("dengue 2020 (test): injected, all types", E, lambda d: d.is_inj, lambda d: d.neg)):
        sel_ = D["v1"].week_start.dt.year == 2020
        R[key + " [covid sensitivity]"] = evaluate(frozen.methods(D, ["v1", "covid", "v2"]), sel_ & pos_fn(D["v1"]),
                                                   sel_ & neg_fn(D["v1"]) & neg_fn(D["covid"]) & neg_fn(D["v2"]),
                                                   D["v1"].location_id, period_no(D["v1"].week_start))
    # bootstrap CIs (cluster = location) for the three headline 2020 sets
    for key, D, pos_fn, neg_fn in (
            ("dengue 2020: real swaps", P, lambda d: d.is_swap, lambda d: ok_scored(d) & ok_scored(P["v2"])),
            ("dengue 2020: regional gap filled with 0", E, lambda d: d.is_gap, lambda d: d.neg & E["v2"].neg),
            ("dengue 2020 (test): injected, all types", E, lambda d: d.is_inj, lambda d: d.neg & E["v2"].neg)):
        d0 = D["v1"]
        sel_ = d0.week_start.dt.year == 2020
        CI[key] = {name: bootstrap_ci(score, thr, sel_ & pos_fn(d0), sel_ & neg_fn(d0), d0.location_id)
                   for name, (score, thr) in frozen.methods(D).items()}

    # ---- calibration ---------------------------------------------------------------------------------------
    CAL = {k: calib_by_year(P[k], taus[k]) for k in ("v1", "v2")}
    PIT = {}
    for k in ("v1", "v2"):
        pit = P[k][ok_scored(P[k]) & P[k].week_start.dt.year.isin([2019, 2020])].p_low
        cnt, _ = np.histogram(pit, bins=10, range=(0, 1))
        PIT[k] = (cnt / cnt.sum()).tolist()
    p20 = P["v2"][(P["v2"].week_start.dt.year == 2020) & (P["v2"].is_swap | ok_scored(P["v2"])) & P["v2"].p_low.notna()]
    pf20 = pf.predict(p20.p_low)
    REL = {"2020 production rows (real swaps vs ok weeks)": reliability(pf20, p20.is_swap)}
    brier = float(np.mean((pf20 - p20.is_swap.to_numpy(float)) ** 2))
    base = float(p20.is_swap.mean())
    brier_base = float(np.mean((base - p20.is_swap.to_numpy(float)) ** 2))

    # ---- national runs (EDCS, measles, TB) -----------------------------------------------------------------
    nat = {k: score_edcs_and_tb(inp, o, k, workers) for k, o in (("v1", config.options("v1")), ("v2", opts_v2))}
    R.update(measles_eval(inp, {k: v[0] for k, v in nat.items()}, frozen,
                          {"v1": config.options("v1"), "v2": opts_v2}, workers))
    tb_v1, tb_v2 = nat["v1"], nat["v2"]
    R.update(tb_eval(inp, {"tb": (tb_v1[2], tb_v1[3], {"v1": tb_v1[4], "v2": tb_v2[4]}, tb_v1[6])}, frozen))

    # ---- scores_v2.csv -------------------------------------------------------------------------------------
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + hashlib.sha256(
        json.dumps([opts_v2, taus], default=str, sort_keys=True).encode()).hexdigest()[:8]
    scores = build_scores(P["v2"], nat["v2"], pf, taus["v2"], run_id)
    validate(scores)
    MODEL_A_V2_DIR.mkdir(parents=True, exist_ok=True)
    scores_path = MODEL_A_V2_DIR / "scores_v2.csv"
    scores.to_csv(scores_path, index=False, lineterminator="\n", date_format="%Y-%m-%d", float_format="%.6g")
    validate(read_scores(scores_path))  # what a consumer reads back must also pass
    fallbacks = pd.concat([cached_fallbacks(inp, chosen, workers).assign(run="dengue"),
                           nat["v2"][1].assign(run="edcs"), nat["v2"][7].assign(run="tb")], ignore_index=True)
    fallbacks.to_csv(MODEL_A_V2_DIR / "fallback_log.csv", index=False, lineterminator="\n")

    out = {
        "run_id": run_id, "chosen": chosen, "selection": sel, "opts_v2": opts_v2, "taus": taus, "H": H,
        "threshold_curve": curve, "pfail": pf.describe(), "rho": {k: v.round(4).to_dict() for k, v in rho.items()},
        "region_taus": {f"{m} / {p}": t for (m, p), t in rw_taus.items()},
        "R": R, "CI": CI, "region": region_tbl, "CAL": CAL, "PIT": PIT, "REL": REL,
        "brier": {"model": brier, "base_rate_only": brier_base, "base_rate": base},
        "scores": scores, "scores_sha256": hashlib.sha256(scores_path.read_bytes()).hexdigest(),
        "frames": {"P": P, "E": E}, "runtime_seconds": round(time.time() - t0, 1),
    }
    return out


def cached_fallbacks(inp, name, workers):
    """The fallback log of the chosen production run (a cache hit: same tag and settings as run_candidate)."""
    _, log = cached_run_weekly(CACHE, f"{name}_prod", inp.X_dengue, "location_id", inp.cal, config.V1,
                               config.options(name), workers=workers)
    return log


def read_scores(path) -> pd.DataFrame:
    return pd.read_csv(path, dtype={"disease": str, "location_id": str, "region_id": str, "hub_id": str,
                                    "resolution": str, "report_status": str, "model_version": str, "run_id": str},
                       keep_default_na=False, na_values=[""])


def build_scores(pv2: pd.DataFrame, nat: tuple, pf: PFail, tau: float, run_id: str) -> pd.DataFrame:
    edcs, _, tb, m1, m2, sub, _, _ = nat

    def block(d, disease, loc, period_col, resolution, level, region=None, hub=None, pooled_region=None,
              hub_p=None, pooled_disease=None):
        o = pd.DataFrame({
            "disease": d[disease] if disease in d else disease,
            "location_id": d[loc] if loc in d else loc,
            "region_id": d[region] if region else np.nan,
            "hub_id": d[hub] if hub else np.nan,
            "period_start": d[period_col], "resolution": resolution,
            "cases": np.where(d.report_status.eq("reported"), d.cases, np.nan),
            "report_status": d.report_status,
            "expected": d.expected, "pi_low": d.pi_low, "pi_high": d.pi_high, "p_low": d.p_low,
        })
        o["p_fail"] = pf.predict(o.p_low)
        o["flag"] = np.where(o.p_low.notna(), (o.p_low < tau).astype(float), np.nan)
        rep = o.report_status.eq("reported")
        o["shortfall"] = np.where(rep, np.maximum(o.expected - o.cases, 0), o.expected)
        o["pooled_region_p"] = d[pooled_region] if pooled_region else np.nan
        o["hub_p"] = d[hub_p] if hub_p else np.nan
        o["pooled_disease_p"] = d[pooled_disease] if pooled_disease else np.nan
        o["model_version"] = "model_a_v2:" + pd.Series(level).astype(str).to_numpy()
        return o

    parts = [
        block(pv2, "dengue", "location_id", "week_start", "week", pv2.level, region="region_id", hub="hub_id",
              pooled_region="pooled_region_p", hub_p="hub_p"),
        block(edcs.assign(location_id="PH"), "disease", "location_id", "week_start", "week", edcs.level,
              pooled_disease="pooled_disease_p"),
    ]
    for mm, mask in ((m1, np.ones(len(tb), bool)), (m2, sub)):
        d = tb[["month_start", "cases", "report_status"]].join(mm)[mask]
        parts.append(block(d.assign(disease="tb", location_id="PH"), "disease", "location_id", "month_start", "month",
                           d.level))
    s = pd.concat(parts, ignore_index=True)
    s["run_id"] = run_id
    s["period_start"] = pd.to_datetime(s.period_start)
    s["cases"] = s.cases.astype("Int64")
    s["flag"] = s.flag.astype("Int64")
    for c in ("region_id", "hub_id"):
        s[c] = s[c].astype(object).where(s[c].notna(), None)
    s = s.sort_values(["disease", "location_id", "model_version", "period_start"], kind="mergesort", ignore_index=True)
    from ..contract import SCORES_V2
    return s[list(SCORES_V2)]


def manifest(out: dict, inp: Inputs) -> dict:
    return {
        "run_id": out["run_id"], "model_version": config.V2["MODEL_VERSION"], "package_version": __version__,
        "chosen_variant": out["chosen"], "variant_options": out["opts_v2"], "selection": out["selection"],
        "split": config.SPLIT, "alert_budget": config.V1["ALERT_BUDGET"],
        "TAU_model_a_v2": out["taus"]["v2"], "TAU_model_a_v2_budget_only": out["taus"]["v2_budget"],
        "TAU_model_a_v1": out["taus"]["v1"], "BASELINE_THRESHOLDS": out["H"],
        "region_week_thresholds": out["region_taus"], "stouffer_rho_by_hub": out["rho"]["v2"],
        "p_fail": out["pfail"], "count_model_settings": config.V1,
        "inputs_sha256": input_hashes(), "scores_sha256": out["scores_sha256"],
        "versions": {"python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__,
                     "scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "scikit-learn": sklearn.__version__},
        "runtime_seconds": out["runtime_seconds"],
    }
