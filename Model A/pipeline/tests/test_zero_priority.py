"""Model B · zero-report prioritizer: unit tests (no data needed) and integration tests (repo data)."""

import numpy as np
import pandas as pd
import pytest

from iris_pipeline.zero_priority.features import build, candidates
from iris_pipeline.zero_priority.score import COMPONENTS, ZeroPriorityModel, components, weighted


def _cal(weeks):
    return pd.DataFrame({"week_start": weeks, "covid_period": False, "holy_week": False, "christmas_newyear": False,
                         "mw_year": [w.year for w in weeks], "mw": range(1, len(weeks) + 1)})


def _frame(cases_by_loc, region="R1"):
    weeks = pd.date_range("2018-01-07", periods=len(next(iter(cases_by_loc.values()))), freq="7D")
    rows = []
    for loc, cases in cases_by_loc.items():
        for w, c in zip(weeks, cases):
            rows.append({"location_id": loc, "location": loc, "region_id": region, "region": region, "hub_id": "RESU-" + region,
                         "week_start": w, "mw_year": w.year, "mw": 1, "cases": c,
                         "report_status": "missing" if c is None or (isinstance(c, float) and np.isnan(c)) else "reported",
                         "expected": 10.0, "pi_low": 2.0, "pi_high": 20.0, "p_low": 0.01, "pooled_region_p": 0.5, "hub_p": 0.5})
    X = pd.DataFrame(rows)
    X["cases"] = pd.to_numeric(X.cases)
    return X, _cal(list(weeks))


def _model(weights=None):
    w = weights or {k: 1 for k in COMPONENTS}
    return ZeroPriorityModel(hist_weeks=26, min_hist=4, streak_saturation=4, weights=w, bands={"High": 60.0, "Medium": 30.0},
                             calibration={"x": [0.0, 100.0], "y": [0.1, 0.9], "prior_shift": 1.0, "bootstrap": []},
                             meta={"model_version": "test"})


def test_features_use_past_weeks_only():
    base = [10.0] * 30 + [0.0] + [10.0] * 9
    X, cal = _frame({"A": base, "B": [5.0] * 40})
    later = base[:31] + [500.0] * 9  # change only weeks after the zero
    X2, _ = _frame({"A": later, "B": [5.0] * 40})
    cols = ["zero_streak", "n_hist", "hist_zero_share", "recent_median", "last_nonzero", "on_off_flips", "season_mean"]
    a = build(X, cal).query("location_id == 'A'").iloc[:31][cols]
    b = build(X2, cal).query("location_id == 'A'").iloc[:31][cols]
    pd.testing.assert_frame_equal(a.reset_index(drop=True), b.reset_index(drop=True))


def test_missing_week_is_never_a_zero_and_breaks_the_streak():
    X, cal = _frame({"A": [8.0] * 10 + [0.0, 0.0, np.nan, 0.0] + [8.0] * 4, "B": [5.0] * 18})
    F = build(X, cal).query("location_id == 'A'").reset_index(drop=True)
    assert not candidates(F).iloc[12]                    # missing
    assert list(F.zero_streak.iloc[10:14]) == [1, 2, 0, 1]  # streak broken by the missing week
    assert candidates(F).iloc[10] and candidates(F).iloc[13]


def test_regional_share_excludes_the_location_itself():
    X, cal = _frame({"A": [0.0] * 6, "B": [0.0] * 6, "C": [3.0] * 6})
    F = build(X, cal)
    a = F[(F.location_id == "A")].iloc[-1]
    c = F[(F.location_id == "C")].iloc[-1]
    assert a.region_other_zero_share == pytest.approx(0.5) and c.region_other_zero_share == pytest.approx(1.0)


def test_components_are_bounded_and_unused_weights_ignored():
    X, cal = _frame({"A": [20.0] * 20 + [0.0] * 5, "B": [1.0] * 25})
    F = build(X, cal)
    C = components(F, 4, 4)
    assert ((C.fillna(0) >= 0) & (C.fillna(0) <= 1)).all().all()
    only = {k: 0 for k in COMPONENTS} | {"streak": 1}
    s = weighted(C, np.array([only[k] for k in COMPONENTS], float))
    np.testing.assert_allclose(s, 100 * C.streak.fillna(0).to_numpy())


def test_model_json_round_trip_and_bands():
    m = _model()
    m2 = ZeroPriorityModel.from_json(m.to_json())
    assert m2 == m
    assert list(m.band(np.array([10, 45, 80]))) == ["Low", "Medium", "High"]
    p, lo, hi = m.probability(np.array([0.0, 50.0, 100.0]))
    assert np.all(np.diff(p) >= 0) and np.all(lo <= p + 1e-12) and np.all(hi >= p - 1e-12)
    assert p.max() <= 0.99 and p.min() >= 0.01  # never shown as certain


def test_rank_alerts_orders_zeros_and_returns_missing_unranked():
    from iris_pipeline.zero_priority.api import rank_alerts
    X, cal = _frame({"A": [30.0] * 30 + [0.0], "B": [1.0] * 30 + [0.0], "C": [10.0] * 30 + [np.nan]})
    last = X.week_start.max()
    out = rank_alerts(X, _model(), cal, week_start=last)
    zeros = out[out.priority_score.notna()]
    assert list(zeros.rank_in_week) == list(range(1, len(zeros) + 1))
    assert zeros.priority_score.is_monotonic_decreasing
    assert (out.loc[out.location_id == "C", "priority"] == "Missing report (not ranked)").all()
    assert zeros.explanation.str.len().gt(0).all() and zeros.verification_steps.str.contains("surveillance officer").all()
    assert zeros.data_warnings.str.contains("cannot be determined").all()


def test_rank_alerts_refuses_answer_key_columns():
    from iris_pipeline.zero_priority.api import rank_alerts
    X, cal = _frame({"A": [3.0] * 10, "B": [0.0] * 10})
    with pytest.raises(RuntimeError):
        rank_alerts(X.assign(qa_label="ok"), _model(), cal)


# ---- integration (repo data: data/surveillance.csv, shared files, Model A v2 outputs) ----------------------

@pytest.fixture(scope="module")
def dengue():
    from iris_pipeline.paths import DATA_DIR
    if not (DATA_DIR / "surveillance.csv").exists():
        pytest.skip("data/surveillance.csv not present")
    from iris_pipeline.zero_priority.inputs import load_dengue
    return load_dengue()


def test_dengue_inputs_pass_the_cleaning_plan_checks(dengue):
    assert len(dengue.X_dengue) == 33012
    assert "qa_label" not in dengue.X_dengue and "qa_flag" not in dengue.X_dengue


def test_rank_alerts_from_the_model_a_contract(dengue):
    from iris_pipeline.paths import MODEL_A_V2_DIR
    from iris_pipeline.zero_priority.api import ZP_DIR, load_model, prepare_history, rank_alerts
    if not (ZP_DIR / "model.json").exists():
        pytest.skip("run `python -m iris_pipeline zero-priority` first")
    sc = pd.read_csv(MODEL_A_V2_DIR / "scores_v2.csv", keep_default_na=False, na_values=[""], low_memory=False)
    hist = prepare_history(sc, dengue.cal, dengue.locs)
    out = rank_alerts(hist, load_model(), dengue.cal, week_start="2020-12-27")
    z = out[out.priority_score.notna()]
    assert len(z) > 0 and set(z.priority) <= {"High", "Medium", "Low"}
    assert (z.cases == 0).all()
