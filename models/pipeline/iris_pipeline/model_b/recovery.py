"""Rolling weekly recovery simulation (roadmap step 4.3).

Every week of the simulated year: reports arrive -> Model A scores every facility (online) -> shared-source
tests -> calibrated probabilities -> the policy picks actions within the week's staff hours and budget -> each
action succeeds with its probability (common random numbers) -> a correct, successful action ends its failure
from the next week. Each policy sees the same failures, the same facility noise and the same luck.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config
from ..network.ablation import mean_ci
from ..network.build import World
from ..network.scorer import FacilityModels
from ..network.simulate import Simulation, draw_events
from ..network.sources import Sources
from .actions import SOURCE_LEVEL
from .policies import FUNCS, LABEL, OldBScorer


def run_policy(world: World, fm: FacilityModels, src: Sources, tuned: dict, year: int, seed: int, policy: str,
               hours: float, cost: float, old_b: OldBScorer) -> tuple[dict, list[dict]]:
    events = draw_events(world, year, seed)
    sim = Simulation(world, year, events, seed)
    st = fm.new_state()
    fac_ids = world.facilities.facility_id.to_numpy()
    hist = world.true[:, max(0, fm.c0 - OldBScorer.WINDOW): fm.c0].copy()
    streak = np.zeros(world.n_fac)
    for k in range(hist.shape[1]):
        streak = np.where(hist[:, k] == 0, streak + 1, 0)
    first_touch: dict[str, tuple[int, bool]] = {}
    hours_used, cost_used, n_actions, log = 0.0, 0.0, 0, []
    for t in range(sim.n_weeks):
        y = sim.observed(t)
        r = fm.score(t, y, st)
        streak = np.where(y == 0, streak + 1, 0)
        pv = src.nb_sum(r, tuned["rho"])
        P = np.full(len(src.ids), np.nan)
        for typ in ("hub", "lab"):
            m = src.types == typ
            P[m] = tuned["pf_src"][typ].predict(pv[m])
        ctx = {"t": t, "seed": seed, "world": world, "src": src, "sim": sim, "hours": hours, "cost": cost,
               "p_fail": tuned["pf_fac"].predict(r["p_low"]), "P_src": P,
               "old_b_score": old_b.score(hist, streak, y) if policy == "old_b_fixed" else None}
        acts = FUNCS[policy](ctx)
        active = sim.active(t)
        for a in acts:
            hours_used += a.hours
            cost_used += a.cost
            n_actions += 1
            cov = set(a.covers.tolist())
            for e in active:
                touches = (a.target == e.source) or bool(cov.intersection(e.members.tolist()))
                if touches and e.event_id not in first_touch:
                    first_touch[e.event_id] = (t, a.action in SOURCE_LEVEL)
            ok = sim.success(a.action, a.target, t, a.success)
            ended = []
            if ok:
                if a.action in ("call_facility", "visit_facility"):
                    ended = sim.repair("isolated", {a.target}, t)
                elif a.action == "fix_hub":
                    ended = sim.repair("hub", {a.target}, t)
                elif a.action == "fix_lab":
                    ended = sim.repair("lab", {a.target}, t)
                elif a.action == "call_resu":
                    reg = a.target.removeprefix("RESU-")
                    hubs = set(world.facilities.hub_id[world.facilities.region_id == reg])
                    ended = sim.repair("hub", hubs, t)
            log.append({"seed": seed, "policy": policy, "week": t, "action": a.action, "target": a.target,
                        "hours": a.hours, "succeeded": ok, "ended_events": ";".join(ended)})
        hist = np.c_[hist[:, 1:], y]
    failed_fw = int(sum((e.end - e.start) * len(e.members) for e in events))
    missed_cases = 0.0
    for e in events:
        tr = world.true[np.ix_(e.members, sim.cols[e.start:e.end])]
        missed_cases += float((tr - np.floor(tr * e.mult)).sum())
    shared = [e for e in events if e.kind in ("hub", "lab")]
    touched = [e for e in shared if e.event_id in first_touch]
    row = {
        "seed": seed, "policy": policy, "hours_budget": hours, "failed_facility_weeks": failed_fw,
        "missed_cases": missed_cases, "hours_used": hours_used, "cost_used": cost_used, "actions": n_actions,
        "mean_event_weeks": float(np.mean([e.end - e.start for e in events])),
        "mean_shared_event_weeks": float(np.mean([e.end - e.start for e in shared])) if shared else np.nan,
        "shared_events": len(shared),
        "shared_source_acted_on_first": (float(np.mean([first_touch[e.event_id][1] for e in touched]))
                                          if touched else np.nan),
        "shared_events_acted_on": len(touched) / len(shared) if shared else np.nan,
    }
    return row, log


def run_recovery(world: World, cal, tuned: dict, src: Sources, seeds: list[int], year: int,
                 hours_list: list[float], workers=None, policies=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    policies = policies or list(FUNCS)
    rows, logs = [], []
    for seed in seeds:
        w = world.resample(seed)
        fm = FacilityModels(w, year, cal, workers)
        old_b = OldBScorer(w.true[:, : fm.c0])
        for hours in hours_list:
            for pol in policies:
                if hours != config.PLAN["STAFF_HOURS_PER_WEEK"] and pol not in ("network_aware", "facility_first", "none"):
                    continue
                if pol == "none" and hours != hours_list[0]:
                    continue
                row, log = run_policy(w, fm, src, tuned, year, seed, pol, hours, config.PLAN["COST_PHP_PER_WEEK"], old_b)
                rows.append(row)
                logs += log
        print(f"  recovery seed {seed} done", flush=True)
    res = pd.DataFrame(rows)
    base = res[res.policy == "none"].set_index("seed").failed_facility_weeks
    res["recovered_submissions"] = base.reindex(res.seed).to_numpy() - res.failed_facility_weeks
    res["recovered_per_staff_hour"] = np.where(res.hours_used > 0, res.recovered_submissions / res.hours_used, np.nan)
    return res, pd.DataFrame(logs)


def summarise(res: pd.DataFrame) -> pd.DataFrame:
    out = []
    for (pol, h), g in res.groupby(["policy", "hours_budget"], sort=False):
        row = {"policy": LABEL[pol], "staff hours / week": h}
        for col, lab in (("failed_facility_weeks", "failed facility-weeks"), ("recovered_submissions", "recovered submissions"),
                         ("recovered_per_staff_hour", "recovered per staff-hour"), ("mean_event_weeks", "mean weeks to recover (all failures)"),
                         ("mean_shared_event_weeks", "mean weeks to recover (shared failures)"),
                         ("shared_source_acted_on_first", "shared source acted on first"),
                         ("missed_cases", "cases missing from reports"), ("hours_used", "staff hours used")):
            row[lab] = mean_ci(g[col], upper=1.0 if col == "shared_source_acted_on_first" else None)
        out.append(row)
    return pd.DataFrame(out)
