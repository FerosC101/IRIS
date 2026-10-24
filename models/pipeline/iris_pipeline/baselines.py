"""Baseline detectors (port of models/notebooks/model_a.ipynb cell 8). Higher score = more suspicious."""

from __future__ import annotations

import math

import numpy as np

BASELINES = ["rolling_median", "ewma", "cusum"]


def baseline_scores(y, cfg):
    """y: float array, NaN = not reported. Returns (rolling_median, ewma, cusum) scores; NaN where unscored."""
    W, MIN, LAM, K = cfg["BASELINE_WINDOW"], cfg["BASELINE_MIN_OBS"], cfg["EWMA_LAMBDA"], cfg["CUSUM_K"]
    n = len(y)
    med, ewm, cus = (np.full(n, np.nan) for _ in range(3))
    hist, e, v, S = [], None, 0.0, 0.0
    for i in range(n):
        yi = y[i]
        if not np.isnan(yi) and len(hist) >= MIN:
            w = np.asarray(hist[-W:])
            m = np.median(w)
            s = max(1.0, 1.4826 * np.median(np.abs(w - m)))
            z = (m - yi) / s
            med[i] = z
            S = max(0.0, S + z - K)
            cus[i] = S
            ewm[i] = (e - yi) / max(1.0, math.sqrt(v))
        if not np.isnan(yi):
            if e is None:
                e = yi
            else:
                d = yi - e
                e += LAM * d
                v = (1 - LAM) * (v + LAM * d * d)
            hist.append(yi)
    return med, ewm, cus
