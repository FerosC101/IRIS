"""Three detection methods evaluated on identical inputs.

All methods share two simple channels so that comparisons isolate the
*reporting-delay* logic:

* Incomplete records: share of received reports with blank or incomplete
  fields is at least ``incomplete_share``.
* Count drop: reported case total is improbably low under a Poisson model
  whose mean is the unit's recent average (only assessed when the week's
  reports were mostly received, so missing reports are not mistaken for a
  drop). A count drop is *not* proof of under-reporting.
* Zero-case run: a unit submitted explicit zero-case reports for a category
  for several consecutive weeks, and such a run is improbable under a Poisson
  model with the unit's own recent mean for that category. Zero-case reports
  are reports: the run may be valid, and a flag does not establish a cause.

The reporting-delay channel differs by method:

``threshold``   Statistical threshold. Deficit compared with the unit's own
                recent median and spread (robust z-score).
``ewma``        Independent time-series. Exponentially weighted moving average
                of the deficit, compared with the same baseline.
``network``     Network-aware. The threshold z-score plus a bonus for the
                share of *connected* units (same reporting hub or shared
                resource) that also show a delay that week. Requires some
                own evidence; connections alone never flag a unit.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from scipy.stats import poisson

from iris.detection.features import ZERO_RUN_MIN_MEAN

METHODS = ("threshold", "ewma", "network")
METHOD_LABELS = {
    "threshold": "Statistical threshold",
    "ewma": "Time-series (EWMA)",
    "network": "Network-aware",
}


@dataclass(frozen=True)
class DetectionParams:
    history_weeks: int = 8
    min_history: int = 6
    scale_floor: float = 0.15
    fallback_median: float = 0.05
    z_cap: float = 10.0
    threshold_z: float = 3.0
    threshold_min_deficit: float = 0.3
    ewma_lambda: float = 0.5
    ewma_z: float = 3.0
    ewma_min: float = 0.3
    peer_weight: float = 3.0
    network_score: float = 4.5
    network_min_deficit: float = 0.25
    peer_z: float = 2.0
    peer_min_deficit: float = 0.25
    incomplete_share: float = 0.5
    count_p: float = 0.001
    count_min_expected: float = 4.0
    count_min_history: int = 4
    count_min_received_share: float = 0.75
    zero_run_weeks: int = 3
    zero_run_p: float = 0.001
    zero_run_min_history: int = 4
    zero_run_min_mean: float = ZERO_RUN_MIN_MEAN

    def as_dict(self) -> dict:
        return asdict(self)


def _robust_baseline(x: np.ndarray, params: DetectionParams) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Trailing median / MAD-based scale for each week, using only prior weeks."""
    n = len(x)
    med = np.full(n, params.fallback_median)
    scale = np.full(n, params.scale_floor)
    hist_n = np.zeros(n, dtype=int)
    for t in range(n):
        hist = x[max(0, t - params.history_weeks):t]
        hist = hist[~np.isnan(hist)]
        hist_n[t] = len(hist)
        if len(hist) >= params.min_history:
            m = float(np.median(hist))
            mad = float(np.median(np.abs(hist - m))) * 1.4826
            med[t] = m
            scale[t] = max(mad, params.scale_floor)
    return med, scale, hist_n


def _count_channel(cases: np.ndarray, reports: np.ndarray, received_share: np.ndarray, incomplete: np.ndarray, params: DetectionParams):
    n = len(cases)
    expected = np.full(n, np.nan)
    pval = np.full(n, np.nan)
    flag = np.zeros(n, dtype=bool)
    for t in range(n):
        lo = max(0, t - params.history_weeks)
        # Weeks already flagged as a drop are excluded so a sustained drop does
        # not become its own baseline.
        ok = (received_share[lo:t] >= 0.999) & (incomplete[lo:t] == 0) & (reports[lo:t] > 0) & ~flag[lo:t]
        if ok.sum() < params.count_min_history or received_share[t] < params.count_min_received_share or reports[t] == 0:
            continue
        per_report = float(np.mean(cases[lo:t][ok] / reports[lo:t][ok]))
        exp_now = per_report * reports[t]
        expected[t] = exp_now
        if exp_now < params.count_min_expected:
            continue
        p = float(poisson.cdf(cases[t], exp_now))
        pval[t] = p
        flag[t] = p < params.count_p
    return expected, pval, flag


def own_evidence(features: pd.DataFrame, params: DetectionParams) -> pd.DataFrame:
    """Per-unit baselines, z-scores, EWMA and the shared channels."""
    missing = {"zero_streak": 0, "zero_baseline": np.nan, "zero_baseline_n": 0, "zero_category": None}
    missing = {k: v for k, v in missing.items() if k not in features.columns}
    if missing:  # features built without per-category zero-run information
        features = features.assign(**missing)
    parts = []
    for unit_id, g in features.groupby("unit_id", sort=True):
        g = g.sort_values("week").copy()
        x = g["deficit"].to_numpy(dtype=float)
        med, scale, hist_n = _robust_baseline(x, params)
        z = np.clip((x - med) / scale, -params.z_cap, params.z_cap)
        lam = params.ewma_lambda
        e = np.zeros(len(x))
        prev = med[0]
        for t in range(len(x)):
            prev = lam * x[t] + (1 - lam) * prev
            e[t] = prev
        ez = (e - med) / (scale * np.sqrt(lam / (2 - lam)))
        expected, pval, cflag = _count_channel(
            g["total_cases"].to_numpy(dtype=float), g["n_case_reports"].to_numpy(dtype=float),
            g["received_share"].to_numpy(dtype=float), g["n_incomplete"].to_numpy(dtype=float), params,
        )
        g["baseline_median"] = med
        g["baseline_scale"] = scale
        g["history_weeks"] = hist_n
        g["insufficient_history"] = hist_n < params.min_history
        g["own_z"] = z
        g["ewma"] = e
        g["ewma_z"] = np.clip(ez, -params.z_cap, params.z_cap)
        g["count_expected"] = expected
        g["count_p"] = pval
        g["count_flag"] = cflag
        g["incomplete_flag"] = g["incomplete_share"] >= params.incomplete_share
        streak = g["zero_streak"].to_numpy(dtype=float)
        base = g["zero_baseline"].to_numpy(dtype=float)
        enough = ((g["zero_baseline_n"].to_numpy() >= params.zero_run_min_history) & ~np.isnan(base)
                  & (np.nan_to_num(base) >= params.zero_run_min_mean))
        p_run = np.where(enough & (streak > 0), np.exp(-streak * np.nan_to_num(base)), np.nan)
        g["zero_run_p"] = p_run
        g["zero_run_flag"] = (streak >= params.zero_run_weeks) & enough & (np.nan_to_num(p_run, nan=1.0) < params.zero_run_p)
        parts.append(g)
    return pd.concat(parts, ignore_index=True) if parts else features.copy()


