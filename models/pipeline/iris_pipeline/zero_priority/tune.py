"""Tuning on 2019 only: grid search, the pre-registered selection rule, priority bands and calibration."""

from __future__ import annotations

import itertools

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score

from .. import config
from ..model_a.calibrate import tune_high
from .features import build
from .labels import label_frame
from .score import COMPONENTS, ZeroPriorityModel, components, weighted

CFG = config.ZERO_PRIORITY


def ap(score: np.ndarray, y: np.ndarray) -> float:
    s = np.nan_to_num(np.asarray(score, float), nan=-1e9)
    return float(average_precision_score(np.asarray(y, bool), s)) if y.any() and (~y).any() else np.nan


def grid_search(prod_feats: dict, prod_labels: pd.DataFrame, ev_feats: dict, ev_labels: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Every grid setting scored on synthetic 2019 and real 2016-2017 (both pre-test). Returns the grid and the choice."""
    g = CFG["GRID"]
    weight_sets = [w for w in itertools.product(g["weights"], repeat=len(COMPONENTS)) if any(w)]
    W = np.array(weight_sets, float)
    rows = []
    for hw in g["hist_weeks"]:
        e = label_frame(ev_feats[hw], ev_labels)
        me = e.cand & (e.year == config.SPLIT["tune"]) & (e.is_inj | e.normal)
        ye = e.loc[me, "is_inj"].to_numpy()
        p = label_frame(prod_feats[hw], prod_labels)
        mp = p.cand & p.year.isin(CFG["TUNING_REAL_YEARS"]) & (p.is_swap | p.normal)
        yp = p.loc[mp, "is_swap"].to_numpy()
        for mh, ss in itertools.product(g["min_hist"], g["streak_saturation"]):
            Ce = np.nan_to_num(components(e.loc[me], mh, ss).to_numpy(float), nan=0.0)
            Cp = np.nan_to_num(components(p.loc[mp], mh, ss).to_numpy(float), nan=0.0)
            Se, Sp = 100 * (Ce @ W.T) / W.sum(axis=1), 100 * (Cp @ W.T) / W.sum(axis=1)
            for j, w in enumerate(weight_sets):
                a_s, a_r = ap(Se[:, j], ye), ap(Sp[:, j], yp)
                rows.append((hw, mh, ss, w, a_s, a_r, (a_s + a_r) / 2))
    grid = pd.DataFrame(rows, columns=["hist_weeks", "min_hist", "streak_saturation", "weights", "ap_synthetic_2019",
                                       "ap_real_2016_2017", "objective"])
    grid["n_used"] = grid.weights.map(lambda w: sum(1 for x in w if x))
    grid["total_weight"] = grid.weights.map(sum)
    best = grid.objective.max()
    near = grid[grid.objective >= best - CFG["AP_TOLERANCE"]]
    chosen = near.sort_values(["n_used", "total_weight", "objective"], ascending=[True, True, False], kind="mergesort").iloc[0]
    eq = grid[(grid.weights.map(lambda w: len(set(w)) == 1)) & (grid.hist_weeks == 52) & (grid.min_hist == 13) & (grid.streak_saturation == 4)]
    ref = lambda r: {"objective": float(r.objective), "ap_synthetic_2019": float(r.ap_synthetic_2019), "ap_real_2016_2017": float(r.ap_real_2016_2017)}
    info = {"grid_size": int(len(grid)), "best_objective": float(best), "n_within_tolerance": int(len(near)),
            "chosen": ref(chosen), "equal_weights": ref(eq.iloc[0]) if len(eq) else None,
            "synthetic_2019": {"positives": int(ye.sum()), "negatives": int((~ye).sum())},
            "real_2016_2017": {"positives": int(yp.sum()), "negatives": int((~yp).sum())}}
    return grid, {"hist_weeks": int(chosen.hist_weeks), "min_hist": int(chosen.min_hist),
                  "streak_saturation": int(chosen.streak_saturation),
                  "weights": dict(zip(COMPONENTS, [int(x) for x in chosen.weights])), "info": info}


def _iso_points(score: np.ndarray, y: np.ndarray) -> dict:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip").fit(score, y.astype(float))
    return {"x": [float(v) for v in iso.X_thresholds_], "y": [float(v) for v in iso.y_thresholds_]}


def fit(prod_feats: dict, prod_labels: pd.DataFrame, ev_feats: dict, ev_labels: pd.DataFrame) -> tuple[ZeroPriorityModel, pd.DataFrame]:
    grid, ch = grid_search(prod_feats, prod_labels, ev_feats, ev_labels)
    model = ZeroPriorityModel(hist_weeks=ch["hist_weeks"], min_hist=ch["min_hist"],
                              streak_saturation=ch["streak_saturation"], weights=ch["weights"])
    # Bands: false-alert rate on REAL 2019 normal zeros (production run), as Model A v2 counts its budget.
    p = label_frame(prod_feats[model.hist_weeks], prod_labels)
    neg19 = p.cand & (p.year == config.SPLIT["tune"]) & p.normal
    s_neg = model.score(p.loc[neg19])
    model.bands = {b: tune_high(s_neg, far) for b, far in CFG["BAND_FAR"].items()}
    # Calibration: isotonic on the 2019 tuning rows, prior-shifted to the real error share among zero reports.
    e = label_frame(ev_feats[model.hist_weeks], ev_labels)
    m = e.cand & (e.year == config.SPLIT["tune"]) & (e.is_inj | e.normal)
    s, y = model.score(e.loc[m]), e.loc[m, "is_inj"].to_numpy()
    train_share = float(y.mean())
    trn = p.cand & p.year.isin(range(config.SPLIT["train"][0], config.SPLIT["train"][1] + 1)) & (p.normal | p.is_swap)
    real_share = float(p.loc[trn, "is_swap"].mean())
    shift = (real_share / (1 - real_share)) / (train_share / (1 - train_share))
    rng = np.random.default_rng(config.SEED)
    boots = []
    for _ in range(CFG["PROB_BOOTSTRAP"]):
        i = rng.integers(0, len(s), len(s))
        if y[i].any() and (~y[i]).any():
            boots.append(_iso_points(s[i], y[i]))
    model.calibration = {**_iso_points(s, y), "prior_shift": shift, "train_share": train_share,
                         "real_share": real_share, "bootstrap": boots,
                         "method": "isotonic on the score (2019 tuning rows), prior-shifted to the real 2016-2018 share of swapped zeros"}
    model.meta = {"selection": ch["info"], "band_far": CFG["BAND_FAR"], "tuning_year": config.SPLIT["tune"],
                  "negatives_for_bands": int(neg19.sum())}
    return model, grid


def equal_weights(model: ZeroPriorityModel) -> np.ndarray:
    return np.ones(len(COMPONENTS))


def score_with(F: pd.DataFrame, model: ZeroPriorityModel, w: np.ndarray) -> np.ndarray:
    return weighted(components(F, model.min_hist, model.streak_saturation), w)


__all__ = ["fit", "grid_search", "ap", "build", "score_with", "equal_weights"]
