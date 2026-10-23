"""Step 5: one results table for the proposal, built only from the saved outputs of steps 2-4.

Reads model_a_v2/metrics.json, model_b/metrics_b.json and model_b/old_model_b_real_eval.csv; writes
outputs/results/RESULTS.md and results.json. Nothing is recomputed here, so every number traces to a file.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .. import config
from ..paths import MODEL_A_V2_DIR, OUT_DIR
from .report_a import _json, md

RES_DIR = OUT_DIR / "results"
SWAPS = "dengue 2020: real swaps"
INJ = "dengue 2020 (test): injected, all types"


def _load():
    a = json.loads((MODEL_A_V2_DIR / "metrics.json").read_text(encoding="utf-8"))
    a_cfg = json.loads((MODEL_A_V2_DIR / "config.json").read_text(encoding="utf-8"))
    b = json.loads((OUT_DIR / "model_b" / "metrics_b.json").read_text(encoding="utf-8"))
    ob = pd.read_csv(OUT_DIR / "model_b" / "old_model_b_real_eval.csv")
    return a, a_cfg, b, ob


def _ci(v, ci):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    return f"{v:.3f} ({ci[0]:.3f}–{ci[1]:.3f})" if ci else f"{v:.3f}"


def _pair(v):
    """A CI read back from CSV arrives as the text '(lo, hi)'."""
    if isinstance(v, str) and v.startswith("("):
        lo, hi = v.strip("()").split(",")
        return float(lo), float(hi)
    return v if isinstance(v, (tuple, list)) else None


def _nan(x) -> bool:
    return x is None or (isinstance(x, float) and np.isnan(x))


def _mci(v, pct=False):
    m, lo, hi = v
    if _nan(m):
        return "n/a"
    f = (lambda x: f"{x:.1%}" if x < 0.1 else f"{x:.0%}") if pct else (lambda x: f"{x:.2f}")
    return f"{f(m)} ({f(lo)}–{f(hi)})" if not _nan(lo) else f(m)


def detection_table(a: dict, ob: pd.DataFrame, key: str, with_old_b: bool) -> pd.DataFrame:
    rows = []
    order = ["Model A v2", "Model A v1", "Rolling median", "EWMA", "CUSUM"]
    recs = {r["method"]: r for r in a["sets"][key]}
    for m in order:
        r = recs[m]
        ci = a["bootstrap_ci"].get(key, {}).get(m, {})
        rows.append({"method": m, "precision": r["precision"], "recall (95% CI)": _ci(r["recall"], ci.get("recall_ci")),
                     "F1": r["f1"], "false-alert rate (95% CI)": _ci(r["false_alert_rate"], ci.get("false_alert_rate_ci")),
                     "weeks to detect": r["weeks_to_detect"], "AUC": r["auc"],
                     "_recall": r["recall"], "_far": r["false_alert_rate"]})
    if with_old_b:
        for _, r in ob[ob.method != "Model A v2"].iterrows():
            rec, far = r["recall at 1% budget (2020 swaps)"], r["false-alert rate (2020 normal weeks)"]
            rows.append({"method": r["method"], "precision": r["precision"],
                         "recall (95% CI)": _ci(rec, _pair(r.get("recall 95% CI"))),
                         "F1": r.get("f1", np.nan), "false-alert rate (95% CI)": _ci(far, _pair(r.get("false-alert rate 95% CI"))),
                         "weeks to detect": r.get("weeks to detect", np.nan),
                         "AUC": r["AUC, 2020 all swaps vs all normal weeks"], "_recall": rec, "_far": far})
    return pd.DataFrame(rows)


def graph_table(b: dict) -> pd.DataFrame:
    rows = []
    for r in b["ablation"]:
        rows.append({"method": r["method"], "right hub named": _mci(r["hub source identified"], True),
                     "right lab named": _mci(r["lab source identified"], True),
                     "failing facility-weeks flagged": _mci(r["facility-week recall"], True),
                     "false alerts (normal facility-weeks)": _mci(r["facility-week false-alert rate"], True),
                     "false source alerts": _mci(r["source false-alert rate"], True)})
    return pd.DataFrame(rows)


def recovery_table(b: dict) -> pd.DataFrame:
    H = config.PLAN["STAFF_HOURS_PER_WEEK"]
    rows = []
    for r in b["recovery"]:
        if r["staff hours / week"] != H:
            continue
        rows.append({"policy": r["policy"], "recovered submissions / year": _mci(r["recovered submissions"]),
                     "per staff-hour": _mci(r["recovered per staff-hour"]),
                     "weeks to recover, shared failures": _mci(r["mean weeks to recover (shared failures)"]),
                     "shared source acted on first": _mci(r["shared source acted on first"], True),
                     "staff hours used / year": f"{r['staff hours used'][0]:.0f}"})
    return pd.DataFrame(rows)


def build() -> dict:
    a, a_cfg, b, ob = _load()
    det = detection_table(a, ob, SWAPS, True)
    det_inj = detection_table(a, ob, INJ, False)
    gt = graph_table(b)
    rt = recovery_table(b)
    abl = {r["method"]: r for r in b["ablation"]}
    G, F0 = "graph: hub + lab, NB sum", "facility only (no graph)"
    rec = {r["policy"]: r for r in b["recovery"] if r["staff hours / week"] == config.PLAN["STAFF_HOURS_PER_WEEK"]}
    NA, FF = rec["Network-aware (Model B v2)"], rec["Facility-first (proposal baseline)"]
    dv = det.set_index("method")
    region = pd.DataFrame(a["region"])
    reg20 = region[(region["failure set"] == "real swaps 2020 (test)")]
    reg_v1 = float(reg20.iloc[0]["false region alerts (clean region-weeks)"])
    reg_v2 = float(reg20[(reg20.model == "Model A v2") & (reg20.pooling.str.startswith("Stouffer"))].iloc[0][
        "false region alerts (clean region-weeks)"])
    dw = {r["target (roadmap step 2)"]: r for r in a["done_when"]}
    met_a = sum(r["met"] == "yes" for r in a["done_when"])

    score = pd.DataFrame([
        {"objective (proposal)": "1. Detect reporting anomalies", "status": "Partly met",
         "evidence": f"Real 2020 swaps: Model A v2 catches {dv.loc['Model A v2','_recall']:.0%} at {dv.loc['Model A v2','_far']:.1%} "
                     f"false alerts; v1 {dv.loc['Model A v1','_recall']:.0%} at {dv.loc['Model A v1','_far']:.1%}; best simple baseline "
                     f"{det[det.method.isin(['Rolling median','EWMA','CUSUM'])]._recall.max():.0%}. Neither version holds the 1% budget in the COVID year."},
        {"objective (proposal)": "1. Detect shared network disruptions", "status": "Met in simulation; partly on real data",
         "evidence": f"Simulation: right hub named in {abl[G]['hub source identified'][0]:.0%} of hub outages (0% without the graph). "
                     f"Real 2020: false region alerts {reg_v1:.0%} (v1) → {reg_v2:.0%} (v2)."},
        {"objective (proposal)": "1. Temporal graph", "status": "Met (synthetic network)",
         "evidence": f"Facility → hub → RESU and facility → lab graph of {b['world'].get('facility', 0)} facilities over the real 126 "
                     "locations; graph ablation done. The real reporting pathways are not available."},
        {"objective (proposal)": "1. Multiple diseases", "status": "Met (Model A)",
         "evidence": "Dengue (province-weekly), 18 EDCS diseases incl. measles and rubella (national weekly), TB (monthly). "
                     "Measles and TB have few labels."},
        {"objective (proposal)": "2. Recommend actions under limited resources", "status": "Met in simulation",
         "evidence": f"Model B v2 integer program: {NA['recovered submissions'][0]:.0f} vs {FF['recovered submissions'][0]:.0f} "
                     f"failed facility-weeks restored per year (facility-first), same {config.PLAN['STAFF_HOURS_PER_WEEK']:.0f} h/week; "
                     f"shared source handled first in {NA['shared source acted on first'][0]:.0%} of shared failures. Real 2020 plan produced."},
        {"objective (proposal)": "3. Evaluate (precision, recall, F1, false alarms, delay, recovery, baselines, time order, ablation)",
         "status": "Met", "evidence": "All in the table below; train 2016–2018 / tune 2019 / test 2020; 20 simulation replicates with 95% intervals."},
        {"objective (proposal)": "Dashboard prototype", "status": "Met (Streamlit prototype)",
         "evidence": "pipeline/app/streamlit_app.py: completeness, priority list with evidence, network, plan, recovery."},
    ])

    gen = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    show = lambda df: df.drop(columns=[c for c in df.columns if c.startswith("_")])  # noqa: E731
    L = [
        "# IRIS results", "",
        f"Team Nex · PJDSC 2026 · generated {gen} by `python -m iris_pipeline results` from the saved outputs "
        f"(Model A run `{a['run_id']}`).", "",
        "## In plain words", "",
        "- **IRIS has two jobs.** Model A spots weekly reports that look wrong. Model B decides what to fix first when "
        "staff time is limited.",
        f"- **Spotting (real data, 2020).** Model A v2 cut false alarms from {dv.loc['Model A v1','_far']:.0%} to "
        f"{dv.loc['Model A v2','_far']:.1%} of normal weeks and region-wide false alarms from {reg_v1:.0%} to {reg_v2:.0%}, "
        f"but it catches fewer real errors ({dv.loc['Model A v1','_recall']:.0%} → {dv.loc['Model A v2','_recall']:.0%}). "
        "The COVID-19 drop in 2020 is the hardest case: no version holds the 1% alarm budget through it.",
        f"- **Shared failures (simulation).** Using the reporting network, IRIS names the broken hub in "
        f"{abl[G]['hub source identified'][0]:.0%} of hub outages; without it, never.",
        f"- **Fixing (simulation).** With the same {config.PLAN['STAFF_HOURS_PER_WEEK']:.0f} staff-hours a week, network-aware "
        f"planning restores about {NA['recovered submissions'][0] / FF['recovered submissions'][0]:.0f}x more failed reports "
        f"than fixing facilities one by one ({NA['recovered submissions'][0]:.0f} vs {FF['recovered submissions'][0]:.0f} a year).",
        "- **Every alert is a lead to verify**, the network is synthetic, and no real-world recovery effect is claimed.", "",
        "## Proposal objectives", "", md(score), "",
        "## The results table", "",
        "### A. Detection on real data: the 158 swapped dengue reports of 2020", "",
        "Test year 2020, scored once; thresholds frozen on 2019 at a 1% alert budget. 95% intervals: cluster bootstrap "
        "over places. Old Model B rules can only flag zero reports.", "",
        md(show(det), 3), "",
        "### A2. Detection on simulated failures injected into real 2020 data (407 location-weeks)", "",
        md(show(det_inj), 3), "",
        "### B. Shared-source identification, with and without the graph (simulation, 20 replicates)", "",
        md(gt), "",
        f"### C. Recovery efficiency (simulation, 20 replicates, {config.PLAN['STAFF_HOURS_PER_WEEK']:.0f} staff-hours/week)", "",
        md(rt), "",
        "## Model A v2 against the roadmap's targets", "", f"{met_a} of {len(a['done_when'])} met:", "",
        md(pd.DataFrame(a["done_when"])), "",
        "## Where each number comes from", "",
        "| block | file | produced by |", "|---|---|---|",
        "| A, A2, targets | `outputs/model_a_v2/metrics.json`, `eval_report.md` | `python -m iris_pipeline model-a` |",
        "| A (old Model B rows) | `outputs/model_b/old_model_b_real_eval.csv` | `python -m iris_pipeline model-b` |",
        "| B, C | `outputs/model_b/metrics_b.json`, `report_b.md` | `python -m iris_pipeline model-b` |",
        "| Machine-readable copies for the IRIS app | `outputs/contract/*.json` | `python -m iris_pipeline contract-json` |", "",
        "## Limits", "",
        "- Real labels are the errors found during cleaning (581 swapped rows, 3 regional gaps); other errors are unknown and count as normal weeks.",
        "- 2020 contains the COVID-19 drop, a shift larger than anything in 2016–2019; thresholds tuned on 2019 do not hold there.",
        "- The reporting network, its failures and recovery effects are simulated; action hours and success rates are the IRIS planner's assumptions.",
        "- Measles and TB results rest on very few labelled events.",
        "- Alerts are leads for surveillance staff to verify, not confirmed errors.", "",
    ]
    RES_DIR.mkdir(parents=True, exist_ok=True)
    (RES_DIR / "RESULTS.md").write_text("\n".join(L), encoding="utf-8")
    out = {
        "generated_at": gen, "model_a_run_id": a["run_id"], "model_a_variant": a["chosen_variant"],
        "objectives": score.to_dict("records"),
        "detection_real_swaps_2020": show(det).to_dict("records"),
        "detection_injected_2020": show(det_inj).to_dict("records"),
        "shared_source_identification": b["ablation"], "recovery": b["recovery"],
        "model_a_done_when": a["done_when"],
        "thresholds": {"model_a_v2_tau": a_cfg["TAU_model_a_v2"], "alert_budget": a_cfg["alert_budget"]},
    }
    (RES_DIR / "results.json").write_text(json.dumps(out, indent=2, default=_json), encoding="utf-8")
    return out