def _peer_support(ev: pd.DataFrame, peer_groups: dict[str, dict[str, list[str]]], params: DetectionParams) -> pd.DataFrame:
    soft = (ev["own_z"] >= params.peer_z) & (ev["deficit"] >= params.peer_min_deficit)
    soft_set = set(zip(ev.loc[soft, "unit_id"], ev.loc[soft, "week"]))
    present = set(zip(ev["unit_id"], ev["week"]))
    support = np.zeros(len(ev))
    via = np.empty(len(ev), dtype=object)
    affected = np.empty(len(ev), dtype=object)
    group_size = np.zeros(len(ev), dtype=int)
    for i, (u, w) in enumerate(zip(ev["unit_id"], ev["week"])):
        best, best_via, best_aff, best_n = 0.0, None, [], 0
        for gid, members in peer_groups.get(u, {}).items():
            members = [m for m in members if (m, w) in present]
            if not members:
                continue
            aff = [m for m in members if (m, w) in soft_set]
            frac = len(aff) / len(members)
            if frac > best or (frac == best and best_via is None):
                best, best_via, best_aff, best_n = frac, gid, aff, len(members)
        support[i], via[i], affected[i], group_size[i] = best, best_via, best_aff, best_n
    ev = ev.copy()
    ev["peer_support"] = support
    ev["peer_via"] = via
    ev["peer_affected"] = affected
    ev["peer_group_size"] = group_size
    return ev


def detect(features: pd.DataFrame, method: str, params: DetectionParams | None = None,
           peer_groups: dict[str, dict[str, list[str]]] | None = None,
           evidence: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return one row per unit-week with ``flagged``, ``score`` and evidence columns."""
    params = params or DetectionParams()
    if method not in METHODS:
        raise ValueError(f"Unknown method {method!r}")
    ev = evidence if evidence is not None else own_evidence(features, params)
    if ev.empty:
        return ev.assign(flagged=False, score=0.0, delay_flag=False, zero_run_flag=False, method=method)
    if method == "threshold":
        score = ev["own_z"]
        delay_flag = (ev["own_z"] >= params.threshold_z) & (ev["deficit"] >= params.threshold_min_deficit)
        out = ev.assign(peer_support=0.0, peer_via=None, peer_affected=[[] for _ in range(len(ev))], peer_group_size=0)
    elif method == "ewma":
        score = ev["ewma_z"]
        delay_flag = (ev["ewma_z"] >= params.ewma_z) & (ev["ewma"] >= params.ewma_min)
        out = ev.assign(peer_support=0.0, peer_via=None, peer_affected=[[] for _ in range(len(ev))], peer_group_size=0)
    else:
        if peer_groups is None:
            raise ValueError("The network-aware method requires a defined reporting network.")
        out = _peer_support(ev, peer_groups, params)
        score = out["own_z"] + params.peer_weight * out["peer_support"]
        delay_flag = (score >= params.network_score) & (out["deficit"] >= params.network_min_deficit)
    out = out.copy()
    out["method"] = method
    out["score"] = score.round(3)
    out["delay_flag"] = delay_flag
    out["flagged"] = delay_flag | out["count_flag"] | out["incomplete_flag"] | out["zero_run_flag"]
    return out


def peer_groups_from_edges(edges: list[tuple[str, str, str]], reporting_unit_ids: set[str]) -> dict[str, dict[str, list[str]]]:
    """Connected-unit groups from explicitly defined relationships only.

    ``edges`` are ``(source, target, relationship_type)`` tuples. Units that
    report through the same hub form a group; units joined by a
    ``shared_resource`` edge form a group. Specimen referrals are not used:
    they do not carry weekly reports in the simulated network.
    """
    upstream: dict[str, str] = {}
    shared: dict[str, set[str]] = {}
    for src, dst, kind in edges:
        if kind == "reports_through" and src in reporting_unit_ids:
            upstream[src] = dst
        elif kind == "shared_resource":
            shared.setdefault(src, set()).add(dst)
            shared.setdefault(dst, set()).add(src)
    members: dict[str, list[str]] = {}
    for u, hub in upstream.items():
        members.setdefault(hub, []).append(u)
    groups: dict[str, dict[str, list[str]]] = {}
    for u in reporting_unit_ids:
        g: dict[str, list[str]] = {}
        hub = upstream.get(u)
        if hub:
            g[hub] = sorted(m for m in members[hub] if m != u)
        if u in shared:
            g["shared_resource:" + "|".join(sorted({u, *shared[u]}))] = sorted(shared[u])
        groups[u] = g
    return groups
