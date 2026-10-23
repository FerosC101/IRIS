"""Thresholds and probabilities, all fitted on the tuning year (2019) only.

- tune_low / tune_high: v1's budget thresholds (cell 16): the alert rate on normal weeks equals the budget.
- tune_tau_f1: v2. Among thresholds whose false-alert rate on 2019 normal weeks is within the budget, the one
  with the best F1 on 2019 injected failures, so detection is weighed against the alert budget (roadmap 2.3).
- PFail: isotonic regression of "is a failure" on -log10(p_low), then a prior shift from the evaluation set's
  failure share to the real failure share seen in the training years' labels (Saerens et al. 2002).
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression


def tune_low(p, budget):
    p = np.sort(np.asarray(p, dtype=float))
    return float(p[int(math.floor(budget * len(p)))])


def tune_high(s, budget):
    s = np.sort(np.asarray(s, dtype=float)[~np.isnan(s)])[::-1]
    return float(s[int(math.floor(budget * len(s)))])


def threshold_curve(p_pos, p_neg, max_far: float) -> pd.DataFrame:
    """Recall, false-alert rate, precision and F1 at every candidate tau (alert if p_low < tau)."""
    p_pos = np.asarray(p_pos, float)
    p_neg = np.sort(np.asarray(p_neg, float))
    cap = tune_low(p_neg, max_far)
    cands = np.unique(np.concatenate([p_pos[p_pos <= cap], p_neg[p_neg <= cap], [cap]]))
    cands = np.nextafter(cands, np.inf)  # alert if p_low < tau: put tau just above each observed value
    cands = cands[cands <= cap]
    if not len(cands):
        cands = np.array([cap])
    tp = np.searchsorted(np.sort(p_pos), cands, side="left")
    fp = np.searchsorted(p_neg, cands, side="left")
    rec = tp / max(len(p_pos), 1)
    far = fp / max(len(p_neg), 1)
    prec = np.where(tp + fp > 0, tp / np.maximum(tp + fp, 1), np.nan)
    with np.errstate(invalid="ignore", divide="ignore"):
        f1 = np.where(tp > 0, 2 * prec * rec / (prec + rec), 0.0)
    return pd.DataFrame({"tau": cands, "recall": rec, "false_alert_rate": far, "precision": prec, "f1": f1})


def tune_tau_f1(p_pos, p_neg, budget: float) -> tuple[float, pd.DataFrame]:
    curve = threshold_curve(p_pos, p_neg, budget)
    best = curve.sort_values(["f1", "recall", "tau"], ascending=[False, False, False]).iloc[0]
    return float(best.tau), curve


class PFail:
    def __init__(self, train_share: float, real_share: float):
        self.train_share = train_share
        self.real_share = real_share
        self.iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")

    @staticmethod
    def feature(p_low) -> np.ndarray:
        return -np.log10(np.clip(np.asarray(p_low, float), 1e-300, 1.0))

    def fit(self, p_low, label):
        self.iso.fit(self.feature(p_low), np.asarray(label, float))
        return self

    def predict(self, p_low) -> np.ndarray:
        p_low = np.asarray(p_low, float)
        out = np.full(len(p_low), np.nan)
        ok = ~np.isnan(p_low)
        if not ok.any():
            return out
        q = np.clip(self.iso.predict(self.feature(p_low[ok])), 1e-6, 1 - 1e-6)
        shift = (self.real_share / (1 - self.real_share)) / (self.train_share / (1 - self.train_share))
        odds = q / (1 - q) * shift
        out[ok] = odds / (1 + odds)
        return out

    def describe(self) -> dict:
        return {"method": "isotonic on -log10(p_low), prior-shifted",
                "train_failure_share": self.train_share, "real_failure_share": self.real_share}
