"""Supervised comparison: gradient boosting on the real swap labels (an experiment, not the deployed model).

The only real labels for zero reports are the swapped cases/deaths rows (2016: 196, 2017: 174, 2018-2019: none).
They mark one specific source error, so a model trained on them learns that pattern, not reporting failures in
general. Forward chaining keeps time order: fit on 2016, choose hyperparameters on 2017 (average precision), refit on
2016-2018 (2018 adds negatives only), and score 2020 once. Deaths are not an input (the clean data does not carry
them), so the swap cannot be read off directly.
"""

from __future__ import annotations

import itertools

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from .. import config
from .tune import ap

FEATURES = ["neg_log10_p_low", "expected", "pi_high", "hub_p", "hist_zero_share", "n_hist", "zero_streak",
            "recent_median", "last_nonzero", "on_off_flips", "season_mean", "region_other_zero_share",
            "region_other_missing_share", "covid_period", "holy_week", "christmas_newyear"]


def matrix(d: pd.DataFrame) -> pd.DataFrame:
    X = d.assign(neg_log10_p_low=-np.log10(np.clip(d.p_low.astype(float), 1e-300, 1)))[FEATURES].astype(float)
    return X


def fit_select(prod: pd.DataFrame) -> tuple[HistGradientBoostingClassifier, dict]:
    usable = prod.cand & (prod.is_swap | prod.normal)
    tr, va = usable & (prod.year == 2016), usable & (prod.year == 2017)
    grid = config.ZERO_PRIORITY["GBM_GRID"]
    keys = list(grid)
    results = []
    for vals in itertools.product(*grid.values()):
        params = dict(zip(keys, vals))
        clf = HistGradientBoostingClassifier(random_state=config.SEED, **params)
        clf.fit(matrix(prod[tr]), prod.loc[tr, "is_swap"])
        results.append((params, ap(clf.predict_proba(matrix(prod[va]))[:, 1], prod.loc[va, "is_swap"].to_numpy())))
    best_params, best_ap = max(results, key=lambda r: r[1])
    final = usable & prod.year.isin(range(config.SPLIT["train"][0], config.SPLIT["train"][1] + 1))
    clf = HistGradientBoostingClassifier(random_state=config.SEED, **best_params)
    clf.fit(matrix(prod[final]), prod.loc[final, "is_swap"])
    return clf, {"chosen": {k: (v if v is not None else "none") for k, v in best_params.items()},
                 "validation_ap_2017": best_ap, "grid_size": len(results),
                 "train_rows": int(final.sum()), "train_positives": int(prod.loc[final, "is_swap"].sum())}


def predict(clf: HistGradientBoostingClassifier, d: pd.DataFrame) -> np.ndarray:
    return clf.predict_proba(matrix(d))[:, 1]
