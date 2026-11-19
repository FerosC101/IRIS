"""Tuning on 2016-2019 only: grid search, the pre-registered selection rule, priority bands and calibration.

v2 grid: local weights (0/1/2 for each local component) x regional route on/off x the region's baseline window x how the
two routes combine (mean / max / noisy-OR), plus the v1 history window, minimum history and streak criterion."""

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
from .score import LOCAL, ZeroPriorityModel, components

CFG = config.ZERO_PRIORITY


def ap(score: np.ndarray, y: np.ndarray) -> float:
    s = np.nan_to_num(np.asarray(score, float), nan=-1e9)
    return float(average_precision_score(np.asarray(y, bool), s)) if y.any() and (~y).any() else np.nan


def grid_search(prod_feats: dict, prod_labels: pd.DataFrame, ev_feats: dict, ev_labels: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Every grid setting scored on synthetic 2019 and real 2016-2017 (both pre-test). Returns the grid and the choice."""
    g = CFG["GRID"]
    W = np.array(list(itertools.product(g["weights"], repeat=len(LOCAL))), float)  # includes all-zero (regional only)
    wsum = W.sum(axis=1)
    rows = []
    for hw in g["hist_weeks"]:
        e = label_frame(ev_feats[hw], ev_labels)
        me = e.cand & (e.year == config.SPLIT["tune"]) & (e.is_inj | e.normal)
        ye = e.loc[me, "is_inj"].to_numpy()
        p = label_frame(prod_feats[hw], prod_labels)
        mp = p.cand & p.year.isin(CFG["TUNING_REAL_YEARS"]) & (p.is_swap | p.normal)
        yp = p.loc[mp, "is_swap"].to_numpy()
        for mh, ss in itertools.product(g["min_hist"], g["streak_saturation"]):
            Ce = components(e.loc[me], mh, ss)
            Cp = components(p.loc[mp], mh, ss)
            # Weighted sums of the local components for every weight row; the local route is their mean.
            Ue = np.nan_to_num(Ce[LOCAL].to_numpy(float), nan=0.0) @ W.T
            Up = np.nan_to_num(Cp[LOCAL].to_numpy(float), nan=0.0) @ W.T
            Le, Lp = 100 * Ue / np.where(wsum > 0, wsum, 1), 100 * Up / np.where(wsum > 0, wsum, 1)
            # Regional route off: the base window and the combination do not matter, so it is scored once.
            settings = [(None, 0, "mean", Le, Lp)]
            for k in g["region_base_weeks"]:
                Re = np.nan_to_num(components(e.loc[me], mh, ss, k)["regional_excess"].to_numpy(float), nan=0.0)[:, None]
                Rp = np.nan_to_num(components(p.loc[mp], mh, ss, k)["regional_excess"].to_numpy(float), nan=0.0)[:, None]
                for agg in g["aggregation"]:
                    if agg == "mean":   # regional component weighted 1 next to the local weights
                        Se, Sp = 100 * (Ue + Re) / (wsum + 1), 100 * (Up + Rp) / (wsum + 1)
                    elif agg == "max":
                        Se, Sp = np.maximum(Le, 100 * Re), np.maximum(Lp, 100 * Rp)
                    else:               # noisy-OR
                        Se, Sp = 100 - (100 - Le) * (1 - Re), 100 - (100 - Lp) * (1 - Rp)
                    settings.append((k, 1, agg, Se, Sp))
            for k, route, agg, Se, Sp in settings:
                for j, w in enumerate(W):
                    if route == 0 and wsum[j] == 0:
                        continue
                    a_s, a_r = ap(Se[:, j], ye), ap(Sp[:, j], yp)
                    rows.append((hw, mh, ss, k, route, agg, tuple(int(x) for x in w), a_s, a_r, (a_s + a_r) / 2))
    grid = pd.DataFrame(rows, columns=["hist_weeks", "min_hist", "streak_saturation", "region_base_weeks", "regional_route",
                                       "aggregation", "weights", "ap_synthetic_2019", "ap_real_2016_2017", "objective"])
    grid["n_used"] = grid.weights.map(lambda w: sum(1 for x in w if x)) + grid.regional_route
    grid["total_weight"] = grid.weights.map(sum) + grid.regional_route
    best = grid.objective.max()
    near = grid[grid.objective >= best - CFG["AP_TOLERANCE"]]
    # Pre-registered rule (unchanged from v1): fewest components, then smallest total weight, then highest objective;
    # remaining ties keep grid order (shorter windows first; mean, then max, then noisy-OR).
    chosen = near.sort_values(["n_used", "total_weight", "objective"], ascending=[True, True, False], kind="mergesort").iloc[0]
    eq = grid[(grid.weights.map(lambda w: len(set(w)) == 1 and w[0] == 1)) & (grid.regional_route == 1) & (grid.hist_weeks == 52)
              & (grid.min_hist == 13) & (grid.streak_saturation == 4) & (grid.region_base_weeks == 8) & (grid.aggregation == "mean")]
    ref = lambda r: {"objective": float(r.objective), "ap_synthetic_2019": float(r.ap_synthetic_2019), "ap_real_2016_2017": float(r.ap_real_2016_2017)}
    by_agg = grid[grid.regional_route == 1].groupby("aggregation").objective.max()
    info = {"grid_size": int(len(grid)), "best_objective": float(best), "n_within_tolerance": int(len(near)),
            "best_objective_by_aggregation": {str(k): float(v) for k, v in by_agg.items()},
            "chosen": ref(chosen), "equal_weights": ref(eq.iloc[0]) if len(eq) else None,
            "synthetic_2019": {"positives": int(ye.sum()), "negatives": int((~ye).sum())},
            "real_2016_2017": {"positives": int(yp.sum()), "negatives": int((~yp).sum())}}
    weights = dict(zip(LOCAL, [int(x) for x in chosen.weights])) | {CFG["REGIONAL_COMPONENT"]: int(chosen.regional_route)}
    k = chosen.region_base_weeks
    return grid, {"hist_weeks": int(chosen.hist_weeks), "min_hist": int(chosen.min_hist),
                  "streak_saturation": int(chosen.streak_saturation), "weights": weights,
                  "region_base_weeks": None if pd.isna(k) else int(k), "aggregation": str(chosen.aggregation), "info": info}


def _iso_points(score: np.ndarray, y: np.ndarray) -> dict:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip").fit(score, y.astype(float))
    return {"x": [float(v) for v in iso.X_thresholds_], "y": [float(v) for v in iso.y_thresholds_]}


def fit(prod_feats: dict, prod_labels: pd.DataFrame, ev_feats: dict, ev_labels: pd.DataFrame) -> tuple[ZeroPriorityModel, pd.DataFrame]:
    grid, ch = grid_search(prod_feats, prod_labels, ev_feats, ev_labels)
    model = ZeroPriorityModel(hist_weeks=ch["hist_weeks"], min_hist=ch["min_hist"], streak_saturation=ch["streak_saturation"],
                              weights=ch["weights"], region_base_weeks=ch["region_base_weeks"], aggregation=ch["aggregation"],
                              regional_component=CFG["REGIONAL_COMPONENT"])
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


def variant(model: ZeroPriorityModel, **changes) -> ZeroPriorityModel:
    """A copy of the model with some settings changed (references and ablations; bands and calibration not reused)."""
    d = {**model.__dict__, "bands": dict(model.bands), "calibration": {}, "meta": {}}
    return ZeroPriorityModel(**{**d, **changes})


def equal_weights(model: ZeroPriorityModel) -> ZeroPriorityModel:
    """Untuned reference: every local component weight 1, regional route on, same windows."""
    return variant(model, weights={k: 1 for k in LOCAL} | {CFG["REGIONAL_COMPONENT"]: 1},
                   region_base_weeks=model.region_base_weeks or CFG["GRID"]["region_base_weeks"][1])


__all__ = ["fit", "grid_search", "ap", "build", "variant", "equal_weights"]
