"""Planning policies compared in the recovery simulation (roadmap step 4.3).

network_aware   Model B v2: every candidate (facility, hub, lab, RESU), chosen by the integer program.
facility_first  the proposal's baseline: facility calls only, in order of p_fail, while hours last.
old_b_fixed     today's Model B rule, fixed (calendar weeks, absolute rather than within-date scores):
                zero reports only, 0.7 x percentile of the 26-week mean + 0.3 x percentile of the zero streak,
                calls in score order.
random          facility calls on random facilities among those with p_fail >= MIN_PROB.
oracle          knows which failures are active and their source (not their remaining length): the best
                action for each, by value per hour. An upper reference, not an achievable policy.
none            no action; failures end on their own.
"""

from __future__ import annotations

import numpy as np

from ..config import PLAN, SIM
from .actions import Action, candidates, make
from .optimizer import greedy, solve

POLICIES = ["network_aware", "facility_first", "old_b_fixed", "random", "oracle", "none"]
LABEL = {"network_aware": "Network-aware (Model B v2)", "facility_first": "Facility-first (proposal baseline)",
         "old_b_fixed": "Old Model B rule, fixed", "random": "Random", "oracle": "Oracle (knows the truth)",
         "none": "No action"}


def network_aware(ctx) -> list[Action]:
    acts = candidates(ctx)
    chosen, _ = solve(acts, ctx["hours"], ctx["cost"], PLAN["MILP_TIME_LIMIT_S"])
    return [acts[i] for i in chosen]


def facility_first(ctx) -> list[Action]:
    acts = candidates(ctx, sources=False, kinds=("call_facility",))
    order = np.argsort([-a.coef[0] for a in acts], kind="stable")
    return [acts[i] for i in greedy(acts, order, ctx["hours"], ctx["cost"])]


def old_b_fixed(ctx) -> list[Action]:
    fac = ctx["world"].facilities
    score = ctx["old_b_score"]
    idx = np.flatnonzero(~np.isnan(score))
    idx = idx[np.argsort(-score[idx], kind="stable")]
    acts = [make("call_facility", fac.facility_id.iat[i], 1, [i], [1.0]) for i in idx]
    return [acts[i] for i in greedy(acts, np.arange(len(acts)), ctx["hours"], ctx["cost"])]


def random_policy(ctx) -> list[Action]:
    fac = ctx["world"].facilities
    pool = np.flatnonzero(np.nan_to_num(ctx["p_fail"]) >= PLAN["MIN_PROB"])
    rng = np.random.default_rng([ctx["seed"], ctx["t"], 99])
    pool = rng.permutation(pool)
    acts = [make("call_facility", fac.facility_id.iat[i], 1, [i], [1.0]) for i in pool]
    return [acts[i] for i in greedy(acts, np.arange(len(acts)), ctx["hours"], ctx["cost"])]


def oracle(ctx) -> list[Action]:
    world, src = ctx["world"], ctx["src"]
    acts = []
    for e in ctx["sim"].active(ctx["t"]):
        if e.kind == "hub":
            acts.append(make("fix_hub", e.source, len(e.members), e.members, np.ones(len(e.members))))
        elif e.kind == "lab":
            acts.append(make("fix_lab", e.source, len(e.members), e.members, np.ones(len(e.members))))
        else:
            acts.append(make("visit_facility", e.source, 1, e.members, [1.0]))
    order = np.argsort([-a.value / a.hours for a in acts], kind="stable")
    return [acts[i] for i in greedy(acts, order, ctx["hours"], ctx["cost"])]


def none(ctx) -> list[Action]:
    return []


FUNCS = {"network_aware": network_aware, "facility_first": facility_first, "old_b_fixed": old_b_fixed,
         "random": random_policy, "oracle": oracle, "none": none}


class OldBScorer:
    """Absolute version of today's Model B score. Percentiles come from the zero reports of the training weeks
    (before the simulated year), so a score means the same thing on every date."""

    WINDOW, MIN_HIST = 26, 13

    def __init__(self, history: np.ndarray):
        means, streaks = [], []
        F, T = history.shape
        for f in range(F):
            y = history[f]
            streak = 0
            for t in range(T):
                streak = streak + 1 if y[t] == 0 else 0
                if y[t] == 0 and t >= self.MIN_HIST:
                    h = y[max(0, t - self.WINDOW):t]
                    means.append(h.mean())
                    streaks.append(streak)
        self.means = np.sort(np.array(means)) if means else np.array([0.0])
        self.streaks = np.sort(np.array(streaks)) if streaks else np.array([1.0])

    def score(self, hist_window: np.ndarray, streak: np.ndarray, y: np.ndarray) -> np.ndarray:
        """hist_window: facilities x last 26 weeks before t; streak: zero streak including week t; y: week t."""
        m = hist_window.mean(1)
        pm = np.searchsorted(self.means, m, side="right") / len(self.means)
        ps = np.searchsorted(self.streaks, streak, side="right") / len(self.streaks)
        s = 100 * (0.7 * pm + 0.3 * ps)
        return np.where(y == 0, s, np.nan)
