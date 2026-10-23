"""Step 3 experiment: detection and shared-source identification with and without the graph.

Tuning (simulated 2019, TUNE_SEEDS): facility threshold, source thresholds, Stouffer correlation and the
probability calibrators that Model B uses. Test (simulated 2020, TEST_SEEDS): every method at frozen settings,
no interventions (failures end on their own). Means over seeds with 95% t-intervals.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from .. import config
from ..evaluation.metrics import binary
from ..model_a.calibrate import PFail, tune_low, tune_tau_f1
from ..model_a.pooling import zscore
from .build import World
from .scorer import FacilityModels
from .simulate import Simulation, draw_events, events_frame
from .sources import METHODS, PRIMARY, Sources

BUDGET = 0.01


def passive_run(world: World, fm: FacilityModels, src: Sources, year: int, seed: int) -> dict:
    events = draw_events(world, year, seed)
    sim = Simulation(world, year, events, seed)
    st = fm.new_state()
    keys = ("y", "mu", "alpha", "p_low")
    out = {k: [] for k in keys}
    fail = []
    for t in range(sim.n_weeks):
        r = fm.score(t, sim.observed(t), st)
        for k in keys:
            out[k].append(r[k])
        fail.append(sim.failing(t))
    res = {k: np.array(v) for k, v in out.items()}
    res.update({"failing": np.array(fail), "events": events, "seed": seed})
    res["src_true"] = source_truth(events, src, sim.n_weeks)
    res["src_normal"] = (res["failing"].astype(float) @ src.A.T) == 0  # weeks x sources: no member failing
    return res


def source_truth(events, src: Sources, n_weeks: int) -> np.ndarray:
    truth = np.zeros((n_weeks, len(src.ids)), bool)
    for e in events:
        if e.kind in ("hub", "lab"):
            truth[e.start:e.end, src.index[e.source]] = True
    return truth


def add_source_tests(run: dict, src: Sources, rho: dict) -> None:
    """Source p-values for every week (needs rho, which is estimated from the tuning runs first)."""
    n = run["p_low"].shape[0]
    run["stouffer"] = np.array([src.stouffer({"p_low": run["p_low"][t]}, rho) for t in range(n)])
    run["nb_sum"] = np.array([src.nb_sum({k: run[k][t] for k in ("y", "mu", "alpha", "p_low")}, rho) for t in range(n)])


def estimate_rho(runs: list[dict], src: Sources) -> dict:
    """Median over sources of each type of the mean pairwise correlation of facility z-scores on normal weeks."""
    out = {}
    for typ in ("hub", "lab", "region"):
        vals = []
        for s in np.flatnonzero(src.types == typ):
            m = src.A[s] > 0
            Z = []
            for r in runs:
                ok = r["src_normal"][:, s]
                z = zscore(np.where(np.isnan(r["p_low"]), 0.5, r["p_low"]))[ok][:, m]
                Z.append(z)
            Z = np.vstack(Z)
            if Z.shape[1] < 2 or Z.shape[0] < 20:
                continue
            c = np.corrcoef(Z.T)
            off = c[~np.eye(len(c), dtype=bool)]
            off = off[np.isfinite(off)]
            if len(off):
                vals.append(off.mean())
        out[typ] = float(np.clip(np.median(vals), 0.0, 0.95)) if vals else 0.0
    return out


def tune(runs: list[dict], src: Sources) -> dict:
    P = np.concatenate([r["p_low"] for r in runs])
    F = np.concatenate([r["failing"] for r in runs])
    ok = ~np.isnan(P)
    tau_fac, curve = tune_tau_f1(np.where(ok & F, P, np.inf)[F], P[ok & ~F], BUDGET)
    tau_src = {}
    for name, m in METHODS.items():
        for typ in m["sources"]:
            cols = src.types == typ
            pv = np.concatenate([r[m["test"]][:, cols] for r in runs])
            normal = np.concatenate([r["src_normal"][:, cols] for r in runs])
            v = pv[normal & ~np.isnan(pv)]
            tau_src[(name, typ)] = tune_low(v, BUDGET)
    # calibrators for Model B (simulated prevalence is the truth of this world, so no prior shift)
    share = float(F[ok].mean())
    pf_fac = PFail(share, share).fit(P[ok], F[ok])
    pf_src = {}
    for typ in ("hub", "lab"):
        cols = src.types == typ
        pv = np.concatenate([r["nb_sum"][:, cols] for r in runs]).ravel()
        lab = np.concatenate([r["src_true"][:, cols] for r in runs]).ravel()
        good = ~np.isnan(pv)
        s = float(lab[good].mean())
        pf_src[typ] = PFail(s, s).fit(pv[good], lab[good])
    return {"tau_fac": tau_fac, "tau_src": tau_src, "curve": curve, "pf_fac": pf_fac, "pf_src": pf_src,
            "fac_failure_share": share}


def evaluate_run(run: dict, src: Sources, tuned: dict, world: World) -> tuple[list[dict], list[dict]]:
    """Per method: facility-week metrics, event metrics and source false alarms for one seed."""
    tau = tuned["tau_fac"]
    fac_flag = np.nan_to_num(run["p_low"], nan=1.0) < tau
    F = run["failing"]
    scored = ~np.isnan(run["p_low"])
    n_weeks = F.shape[0]
    rows, ev_rows = [], []
    for name, m in METHODS.items():
        kept = np.zeros((n_weeks, len(src.ids)), bool)
        best = np.full(F.shape, -1)
        if m["sources"]:
            pv = run[m["test"]]
            thr = np.full(len(src.ids), -np.inf)
            for typ in m["sources"]:
                thr[src.types == typ] = tuned["tau_src"][(name, typ)]
            declared = np.nan_to_num(pv, nan=1.0) < thr
            for t in range(n_weeks):
                kept[t], best[t] = src.attribute(pv[t], declared[t], m["sources"])
        flag = fac_flag | (best >= 0)
        b = binary(flag[scored], F[scored], (~F)[scored])
        types = np.isin(src.types, m["sources"]) if m["sources"] else np.zeros(len(src.ids), bool)
        normal_sw = run["src_normal"][:, types]
        src_far = float(kept[:, types][normal_sw].mean()) if types.any() else np.nan
        rows.append({"method": name, "seed": run["seed"], "recall": b["recall"], "precision": b["precision"],
                     "f1": b["f1"], "false_alert_rate": b["false_alert_rate"], "source_false_alert_rate": src_far})
        for e in run["events"]:
            W = np.arange(e.start, e.end)
            mem = e.members
            hit = flag[np.ix_(W, mem)].any(1)
            first = int(W[np.argmax(hit)] - e.start) if hit.any() else np.nan
            if e.kind == "isolated":
                f = mem[0]
                ok_src = bool((fac_flag[W, f] & (best[W, f] == -1)).any())
            elif "region" in m["sources"]:
                ok_src = False
            elif m["sources"]:
                s = src.index[e.source]
                ok_src = bool(any(kept[t, s] and (best[t, mem] == s).any() for t in W))
            else:
                ok_src = False
            region_ok = np.nan
            if e.kind != "isolated" and "region" in m["sources"]:
                rs = src.index["REGION-" + world.facilities.region_id.iat[mem[0]]]
                region_ok = bool(kept[W, rs].any())
            ev_rows.append({"method": name, "seed": run["seed"], "event_id": e.event_id, "kind": e.kind,
                            "n_facilities": len(mem), "detected": bool(hit.any()), "weeks_to_detect": first,
                            "source_identified": ok_src, "region_identified": region_ok})
    return rows, ev_rows


def mean_ci(x, upper: float | None = None) -> tuple[float, float, float]:
    """Mean over seeds with a 95% t-interval, clipped to the metric's possible range (>= 0, and <= upper)."""
    x = np.asarray(x, float)
    x = x[~np.isnan(x)]
    if not len(x):
        return np.nan, np.nan, np.nan
    m = float(x.mean())
    if len(x) < 2:
        return m, np.nan, np.nan
    h = float(stats.t.ppf(0.975, len(x) - 1) * x.std(ddof=1) / np.sqrt(len(x)))
    lo, hi = max(0.0, m - h), m + h
    return m, lo, min(hi, upper) if upper is not None else hi


