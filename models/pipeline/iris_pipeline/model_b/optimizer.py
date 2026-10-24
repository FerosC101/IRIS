"""Choose this week's actions: an integer program (roadmap step 4.2).

maximise   sum_{a,f} value(a, f) * z[a, f]
subject to z[a, f] <= x[a]                 (credit only for chosen actions)
           sum_a z[a, f] <= 1              (a facility is restored at most once, e.g. not by both its hub fix
                                            and a facility visit)
           sum_a hours[a] * x[a] <= H      (staff hours this week)
           sum_a cost[a] * x[a] <= C       (money this week)
           x binary, 0 <= z <= 1
(plus a negligible cost per hour, so among equally valuable plans the one using fewer staff hours wins)
With x fixed the z-problem is a bipartite assignment (totally unimodular), so z is integral at the optimum.
Solved exactly by HiGHS through scipy.optimize.milp. brute_force() is the reference used in the tests.
"""

from __future__ import annotations

from itertools import combinations

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

from .actions import Action


def solve(actions: list[Action], hours: float, cost: float, time_limit: float = 10.0) -> tuple[list[int], float]:
    """Returns (indices of chosen actions, objective)."""
    if not actions:
        return [], 0.0
    nA = len(actions)
    pa, pf, pc = [], [], []
    for i, a in enumerate(actions):
        for f, c in zip(a.covers, a.coef):
            if c > 0:
                pa.append(i)
                pf.append(int(f))
                pc.append(float(c))
    nZ = len(pa)
    if nZ == 0:
        return [], 0.0
    pa, pf, pc = np.array(pa), np.array(pf), np.array(pc)
    # A tiny cost per staff-hour breaks ties toward fewer hours, so no action that adds nothing is ever chosen.
    tie = 1e-6 * min(1.0, float(pc.min()))
    c = np.r_[tie * np.array([a.hours for a in actions]) / max(1.0, hours), -pc]
    rows, cols, vals, lo, hi = [], [], [], [], []
    r = 0
    for k in range(nZ):  # z - x <= 0
        rows += [r, r]
        cols += [nA + k, pa[k]]
        vals += [1.0, -1.0]
        lo.append(-np.inf)
        hi.append(0.0)
        r += 1
    fac_u, inv = np.unique(pf, return_inverse=True)
    for j in range(len(fac_u)):  # sum_a z[a, f] <= 1
        ks = np.flatnonzero(inv == j)
        if len(ks) > 1:
            rows += [r] * len(ks)
            cols += list(nA + ks)
            vals += [1.0] * len(ks)
            lo.append(-np.inf)
            hi.append(1.0)
            r += 1
    for attr, cap in (("hours", hours), ("cost", cost)):
        rows += [r] * nA
        cols += list(range(nA))
        vals += [float(getattr(a, attr)) for a in actions]
        lo.append(-np.inf)
        hi.append(float(cap))
        r += 1
    A = coo_matrix((vals, (rows, cols)), shape=(r, nA + nZ)).tocsr()
    res = milp(c, constraints=LinearConstraint(A, lo, hi), integrality=np.r_[np.ones(nA), np.zeros(nZ)],
               bounds=Bounds(0, 1), options={"time_limit": time_limit, "disp": False})
    if res.x is None:
        raise RuntimeError(f"MILP failed: {res.message}")
    chosen = [i for i in range(nA) if res.x[i] > 0.5]
    return chosen, objective(actions, chosen)


def objective(actions: list[Action], chosen: list[int]) -> float:
    """Value of a set of actions: each facility counts once, at the best value any chosen action gives it."""
    best: dict[int, float] = {}
    for i in chosen:
        for f, c in zip(actions[i].covers, actions[i].coef):
            best[int(f)] = max(best.get(int(f), 0.0), float(c))
    return float(sum(best.values()))


def brute_force(actions: list[Action], hours: float, cost: float) -> tuple[list[int], float]:
    best, best_set = 0.0, []
    for k in range(1, len(actions) + 1):
        for s in combinations(range(len(actions)), k):
            if sum(actions[i].hours for i in s) <= hours + 1e-9 and sum(actions[i].cost for i in s) <= cost + 1e-9:
                v = objective(actions, list(s))
                if v > best + 1e-9:
                    best, best_set = v, list(s)
    return best_set, best


def greedy(actions: list[Action], order: np.ndarray, hours: float, cost: float) -> list[int]:
    """Take actions in the given order while they fit (the facility-first baseline)."""
    chosen, h, c = [], 0.0, 0.0
    for i in order:
        a = actions[i]
        if h + a.hours <= hours + 1e-9 and c + a.cost <= cost + 1e-9:
            chosen.append(int(i))
            h += a.hours
            c += a.cost
    return chosen
