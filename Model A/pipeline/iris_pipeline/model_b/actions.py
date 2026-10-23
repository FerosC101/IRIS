"""Candidate corrective actions and their expected value (roadmap step 4.1).

Unit of value: failed facility-weeks avoided, i.e. weekly reports restored to complete ("recovered submissions").
For an action a and a facility f it covers:

    value(a, f) = success(a) * P(f is failing because of a's target) * expected weeks the failure would still last

- facility action: P = p_fail(f) * (1 - P(f's hub or lab is the cause))
- hub / lab action: P = P(source failed), the same for every facility behind it (the shared-source bonus: one
  action covers all of them)
- call RESU: covers every facility of every suspect hub in the region, with that hub's probability
Failures are geometric in duration, so the expected weeks left equal the mean duration whatever the age.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..config import ACTIONS, PLAN, SIM

SOURCE_LEVEL = {"fix_hub", "fix_lab", "call_resu"}


@dataclass
class Action:
    action: str
    target: str
    hours: float
    cost: float
    success: float
    covers: np.ndarray          # facility row indices
    coef: np.ndarray            # value per covered facility (already includes success probability)

    @property
    def value(self) -> float:
        return float(self.coef.sum())


def make(action: str, target: str, units: int, covers, prob) -> Action:
    a = ACTIONS[action]
    kind = {"call_facility": "isolated", "visit_facility": "isolated", "fix_hub": "hub", "fix_lab": "lab",
            "call_resu": "hub"}[action]
    hours = round((a["base_hours"] + a["hours_per_unit"] * units) * 2) / 2  # half-hour resolution, as IRIS
    coef = a["success"] * np.asarray(prob, float) * SIM["MEAN_WEEKS"][kind]
    return Action(action, target, hours, float(a["cost_php"]), a["success"], np.asarray(covers, int), coef)


def candidates(ctx: dict, facility=True, sources=True, kinds=("call_facility", "visit_facility")) -> list[Action]:
    world, src = ctx["world"], ctx["src"]
    fac = world.facilities
    pf = np.nan_to_num(ctx["p_fail"], nan=0.0)
    P = np.nan_to_num(ctx["P_src"], nan=0.0)
    p_hub, p_lab = P[src.hub_of], P[src.lab_of]
    p_shared = 1 - (1 - p_hub) * (1 - p_lab) if sources else np.zeros_like(pf)
    out: list[Action] = []
    if facility:
        own = pf * (1 - p_shared)
        idx = np.flatnonzero(own >= PLAN["MIN_PROB"])
        idx = idx[np.argsort(-own[idx])][: PLAN["MAX_FACILITY_CANDIDATES"]]
        for i in idx:
            for k in kinds:
                out.append(make(k, fac.facility_id.iat[i], 1, [i], [own[i]]))
    if sources:
        for s in np.flatnonzero((P >= PLAN["MIN_PROB"]) & np.isin(src.types, ["hub", "lab"])):
            mem = np.flatnonzero(src.A[s] > 0)
            act = "fix_hub" if src.types[s] == "hub" else "fix_lab"
            out.append(make(act, src.ids[s], len(mem), mem, np.full(len(mem), P[s])))
        hubs = np.flatnonzero((P >= PLAN["MIN_PROB"]) & (src.types == "hub"))
        regions: dict[str, list[int]] = {}
        for s in hubs:
            reg = fac.region_id.to_numpy()[src.A[s] > 0][0]
            regions.setdefault(reg, []).append(s)
        for reg, hs in regions.items():
            n_hubs = int(fac[fac.region_id == reg].hub_id.nunique())
            mem = np.concatenate([np.flatnonzero(src.A[s] > 0) for s in hs])
            prob = np.concatenate([np.full(int(src.A[s].sum()), P[s]) for s in hs])
            out.append(make("call_resu", f"RESU-{reg}", n_hubs, mem, prob))
    return out
