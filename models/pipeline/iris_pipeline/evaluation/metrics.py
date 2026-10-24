"""Shared evaluation: the same metrics for every model (port of v1 cell 19, generalised to any scorer).

A method is (score, threshold): higher score = more suspicious; the method alerts when score > threshold.
Model A's score is -p_low and its threshold -tau, so "alert" means p_low < tau exactly as in v1.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats


def auc(score: np.ndarray, pos: np.ndarray, neg: np.ndarray) -> float:
    """P(a failure looks more anomalous than a normal week). Unscored = least anomalous."""
    s = np.where(np.isnan(score), -np.inf, score)
    sp, sn = s[pos], s[neg]
    if not len(sp) or not len(sn):
        return np.nan
    r = stats.rankdata(np.concatenate([sp, sn]))
    return float((r[:len(sp)].sum() - len(sp) * (len(sp) + 1) / 2) / (len(sp) * len(sn)))


def binary(flag: np.ndarray, pos: np.ndarray, neg: np.ndarray) -> dict:
    tp, fn = int((flag & pos).sum()), int((~flag & pos).sum())
    fp, tn = int((flag & neg).sum()), int((~flag & neg).sum())
    rec = tp / (tp + fn) if tp + fn else np.nan
    prec = tp / (tp + fp) if tp + fp else np.nan
    f1 = 2 * prec * rec / (prec + rec) if (tp and not np.isnan(prec)) else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "recall": rec, "precision": prec, "f1": f1,
            "false_alert_rate": fp / (fp + tn) if fp + tn else np.nan}


def evaluate(methods: dict[str, tuple[np.ndarray, float]], pos, neg, event, period_no) -> pd.DataFrame:
    """Row and event metrics for every method at its frozen threshold, plus threshold-free AUC.

    pos / neg: boolean arrays (failure rows / normal rows); event: event id per row (for detection rate and
    delay); period_no: integer period index per row."""
    pos, neg = np.asarray(pos, bool), np.asarray(neg, bool)
    event, period_no = np.asarray(event), np.asarray(period_no)
    rows = []
    for name, (score, thr) in methods.items():
        score = np.asarray(score, float)
        flag = np.nan_to_num(score, nan=-np.inf) > thr
        m = binary(flag, pos, neg)
        ev = pd.DataFrame({"event": event[pos], "flag": flag[pos], "pn": period_no[pos]})
        start = ev.groupby("event").pn.min()
        first = ev[ev.flag].groupby("event").pn.min()
        m.update({
            "method": name, "positives": int(pos.sum()), "events": int(start.size),
            "detection_rate": first.size / start.size if start.size else np.nan,
            "weeks_to_detect": float((first - start.reindex(first.index)).mean()) if first.size else np.nan,
            "auc": auc(score, pos, neg),
        })
        rows.append(m)
    cols = ["method", "positives", "events", "recall", "detection_rate", "weeks_to_detect", "precision", "f1",
            "false_alert_rate", "auc", "tp", "fp", "fn", "tn"]
    return pd.DataFrame(rows)[cols]


def bootstrap_ci(score: np.ndarray, thr: float, pos, neg, cluster, n_boot: int = 400, seed: int = 2026,
                 level: float = 0.95) -> dict:
    """Cluster bootstrap (resampling whole series, e.g. locations) for recall, false-alert rate, F1 and AUC.
    Clusters keep weeks of one place together, so the intervals respect within-place correlation."""
    pos, neg = np.asarray(pos, bool), np.asarray(neg, bool)
    keep = pos | neg
    score = np.asarray(score, float)[keep]
    pos, neg, cluster = pos[keep], neg[keep], np.asarray(cluster)[keep]
    flag = np.nan_to_num(score, nan=-np.inf) > thr
    codes, uniq = pd.factorize(cluster)
    k = len(uniq)
    idx_by = [np.flatnonzero(codes == c) for c in range(k)]
    rng = np.random.default_rng(seed)
    out = {"recall": [], "false_alert_rate": [], "f1": [], "auc": []}
    for _ in range(n_boot):
        pick = rng.integers(0, k, k)
        ii = np.concatenate([idx_by[c] for c in pick])
        m = binary(flag[ii], pos[ii], neg[ii])
        for key in ("recall", "false_alert_rate", "f1"):
            out[key].append(m[key])
        out["auc"].append(auc(score[ii], pos[ii], neg[ii]))
    a = (1 - level) / 2
    return {f"{key}_ci": (float(np.nanquantile(v, a)), float(np.nanquantile(v, 1 - a))) for key, v in out.items()}


def period_no(dates: pd.Series) -> np.ndarray:
    return ((pd.to_datetime(dates) - pd.Timestamp("2012-12-30")).dt.days // 7).astype(int).to_numpy()


def coverage(cases, lo, hi) -> float:
    cases, lo, hi = (np.asarray(x, float) for x in (cases, lo, hi))
    ok = ~np.isnan(cases) & ~np.isnan(lo)
    return float(((cases[ok] >= lo[ok]) & (cases[ok] <= hi[ok])).mean()) if ok.any() else np.nan
