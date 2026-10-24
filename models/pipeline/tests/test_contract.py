"""scores_v2.csv must pass the contract, and the validator must catch every class of breach."""

import pandas as pd
import pytest

from iris_pipeline.contract import SCORES_V2, ContractError, validate
from iris_pipeline.paths import MODEL_A_V2_DIR


def _good():
    return pd.DataFrame([
        {"disease": "dengue", "location_id": "R1-A", "region_id": "R1", "hub_id": "RESU-R1",
         "period_start": "2020-01-05", "resolution": "week", "cases": 3, "report_status": "reported",
         "expected": 5.0, "pi_low": 1.0, "pi_high": 10.0, "p_low": 0.2, "p_fail": 0.01, "flag": 0, "shortfall": 2.0,
         "pooled_region_p": 0.5, "hub_p": 0.4, "pooled_disease_p": None, "model_version": "model_a_v2:nb_full",
         "run_id": "r"},
        {"disease": "dengue", "location_id": "R1-A", "region_id": "R1", "hub_id": "RESU-R1",
         "period_start": "2020-01-12", "resolution": "week", "cases": None, "report_status": "missing",
         "expected": 5.0, "pi_low": 1.0, "pi_high": 10.0, "p_low": None, "p_fail": None, "flag": None,
         "shortfall": 5.0, "pooled_region_p": None, "hub_p": None, "pooled_disease_p": None,
         "model_version": "model_a_v2:nb_full", "run_id": "r"},
    ])[list(SCORES_V2)]


def test_good_frame_passes():
    validate(_good())


@pytest.mark.parametrize("breach", [
    lambda d: d.drop(columns="hub_id"),
    lambda d: d.assign(extra=1),
    lambda d: d.assign(p_low=[1.5, None]),
    lambda d: d.assign(flag=[None, None]),
    lambda d: d.assign(cases=[3, 4]),                    # cases on a missing row
    lambda d: d.assign(report_status=["reported", "late"]),
    lambda d: d.assign(pi_low=[20.0, 1.0]),
    lambda d: d.assign(shortfall=[-1.0, 5.0]),
    lambda d: d.assign(run_id=["a", "b"]),
    lambda d: d.assign(period_start=["2020-01-05", "2020-01-05"]),  # duplicate key
    lambda d: d.assign(disease=[None, "dengue"]),
])
def test_breaches_are_caught(breach):
    with pytest.raises(ContractError):
        validate(breach(_good()))


def test_published_scores_v2_pass():
    path = MODEL_A_V2_DIR / "scores_v2.csv"
    if not path.exists():
        pytest.skip("run `python -m iris_pipeline all` first")
    from iris_pipeline.model_a.v2 import read_scores

    s = read_scores(path)
    validate(s)
    dengue = s[(s.disease == "dengue") & (s.location_id != "PH")]
    assert dengue.hub_id.str.startswith("RESU-").all()
    assert dengue.location_id.nunique() == 126
