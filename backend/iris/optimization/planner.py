"""Budget-constrained selection of corrective actions.

The optimizer maximizes the *assumed* expected benefit (expected report
submissions restored over the planning horizon) subject to a staff-hour
budget and intra-concern dependencies. It is exact: actions are grouped by
concern, every dependency-respecting subset of each group is enumerated, and a
multiple-choice knapsack dynamic program picks the best combination.

The baseline takes actions strictly in priority order while they fit.

Benefits are simulation assumptions. They are not validated estimates of
real-world effectiveness or health impact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

ACTION_TYPES = {
    "verify_contact": "Contact unit to verify submission",
    "technical_support": "Provide technical support",
    "validation_review": "Review data-validation issue",
    "restore_connection": "Restore simulated reporting connection",
    "support_visit": "Schedule simulated training or support visit",
}

DEFAULT_ASSUMPTIONS: dict = {
    "horizon_weeks": 4,
    "action_types": {
        "verify_contact": {"base_hours": 1.5, "hours_per_unit": 0.5, "success_probability": 0.55, "time_days": 1},
        "technical_support": {"base_hours": 4.0, "hours_per_unit": 2.0, "success_probability": 0.7, "time_days": 3},
        "validation_review": {"base_hours": 2.0, "hours_per_unit": 1.0, "success_probability": 0.65, "time_days": 2},
        "restore_connection": {"base_hours": 10.0, "hours_per_unit": 1.0, "success_probability": 0.8, "time_days": 5},
        "support_visit": {"base_hours": 8.0, "hours_per_unit": 3.0, "success_probability": 0.6, "time_days": 7},
    },
}

RESOLUTION = 0.5  # hours


@dataclass
class Candidate:
    id: str
    concern_id: str
    action_type: str
    priority: int
    n_units: int
    expected_reports_per_week: float
    depends_on: list[str] = field(default_factory=list)
    order: int = 0


@dataclass
class Costed:
    id: str
    concern_id: str
    priority: int
    cost_hours: float
    expected_benefit: float
    success_probability: float
    time_days: int
    depends_on: list[str]
    order: int


def merge_assumptions(overrides: dict | None) -> dict:
    out = {"horizon_weeks": DEFAULT_ASSUMPTIONS["horizon_weeks"], "action_types": {k: dict(v) for k, v in DEFAULT_ASSUMPTIONS["action_types"].items()}}
    if not overrides:
        return out
    if "horizon_weeks" in overrides and overrides["horizon_weeks"]:
        out["horizon_weeks"] = int(overrides["horizon_weeks"])
    for k, v in (overrides.get("action_types") or {}).items():
        if k in out["action_types"] and isinstance(v, dict):
            out["action_types"][k].update({kk: float(vv) for kk, vv in v.items() if kk in out["action_types"][k] and vv is not None})
    return out


def cost_actions(cands: list[Candidate], assumptions: dict) -> list[Costed]:
    out = []
    h = assumptions["horizon_weeks"]
    for c in cands:
        a = assumptions["action_types"][c.action_type]
        cost = a["base_hours"] + a["hours_per_unit"] * c.n_units
        cost = round(round(cost / RESOLUTION) * RESOLUTION, 2)
        benefit = round(c.expected_reports_per_week * h * a["success_probability"], 2)
        out.append(Costed(c.id, c.concern_id, c.priority, cost, benefit, a["success_probability"], int(a["time_days"]), list(c.depends_on), c.order))
    return out


def _feasible_subsets(group: list[Costed], satisfied: set[str]) -> list[tuple[str, ...]]:
    ids = {g.id for g in group}
    out: list[tuple[str, ...]] = [()]
    for r in range(1, len(group) + 1):
        for combo in combinations(group, r):
            chosen = {c.id for c in combo}
            if all(all(d in chosen or d in satisfied or d not in ids and d in satisfied for d in c.depends_on) for c in combo):
                out.append(tuple(c.id for c in combo))
    return out


def optimize(actions: list[Costed], budget_hours: float, satisfied: set[str] | None = None) -> list[str]:
    """Exact multiple-choice knapsack. ``satisfied`` lists dependencies already met."""
    satisfied = satisfied or set()
    by_id = {a.id: a for a in actions}
    groups: dict[str, list[Costed]] = {}
    for a in actions:
        groups.setdefault(a.concern_id, []).append(a)
    cap = int(round(max(budget_hours, 0) / RESOLUTION))
    # dp[c] = (benefit, chosen ids) using capacity c
    dp: list[tuple[float, tuple[str, ...]]] = [(0.0, ())] * (cap + 1)
    for gid in sorted(groups):
        options = []
        for subset in _feasible_subsets(groups[gid], satisfied):
            w = int(round(sum(by_id[i].cost_hours for i in subset) / RESOLUTION))
            v = sum(by_id[i].expected_benefit for i in subset)
            options.append((w, v, subset))
        new = list(dp)
        for c in range(cap + 1):
            best = dp[c]
            for w, v, subset in options:
                if w <= c and subset:
                    cand = dp[c - w][0] + v
                    if cand > best[0] + 1e-9:
                        best = (cand, dp[c - w][1] + subset)
            new[c] = best
        dp = new
    return list(dp[cap][1])


def baseline(actions: list[Costed], budget_hours: float, satisfied: set[str] | None = None) -> list[str]:
    """Highest priority first; skip actions that do not fit or whose dependencies are unmet."""
    satisfied = set(satisfied or set())
    remaining = budget_hours
    chosen: list[str] = []
    for a in sorted(actions, key=lambda a: (a.priority, a.order, len(a.depends_on))):
        if a.cost_hours > remaining + 1e-9:
            continue
        if any(d not in satisfied and d not in chosen for d in a.depends_on):
            continue
        chosen.append(a.id)
        remaining -= a.cost_hours
    return chosen


def explain(actions: list[Costed], chosen: list[str], budget_hours: float) -> list[dict]:
    chosen_set = set(chosen)
    used = sum(a.cost_hours for a in actions if a.id in chosen_set)
    rows = []
    for a in actions:
        if a.id in chosen_set:
            reason = "Selected"
        elif any(d not in chosen_set for d in a.depends_on):
            reason = "Not selected: depends on an action that was not selected"
        elif a.cost_hours > budget_hours - used + 1e-9:
            reason = "Not selected: exceeds remaining budget"
        else:
            reason = "Not selected: lower benefit per hour than the selected combination"
        rows.append({"id": a.id, "selected": a.id in chosen_set, "reason": reason})
    return rows
