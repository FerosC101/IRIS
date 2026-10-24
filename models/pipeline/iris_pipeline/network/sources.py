"""Shared-source evidence and attribution (roadmap step 3).

For every candidate source S (hub or lab with the graph; region without it) and week:
- nb_sum: the summed reports of S's facilities against their summed expectation, as one negative binomial with
  moment-matched dispersion whose variance includes the facilities' estimated correlation. A shared failure lowers
  many small counts at once, which this sees even when no single facility looks alarming.
- stouffer: correlation-adjusted Stouffer over the facilities' p_low (Z = sum z / sqrt(k + k(k-1) rho)).
Attribution: a declared source is kept if it is the most significant declared source for at least one of its
facilities; a facility alert covered by no kept source is attributed to the facility itself (isolated).
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from ..model_a.countmodel import mid_p_low
from ..model_a.pooling import zscore
from .build import World

METHODS = {
    "facility only (no graph)": {"sources": [], "test": None},
    "region pooling (no graph)": {"sources": ["region"], "test": "stouffer"},
    "graph: hub + lab, Stouffer": {"sources": ["hub", "lab"], "test": "stouffer"},
    "graph: hub + lab, NB sum": {"sources": ["hub", "lab"], "test": "nb_sum"},
}
PRIMARY = "graph: hub + lab, NB sum"


class Sources:
    def __init__(self, world: World):
        f = world.facilities
        self.ids, self.types, rows = [], [], []
        for typ, col in (("hub", "hub_id"), ("lab", "lab_id"), ("region", "region_id")):
            for sid in sorted(f[col].unique()):
                self.ids.append(sid if typ != "region" else f"REGION-{sid}")
                self.types.append(typ)
                rows.append((f[col].to_numpy() == sid))
        self.A = np.array(rows, dtype=float)               # sources x facilities incidence
        self.types = np.array(self.types)
        self.ids = np.array(self.ids)
        self.k = self.A.sum(1)
        self.index = {s: i for i, s in enumerate(self.ids)}
        self.hub_of = np.array([self.index[h] for h in f.hub_id])
        self.lab_of = np.array([self.index[x] for x in f.lab_id])

    def nb_sum(self, r: dict, rho_by_type: dict | None = None) -> np.ndarray:
        """Summed-count test. Var(sum) = sum of variances + rho * sum over pairs of sd_i sd_j: facilities behind one
        source share epidemic dynamics the per-facility models don't capture, so their counts co-vary."""
        ok = ~np.isnan(r["mu"]) & ~np.isnan(r["p_low"])
        y, mu, a = (np.where(ok, r[c], 0.0) for c in ("y", "mu", "alpha"))
        Y, M = self.A @ y, self.A @ mu
        v = mu + a * mu ** 2
        rho = np.array([(rho_by_type or {}).get(t, 0.0) for t in self.types])
        S1, S2 = self.A @ np.sqrt(v), self.A @ v
        V = S2 + rho * (S1 ** 2 - S2)
        with np.errstate(divide="ignore", invalid="ignore"):
            alpha_s = np.clip((V - M) / M ** 2, 1e-4, 50.0)
        p = np.full(len(Y), np.nan)
        good = M > 0
        p[good] = mid_p_low(Y[good], M[good], alpha_s[good])
        return p

    def stouffer(self, r: dict, rho_by_type: dict) -> np.ndarray:
        ok = ~np.isnan(r["p_low"])
        z = np.where(ok, zscore(np.where(ok, r["p_low"], 0.5)), 0.0)
        Aok = self.A * ok
        k = Aok.sum(1)
        rho = np.array([rho_by_type.get(t, 0.0) for t in self.types])
        with np.errstate(divide="ignore", invalid="ignore"):
            Z = (Aok @ z) / np.sqrt(k + k * (k - 1) * rho)
        p = np.where(k > 0, stats.norm.cdf(Z), np.nan)
        return p

    def pvalues(self, r: dict, rho_by_type: dict) -> dict:
        return {"nb_sum": self.nb_sum(r), "stouffer": self.stouffer(r, rho_by_type)}

    def attribute(self, p_src: np.ndarray, declared: np.ndarray, allowed: list[str]):
        """Returns (kept source mask, per-facility attributed source index or -1)."""
        use = declared & np.isin(self.types, allowed)
        n_fac = self.A.shape[1]
        best = np.full(n_fac, -1)
        best_p = np.full(n_fac, np.inf)
        for s in np.flatnonzero(use):
            m = self.A[s] > 0
            better = m & (p_src[s] < best_p)
            best[better], best_p[better] = s, p_src[s]
        kept = np.zeros(len(self.ids), bool)
        kept[np.unique(best[best >= 0])] = True
        return kept, best
