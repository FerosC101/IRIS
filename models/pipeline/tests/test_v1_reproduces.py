"""The package's port of Model A v1 must reproduce the published v1 scores.csv.

scores.csv stores 6 significant digits, so values must agree to a relative 1e-5 (a real difference in the
model would be orders of magnitude larger). Series are scored independently, so a subset of places is an exact test.
"""

import numpy as np
import pandas as pd
import pytest

from iris_pipeline import config
from iris_pipeline.model_a.run import run_weekly
from iris_pipeline.paths import V1_OUT_DIR

N_PLACES = 15


@pytest.fixture(scope="module")
def v1_scores():
    path = V1_OUT_DIR / "scores.csv"
    if not path.exists():
        pytest.skip("published v1 scores.csv not found")
    s = pd.read_csv(path, parse_dates=["period_start"])
    return s[(s.disease == "dengue") & (s.location_id != "PH")]


def test_v1_reproduces(inputs, v1_scores):
    places = sorted(inputs.X_dengue.location_id.unique())
    pick = places[:: max(1, len(places) // N_PLACES)][:N_PLACES]
    frame = inputs.X_dengue[inputs.X_dengue.location_id.isin(pick)]
    d, _ = run_weekly(frame, "location_id", inputs.cal, config.V1, config.options("v1"), workers=1)
    m = d.merge(v1_scores, left_on=["location_id", "week_start"], right_on=["location_id", "period_start"],
                suffixes=("", "_v1"), validate="one_to_one")
    assert len(m) == len(frame)
    for col in ("expected", "p_low", "pi_low", "pi_high"):
        a, b = m[col].to_numpy(float), m[col + "_v1"].to_numpy(float)
        assert (np.isnan(a) == np.isnan(b)).all(), f"{col}: scored rows differ"
        both = ~np.isnan(a)
        rel = np.abs(a[both] - b[both]) / np.maximum(np.abs(b[both]), 1e-12)
        assert rel.max() < 1e-5, f"{col}: max relative difference {rel.max():.2e}"
    assert (m.level.astype(str).radd("model_a_v1:") == m.model_version).all()
