"""Write Model A v2's evaluation report, metrics.json, config.json and figures."""

from __future__ import annotations

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from ..model_a.labels import ok_scored  # noqa: E402
from ..paths import MODEL_A_V2_DIR  # noqa: E402

HEADLINE = ["dengue 2020: real swaps", "dengue 2020: regional gap filled with 0", "dengue 2020 (test): injected, all types"]
FAR_TARGET = 0.02  # "close to 1%": at most 2 false alerts per 100 normal location-weeks (set before the test run)


def md(df: pd.DataFrame, floats: int = 3) -> str:
    d = df.copy()
    for c in d.columns:
        if pd.api.types.is_float_dtype(d[c]):
            d[c] = d[c].map(lambda v: "" if pd.isna(v) else f"{v:.{floats}f}")
    cols = list(d.columns)
    out = ["| " + " | ".join(map(str, cols)) + " |", "|" + "---|" * len(cols)]
    out += ["| " + " | ".join("" if (isinstance(v, float) and np.isnan(v)) else str(v) for v in r) + " |"
            for r in d.itertuples(index=False)]
    return "\n".join(out)


def _ci(v, ci):
    return f"{v:.3f} ({ci[0]:.3f}–{ci[1]:.3f})" if ci and not np.isnan(v) else ("" if np.isnan(v) else f"{v:.3f}")


def headline_table(out: dict) -> pd.DataFrame:
    rows = []
    for key in HEADLINE:
        t = out["R"][key]
        for r in t.itertuples():
            ci = out["CI"].get(key, {}).get(r.method, {})
            rows.append({"failure set": key.replace("dengue 2020", "2020").replace(" (test)", ""), "method": r.method,
                         "positives": r.positives, "recall (95% CI)": _ci(r.recall, ci.get("recall_ci")),
                         "false-alert rate (95% CI)": _ci(r.false_alert_rate, ci.get("false_alert_rate_ci")),
                         "precision": r.precision, "F1": r.f1, "AUC": r.auc, "weeks to detect": r.weeks_to_detect})
    return pd.DataFrame(rows)


def done_when(out: dict) -> pd.DataFrame:
    sw = out["R"]["dengue 2020: real swaps"].set_index("method")
    v2, v1 = sw.loc["Model A v2"], sw.loc["Model A v1"]
    base = sw.drop(index=["Model A v1", "Model A v2"])
    best_base = float(base.recall.max())
    ci = out["CI"]["dengue 2020: real swaps"]["Model A v2"]
    cal = out["CAL"]["v2"].set_index("year")["inside 90% range"]
    cov_sel = float(out["selection_row"]["coverage90_2017_2019"])
    cov20 = float(cal.get(2020, np.nan))
    rows = [
        {"target (roadmap step 2)": "2020 false-alert rate close to 1% (≤ 2%)",
         "Model A v1": f"{v1.false_alert_rate:.3f}", "Model A v2": f"{v2.false_alert_rate:.3f}",
         "met": "yes" if v2.false_alert_rate <= FAR_TARGET else "no"},
        {"target (roadmap step 2)": f"2020 recall on real swaps well above the baselines (best baseline {best_base:.3f})",
         "Model A v1": f"{v1.recall:.3f}", "Model A v2": f"{v2.recall:.3f} (CI {ci['recall_ci'][0]:.3f}–{ci['recall_ci'][1]:.3f})",
         "met": "yes" if (v2.recall >= 2 * best_base and ci["recall_ci"][0] > best_base) else "no"},
        {"target (roadmap step 2)": "85–95% of normal weeks inside the 90% range, 2017–2019 (selection years)",
         "Model A v1": f"{float(out['v1_selection_row']['coverage90_2017_2019']):.3f}", "Model A v2": f"{cov_sel:.3f}",
         "met": "yes" if 0.85 <= cov_sel <= 0.95 else "no"},
        {"target (roadmap step 2)": "85–95% of normal weeks inside the 90% range, 2020 (test year)",
         "Model A v1": f"{float(out['CAL']['v1'].set_index('year')['inside 90% range'].get(2020, np.nan)):.3f}",
         "Model A v2": f"{cov20:.3f}", "met": "yes" if 0.85 <= cov20 <= 0.95 else "no"},
    ]
    return pd.DataFrame(rows)


