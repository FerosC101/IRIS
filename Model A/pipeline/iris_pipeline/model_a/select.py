"""Phase 1 of Model A v2: choose the variant on 2016-2019 only, and write the choice down before 2020 is scored.

This module never computes a metric on 2020 rows. Its output, selection.json, is read by the test phase.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from .. import config
from ..data import Inputs, dengue_eval_frame
from ..evaluation.metrics import binary, coverage
from ..paths import MODEL_A_V2_DIR
from .calibrate import tune_low
from .labels import lab_eval, lab_prod, ok_scored
from .run import cached_run_weekly

CACHE = MODEL_A_V2_DIR / "_cache"


def run_candidate(name: str, inp: Inputs, workers=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    opts = config.options(name)
    prod, _ = cached_run_weekly(CACHE, f"{name}_prod", inp.X_dengue, "location_id", inp.cal, config.V1, opts,
                                label=f"{name} production", workers=workers)
    ev, _ = cached_run_weekly(CACHE, f"{name}_eval", dengue_eval_frame(inp), "location_id", inp.cal, config.V1, opts,
                              label=f"{name} evaluation", workers=workers)
    return lab_prod(prod, inp), lab_eval(ev, inp)


def pre_test_metrics(name: str, lp: pd.DataFrame, le: pd.DataFrame) -> dict:
    """Metrics on 2016-2019 only."""
    assert lp.week_start.max() >= pd.Timestamp("2020-01-01")  # the frame has 2020; we must not use it here
    yr_p, yr_e = lp.week_start.dt.year, le.week_start.dt.year
    okp = ok_scored(lp)
    tune = lp[(yr_p == config.SPLIT["tune"]) & okp]
    tau = tune_low(tune.p_low, config.V1["ALERT_BUDGET"])
    row = {"candidate": name, "tau_budget_2019": tau}
    for y in (2016, 2017, 2018, 2019):
        s = lp[(yr_p == y) & okp]
        row[f"coverage90_{y}"] = coverage(s.cases, s.pi_low, s.pi_high)
    sel = lp[yr_p.isin(config.SELECTION["coverage_years"]) & okp]
    row["coverage90_2017_2019"] = coverage(sel.cases, sel.pi_low, sel.pi_high)
    ry = config.SELECTION["recall_year"]
    e = le[yr_e == ry]
    flag = (e.p_low < tau).fillna(False).to_numpy()
    m = binary(flag, e.is_inj.to_numpy(), e.neg.to_numpy())
    row.update({f"inj_recall_{ry}": m["recall"], f"inj_far_{ry}": m["false_alert_rate"], f"inj_f1_{ry}": m["f1"]})
    for y in (2016, 2017):  # real swap episodes before the test year (rolling-origin, so out-of-sample)
        s = lp[yr_p == y]
        f = (s.p_low < tau).fillna(False).to_numpy()
        m = binary(f, s.is_swap.to_numpy(), ok_scored(s).to_numpy())
        row[f"swap_recall_{y}"] = m["recall"]
        row[f"far_{y}"] = m["false_alert_rate"]
    row["scored_rows_2019"] = int(lp[(yr_p == 2019)].p_low.notna().sum())
    return row


def choose(table: pd.DataFrame) -> tuple[str, str]:
    lo, hi = config.SELECTION["coverage_band"]
    ry = config.SELECTION["recall_year"]
    t = table[table.candidate.isin(config.SELECTABLE)].copy()
    inside = t[t.coverage90_2017_2019.between(lo, hi)]
    if len(inside):
        best = inside.sort_values([f"inj_recall_{ry}", "coverage90_2017_2019"], ascending=[False, False]).iloc[0]
        return best.candidate, (f"coverage {best.coverage90_2017_2019:.3f} is inside [{lo}, {hi}] and it has the best "
                                f"{ry} injected-failure recall ({best[f'inj_recall_{ry}']:.3f}) among those that are")
    t["gap"] = (t.coverage90_2017_2019 - 0.90).abs()
    best = t.sort_values(["gap", f"inj_recall_{ry}"], ascending=[True, False]).iloc[0]
    return best.candidate, (f"no candidate reached the coverage band; closest coverage "
                            f"({best.coverage90_2017_2019:.3f}), recall {best[f'inj_recall_{ry}']:.3f}")


def run_selection(inp: Inputs, workers=None) -> dict:
    rows = []
    for name in config.V2_CANDIDATES:
        lp, le = run_candidate(name, inp, workers)
        rows.append(pre_test_metrics(name, lp, le))
        print(f"  {name}: coverage 2017-19 {rows[-1]['coverage90_2017_2019']:.3f}, "
              f"2019 injected recall {rows[-1]['inj_recall_2019']:.3f}", flush=True)
    table = pd.DataFrame(rows)
    chosen, why = choose(table)
    MODEL_A_V2_DIR.mkdir(parents=True, exist_ok=True)
    table.to_csv(MODEL_A_V2_DIR / "selection_2016_2019.csv", index=False, lineterminator="\n", float_format="%.6g")
    out = {"chosen": chosen, "reason": why, "rule": config.SELECTION, "candidates": config.V2_CANDIDATES,
           "note": "Computed on 2016-2019 only, before any 2020 metric. covid+uncertainty is not selectable "
                   "(covid_period is 0 before 2020) and is reported on 2020 as a sensitivity analysis."}
    (MODEL_A_V2_DIR / "selection.json").write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
    return {**out, "table": table}
