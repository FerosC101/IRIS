"""Public entry point: rank candidate zero-report alerts for a surveillance team.

Typical use with Model A's contract file:

    from iris_pipeline.zero_priority.api import load_model, prepare_history, rank_alerts
    model = load_model()                                   # outputs/zero_priority/model.json
    hist = prepare_history(pd.read_csv("outputs/model_a_v2/scores_v2.csv"), cal, locs)
    ranked = rank_alerts(hist, model, week_start="2020-12-27")

`history` must contain the candidate weeks and the weeks before them (the indicators look back up to two years).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..contract import assert_no_answer_key
from ..paths import OUT_DIR
from .features import build, candidates
from .score import COMPONENTS, ZeroPriorityModel, data_sufficiency, explain

ZP_DIR = OUT_DIR / "zero_priority"

OUTPUT_COLUMNS = ["week_start", "mw_year", "mw", "location_id", "location", "region_id", "region", "report_status",
                  "cases", "expected", "p_low", "model_a_flag", "priority_score", "priority", "rank_in_week",
                  "p_priority", "p_priority_low", "p_priority_high", "data_sufficiency", "top_indicators",
                  "explanation", "data_warnings", "verification_steps"] + [f"c_{k}" for k in COMPONENTS] + ["model_version"]


def load_model(path=None) -> ZeroPriorityModel:
    return ZeroPriorityModel.from_json((path or ZP_DIR / "model.json").read_text(encoding="utf-8"))


def prepare_history(scores: pd.DataFrame, cal: pd.DataFrame, locs: pd.DataFrame, tau: float | None = None) -> pd.DataFrame:
    """Turn scores_v2.csv rows (the Model A contract) into the frame the indicators are built from."""
    s = scores[(scores.disease == "dengue") & (scores.location_id != "PH")].copy()
    s["week_start"] = pd.to_datetime(s.period_start)
    s = s.merge(cal[["week_start", "mw_year", "mw"]], on="week_start", how="left", validate="many_to_one")
    s = s.merge(locs[["location_id", "location", "region"]], on="location_id", how="left", validate="many_to_one")
    cols = ["location_id", "location", "region_id", "region", "hub_id", "week_start", "mw_year", "mw", "cases",
            "report_status", "expected", "pi_low", "pi_high", "p_low", "pooled_region_p", "hub_p"]
    out = s[cols].sort_values(["location_id", "week_start"]).reset_index(drop=True)
    if tau is not None:
        out.attrs["tau"] = tau
    return out


def rank_alerts(history: pd.DataFrame, model: ZeroPriorityModel, cal: pd.DataFrame | None = None,
                week_start=None, candidates_df: pd.DataFrame | None = None, tau: float | None = None) -> pd.DataFrame:
    """Ranked investigation list for the zero reports in `week_start` (or in `candidates_df`'s location-weeks).

    Missing reports in the candidate list are returned last with priority 'Missing report (not ranked)': they are
    certain gaps for the planner, not zeros to verify.
    """
    assert_no_answer_key(history, "rank_alerts history")
    if cal is None:
        from .inputs import load_dengue
        cal = load_dengue(check=False).cal
    F = build(history, cal, model.hist_weeks)
    if candidates_df is not None:
        keys = candidates_df[["location_id", "week_start"]].assign(week_start=lambda x: pd.to_datetime(x.week_start))
        pick = F.merge(keys.assign(_c=1), on=["location_id", "week_start"], how="left")["_c"].eq(1).to_numpy()
    elif week_start is not None:
        pick = (F.week_start == pd.Timestamp(week_start)).to_numpy()
    else:
        pick = np.ones(len(F), bool)
    sel = F[pick].copy()
    zero = candidates(sel)
    Z = sel[zero].copy()
    c = model.components(Z)
    Z["priority_score"] = model.score(Z)
    Z["priority"] = model.band(Z.priority_score)
    Z["p_priority"], Z["p_priority_low"], Z["p_priority_high"] = model.probability(Z.priority_score.to_numpy())
    Z["data_sufficiency"] = data_sufficiency(Z, model.min_hist)
    tau = tau if tau is not None else history.attrs.get("tau")
    Z["model_a_flag"] = (Z.p_low < tau).astype("Int64").where(Z.p_low.notna()) if tau is not None else pd.NA
    Z = pd.concat([Z, explain(model, Z, c)], axis=1)
    for k in COMPONENTS:
        Z[f"c_{k}"] = c[k]
    Z = Z.sort_values(["week_start", "priority_score"], ascending=[True, False])
    Z["rank_in_week"] = Z.groupby("week_start").cumcount() + 1
    M = sel[sel.report_status.eq("missing")].copy()
    if len(M):
        M["priority"] = "Missing report (not ranked)"
        M["explanation"] = "No report was received for this week. This is a certain reporting gap; route it to the planner."
        M["data_warnings"] = "Missing is not the same as zero: no count was submitted."
        M["verification_steps"] = "Ask the province/city surveillance officer why the week's report was not submitted."
    out = pd.concat([Z, M], ignore_index=True)
    out["model_version"] = model.meta.get("model_version", "zero_priority_v1")
    for col in OUTPUT_COLUMNS:
        if col not in out:
            out[col] = pd.NA
    return out[OUTPUT_COLUMNS]
