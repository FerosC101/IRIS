"""Model A v2 evidence for every dengue location-week, on the real data and on the evaluation copy.

Uses the pipeline's own run_candidate (cached count-model fits), so these are exactly the Model A v2 scores the
rest of IRIS uses. Pooling (region Fisher, hub Stouffer) is rebuilt with the same rho estimate as v2.run_test.
Returns two frames: model columns only (safe as model input) and the labels, kept apart.
"""

from __future__ import annotations

import pandas as pd

from .. import config
from ..contract import assert_no_answer_key
from ..model_a.labels import ok_scored
from ..model_a.pooling import add_hub_pool, add_region_pool, estimate_rho
from ..model_a.select import run_candidate
from ..model_a.v2 import _hub

MODEL_COLS = ["location_id", "location", "region_id", "region", "hub_id", "week_start", "mw_year", "mw",
              "cases", "report_status", "expected", "pi_low", "pi_high", "p_low", "pooled_region_p", "hub_p"]
LABEL_COLS = ["location_id", "week_start", "qa_label", "qa_flag", "is_swap"]
EVAL_LABEL_COLS = LABEL_COLS + ["is_gap", "is_inj", "neg", "event_id", "scenario", "cases_true", "cases_injected"]


def model_a_evidence(inp, workers: int | None = None) -> dict:
    variant = config.MODEL_A_VARIANT
    lp, le = run_candidate(variant, inp, workers)
    lp, le = _hub(lp), _hub(le)
    normal = lp.week_start.dt.year.isin(config.V2["STOUFFER_RHO_YEARS"]) & ok_scored(lp)
    rho = estimate_rho(lp, "hub_id", "location_id", normal)
    lp = add_hub_pool(add_region_pool(lp), rho)
    le = add_hub_pool(add_region_pool(le), rho)
    out = {"variant": variant}
    for tag, d, labs in (("prod", lp, LABEL_COLS), ("eval", le, EVAL_LABEL_COLS)):
        d = d.sort_values(["location_id", "week_start"]).reset_index(drop=True)
        X = d[MODEL_COLS].copy()
        assert_no_answer_key(X, f"zero_priority {tag} evidence")
        out[tag] = X
        out[f"{tag}_labels"] = d[labs].copy()
    return out
