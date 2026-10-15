"""Unit-week features derived from reporting slots.

Each week is assessed at its *review date*: the due date plus a grace period
(``REVIEW_GRACE_DAYS``), or the dataset snapshot date if that is earlier.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from iris import config

FEATURE_COLUMNS = [
    "unit_id", "week", "n_expected", "n_on_time", "n_late", "n_not_received", "n_incomplete",
    "n_case_reports", "total_cases", "received_share", "deficit", "incomplete_share",
]


def unit_week_features(
    slots: pd.DataFrame,
    case_categories: set[str],
    as_of: datetime | None = config.AS_OF,
    grace_days: int = config.REVIEW_GRACE_DAYS,
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
    return g[FEATURE_COLUMNS].sort_values(["unit_id", "week"]).reset_index(drop=True)
