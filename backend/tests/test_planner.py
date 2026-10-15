import itertools
import random

from iris.optimization.planner import Candidate, Costed, baseline, cost_actions, merge_assumptions, optimize


def _brute(actions, budget):
    best = 0.0
    ids = [a.id for a in actions]
    by = {a.id: a for a in actions}
    for r in range(len(actions) + 1):
        for combo in itertools.combinations(ids, r):
            s = set(combo)
            if sum(by[i].cost_hours for i in s) > budget + 1e-9:
                continue
            if any(d not in s for i in s for d in by[i].depends_on):
                continue
            best = max(best, sum(by[i].expected_benefit for i in s))
    return best


def _random_actions(rng, n_concerns):
    out = []
    for c in range(n_concerns):
        a = Costed(f"c{c}-a", f"c{c}", rng.randint(1, 3), rng.choice([1.0, 2.5, 4.0, 6.5]), round(rng.uniform(1, 20), 2), 0.5, 1, [], c)
        b = Costed(f"c{c}-b", f"c{c}", a.priority, rng.choice([3.0, 8.0, 10.5]), round(rng.uniform(1, 30), 2), 0.5, 1, [a.id], c)
        out += [a, b]
    return out


def test_optimizer_matches_brute_force():
    rng = random.Random(4)
    for _ in range(25):
        acts = _random_actions(rng, rng.randint(1, 5))
        budget = rng.choice([0, 3, 7.5, 12, 20, 40])
        chosen = optimize(acts, budget)
        by = {a.id: a for a in acts}
        assert sum(by[i].cost_hours for i in chosen) <= budget + 1e-9
        assert all(d in chosen for i in chosen for d in by[i].depends_on)
        assert abs(sum(by[i].expected_benefit for i in chosen) - _brute(acts, budget)) < 1e-6


def test_budget_changes_selection_monotonically():
    acts = _random_actions(random.Random(9), 5)
    by = {a.id: a for a in acts}
    values = [sum(by[i].expected_benefit for i in optimize(acts, b)) for b in (0, 5, 10, 20, 40, 80)]
    assert values == sorted(values)
    assert values[0] == 0 and values[-1] > values[1]


def test_optimizer_never_worse_than_baseline():
    rng = random.Random(11)
    for _ in range(20):
        acts = _random_actions(rng, 4)
        by = {a.id: a for a in acts}
        b = rng.choice([5, 10, 15, 30])
        assert sum(by[i].expected_benefit for i in optimize(acts, b)) >= sum(by[i].expected_benefit for i in baseline(acts, b)) - 1e-9


def test_baseline_takes_priority_order_and_respects_dependencies():
    acts = [
        Costed("x", "c1", 1, 5, 1, 0.5, 1, [], 0),
        Costed("y", "c1", 1, 5, 9, 0.5, 1, ["x"], 0),
        Costed("z", "c2", 3, 5, 50, 0.5, 1, [], 1),
    ]
    assert baseline(acts, 10) == ["x", "y"]
    assert baseline(acts, 4) == []


def test_assumptions_drive_cost_and_benefit():
    cand = [Candidate("a", "c", "verify_contact", 1, 2, 10.0)]
    a = cost_actions(cand, merge_assumptions(None))[0]
    b = cost_actions(cand, merge_assumptions({"horizon_weeks": 8, "action_types": {"verify_contact": {"success_probability": 1.0}}}))[0]
    assert b.expected_benefit == 10 * 8 * 1.0
    assert a.expected_benefit < b.expected_benefit
