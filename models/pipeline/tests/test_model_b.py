"""Model B v2: the integer program is exact, and the simulator is deterministic and does what it says."""

from itertools import combinations

import numpy as np
import pytest

from iris_pipeline.model_b.actions import Action
from iris_pipeline.model_b.optimizer import brute_force, greedy, objective, solve


def _random_instance(rng, n_fac=8, n_act=9):
    acts = []
    for i in range(n_act):
        k = int(rng.integers(1, 4))
        cov = rng.choice(n_fac, size=k, replace=False)
        acts.append(Action("a", f"t{i}", float(rng.integers(1, 8)), float(rng.choice([0, 500, 1500])), 0.6,
                           cov, rng.uniform(0.05, 2.0, size=k)))
    return acts


@pytest.mark.parametrize("seed", range(25))
def test_milp_equals_brute_force(seed):
    rng = np.random.default_rng(seed)
    acts = _random_instance(rng)
    hours, cost = float(rng.integers(5, 20)), float(rng.choice([1000, 3000, 1e9]))
    chosen, obj = solve(acts, hours, cost)
    _, best = brute_force(acts, hours, cost)
    assert np.isclose(obj, best, atol=1e-6)
    assert sum(acts[i].hours for i in chosen) <= hours + 1e-9
    assert sum(acts[i].cost for i in chosen) <= cost + 1e-9


def _iris_knapsack(items, budget, resolution=0.5):
    """Independent reference: the IRIS backend's multiple-choice knapsack DP (backend/iris/optimization/planner.py
    optimize), reduced to one action per group, which is the case when no two actions cover the same facility."""
    cap = int(round(budget / resolution))
    dp = [(0.0, ())] * (cap + 1)
    for idx, (h, v) in enumerate(items):
        w = int(round(h / resolution))
        new = list(dp)
        for c in range(cap + 1):
            if w <= c and dp[c - w][0] + v > new[c][0] + 1e-9:
                new[c] = (dp[c - w][0] + v, dp[c - w][1] + (idx,))
        dp = new
    return dp[cap][0]


@pytest.mark.parametrize("seed", range(10))
def test_milp_matches_iris_knapsack_without_sharing(seed):
    rng = np.random.default_rng(100 + seed)
    acts = [Action("a", f"t{i}", float(rng.integers(1, 12)) / 2, 0.0, 0.5, np.array([i]), np.array([rng.uniform(0.1, 3)]))
            for i in range(15)]
    _, obj = solve(acts, 20.0, 1e9)
    ref = _iris_knapsack([(a.hours, a.value) for a in acts], 20.0)
    assert np.isclose(obj, ref, atol=1e-6)


def test_shared_coverage_counts_once():
    hub = Action("fix_hub", "H", 4.0, 0.0, 0.8, np.array([0, 1, 2]), np.array([1.0, 1.0, 1.0]))
    fac = Action("call_facility", "F0", 1.0, 0.0, 0.55, np.array([0]), np.array([0.9]))
    assert objective([hub, fac], [0, 1]) == 3.0
    chosen, obj = solve([hub, fac], 5.0, 1e9)
    assert obj == 3.0 and chosen == [0]  # the facility call adds nothing once its hub is fixed


def test_greedy_respects_budget():
    acts = [Action("a", str(i), 3.0, 0.0, 0.5, np.array([i]), np.array([1.0])) for i in range(5)]
    assert greedy(acts, np.arange(5), 10.0, 1e9) == [0, 1, 2]


def test_real_plan_treats_missing_reports_as_gaps():
    """A report that never arrived is a certain gap; many in one region point the plan to the RESU."""
    import pandas as pd

    from iris_pipeline.model_a.calibrate import PFail
    from iris_pipeline.model_b.real_plan import week_candidates

    rows = []
    for i in range(5):  # region A: 4 of 5 reports missing
        miss = i < 4
        rows.append({"location_id": f"A-{i}", "region_id": "A", "period_start": pd.Timestamp("2020-11-15"),
                     "report_status": "missing" if miss else "reported", "cases": None if miss else 10.0,
                     "expected": 20.0, "shortfall": 20.0 if miss else 10.0, "p_fail": None if miss else 0.01,
                     "hub_p": 0.9})
    for i in range(3):  # region B: normal
        rows.append({"location_id": f"B-{i}", "region_id": "B", "period_start": pd.Timestamp("2020-11-15"),
                     "report_status": "reported", "cases": 20.0, "expected": 20.0, "shortfall": 0.0, "p_fail": 0.001,
                     "hub_p": 0.9})
    cal = PFail(0.1, 0.1).fit(np.array([0.001, 0.01, 0.5, 0.9]), np.array([1, 1, 0, 0]))
    g, acts = week_candidates(pd.DataFrame(rows), cal)
    assert g.loc[g.region_id == "A", "P_region"].iloc[0] == 0.8   # 4 of 5 missing
    resu = [a for a in acts if a.action == "call_resu"]
    assert [a.target for a in resu] == ["RESU-A"]
    chosen, _ = solve(acts, 24.0, 1e9)
    assert any(acts[i].target == "RESU-A" for i in chosen)


# ---- simulator ---------------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def world(inputs):
    from iris_pipeline.network.build import build_world

    return build_world()


def test_world_preserves_location_totals(world):
    w2 = world.resample(5)
    for w in (world, w2):
        for loc, idx in list(w.facilities.groupby("location_id").indices.items())[:10]:
            assert np.array_equal(w.true[idx].sum(0), w.location_totals[loc])
    assert not np.array_equal(world.true, w2.true)


def test_events_deterministic_and_disjoint(world):
    from iris_pipeline.network.simulate import draw_events

    a, b = draw_events(world, 2018, 7), draw_events(world, 2018, 7)
    assert [(e.source, e.start, e.end) for e in a] == [(e.source, e.start, e.end) for e in b]
    occ = {}
    for e in a:
        for m in e.members:
            for t in range(e.start, e.end):
                assert (m, t) not in occ
                occ[(m, t)] = e.event_id
    kinds = [e.kind for e in a]
    assert kinds.count("hub") == 6 and kinds.count("lab") == 3 and kinds.count("isolated") == 40


def test_repair_ends_event_next_week(world):
    from iris_pipeline.network.simulate import Simulation, draw_events

    ev = draw_events(world, 2018, 11)
    sim = Simulation(world, 2018, ev, 11)
    e = next(x for x in ev if x.kind == "hub" and x.end - x.start >= 2)
    t = e.start
    assert sim.failing(t)[e.members].all()
    assert sim.repair("isolated", {e.source}, t) == []      # wrong kind of fix does nothing
    assert sim.repair("hub", {e.source}, t) == [e.event_id]
    assert sim.failing(t)[e.members].all() and not sim.failing(t + 1)[e.members].any()
    assert (sim.observed(t + 1)[e.members] == sim.true(t + 1)[e.members]).all()


def test_success_draws_are_common_random_numbers(world):
    from iris_pipeline.network.simulate import Simulation, draw_events

    s1 = Simulation(world, 2018, draw_events(world, 2018, 3), 3)
    s2 = Simulation(world, 2018, draw_events(world, 2018, 3), 3)
    draws = [(s1.success("fix_hub", "HUB-X", t, 0.5), s2.success("fix_hub", "HUB-X", t, 0.5)) for t in range(30)]
    assert all(a == b for a, b in draws) and 5 < sum(a for a, _ in draws) < 25
