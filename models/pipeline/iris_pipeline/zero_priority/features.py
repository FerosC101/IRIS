"""Past-only indicators for every dengue location-week (Model B · zero-report prioritizer).

Each indicator at week t uses reports from weeks before t only, except the regional context, which uses the other
locations' reports for the same week (available when that week is reviewed). A missing week is never a zero: it
is NaN in every history and breaks a zero streak.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .. import config

CFG = config.ZERO_PRIORITY


def _streak(y: np.ndarray) -> np.ndarray:
    out, s = np.zeros(len(y)), 0
    for t, v in enumerate(y):
        s = s + 1 if v == 0 else 0  # NaN (missing) resets
        out[t] = s
    return out


def _location(g: pd.DataFrame, hist_weeks: int) -> pd.DataFrame:
    y = np.where(g.report_status.eq("reported"), g.cases, np.nan).astype(float)
    n = len(y)
    n_hist = np.zeros(n)
    zero_share = np.full(n, np.nan)
    recent = np.full(n, np.nan)
    last_nonzero = np.full(n, np.nan)
    flips = np.full(n, np.nan)
    season = np.full(n, np.nan)
    k_recent, k_onoff, hw = CFG["RECENT_REPORTS"], CFG["ON_OFF_WINDOW"], CFG["SEASON_HALF_WIDTH"]
    for t in range(n):
        h = y[max(0, t - hist_weeks):t]
        h = h[~np.isnan(h)]
        n_hist[t] = len(h)
        if len(h):
            zero_share[t] = float((h == 0).mean())
        past = y[:t][~np.isnan(y[:t])]
        if len(past):
            recent[t] = float(np.median(past[-k_recent:]))
            nz = past[past > 0]
            last_nonzero[t] = float(nz[-1]) if len(nz) else 0.0
        w = past[-k_onoff:]
        if len(w) >= 4:
            z = w == 0
            flips[t] = float(np.sum(z[1:] != z[:-1]))
        same = []
        for lag in (52, 104):
            lo, hi = t - lag - hw, t - lag + hw + 1
            if lo >= 0:
                same.append(y[lo:hi])
        if same:
            s = np.concatenate(same)
            s = s[~np.isnan(s)]
            if len(s) >= 3:
                season[t] = float(s.mean())
    n_before = np.concatenate([[0], np.cumsum(~np.isnan(y))[:-1]])
    return g.assign(y=y, zero_streak=_streak(y), n_hist=n_hist, n_reported_before=n_before, hist_zero_share=zero_share, recent_median=recent,
                    last_nonzero=last_nonzero, on_off_flips=flips, season_mean=season)


def build(X: pd.DataFrame, cal: pd.DataFrame, hist_weeks: int = 52) -> pd.DataFrame:
    """X: Model A evidence frame (one row per location-week on the calendar grid)."""
    parts = [_location(g.reset_index(drop=True), hist_weeks)
             for _, g in X.sort_values(["location_id", "week_start"]).groupby("location_id", sort=True)]
    F = pd.concat(parts, ignore_index=True)
    # Regional context for the same week, excluding the location itself.
    F["_zero"] = (F.y == 0).astype(int)
    F["_missing"] = F.report_status.eq("missing").astype(int)
    F["_listed"] = (~F.report_status.eq("not_in_source")).astype(int)
    grp = F.groupby(["region_id", "week_start"])
    tot = grp[["_zero", "_missing", "_listed"]].transform("sum")
    others = (tot["_listed"] - F["_listed"]).clip(lower=0)
    F["region_others"] = others
    F["region_other_zero_share"] = np.where(others > 0, (tot["_zero"] - F["_zero"]) / others.where(others > 0, 1), np.nan)
    F["region_other_missing_share"] = np.where(others > 0, (tot["_missing"] - F["_missing"]) / others.where(others > 0, 1), np.nan)
    F = F.drop(columns=["_zero", "_missing", "_listed"])
    c = cal[["week_start", "covid_period", "holy_week", "christmas_newyear"]]
    return F.merge(c, on="week_start", how="left", validate="many_to_one")


def candidates(F: pd.DataFrame) -> pd.Series:
    """Explicit zero-case reports. Missing reports are never candidates for zero ranking."""
    return F.report_status.eq("reported") & (F.cases == 0)
