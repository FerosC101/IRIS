"""A weekly action plan for the real 2020 dengue alerts (roadmap step 4, real-data demonstration).

Real data has no facility or hub table, so a location (province / city) plays the facility and its region's RESU
plays the hub. Value is in cases: success x P(the cause is here) x shortfall (cases likely missing).
- call location: P = p_fail x (1 - P_region). A report that was due but never arrived (report_status = missing)
  is a reporting gap for certain: P = 1 x (1 - P_region), and its shortfall is the whole expected count.
- call RESU: P = P_region for each location of the region. P_region is the larger of (a) the probability that the
  region-week holds a real reporting failure, from hub_p by isotonic regression on 2016-2018 real labels, and
  (b) the share of the region's locations whose report is missing, when at least MIN_MISSING_FOR_REGION are:
  many places going silent the same week points to a shared cause.
The plan is a list of leads to verify, not a validated intervention.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from ..config import ACTIONS, PLAN
from ..data import Inputs, fl
from ..model_a.calibrate import PFail
from ..paths import MODEL_A_V2_DIR
from .actions import Action
from .optimizer import solve

MIN_MISSING_FOR_REGION = 3


def _action(kind: str, target: str, units: int, covers, coef) -> Action:
    a = ACTIONS[kind]
    hours = round((a["base_hours"] + a["hours_per_unit"] * units) * 2) / 2
    return Action(kind if kind != "call_facility" else "call_location", target, hours, float(a["cost_php"]),
                  a["success"], np.asarray(covers, int), a["success"] * np.asarray(coef, float))


def region_calibrator(d: pd.DataFrame, Y: pd.DataFrame) -> PFail:
    lab = d.merge(Y, left_on=["location_id", "period_start"], right_on=["location_id", "week_start"], how="left")
    lab["bad"] = fl(lab, "swap_cases_deaths") | fl(lab, "regional_gap")
    rw = lab.groupby(["region_id", "period_start"]).agg(hub_p=("hub_p", "first"), bad=("bad", "any")).reset_index()
    tr = rw[rw.period_start.dt.year.isin([2016, 2017, 2018]) & rw.hub_p.notna()]
    s = float(tr.bad.mean())
    return PFail(s, s).fit(tr.hub_p, tr.bad)


def week_candidates(g: pd.DataFrame, cal: PFail) -> tuple[pd.DataFrame, list[Action]]:
    """One week's candidate actions. g: that week's dengue province rows of scores_v2."""
    g = g.reset_index(drop=True).copy()
    missing = g.report_status.eq("missing")
    hub_p = g.groupby("region_id").hub_p.first()
    P_reg = pd.Series(np.nan_to_num(cal.predict(hub_p.to_numpy()), nan=0.0), index=hub_p.index)
    miss = missing.groupby(g.region_id).agg(["sum", "size"])
    share = (miss["sum"] / miss["size"]).where(miss["sum"] >= MIN_MISSING_FOR_REGION, 0.0)
    P_reg = np.maximum(P_reg, share.reindex(P_reg.index).fillna(0.0))
    g["P_region"] = g.region_id.map(P_reg).fillna(0.0)
    pf = np.where(missing, 1.0, g.p_fail.fillna(0.0).to_numpy())
    sf = g.shortfall.fillna(0.0).to_numpy()
    acts = []
    own = pf * (1 - g.P_region.to_numpy())
    for i in np.flatnonzero((own >= PLAN["MIN_PROB"]) & (sf > 0)):
        acts.append(_action("call_facility", g.location_id[i], 1, [i], [own[i] * sf[i]]))
    for reg, p in P_reg.items():
        if p >= PLAN["MIN_PROB"]:
            mem = np.flatnonzero(g.region_id.to_numpy() == reg)
            acts.append(_action("call_resu", f"RESU-{reg}", len(mem), mem, p * sf[mem]))
    return g, acts


def plan_rows(g: pd.DataFrame, acts: list[Action], chosen: list[int], run_id: str) -> list[dict]:
    rows = []
    for i in chosen:
        a = acts[i]
        mem = g.iloc[a.covers]
        rows.append({"week_start": g.period_start.iloc[0].date(), "action": a.action, "target": a.target,
                     "region_id": mem.region_id.iloc[0], "hours": a.hours,
                     "expected_cases_recovered": round(a.value, 2),
                     "locations": ";".join(mem.location_id), "missing_reports": int(mem.report_status.eq("missing").sum()),
                     "reported_cases": int(mem.cases.fillna(0).sum()),
                     "expected_cases": round(float(mem.expected.sum()), 1),
                     "shortfall": round(float(mem.shortfall.fillna(0).sum()), 1),
                     "p_fail_max": round(float(mem.p_fail.max()), 4) if mem.p_fail.notna().any() else None,
                     "hub_p": round(float(mem.hub_p.iloc[0]), 6) if pd.notna(mem.hub_p.iloc[0]) else None,
                     "P_region": round(float(mem.P_region.iloc[0]), 4),
                     "status": "lead to verify", "run_id": run_id})
    return sorted(rows, key=lambda r: -r["expected_cases_recovered"])


def dengue_rows(scores_v2: pd.DataFrame) -> pd.DataFrame:
    d = scores_v2[(scores_v2.disease == "dengue") & (scores_v2.location_id != "PH")].copy()
    d["period_start"] = pd.to_datetime(d.period_start)
    return d


def plan(inp: Inputs, scores_v2: pd.DataFrame, hours: float | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    hours = hours or PLAN["STAFF_HOURS_PER_WEEK"]
    d = dengue_rows(scores_v2)
    cal = region_calibrator(d, inp.Y_dengue)
    run_id = json.loads((MODEL_A_V2_DIR / "config.json").read_text(encoding="utf-8"))["run_id"]
    rows, weekly = [], []
    for wk, g0 in d[d.period_start.dt.year == 2020].groupby("period_start"):
        g, acts = week_candidates(g0, cal)
        chosen, obj = solve(acts, hours, PLAN["COST_PHP_PER_WEEK"])
        rows += plan_rows(g, acts, chosen, run_id)
        weekly.append({"week_start": wk.date(), "candidates": len(acts), "actions": len(chosen),
                       "hours_used": float(sum(acts[i].hours for i in chosen)), "expected_cases_recovered": round(obj, 2)})
    return pd.DataFrame(rows), pd.DataFrame(weekly)
