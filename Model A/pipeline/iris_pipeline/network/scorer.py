"""Model A v2 at facility level, for the simulated year.

Each facility's count model (same CountModel and options as Model A v2) is fitted once, on the FIT_WINDOW weeks
before the simulated year, then scores the year week by week. The recent-level term is updated online from the
reports actually received, so a policy that repairs a failure changes what the model sees next. Pausing refits
during the year keeps every policy and seed scored by the same model (and makes 20 seeds x 6 policies cheap).
"""

from __future__ import annotations

import warnings
from collections import deque
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from .. import config
from ..model_a.countmodel import CountModel, design, mid_p_low
from ..model_a.run import default_workers
from .build import World

COLS = ["const", "trend", "sin", "cos", "holy_week", "christmas_newyear", "recent"]
K = len(COLS)


def _history_recent(y: np.ndarray, window: int) -> np.ndarray:
    rec = np.full(len(y), np.nan)
    for t in range(1, len(y)):
        h = y[max(0, t - window):t]
        rec[t] = np.log1p(np.median(h))
    return rec


def _fit_one(task):
    warnings.filterwarnings("ignore")
    i, y_tr, X_tr, years_tr, cfg, opts = task
    m = CountModel(cfg, opts)
    lv, cols, beta, a, cov, _, reason = m.robust_fit(y_tr, X_tr.reset_index(drop=True))
    b = np.zeros(K)
    C = np.zeros((K, K))
    if lv is None:
        return i, None, b, C, np.nan, 0.0
    idx = [COLS.index(c) for c in cols]
    b[idx] = beta.to_numpy()
    if cov is not None and lv != "zero_history":
        C[np.ix_(idx, idx)] = cov.loc[cols, cols].to_numpy()
    s_year = 0.0
    if lv != "zero_history":
        mu_tr = np.exp(np.clip(X_tr[cols].to_numpy() @ beta.to_numpy(), -20, 20))
        s_year = m._year_var(y_tr, mu_tr, a, years_tr)
    return i, lv, b, C, float(a), s_year


class FacilityModels:
    def __init__(self, world: World, year: int, cal: pd.DataFrame, workers: int | None = None):
        self.world, self.year = world, year
        self.cfg, self.opts = config.V1, config.options(config.MODEL_A_VARIANT)
        self.window = self.opts["recent_window"]
        self.excl = self.opts["recent_exclude_p"]
        hol = cal.set_index("week_start")[["holy_week", "christmas_newyear"]].reindex(world.weeks).reset_index(drop=True)
        X = design(len(world.weeks), self.cfg["PERIODS_PER_YEAR"]["week"], hol)
        X["recent"] = np.nan
        self.X = X
        self.c0 = int(np.flatnonzero(world.weeks.year == year)[0])
        W = config.SIM["FIT_WINDOW"]
        tr = np.arange(self.c0 - W, self.c0)
        years = world.weeks.year.to_numpy()
        tasks = []
        for i in range(world.n_fac):
            y = world.true[i, : self.c0]
            rec = _history_recent(y, self.window)
            Xi = X.iloc[tr].copy()
            Xi["recent"] = rec[tr]
            ok = ~np.isnan(Xi.recent.to_numpy())
            tasks.append((i, y[tr][ok], Xi[ok], years[tr][ok], self.cfg, self.opts))
        workers = default_workers() if workers is None else workers
        if workers > 1:
            with ProcessPoolExecutor(max_workers=workers) as ex:
                res = list(ex.map(_fit_one, tasks, chunksize=max(1, len(tasks) // (4 * workers))))
        else:
            res = [_fit_one(t) for t in tasks]
        res.sort(key=lambda r: r[0])
        self.level = np.array([r[1] for r in res], dtype=object)
        self.beta = np.stack([r[2] for r in res])
        self.cov = np.stack([r[3] for r in res])
        self.alpha = np.array([r[4] for r in res])
        self.s_year = np.array([r[5] for r in res])
        self.fitted = np.array([r[1] is not None for r in res])
        self.uses_recent = self.beta[:, COLS.index("recent")] != 0

    def new_state(self):
        """Per-run online state: the last few usable reports of every facility (history counts as usable)."""
        return [deque(self.world.true[i, max(0, self.c0 - self.window): self.c0], maxlen=self.window)
                for i in range(self.world.n_fac)]

    def score(self, t: int, y: np.ndarray, state) -> dict:
        """Score week t of the simulated year given this week's reports y; then update the online state."""
        x = self.X.iloc[self.c0 + t][COLS[:-1]].to_numpy(dtype=float)
        rec = np.array([np.log1p(np.median(d)) if len(d) else np.nan for d in state])
        A = np.tile(np.r_[x, 0.0], (self.world.n_fac, 1))
        A[:, -1] = np.where(self.uses_recent, rec, 0.0)
        eta = np.clip(np.einsum("fi,fi->f", A, self.beta), -20, 20)
        mu = np.exp(eta)
        se2 = np.einsum("fi,fij,fj->f", A, self.cov, A)
        a = np.where(np.isnan(self.alpha), 1.0, self.alpha)
        a_lo, a_hi = self.cfg["ALPHA_BOUNDS"]
        alpha_eff = np.clip((1 + a) * np.exp(np.minimum(se2 + self.s_year, 5.0)) - 1, a, a_hi)
        ok = self.fitted & ~(self.uses_recent & np.isnan(rec))
        p = np.full(self.world.n_fac, np.nan)
        p[ok] = mid_p_low(y[ok], mu[ok], alpha_eff[ok])
        for i in range(self.world.n_fac):
            if not ok[i] or p[i] >= self.excl:
                state[i].append(y[i])
        mu[~ok] = np.nan
        return {"y": y, "mu": mu, "alpha": alpha_eff, "p_low": p}