def test_run_log(out: dict) -> list[str]:
    """Every scoring of 2020 is listed, so a reader can see that the test year was not tuned on."""
    run1 = MODEL_A_V2_DIR / "test_runs" / "run1_metrics.json"
    if not run1.exists():
        return []
    m1 = json.loads(run1.read_text(encoding="utf-8"))
    c1 = json.loads((MODEL_A_V2_DIR / "test_runs" / "run1_config.json").read_text(encoding="utf-8"))

    def pick(sets, key):
        r = next(x for x in sets[key] if x["method"] == "Model A v2")
        return r["recall"], r["false_alert_rate"]

    rows = []
    for name, sets, tau in (("run 1 (cap bug)", m1["sets"], c1["TAU_model_a_v2"]),
                            ("run 2 (this report)", {k: v.to_dict("records") for k, v in out["R"].items()}, out["taus"]["v2"])):
        rs, fs = pick(sets, "dengue 2020: real swaps")
        ri, fi = pick(sets, "dengue 2020 (test): injected, all types")
        rows.append({"test run": name, "v2 tau": f"{tau:.3g}", "2020 swaps recall": rs, "2020 false-alert rate": fs,
                     "2020 injected recall": ri, "2020 false-alert rate (eval copy)": fi})
    return [
        "### Test-run log", "",
        "The 2020 test year was scored twice. **Run 1** had an implementation bug in the threshold rule: the 1% "
        "false-alert cap was counted on the evaluation copy's normal weeks, whose injected failures widen the model, "
        "instead of on the real 2019 stream. The bug is visible on 2019 alone: run 1's tau flagged 1.7% of real 2019 "
        "normal weeks, above the stated 1% budget. **Run 2** counts the cap on the real 2019 stream, as the rule says "
        "and as v1 does. Nothing else changed; no setting was chosen by looking at 2020. Run 1's full outputs are kept "
        "in `test_runs/`.", "", md(pd.DataFrame(rows)),
    ]


