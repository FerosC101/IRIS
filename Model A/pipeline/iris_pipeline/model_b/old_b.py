"""Today's Model B rule on the real data: as published (within-date ranks) and fixed (roadmap step 4.4).

Fixes: clean data (corrected names and regions), calendar weeks (a missing week is a gap, not the next week, and it
breaks a zero streak), absolute scores (percentiles from the 2016-2018 zero reports, the same on every date), and
the false-alert rate measured on real labels at the shared 1% budget. Model A v2 is graded on the same rows.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

from ..data import Inputs, fl
from ..evaluation.metrics import auc, binary, bootstrap_ci, period_no
from ..evaluation.metrics import evaluate as evaluate_methods
from ..paths import MODEL_A_V2_DIR

WINDOW, MIN_HIST = 26, 13


def features(X: pd.DataFrame) -> pd.DataFrame:
    parts = []
    for loc, g in X.sort_values(["location_id", "week_start"]).groupby("location_id", sort=True):
        g = g.reset_index(drop=True)
        y = np.where(g.report_status.eq("reported"), g.cases, np.nan).astype(float)
        mean = np.full(len(y), np.nan)
        streak = np.zeros(len(y))
        s = 0
        for t in range(len(y)):
            s = s + 1 if y[t] == 0 else 0  # NaN (missing week) resets the streak
            streak[t] = s
            h = y[max(0, t - WINDOW):t]
            if np.sum(~np.isnan(h)) >= MIN_HIST:
                mean[t] = np.nanmean(h)
        parts.append(g.assign(y=y, hist_mean=mean, zero_streak=streak))
    return pd.concat(parts, ignore_index=True)


def score_fixed(d: pd.DataFrame, train_years=(2016, 2017, 2018)) -> np.ndarray:
    z = d[(d.y == 0) & d.hist_mean.notna()]
    ref = z[z.week_start.dt.year.isin(train_years)]
    m_ref, s_ref = np.sort(ref.hist_mean.to_numpy()), np.sort(ref.zero_streak.to_numpy())
    pm = np.searchsorted(m_ref, d.hist_mean.fillna(-1).to_numpy(), side="right") / len(m_ref)
    ps = np.searchsorted(s_ref, d.zero_streak.to_numpy(), side="right") / len(s_ref)
    return np.where((d.y == 0) & d.hist_mean.notna(), 100 * (0.7 * pm + 0.3 * ps), np.nan)


def score_published(d: pd.DataFrame) -> np.ndarray:
    """The notebook's rule: percentile ranks among the zero alerts of the same date."""
    s = np.full(len(d), np.nan)
    z = (d.y == 0) & d.hist_mean.notna()
    dz = d[z]
    hr = dz.groupby("week_start").hist_mean.rank(pct=True)
    sr = dz.groupby("week_start").zero_streak.rank(pct=True)
    s[z.to_numpy()] = (100 * (0.7 * hr + 0.3 * sr)).to_numpy()
    return s


def budget_threshold(score: np.ndarray, budget: float) -> float:
    s = np.sort(np.where(np.isnan(score), -np.inf, score))[::-1]
    return float(s[int(math.floor(budget * len(s)))])


def evaluate(inp: Inputs, scores_v2: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    d = features(inp.X_dengue).merge(inp.Y_dengue, on=["location_id", "week_start"], how="left", validate="one_to_one")
    d["is_swap"] = fl(d, "swap_cases_deaths")
    v2 = scores_v2[(scores_v2.disease == "dengue") & (scores_v2.location_id != "PH")][["location_id", "period_start", "p_low"]]
    d = d.merge(v2.rename(columns={"period_start": "week_start"}), on=["location_id", "week_start"], how="left")
    tau_v2 = json.loads((MODEL_A_V2_DIR / "config.json").read_text(encoding="utf-8"))["TAU_model_a_v2"]
    d["s_fixed"] = score_fixed(d)
    d["s_published"] = score_published(d)
    d["s_model_a_v2"] = -d.p_low
    ok = (d.qa_label == "ok") & d.y.notna()
    y20, y19 = d.week_start.dt.year == 2020, d.week_start.dt.year == 2019
    rows = []
    thr = {"s_fixed": budget_threshold(d.loc[y19 & ok, "s_fixed"].to_numpy(), 0.01),
           "s_published": budget_threshold(d.loc[y19 & ok, "s_published"].to_numpy(), 0.01),
           "s_model_a_v2": -tau_v2}
    names = {"s_published": "Old Model B, as published (within-date ranks)", "s_fixed": "Old Model B, fixed (absolute)",
             "s_model_a_v2": "Model A v2"}
    for col, name in names.items():
        s = d[col].to_numpy(float)
        zero = (d.y == 0).to_numpy()
        pos_all = (y20 & d.is_swap).to_numpy()
        neg_all = (y20 & ok & ~d.is_swap).to_numpy()
        flag = np.nan_to_num(s, nan=-np.inf) > thr[col]
        b = binary(flag, pos_all, neg_all)
        ev = evaluate_methods({name: (s, thr[col])}, pos_all, neg_all,
                      (d.location_id + "-" + d.week_start.dt.year.astype(str)).to_numpy(), period_no(d.week_start)).iloc[0]
        ci = bootstrap_ci(s, thr[col], pos_all, neg_all, d.location_id.to_numpy())
        top = d.loc[y20 & d[col].notna()].nlargest(100, col)
        rows.append({
            "method": name,
            "AUC, 2020 swapped zeros vs normal zeros": auc(s, pos_all & zero, neg_all & zero),
            "AUC, 2020 all swaps vs all normal weeks": auc(s, pos_all, neg_all),
            "recall at 1% budget (2020 swaps)": b["recall"], "false-alert rate (2020 normal weeks)": b["false_alert_rate"],
            "recall 95% CI": ci["recall_ci"], "false-alert rate 95% CI": ci["false_alert_rate_ci"],
            "precision": b["precision"], "f1": b["f1"], "weeks to detect": ev.weeks_to_detect,
            "real swaps in 2020 top 100": int(top.is_swap.sum()),
            "can see partial reports (1-3 cases)": "yes" if col == "s_model_a_v2" else "no (zeros only)",
        })
    return pd.DataFrame(rows), {"thresholds": thr, "swaps_2020": int((y20 & d.is_swap).sum()),
                                "swaps_2020_nonzero": int((y20 & d.is_swap & (d.y > 0)).sum())}
