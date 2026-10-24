"""Every score must use only earlier periods: changing the future must not change any past output."""

import numpy as np
import pytest

from iris_pipeline import config
from iris_pipeline.model_a.countmodel import CountModel, design


def _series(inputs, loc="NCR-QUEZON_CITY"):
    g = inputs.X_dengue[inputs.X_dengue.location_id == loc].sort_values("week_start").reset_index(drop=True)
    if g.empty:
        g = inputs.X_dengue[inputs.X_dengue.location_id == inputs.X_dengue.location_id.iloc[0]].reset_index(drop=True)
    y = np.where(g.report_status.eq("reported"), g.cases, np.nan).astype(float)
    hol = inputs.cal.set_index("week_start")[["holy_week", "christmas_newyear", "covid_period"]]
    h = hol.reindex(g.week_start).reset_index(drop=True)
    return y, h, g.week_start.dt.year.to_numpy()


@pytest.mark.parametrize("variant", ["v1", "recent1+uncertainty", "covid+uncertainty"])
@pytest.mark.parametrize("cut", [150, 203])  # mid refit block and block boundary
def test_future_does_not_change_past(inputs, variant, cut):
    y, h, years = _series(inputs)
    opts = config.options(variant)
    cols = ["holy_week", "christmas_newyear"] + (["covid_period"] if opts["covid_flag"] else [])
    X = design(len(y), config.V1["PERIODS_PER_YEAR"]["week"], h[cols])
    base = CountModel(config.V1, opts).score_series(y, X, "s", [], years=years)
    y2 = y.copy()
    rng = np.random.default_rng(0)
    y2[cut + 1:] = np.where(rng.random(len(y) - cut - 1) < 0.2, np.nan, y[cut + 1:] * 3 + 7)
    alt = CountModel(config.V1, opts).score_series(y2, X, "s", [], years=years)
    for col in ("expected", "pi_low", "pi_high", "p_low"):
        a, b = base[col].to_numpy(float)[: cut + 1], alt[col].to_numpy(float)[: cut + 1]
        assert np.array_equal(np.isnan(a), np.isnan(b)) and np.allclose(a[~np.isnan(a)], b[~np.isnan(b)], rtol=0, atol=0), col
    assert not np.allclose(np.nan_to_num(base.expected.to_numpy()[cut + 5:]), np.nan_to_num(alt.expected.to_numpy()[cut + 5:]))


def test_answer_key_wall():
    import pandas as pd

    from iris_pipeline.contract import assert_no_answer_key

    with pytest.raises(RuntimeError):
        assert_no_answer_key(pd.DataFrame({"cases": [1], "qa_flag": ["x"]}))
