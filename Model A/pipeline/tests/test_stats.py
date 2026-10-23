"""Thresholds, calibration, pooling and metrics behave as documented."""

import numpy as np
import pandas as pd
from scipy import stats

from iris_pipeline.evaluation.metrics import auc, binary, evaluate
from iris_pipeline.model_a.calibrate import PFail, threshold_curve, tune_low, tune_tau_f1
from iris_pipeline.model_a.countmodel import CountModel, mid_p_low
from iris_pipeline.model_a.pooling import fisher, stouffer_corr
from iris_pipeline import config

RNG = np.random.default_rng(1)


def test_tune_tau_respects_budget():
    p_neg = RNG.uniform(size=5000)
    p_pos = RNG.uniform(size=300) ** 6
    tau, curve = tune_tau_f1(p_pos, p_neg, 0.01)
    assert (p_neg < tau).mean() <= 0.01 + 1e-12
    assert (curve.false_alert_rate <= 0.01 + 1e-12).all()
    assert tau <= tune_low(p_neg, 0.01)


def test_threshold_curve_counts():
    c = threshold_curve(np.array([0.001, 0.002, np.inf]), np.linspace(0.0005, 1, 1000), 0.01)
    last = c.iloc[-1]
    assert last.recall == 2 / 3


def test_pfail_monotone_and_prior_shift():
    p = np.concatenate([RNG.uniform(size=2000), RNG.uniform(size=200) ** 8])
    y = np.r_[np.zeros(2000), np.ones(200)]
    lo = PFail(train_share=y.mean(), real_share=0.01).fit(p, y)
    same = PFail(train_share=y.mean(), real_share=y.mean()).fit(p, y)
    grid = np.logspace(-10, 0, 50)
    a, b = lo.predict(grid), same.predict(grid)
    assert np.all(np.diff(a) <= 1e-12)  # smaller p_low -> higher p_fail
    assert np.all(a <= b + 1e-12)       # a rarer real failure rate lowers every probability
    assert np.isnan(lo.predict(np.array([np.nan]))[0])


def test_fisher_matches_scipy():
    p = RNG.uniform(size=7)
    d = pd.DataFrame({"g": 1, "w": 1, "p_low": p})
    got = fisher(d, ["g", "w"]).pooled_p.iloc[0]
    assert np.isclose(got, stats.combine_pvalues(p, method="fisher").pvalue)


def test_stouffer_rho_limits():
    p = RNG.uniform(size=6)
    d = pd.DataFrame({"hub_id": "H", "week_start": 1, "p_low": p})
    z = stats.norm.ppf(p)
    r0 = stouffer_corr(d, ["hub_id", "week_start"], pd.Series({"H": 0.0}), "hub_id").hub_p.iloc[0]
    r1 = stouffer_corr(d, ["hub_id", "week_start"], pd.Series({"H": 1.0}), "hub_id").hub_p.iloc[0]
    assert np.isclose(r0, stats.norm.cdf(z.sum() / np.sqrt(6)))
    assert np.isclose(r1, stats.norm.cdf(z.mean()))  # perfectly correlated places count as one witness


def test_metrics_basic():
    pos = np.array([1, 1, 0, 0, 0], bool)
    neg = ~pos
    m = binary(np.array([1, 0, 1, 0, 0], bool), pos, neg)
    assert (m["recall"], m["false_alert_rate"]) == (0.5, 1 / 3)
    assert auc(np.array([5, 4, 1, 2, 3.0]), pos, neg) == 1.0
    t = evaluate({"m": (np.array([5, 4, 1, 2, 3.0]), 3.5)}, pos, neg, np.array(["a", "a", "", "", ""]), np.arange(5))
    assert t.recall.iloc[0] == 1.0 and t.detection_rate.iloc[0] == 1.0


def test_uncertainty_widens_range():
    mu, a = 20.0, 0.1
    m = CountModel(config.V1, config.options("recent1+uncertainty"))
    a_eff = m._alpha_eff(a, np.array([0.2]))[0]
    assert a_eff > a
    # exact variance identity for an NB mean scaled by a mean-one lognormal
    assert np.isclose(mu + mu ** 2 * a_eff, mu + mu ** 2 * ((1 + a) * np.exp(0.2) - 1))
    assert mid_p_low(0, mu, a_eff) > mid_p_low(0, mu, a)
