"""Unit-week features derived from reporting slots.

Each week is assessed at its *review date*: the due date plus a grace period
(``REVIEW_GRACE_DAYS``), or the dataset snapshot date if that is earlier.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from iris import config

ZERO_RUN_COLUMNS = ["zero_streak", "zero_baseline", "zero_baseline_n", "zero_category"]

FEATURE_COLUMNS = [
    "unit_id", "week", "n_expected", "n_on_time", "n_late", "n_not_received", "n_incomplete",
    "n_case_reports", "total_cases", "received_share", "deficit", "incomplete_share", *ZERO_RUN_COLUMNS,
]

#: Prior weeks used for the zero-run baseline (matches the detection history window).
ZERO_RUN_HISTORY = 8
#: A zero run is assessed only for categories in which the unit usually reports
#: cases. In rare categories (measles, for example) long runs of zeros are normal.
ZERO_RUN_MIN_MEAN = 2.0


def _zero_runs(weekly: pd.DataFrame, got: pd.Series, case_categories: set[str], history: int,
               min_mean: float = ZERO_RUN_MIN_MEAN) -> pd.DataFrame:
    """Per unit-week, the strongest run of consecutive *received explicit zero* reports.

    For each unit and case category, the run ending at week t counts the
    consecutive weeks up to t whose report was received with an explicit zero.
    A blank field or a report not received ends the run: neither is a zero.
    The baseline is the mean of received, non-blank values in the ``history``
    weeks before the run started. Only categories whose baseline mean is at
    least ``min_mean`` are considered; of those, the one whose run is least
    likely under its own baseline (largest run x mean) is kept.
    """
    cols = ["unit_id", "week", *ZERO_RUN_COLUMNS]
    w = weekly.assign(_got=got)[weekly["category_code"].isin(case_categories)]
    if w.empty:
        return pd.DataFrame(columns=cols)
    best: dict[tuple[str, int], tuple[float, int, float, int, str]] = {}
    for (unit_id, code), g in w.groupby(["unit_id", "category_code"], sort=True):
        g = g.sort_values("week")
        weeks = g["week"].to_numpy(dtype=int)
        is_zero = (g["_got"] & (g["value_status"] == "zero")).to_numpy()
        usable = (g["_got"] & g["value"].notna()).to_numpy()
        values = pd.to_numeric(g["value"], errors="coerce").to_numpy(dtype=float)
        streak = 0
        for i, t in enumerate(weeks):
            streak = streak + 1 if is_zero[i] and (i == 0 or weeks[i - 1] == t - 1) else (1 if is_zero[i] else 0)
            if streak == 0:
                continue
            start = t - streak + 1
            prior = (weeks >= start - history) & (weeks < start) & usable
            n = int(prior.sum())
            mean = float(values[prior].mean()) if n else float("nan")
            if not n or mean < min_mean:
                continue
            strength = streak * mean
            key = (unit_id, int(t))
            if key not in best or strength > best[key][0]:
                best[key] = (strength, streak, mean, n, code)
    rows = [{"unit_id": u, "week": t, "zero_streak": s, "zero_baseline": m, "zero_baseline_n": n, "zero_category": c}
            for (u, t), (_v, s, m, n, c) in best.items()]
    return pd.DataFrame(rows, columns=cols)


def unit_week_features(
    slots: pd.DataFrame,
    case_categories: set[str],
    as_of: datetime | None = config.AS_OF,
    grace_days: int = config.REVIEW_GRACE_DAYS,
    zero_run_history: int = ZERO_RUN_HISTORY,
) -> pd.DataFrame:
    weekly = slots[slots["frequency"] == "weekly"].copy()
    if weekly.empty:
        return pd.DataFrame(columns=FEATURE_COLUMNS)
    due = pd.to_datetime(weekly["due_at"])
    cutoff = due + timedelta(days=grace_days)
    if as_of is not None:
        cutoff = cutoff.where(cutoff <= as_of, as_of)
    received = pd.to_datetime(weekly["received_at"])
    got = received.notna() & (received <= cutoff)
    on_time = received.notna() & (received <= due)
    fields = pd.to_numeric(weekly["fields_complete"], errors="coerce")
    incomplete = got & ((weekly["value_status"] == "blank") | (fields < 0.8))
    is_case = weekly["category_code"].isin(case_categories) & got & weekly["value"].notna()
    weekly = weekly.assign(
        _got=got.astype(int),
        _on=on_time.astype(int),
        _inc=incomplete.astype(int),
        _case=is_case.astype(int),
        _cases=np.where(is_case, pd.to_numeric(weekly["value"], errors="coerce").fillna(0), 0.0),
    )
    g = weekly.groupby(["unit_id", "week"], as_index=False).agg(
        n_expected=("status", "size"),
        n_received=("_got", "sum"),
        n_on_time=("_on", "sum"),
        n_incomplete=("_inc", "sum"),
        n_case_reports=("_case", "sum"),
        total_cases=("_cases", "sum"),
    )
    g["n_late"] = g["n_received"] - g["n_on_time"]
    g["n_not_received"] = g["n_expected"] - g["n_received"]
    g["received_share"] = g["n_received"] / g["n_expected"]
    g["deficit"] = (0.5 * g["n_late"] + g["n_not_received"]) / g["n_expected"]
    g["incomplete_share"] = np.where(g["n_received"] > 0, g["n_incomplete"] / g["n_received"].clip(lower=1), 0.0)
    g = g.merge(_zero_runs(weekly, got, case_categories, zero_run_history), on=["unit_id", "week"], how="left")
    g["zero_streak"] = g["zero_streak"].fillna(0).astype(int)
    g["zero_baseline_n"] = g["zero_baseline_n"].fillna(0).astype(int)
    g["zero_category"] = g["zero_category"].astype(object).where(g["zero_category"].notna(), None)
    return g[FEATURE_COLUMNS].sort_values(["unit_id", "week"]).reset_index(drop=True)