def summarise(fw: pd.DataFrame, ev: pd.DataFrame) -> pd.DataFrame:
    out = []
    for name in METHODS:
        f = fw[fw.method == name]
        e = ev[ev.method == name]
        per_seed = e.groupby(["seed", "kind"]).agg(det=("detected", "mean"), src=("source_identified", "mean"),
                                                   delay=("weeks_to_detect", "mean")).reset_index()
        row = {"method": name}
        for col, lab in (("recall", "facility-week recall"), ("false_alert_rate", "facility-week false-alert rate"),
                         ("precision", "facility-week precision"), ("source_false_alert_rate", "source false-alert rate")):
            row[lab] = mean_ci(f[col], upper=1.0)
        for kind in ("isolated", "hub", "lab"):
            k = per_seed[per_seed.kind == kind]
            row[f"{kind} events detected"] = mean_ci(k.det, upper=1.0)
            row[f"{kind} source identified"] = mean_ci(k.src, upper=1.0)
            row[f"{kind} weeks to detect"] = mean_ci(k.delay)
        out.append(row)
    return pd.DataFrame(out)


def seed_run(world: World, cal: pd.DataFrame, src: Sources, year: int, seed: int, workers=None):
    """One replicate: fresh facility noise, facility models fitted on the weeks before `year`, passive year."""
    w = world.resample(seed)
    fm = FacilityModels(w, year, cal, workers)
    return w, fm, passive_run(w, fm, src, year, seed)


def run_network(world: World, cal: pd.DataFrame, workers=None, tune_seeds=None, test_seeds=None,
                test_year=None, tuned=None) -> dict:
    """Tune on TUNE_SEEDS (unless `tuned` is given), then evaluate every method on test_seeds in test_year."""
    src = Sources(world)
    tune_seeds = tune_seeds or config.SIM["TUNE_SEEDS"]
    test_seeds = test_seeds or config.SIM["TEST_SEEDS"]
    test_year = test_year or config.SIM["TEST_YEAR"]
    tune_events = None
    if tuned is None:
        tune_runs = [seed_run(world, cal, src, config.SIM["TUNE_YEAR"], s, workers)[2] for s in tune_seeds]
        rho = estimate_rho(tune_runs, src)
        for r in tune_runs:
            add_source_tests(r, src, rho)
        tuned = tune(tune_runs, src)
        tuned["rho"] = rho
        tune_events = pd.concat([events_frame(r["events"], world).assign(seed=r["seed"]) for r in tune_runs],
                                ignore_index=True)
    fw, ev, events = [], [], []
    for s in test_seeds:
        w, fm, r = seed_run(world, cal, src, test_year, s, workers)
        add_source_tests(r, src, tuned["rho"])
        a, b = evaluate_run(r, src, tuned, world)
        fw += a
        ev += b
        events.append(events_frame(r["events"], world).assign(seed=s))
    fw, ev = pd.DataFrame(fw), pd.DataFrame(ev)
    return {"src": src, "tuned": tuned, "fw": fw, "ev": ev, "summary": summarise(fw, ev),
            "events_test": pd.concat(events, ignore_index=True), "events_tune": tune_events,
            "primary": PRIMARY, "test_year": test_year}
