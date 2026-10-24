"""Evaluation sets for zero reports. Labels are joined only here, after scoring (the answer-key wall)."""

from __future__ import annotations

import pandas as pd

from .features import candidates


def label_frame(F: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    """F: features for one frame (prod or eval); labels: that frame's label columns (same rows)."""
    d = F.merge(labels, on=["location_id", "week_start"], how="left", validate="one_to_one")
    d["cand"] = candidates(d)
    d["year"] = d.week_start.dt.year
    for c in ("is_swap", "is_inj", "is_gap"):
        if c not in d:
            d[c] = False
        d[c] = d[c].fillna(False).astype(bool)
    d["normal"] = d.qa_label.eq("ok") & ~d.is_swap & ~d.is_inj & ~d.is_gap
    return d


def sets(prod: pd.DataFrame, ev: pd.DataFrame) -> dict:
    """name -> (frame, rows, positives, negatives, kind). Every set is restricted to explicit zero reports."""
    def mk(d, years, pos_col, kind):
        rows = d.cand & d.year.isin(years)
        return {"frame": d, "rows": rows, "pos": rows & d[pos_col], "neg": rows & d.normal, "kind": kind}
    return {
        "Real 2020 (test): swapped zeros": mk(prod, [2020], "is_swap", "real"),
        "Real 2016-2017 (tuning, in-sample): swapped zeros": mk(prod, [2016, 2017], "is_swap", "real"),
        "Synthetic 2019 (tuning): injected zeros": mk(ev, [2019], "is_inj", "synthetic"),
        "Synthetic 2020 (test): injected zeros": mk(ev, [2020], "is_inj", "synthetic"),
        "Synthetic 2020 (test): regional gap entered as zero": mk(ev, [2020], "is_gap", "synthetic"),
    }