def figures(out: dict) -> list[str]:
    fig_dir = MODEL_A_V2_DIR / "figures"
    fig_dir.mkdir(parents=True, exist_ok=True)
    names = []
    P = out["frames"]["P"]

    def save(fig, name):
        fig.tight_layout()
        fig.savefig(fig_dir / name, dpi=130)
        plt.close(fig)
        names.append(name)

    # 1. weekly false-alert rate 2019-2020
    fig, ax = plt.subplots(figsize=(10, 3.6))
    for k, color in (("v1", "#c0504d"), ("v2", "#1f77b4")):
        d = P[k][ok_scored(P[k]) & P[k].week_start.dt.year.isin([2019, 2020])]
        thr = out["taus"][k]
        w = d.assign(a=d.p_low < thr).groupby("week_start").a.mean()
        ax.plot(w.index, w.values, color=color, lw=1.4, label=f"Model A {k}")
    ax.axhline(0.01, color="grey", ls="--", lw=1, label="1% budget")
    ax.axvline(pd.Timestamp("2020-03-15"), color="black", lw=0.8, ls=":")
    ax.text(pd.Timestamp("2020-03-22"), ax.get_ylim()[1] * 0.9, "COVID-19 lockdown", fontsize=8)
    ax.set_ylabel("share of normal weeks flagged")
    ax.set_title("False alerts per week (normal location-weeks only), 2019 tuning year and 2020 test year")
    ax.legend(loc="upper left", fontsize=8)
    save(fig, "1_weekly_false_alerts_2019_2020.png")

    # 2. PIT histograms
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.2), sharey=True)
    for ax, k in zip(axes, ("v1", "v2")):
        ax.bar(np.arange(10) / 10 + 0.05, out["PIT"][k], width=0.09, color="#1f77b4" if k == "v2" else "#c0504d")
        ax.axhline(0.1, color="grey", ls="--", lw=1)
        ax.set_title(f"Model A {k}: p_low of normal weeks, 2019–2020")
        ax.set_xlabel("p_low (flat at 0.10 = well calibrated)")
    axes[0].set_ylabel("share of weeks")
    save(fig, "2_pit_v1_vs_v2.png")

    # 3. threshold curve on 2019
    c = out["threshold_curve"]
    fig, ax = plt.subplots(figsize=(6.5, 3.6))
    ax.plot(c.false_alert_rate, c.recall, color="#1f77b4", label="recall")
    ax.plot(c.false_alert_rate, c.f1, color="#2ca02c", label="F1")
    sel = c.loc[(c.tau - out["taus"]["v2"]).abs().idxmin()]
    ax.scatter([sel.false_alert_rate], [sel.f1], color="black", zorder=3, label=f"chosen tau = {out['taus']['v2']:.2g}")
    ax.set_xlabel("false-alert rate on 2019 normal weeks (capped at the 1% budget)")
    ax.set_title("Threshold on the 2019 tuning year (injected failures)")
    ax.legend(fontsize=8)
    save(fig, "3_threshold_curve_2019.png")

    # 4. reliability of p_fail on 2020
    rel = list(out["REL"].values())[0]
    rel = rel[rel.rows > 0]
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot([0, 1], [0, 1], color="grey", ls="--", lw=1)
    ax.scatter(rel.mean_p_fail, rel.observed_failure_share, s=np.clip(rel.rows / 20, 10, 300), color="#1f77b4")
    for r in rel.itertuples():
        ax.annotate(f"n={r.rows}", (r.mean_p_fail, r.observed_failure_share), fontsize=7, xytext=(4, 2),
                    textcoords="offset points")
    ax.set_xscale("symlog", linthresh=0.01)
    ax.set_xlabel("predicted p_fail")
    ax.set_ylabel("observed share that were real swaps")
    ax.set_title("p_fail reliability, 2020 (not used to fit)")
    save(fig, "4_pfail_reliability_2020.png")

    # 5. the series with the most v1 false alerts in 2020
    v1 = P["v1"]
    fa = v1[ok_scored(v1) & (v1.week_start.dt.year == 2020) & (v1.p_low < out["taus"]["v1"])]
    loc = fa.location_id.value_counts().index[0]
    fig, ax = plt.subplots(figsize=(10, 3.8))
    for k, color in (("v1", "#c0504d"), ("v2", "#1f77b4")):
        s = P[k][(P[k].location_id == loc) & P[k].week_start.dt.year.isin([2019, 2020])]
        ax.fill_between(s.week_start, s.pi_low, s.pi_high, color=color, alpha=0.15, step="mid")
        ax.plot(s.week_start, s.expected, color=color, lw=1.3, label=f"Model A {k} expected (90% range shaded)")
    s = v1[(v1.location_id == loc) & v1.week_start.dt.year.isin([2019, 2020])]
    ax.plot(s.week_start, s.cases, color="black", lw=0.9, marker=".", ms=3, label="reported cases")
    ax.set_title(f"{s.location.iloc[0]}: the place with the most v1 false alerts in 2020")
    ax.legend(fontsize=8, loc="upper right")
    save(fig, "5_example_series_2019_2020.png")

    # 6. region false alerts 2020
    rg = out["region"]
    rg = rg[rg["failure set"] == "real swaps 2020 (test)"]
    fig, ax = plt.subplots(figsize=(8, 3.2))
    lab = rg.model + " · " + rg.pooling
    ax.barh(lab, rg["false region alerts (clean region-weeks)"], color="#c0504d", label="false region alerts")
    ax.set_xlabel("share of clean 2020 region-weeks flagged")
    ax.set_title("Shared-source (region) alerts in 2020")
    save(fig, "6_region_false_alerts_2020.png")
    return names


