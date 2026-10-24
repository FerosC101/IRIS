"""Model B · zero-report prioritizer: the reproducible pipeline (python -m iris_pipeline zero-priority).

1. Dengue inputs (checked) -> 2. Model A v2 evidence on the real data and the evaluation copy (cached fits)
-> 3. past-only indicators -> 4. tune on 2019 only -> 5. supervised comparison on real swap labels
-> 6. one evaluation of every method on real and synthetic sets (2020 scored once)
-> 7. ranked 2020 investigation list via the public API from scores_v2.csv -> 8. report, metrics, figures.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .. import __version__, config
from ..model_a.calibrate import tune_high
from ..model_b import old_b
from ..paths import MODEL_A_V2_DIR, ensure
from . import api, evaluate, figures, report, supervised, tune
from .evidence import model_a_evidence
from .features import build
from .inputs import load_dengue
from .labels import label_frame, sets

CFG = config.ZERO_PRIORITY


def _old_b(X: pd.DataFrame) -> pd.DataFrame:
    d = old_b.features(X[["location_id", "week_start", "cases", "report_status"]])
    d["old_b_fixed"] = old_b.score_fixed(d)
    return d[["location_id", "week_start", "hist_mean", "old_b_fixed"]].rename(columns={"hist_mean": "hist_mean_26"})


def _diagnostics(P: pd.DataFrame, model) -> dict:
    """Facts that explain the test results (computed on labels after scoring; nothing here is tuned)."""
    out = {"normal_zeros": {}}
    for yr in (config.SPLIT["tune"], config.SPLIT["test"]):
        n = P[P.cand & (P.year == yr) & P.normal]
        out["normal_zeros"][str(yr)] = {"count": int(len(n)), "mean_region_other_zero_share": float(n.region_other_zero_share.mean()),
                                        "share_above_high_cut": float((model.score(n) > model.bands["High"]).mean())}
    w = P[P.cand & (P.year == config.SPLIT["test"])].groupby("week_start").agg(zeros=("cand", "size"), swaps=("is_swap", "sum"))
    out["swaps_2020"] = {"weeks_with_swaps": int((w.swaps > 0).sum()), "max_swaps_in_a_week": int(w.swaps.max()),
                         "max_zero_reports_in_a_week": int(w.zeros.max()), "locations": 126}
    return out


def run(workers: int | None = None) -> dict:
    t0 = time.time()
    out_dir = api.ZP_DIR
    ensure(out_dir, out_dir / "figures")
    inp = load_dengue()
    ev = model_a_evidence(inp, workers)
    feats = {tag: {hw: build(ev[tag], inp.cal, hw) for hw in CFG["GRID"]["hist_weeks"]} for tag in ("prod", "eval")}

    model, grid = tune.fit(feats["prod"], ev["prod_labels"], feats["eval"], ev["eval_labels"])
    a_cfg = json.loads((MODEL_A_V2_DIR / "config.json").read_text(encoding="utf-8"))
    model.meta.update({"model_version": CFG["MODEL_VERSION"], "model_a_variant": ev["variant"],
                       "model_a_run_id": a_cfg.get("run_id"), "tau_model_a_v2": a_cfg["TAU_model_a_v2"]})

    hw = model.hist_weeks
    P = label_frame(feats["prod"][hw], ev["prod_labels"]).merge(_old_b(ev["prod"]), on=["location_id", "week_start"], how="left")
    E = label_frame(feats["eval"][hw], ev["eval_labels"]).merge(_old_b(ev["eval"]), on=["location_id", "week_start"], how="left")

    gbm, gbm_info = supervised.fit_select(P)
    ones = np.ones(len(model.weights))
    methods = {
        "Model B · zero-report prioritizer": lambda d: model.score(d),
        "Equal weights (untuned reference)": lambda d: tune.score_with(d, model, ones),
        "Model A v2 alone": lambda d: -np.log10(np.clip(d.p_low.astype(float), 1e-300, 1)).to_numpy(),
        "Zero-streak length (baseline)": lambda d: d.zero_streak.to_numpy(float),
        "Historical mean, 26 weeks (baseline)": lambda d: d.hist_mean_26.to_numpy(float),
        "Old Model B rule (fixed)": lambda d: d.old_b_fixed.to_numpy(float),
        "Supervised GBM on real swap labels (experiment)": lambda d: supervised.predict(gbm, d),
    }
    neg19 = (P.cand & (P.year == config.SPLIT["tune"]) & P.normal).to_numpy()
    thr = evaluate.thresholds(methods, P, neg19)
    probs = {"Model B · zero-report prioritizer": lambda d: model.probability(model.score(d))[0],
             "Supervised GBM on real swap labels (experiment)": lambda d: supervised.predict(gbm, d)}
    results = evaluate.run(sets(P, E), methods, thr, probs, ci_for=("Model B · zero-report prioritizer", "Model A v2 alone",
                                                                     "Old Model B rule (fixed)"))
    diagnostics = _diagnostics(P, model)

    # Ranked 2020 list through the public API, from the Model A contract file.
    scores_v2 = pd.read_csv(MODEL_A_V2_DIR / "scores_v2.csv", keep_default_na=False, na_values=[""], low_memory=False)
    hist = api.prepare_history(scores_v2, inp.cal, inp.locs)
    ranked = api.rank_alerts(hist, model, inp.cal, tau=model.meta["tau_model_a_v2"])
    ranked = ranked[pd.to_datetime(ranked.week_start).dt.year == config.SPLIT["test"]].reset_index(drop=True)
    chk = ranked[ranked.priority_score.notna()].merge(P[["location_id", "week_start"]].assign(s_eval=model.score(P)),
                                                      on=["location_id", "week_start"], how="left")
    api_gap = float((chk.priority_score - chk.s_eval).abs().max())
    if api_gap > 0.05:
        raise ValueError(f"rank_alerts from scores_v2.csv disagrees with the evaluation scores (max gap {api_gap})")

    model_json = model.to_json()
    (out_dir / "model.json").write_text(model_json, encoding="utf-8")
    ranked.to_csv(out_dir / "ranked_alerts_2020.csv", index=False, lineterminator="\n", date_format="%Y-%m-%d", float_format="%.6g")
    grid.assign(weights=grid.weights.map(lambda w: " ".join(map(str, w)))).sort_values("objective", ascending=False) \
        .to_csv(out_dir / "tuning_grid_2019.csv", index=False, lineterminator="\n", float_format="%.6g")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    manifest = {"run_id": run_id, "package_version": __version__, "model_version": CFG["MODEL_VERSION"],
                "inputs": inp.source, "model_a": {"variant": ev["variant"], "run_id": model.meta["model_a_run_id"]},
                "split": config.SPLIT, "settings": {k: v for k, v in CFG.items() if k != "GBM_GRID"} | {"GBM_GRID": {k: [str(x) for x in v] for k, v in CFG["GBM_GRID"].items()}},
                "chosen": {"hist_weeks": model.hist_weeks, "min_hist": model.min_hist, "streak_saturation": model.streak_saturation,
                           "weights": model.weights, "bands": model.bands},
                "thresholds_5pct_far_2019": thr, "supervised": gbm_info, "api_check_max_score_gap": api_gap,
                "runtime_s": round(time.time() - t0, 1)}
    metrics = {"run_id": run_id, "results": results, "diagnostics": diagnostics, "tuning": model.meta["selection"], "supervised": gbm_info,
               "calibration": {k: v for k, v in model.calibration.items() if k not in ("bootstrap", "x", "y")}}
    (out_dir / "config.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, default=lambda o: None if isinstance(o, float) and np.isnan(o) else str(o)), encoding="utf-8")
    figs = figures.write(out_dir / "figures", ranked, results, model)
    report.write(out_dir / "report.md", model, results, ranked, gbm_info, manifest, figs, diagnostics)
    print(f"zero-priority: wrote {out_dir} in {time.time() - t0:.0f}s")
    return {"model": model, "results": results, "ranked": ranked, "manifest": manifest}
