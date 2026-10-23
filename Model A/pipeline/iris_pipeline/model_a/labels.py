"""Join the answer key onto scored frames for evaluation only (after the model has run)."""

from __future__ import annotations

import pandas as pd

from ..data import Inputs, dengue_injections, fl


def lab_prod(d: pd.DataFrame, inp: Inputs) -> pd.DataFrame:
    lab = d.merge(inp.Y_dengue, on=["location_id", "week_start"], how="left", validate="one_to_one")
    lab["is_swap"] = fl(lab, "swap_cases_deaths")
    return lab


def lab_eval(d: pd.DataFrame, inp: Inputs) -> pd.DataFrame:
    lab = d.merge(inp.Y_dengue, on=["location_id", "week_start"], how="left", validate="one_to_one")
    inj = dengue_injections(inp)
    lab = lab.merge(inj[["location_id", "week_start", "event_id", "scenario", "cases_true", "cases_injected"]],
                    on=["location_id", "week_start"], how="left", validate="one_to_one")
    lab["is_gap"] = fl(lab, "regional_gap")
    lab["is_swap"] = fl(lab, "swap_cases_deaths")
    lab["is_inj"] = lab.event_id.notna() & (lab.cases_injected != lab.cases_true)
    lab["neg"] = (lab.qa_label == "ok") & lab.event_id.isna() & lab.p_low.notna()
    return lab


def ok_scored(lab: pd.DataFrame) -> pd.Series:
    return (lab.qa_label == "ok") & lab.p_low.notna()