def write(out: dict, manifest: dict) -> None:
    sel_table = out["selection"]["table"] if "table" in out["selection"] else pd.read_csv(MODEL_A_V2_DIR / "selection_2016_2019.csv")
    out["selection_row"] = sel_table.set_index("candidate").loc[out["chosen"]]
    out["v1_selection_row"] = sel_table.set_index("candidate").loc["v1"]
    figs = figures(out)
    dw = done_when(out)
    head = headline_table(out)
    R = out["R"]
    sw = R["dengue 2020: real swaps"].set_index("method")
    inj = R["dengue 2020 (test): injected, all types"].set_index("method")
    rg = out["region"]
    rg20 = rg[rg["failure set"] == "real swaps 2020 (test)"].set_index(["model", "pooling"])
    v1_rg = rg20["false region alerts (clean region-weeks)"].iloc[0]
    v2_rg = rg20.loc[("Model A v2", "Stouffer, correlation-adjusted"), "false region alerts (clean region-weeks)"]
    v2_rg_det = rg20.loc[("Model A v2", "Stouffer, correlation-adjusted"), "detected"]
    v1_own_rg = rg20.loc[("Model A v1", "Fisher"), "false region alerts (clean region-weeks)"]
    met = dw.met.eq("yes").sum()
    br = out["brier"]

    L = [
        "# Model A v2: evaluation report", "",
        f"Run `{out['run_id']}` · generated by `python -m iris_pipeline model-a` · runtime {out['runtime_seconds']/60:.1f} min · "
        f"`scores_v2.csv` SHA-256 `{out['scores_sha256'][:16]}…`", "",
        "## In plain words", "",
        f"- **What Model A does.** For every place and week it predicts how many dengue cases should be reported, from "
        f"earlier weeks only, and flags weeks that came in far too low. A flag is a lead for staff to check, not a confirmed error.",
        f"- **What changed in v2.** (1) It follows the recent level of reporting, so it adjusts after a real drop such as "
        f"COVID-19 in 2020 instead of flagging it for months. (2) Its 90% ranges also account for uncertainty in the model "
        f"itself and for some years being bigger epidemics than others. (3) Its threshold was set on 2019 using simulated "
        f"failures. (4) Every week now carries `p_fail`, a probability that the report is a real failure, and `shortfall`, "
        f"the cases likely missing. (5) Region-wide evidence is pooled allowing for places that move together.",
        f"- **False alarms in 2020** (normal weeks wrongly flagged): v1 {sw.loc['Model A v1','false_alert_rate']:.1%} → "
        f"v2 {sw.loc['Model A v2','false_alert_rate']:.1%} (budget 1%).",
        f"- **Real swapped reports caught in 2020:** v1 {sw.loc['Model A v1','recall']:.0%}, v2 {sw.loc['Model A v2','recall']:.0%}, "
        f"best simple baseline {sw.drop(index=['Model A v1','Model A v2']).recall.max():.0%}. "
        f"Simulated failures caught in 2020: v1 {inj.loc['Model A v1','recall']:.0%}, v2 {inj.loc['Model A v2','recall']:.0%}.",
        f"- **Region-wide alerts in 2020:** false region alerts went from {v1_rg:.0%} (v1 as reported) to {v2_rg:.0%} "
        f"(v2 with correlation-adjusted pooling), while {v2_rg_det:.0%} of the real swap region-weeks are still flagged. "
        f"Most of that drop comes from giving region alerts their own threshold (v1 with its own region threshold: "
        f"{v1_own_rg:.0%}); v2's model and pooling take it the rest of the way.",
        f"- **Roadmap targets met: {met} of {len(dw)}** (table below). Targets that were missed are reported as missed; "
        f"nothing was re-tuned on 2020.",
        f"- **Bottom line.** v2 is not better than v1 on every count; it is a different trade-off. It cuts false alarms "
        f"(individual weeks {sw.loc['Model A v1','false_alert_rate']:.0%} → {sw.loc['Model A v2','false_alert_rate']:.0%}, "
        f"regions {v1_rg:.0%} → {v2_rg:.0%}) and ranks simulated failures better (AUC "
        f"{inj.loc['Model A v1','auc']:.2f} → {inj.loc['Model A v2','auc']:.2f}), but it catches far fewer of the real "
        f"2020 swaps, because once it has followed the COVID-era low counts a zero no longer looks unusual. Neither version "
        f"holds the 1% budget through the April–June 2020 drop: a level change that sudden and that large is outside "
        f"anything in 2016–2019. Use v2's region (hub) evidence for shared failures; treat single-week alerts in a "
        f"period of sudden real change with caution.", "",
        "## Roadmap step 2: done-when checklist", "", md(dw), "",
        "## How the test was kept honest", "",
        "- **Split:** train 2016–2018 (history only), tune 2019, test 2020. Scores are rolling-origin: each week is "
        "predicted from earlier weeks only (`tests/test_no_leakage.py` checks this).",
        f"- **Model choice before the test:** {len(sel_table)} variants were compared on 2016–2019 only, with a rule fixed in "
        f"advance (90% range coverage 85–95% on 2017–2019, then the best 2019 recall on injected failures). "
        f"Chosen: **`{out['chosen']}`**: {out['selection']['reason']}. The choice was written to `selection.json` before "
        "any 2020 metric was computed.",
        "- **Same failures for both versions:** v1's injected failures are re-read from "
        "`models/data/synthetic/model_a_injected_failures.csv`, not re-drawn.",
        "- **Faithful port:** v1 re-run inside this package reproduces the published v1 `scores.csv` "
        "(`tests/test_v1_reproduces.py`).", "",
        *test_run_log(out), "",
        "### Variants compared on 2016–2019", "", md(sel_table.drop(columns=["scored_rows_2019"]), 4), "",
        "## 2020 test: headline results", "",
        "95% intervals are cluster-bootstrap intervals (whole places resampled, 400 draws). Thresholds frozen on 2019.", "",
        md(head), "",
        "## Threshold", "",
        f"- v1: tau = {out['taus']['v1']:.3g} (1% of 2019 normal weeks).",
        f"- v2: tau = **{out['taus']['v2']:.3g}**: the best F1 on 2019 injected failures among thresholds whose 2019 "
        f"false-alert rate is within 1%. (At exactly 1% of 2019 normal weeks it would be {out['taus']['v2_budget']:.3g}.)",
        f"- Baselines: {', '.join(f'{k} > {v:.3g}' for k, v in out['H'].items())} (1% of 2019 normal weeks).", "",
        "![threshold](figures/3_threshold_curve_2019.png)", "",
        "## Calibration of the 90% range", "", "**Model A v1**", "", md(out["CAL"]["v1"]), "", "**Model A v2**", "",
        md(out["CAL"]["v2"]), "", "![pit](figures/2_pit_v1_vs_v2.png)", "",
        "![weekly](figures/1_weekly_false_alerts_2019_2020.png)", "", "![example](figures/5_example_series_2019_2020.png)", "",
        "## `p_fail`: probability of a real failure", "",
        f"Isotonic regression of 'is a failure' on −log10(p_low), fitted on 2019 (injected failures vs normal weeks), "
        f"then shifted from the fitting set's failure share ({out['pfail']['train_failure_share']:.3f}) to the real "
        f"failure share in the 2016–2018 labels ({out['pfail']['real_failure_share']:.4f}). Checked on 2020 real swaps, "
        f"which were not used to fit it:", "",
        md(list(out["REL"].values())[0], 4), "",
        f"Brier score {br['model']:.4f} vs {br['base_rate_only']:.4f} for always predicting the base rate "
        f"({br['base_rate']:.4f}); lower is better.", "", "![reliability](figures/4_pfail_reliability_2020.png)", "",
        "## Shared-source evidence (region = hub)", "",
        "Real data has no reporting-hub table, so each region's RESU is used as the hub (`hub_id = RESU-<region>`). "
        "Fisher pooling (v1) treats the places in a region as independent witnesses; correlation-adjusted Stouffer (v2) "
        "discounts them by their average correlation on normal 2016–2018 weeks. Every (model, pooling) pair gets its own "
        "region-week threshold at 1% of clean 2019 region-weeks; the first row repeats v1's own report.", "",
        md(rg), "", "![region](figures/6_region_false_alerts_2020.png)", "",
        "## COVID flag (sensitivity analysis, not selectable)", "",
        "`covid_period` is 0 before 2020, so 2016–2019 cannot judge it; it is shown here only for transparency.", "",
    ]
    for k in [k for k in R if k.endswith("[covid sensitivity]")]:
        L += [f"**{k}**", "", md(R[k][["method", "positives", "recall", "precision", "f1", "false_alert_rate", "auc"]]), ""]
    L += ["## Measles, rubella and TB (thresholds transferred from dengue, no retuning)", ""]
    for k in [k for k in R if k.startswith(("measles", "rubella", "TB"))]:
        L += [f"**{k}**", "", md(R[k][["method", "positives", "recall", "precision", "f1", "false_alert_rate", "auc"]]), ""]
    L += ["## Every dengue failure set", ""]
    for k in [k for k in R if k.startswith("dengue") and not k.endswith("]")]:
        L += [f"**{k}**", "", md(R[k].drop(columns=["tp", "fp", "fn", "tn"])), ""]
    L += [
        "## Limits", "",
        "- Flags are **leads to verify**, not confirmed errors. Real labels are the 581 swapped rows and 3 regional gaps "
        "found during cleaning; other failures in the data are unknown and count as normal weeks here.",
        "- Injected failures are simulated. `p_fail` is calibrated on dengue province-weeks; for other diseases it is "
        "reported but not validated.",
        "- The hub is the region's RESU because real reporting pathways are not available. The synthetic reporting "
        "network (roadmap step 3) tests real hub structure.",
        "- The year-to-year term needs at least 26 reported periods in a year, so it is inactive for the monthly TB series.",
        "- 2019 was a national dengue epidemic year; thresholds tuned on it may be conservative in calmer years.", "",
    ]
    (MODEL_A_V2_DIR / "eval_report.md").write_text("\n".join(L), encoding="utf-8")

    metrics = {
        "run_id": out["run_id"], "chosen_variant": out["chosen"], "done_when": dw.to_dict("records"),
        "headline": head.to_dict("records"),
        "sets": {k: v.to_dict("records") for k, v in R.items()},
        "bootstrap_ci": out["CI"], "calibration_by_year": {k: v.to_dict("records") for k, v in out["CAL"].items()},
        "region": out["region"].to_dict("records"), "brier": out["brier"],
        "pfail_reliability": {k: v.to_dict("records") for k, v in out["REL"].items()},
        "figures": figs,
    }
    (MODEL_A_V2_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2, default=_json), encoding="utf-8")
    (MODEL_A_V2_DIR / "config.json").write_text(json.dumps(manifest, indent=2, default=_json), encoding="utf-8")
    out["threshold_curve"].to_csv(MODEL_A_V2_DIR / "threshold_curve_2019.csv", index=False, float_format="%.6g")


def _json(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.strftime("%Y-%m-%d")
    if isinstance(o, tuple):
        return list(o)
    if isinstance(o, pd.DataFrame):
        return o.to_dict("records")
    return str(o)
