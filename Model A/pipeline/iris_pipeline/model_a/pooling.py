"""Pooling evidence across places that share a source (a region / hub).

fisher(): v1 method (cell 14). Assumes the places are independent, so a region-wide real drop (e.g. COVID-19)
looks like overwhelming evidence of a reporting failure.
stouffer_corr(): v2. Z = sum(z_i) / sqrt(k + k(k-1) rho), with rho the average within-group correlation of the
z-scores estimated on normal weeks of the training years only. Correlated places count as fewer independent
witnesses, which is what a shared real-world cause produces.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

P_CLIP = 1e-15


def fisher(df, keys, p_col="p_low", out_col="pooled_p"):
    d = df[df[p_col].notna()].copy()
    d["_lp"] = -2 * np.log(np.clip(d[p_col].to_numpy(dtype=float), 1e-300, 1.0))
    agg = d.groupby(keys).agg(_stat=("_lp", "sum"), _k=("_lp", "size")).reset_index()
    agg[out_col] = stats.chi2.sf(agg._stat, 2 * agg._k)
    agg[out_col + "_k"] = agg._k
    return agg.drop(columns=["_stat", "_k"])


def add_region_pool(d):
    pr = fisher(d, ["region_id", "week_start"], out_col="pooled_region_p")
    d = d.drop(columns=[c for c in ("pooled_region_p", "pooled_region_p_k") if c in d]).merge(
        pr, on=["region_id", "week_start"], how="left")
    d.loc[d.p_low.isna(), "pooled_region_p"] = np.nan
    return d


def zscore(p) -> np.ndarray:
    return stats.norm.ppf(np.clip(np.asarray(p, float), P_CLIP, 1 - P_CLIP))


def estimate_rho(d: pd.DataFrame, group_col: str, unit_col: str, normal: pd.Series, min_weeks: int = 26) -> pd.Series:
    """Average pairwise correlation of z-scores between units of each group, on normal weeks only.
    Returns rho per group, clipped to [0, 0.95]; groups with fewer than 2 usable units get the median rho."""
    x = d[normal & d.p_low.notna()].assign(z=lambda t: zscore(t.p_low))
    out = {}
    for g, s in x.groupby(group_col):
        wide = s.pivot_table(index="week_start", columns=unit_col, values="z")
        if wide.shape[1] < 2:
            continue
        c = wide.corr(min_periods=min_weeks).to_numpy()
        off = c[~np.eye(len(c), dtype=bool)]
        off = off[np.isfinite(off)]
        if len(off):
            out[g] = float(np.clip(off.mean(), 0.0, 0.95))
    rho = pd.Series(out, dtype=float)
    med = float(rho.median()) if len(rho) else 0.0
    groups = d[group_col].dropna().unique()
    return rho.reindex(groups).fillna(med)


def stouffer_corr(d: pd.DataFrame, keys: list[str], rho: pd.Series, group_col: str, p_col="p_low",
                  out_col="hub_p") -> pd.DataFrame:
    x = d[d[p_col].notna()].assign(_z=lambda t: zscore(t[p_col]))
    agg = x.groupby(keys).agg(_s=("_z", "sum"), _k=("_z", "size")).reset_index()
    r = agg[group_col].map(rho).fillna(0.0).to_numpy()
    k = agg._k.to_numpy(float)
    agg[out_col] = stats.norm.cdf(agg._s / np.sqrt(k + k * (k - 1) * r))
    agg[out_col + "_k"] = agg._k
    return agg.drop(columns=["_s", "_k"])


def add_hub_pool(d: pd.DataFrame, rho: pd.Series) -> pd.DataFrame:
    hp = stouffer_corr(d, ["hub_id", "week_start"], rho, "hub_id")
    d = d.drop(columns=[c for c in ("hub_p", "hub_p_k") if c in d]).merge(hp, on=["hub_id", "week_start"], how="left")
    d.loc[d.p_low.isna(), "hub_p"] = np.nan
    return d
