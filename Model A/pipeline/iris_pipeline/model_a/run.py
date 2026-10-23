"""Score every series of a weekly frame, in parallel across series (each series is independent)."""

from __future__ import annotations

import hashlib
import json
import os
import pickle
import warnings
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from ..baselines import BASELINES, baseline_scores
from ..contract import assert_no_answer_key
from .countmodel import CountModel, design


def _holidays(cal: pd.DataFrame, opts: dict) -> pd.DataFrame:
    cols = ["holy_week", "christmas_newyear"] + (["covid_period"] if opts.get("covid_flag") else [])
    return cal.set_index("week_start")[cols]


def _score_one(task):
    # statsmodels warns on near-separable fits; robust_fit already steps down a level when a fit is unusable.
    warnings.filterwarnings("ignore")
    key, y, hol, years, cfg, opts, ppy = task
    model = CountModel(cfg, opts)
    log: list[dict] = []
    X = design(len(y), ppy, hol)
    s = model.score_series(y, X, key, log, years=years)
    b = baseline_scores(y, cfg)
    for name, arr in zip(BASELINES, b):
        s["s_" + name] = arr
    return key, s, log


def default_workers() -> int:
    return int(os.environ.get("IRIS_WORKERS", max(1, (os.cpu_count() or 2) - 1)))


def run_weekly(frame: pd.DataFrame, group_col: str, cal: pd.DataFrame, cfg: dict, opts: dict,
               label: str = "run", workers: int | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (frame + model scores + baseline scores, fallback log). Same output as v1 cell 10 run_weekly."""
    assert_no_answer_key(frame, label)
    hol = _holidays(cal, opts)
    groups = []
    tasks = []
    for key, g in frame.sort_values([group_col, "week_start"]).groupby(group_col, sort=True):
        g = g.reset_index(drop=True)
        y = np.where(g.report_status.eq("reported"), g.cases, np.nan).astype(float)
        h = hol.reindex(g.week_start).reset_index(drop=True)
        groups.append(g)
        tasks.append((key, y, h, g.week_start.dt.year.to_numpy(), cfg, opts, cfg["PERIODS_PER_YEAR"]["week"]))
    workers = default_workers() if workers is None else workers
    if workers > 1 and len(tasks) > 1:
        with ProcessPoolExecutor(max_workers=min(workers, len(tasks))) as ex:
            results = list(ex.map(_score_one, tasks, chunksize=max(1, len(tasks) // (4 * workers))))
    else:
        results = [_score_one(t) for t in tasks]
    parts, log = [], []
    for g, (_, s, lg) in zip(groups, results):
        parts.append(pd.concat([g, s], axis=1))
        log += lg
    return pd.concat(parts, ignore_index=True), pd.DataFrame(log)


def cached_run_weekly(cache_dir, tag: str, frame: pd.DataFrame, group_col: str, cal: pd.DataFrame, cfg: dict,
                      opts: dict, label: str = "run", workers: int | None = None):
    """run_weekly with a disk cache keyed on the inputs, settings and code version (safe to delete any time)."""
    from .. import __version__
    from . import countmodel

    h = hashlib.sha256()
    h.update(pd.util.hash_pandas_object(frame, index=False).values.tobytes())
    h.update(json.dumps([cfg, opts, group_col, __version__], sort_keys=True, default=str).encode())
    h.update(open(countmodel.__file__, "rb").read())
    path = cache_dir / f"{tag}_{h.hexdigest()[:16]}.pkl"
    if path.exists():
        with open(path, "rb") as f:
            return pickle.load(f)
    out = run_weekly(frame, group_col, cal, cfg, opts, label=label, workers=workers)
    cache_dir.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(out, f)
    return out
