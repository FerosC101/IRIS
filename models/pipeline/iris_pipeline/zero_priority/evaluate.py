"""One evaluation for every method on every zero-report set, with the pipeline's shared metrics.

Methods are (score, threshold) pairs: higher = higher priority. Each threshold is set like Model B's High band:
at most 5% of REAL 2019 normal zero reports above it. Real and synthetic results are always reported separately.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config
from ..evaluation.metrics import auc, binary, bootstrap_ci, evaluate as shared_evaluate, period_no
from ..model_a.calibrate import tune_high
from .tune import ap

CFG = config.ZERO_PRIORITY


def weekly_topk(d: pd.DataFrame, score: np.ndarray, rows: np.ndarray, pos: np.ndarray, neg: np.ndarray, k: int) -> dict:
    """The team verifies the k highest-priority zero reports nationally each week."""
    t = pd.DataFrame({"w": d.week_start.to_numpy()[rows], "s": np.nan_to_num(score[rows], nan=-np.inf),
                      "pos": pos[rows], "neg": neg[rows]})
    t["rk"] = t.groupby("w").s.rank(method="first", ascending=False)
    top = t[t.rk <= k]
    n_pos, n_neg = int(t.pos.sum()), int(t.neg.sum())
    return {"k_per_week": k, "reviews": int(len(top)),
            "recall": top.pos.sum() / n_pos if n_pos else np.nan,
            "precision": top.pos.sum() / (top.pos.sum() + top.neg.sum()) if (top.pos.sum() + top.neg.sum()) else np.nan,
            "false_alert_rate": top.neg.sum() / n_neg if n_neg else np.nan}


def event_ids(d: pd.DataFrame) -> np.ndarray:
    ev = d.event_id.astype(object).where(d.event_id.notna()) if "event_id" in d else pd.Series(np.nan, index=d.index)
    return ev.fillna(d.location_id + "-" + d.year.astype(str)).to_numpy()


def reliability(p: np.ndarray, y: np.ndarray, bins=(0, 0.05, 0.1, 0.2, 0.4, 0.6, 1.0)) -> list[dict]:
    out = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (p >= lo) & ((p < hi) if hi < 1 else (p <= hi))
        if m.any():
            out.append({"bin": f"{lo:.2f}-{hi:.2f}", "n": int(m.sum()), "mean_predicted": float(p[m].mean()),
                        "observed_share": float(y[m].mean())})
    return out


def thresholds(methods: dict, tune_prod: pd.DataFrame, neg19: np.ndarray) -> dict:
    far = CFG["BAND_FAR"]["High"]
    return {name: tune_high(np.nan_to_num(fn(tune_prod)[neg19], nan=-np.inf), far) for name, fn in methods.items()}


def run(eval_sets: dict, methods: dict, thr: dict, probs: dict | None = None, ci_for=()) -> dict:
    """eval_sets from labels.sets; methods: name -> fn(frame) -> score array; probs: name -> fn(frame) -> probability."""
    out = {}
    for set_name, s in eval_sets.items():
        d = s["frame"]
        rows, pos, neg = s["rows"].to_numpy(), s["pos"].to_numpy(), s["neg"].to_numpy()
        cache = {name: np.asarray(fn(d), float) for name, fn in methods.items()}
        res = {"kind": s["kind"], "zero_reports": int(rows.sum()), "positives": int(pos.sum()), "negatives": int(neg.sum()),
               "positive_share": float(pos.sum() / max(pos.sum() + neg.sum(), 1)), "methods": {},
               # Upper bound: a reviewer who knows the answers, with the same weekly budget.
               "oracle_weekly_budget": [weekly_topk(d, pos.astype(float), rows, pos, neg, k) for k in CFG["WEEKLY_BUDGETS"]]}
        ev, pn = event_ids(d), period_no(d.week_start)
        for name, sc in cache.items():
            flag = np.nan_to_num(sc, nan=-np.inf) > thr[name]
            b = binary(flag, pos, neg)
            ev_m = shared_evaluate({name: (sc, thr[name])}, pos, neg, ev, pn).iloc[0]
            m = {"auc": auc(sc, pos, neg), "average_precision": ap(sc[pos | neg], pos[pos | neg]),
                 "high_band": {"recall": b["recall"], "precision": b["precision"], "f1": b["f1"],
                               "false_alert_rate": b["false_alert_rate"], "tp": b["tp"], "fp": b["fp"],
                               "events": int(ev_m.events), "events_detected": ev_m.detection_rate,
                               "weeks_to_detect": ev_m.weeks_to_detect},
                 "weekly_budget": [weekly_topk(d, sc, rows, pos, neg, k) for k in CFG["WEEKLY_BUDGETS"]]}
            if name in ci_for:
                m["high_band_ci"] = bootstrap_ci(sc, thr[name], pos, neg, d.location_id.to_numpy())
            res["methods"][name] = m
        if probs and s["kind"] == "real":
            res["calibration"] = {}
            for name, fn in probs.items():
                p = np.asarray(fn(d), float)
                k = (pos | neg) & ~np.isnan(p)
                res["calibration"][name] = {"brier": float(np.mean((p[k] - pos[k]) ** 2)),
                                            "mean_predicted": float(p[k].mean()), "observed_share": float(pos[k].mean()),
                                            "reliability": reliability(p[k], pos[k])}
        out[set_name] = res
    return out
