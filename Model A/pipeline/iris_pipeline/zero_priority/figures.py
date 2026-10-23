"""Figures for the zero-report prioritizer (matplotlib, written to outputs/zero_priority/figures/).

Categorical colours are the validated reference palette in fixed order (one colour per indicator or method, never
cycled); bands use one hue light-to-dark; text stays in ink colours; thin marks and a recessive grid.
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from .score import COMPONENTS, LABELS

PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"]
COMPONENT_COLOR = dict(zip(COMPONENTS, PALETTE))
BANDS = {"High": "#103e46", "Medium": "#188f89", "Low": "#b9dcd8"}
INK, INK2, GRID = "#24383c", "#637579", "#e3e9ea"


def _style(ax):
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.yaxis.label.set_color(INK2)
    ax.xaxis.label.set_color(INK2)
    ax.title.set_color(INK)


def priority_week(ranked: pd.DataFrame, model, path, top: int = 15) -> str:
    z = ranked[ranked.priority_score.notna()].copy()
    z["week_start"] = pd.to_datetime(z.week_start)
    counts = z.groupby("week_start").size()
    week = counts[counts >= 8].index.max() if (counts >= 8).any() else counts.idxmax()
    d = z[z.week_start == week].nlargest(top, "priority_score").iloc[::-1]
    used = [k for k in COMPONENTS if model.weights[k] > 0]
    wsum = sum(model.weights.values())
    fig, ax = plt.subplots(figsize=(8.2, 0.36 * len(d) + 1.6), dpi=150)
    left = np.zeros(len(d))
    for k in used:
        v = d[f"c_{k}"].fillna(0).to_numpy() * model.weights[k] / wsum * 100
        ax.barh(np.arange(len(d)), v, left=left, height=0.62, color=COMPONENT_COLOR[k], edgecolor="white", linewidth=1.5, label=LABELS[k])
        left += v
    for i, (_, r) in enumerate(d.iterrows()):
        ax.text(r.priority_score + 1, i, f"{r.priority_score:.0f}  {r.priority}", va="center", fontsize=8, color=INK)
    ax.set_yticks(np.arange(len(d)), d.location.str.title(), fontsize=8.5, color=INK)
    ax.set_xlim(0, 112)
    ax.set_xlabel("Priority score (0-100) and the indicators that make it up")
    ax.axvline(model.bands["High"], color=INK2, lw=0.8, ls=(0, (3, 3)))
    ax.axvline(model.bands["Medium"], color=INK2, lw=0.8, ls=(0, (1, 2)))
    ax.text(model.bands["High"], len(d) - 0.2, " High cut", fontsize=7.5, color=INK2, va="bottom")
    ax.text(model.bands["Medium"], len(d) - 0.2, " Medium cut", fontsize=7.5, color=INK2, va="bottom")
    ax.set_title(f"Zero reports to verify first, week of {week:%d %b %Y} (real data, top {len(d)})", fontsize=10.5, loc="left")
    ax.legend(loc="lower right", fontsize=8, frameon=False)
    ax.grid(axis="x", color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return f"{week:%Y-%m-%d}"


def indicators(ranked: pd.DataFrame, model, path) -> None:
    z = ranked[ranked.priority.isin(["High", "Medium"])]
    used = [k for k in COMPONENTS if model.weights[k] > 0]
    wsum = sum(model.weights.values())
    fig, axes = plt.subplots(1, 2, figsize=(8.6, 2.6), dpi=150, sharey=True)
    for ax, band in zip(axes, ["High", "Medium"]):
        b = z[z.priority == band]
        vals = [float((b[f"c_{k}"].fillna(0) * model.weights[k] / wsum * 100).mean()) if len(b) else 0 for k in used]
        ax.barh([LABELS[k] for k in used], vals, color=BANDS[band], height=0.55)
        for i, v in enumerate(vals):
            ax.text(v + 0.5, i, f"{v:.0f}", va="center", fontsize=8, color=INK)
        ax.set_title(f"{band} priority, 2020 (n = {len(b)})", fontsize=9.5, loc="left")
        ax.set_xlabel("Mean points contributed")
        ax.grid(axis="x", color=GRID, lw=0.6)
        ax.set_axisbelow(True)
        _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def budget(results: dict, path, methods: list[str]) -> None:
    panels = [("Real 2020 (test): swapped zeros", "Real data, 2020: swapped zero reports"),
              ("Synthetic 2020 (test): injected zeros", "Synthetic failures injected into 2020")]
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.4), dpi=150, sharey=True)
    for ax, (key, title) in zip(axes, panels):
        res = results[key]["methods"]
        for i, m in enumerate(methods):
            wb = res[m]["weekly_budget"]
            ks = [w["k_per_week"] for w in wb]
            ax.plot(ks, [w["recall"] for w in wb], color=PALETTE[i], lw=2, marker="o", ms=4.5, label=m)
        orc = results[key]["oracle_weekly_budget"]
        ax.plot(ks, [w["recall"] for w in orc], color=INK2, lw=1.2, ls=(0, (4, 3)), label="Ceiling: reviewer who knows the answers")
        ax.set_xticks(ks)
        ax.set_ylim(0, 1)
        ax.set_title(title, fontsize=9.5, loc="left")
        ax.grid(color=GRID, lw=0.6)
        ax.set_axisbelow(True)
        _style(ax)
    axes[0].set_ylabel("Share of bad zeros reached")
    axes[1].legend(fontsize=7.5, frameon=False, loc="center left", bbox_to_anchor=(1.0, 0.5))
    fig.supxlabel("Zero reports verified per week (national)", fontsize=9, color=INK2)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def reliability(results: dict, path) -> None:
    sets_ = [("Real 2016-2017 (tuning, in-sample): swapped zeros", "2016-2017 (in-sample)", PALETTE[1]),
             ("Real 2020 (test): swapped zeros", "2020 (held-out test)", PALETTE[0])]
    fig, ax = plt.subplots(figsize=(4.4, 3.8), dpi=150)
    ax.plot([0, 1], [0, 1], color=INK2, lw=0.8, ls=(0, (3, 3)))
    for key, lab, col in sets_:
        rel = results[key]["calibration"]["Model B · zero-report prioritizer"]["reliability"]
        ax.plot([r["mean_predicted"] for r in rel], [r["observed_share"] for r in rel], color=col, lw=2, marker="o", ms=4.5, label=lab)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Predicted share of bad zeros (p_priority)")
    ax.set_ylabel("Observed share (real swaps)")
    ax.set_title("Calibration on real labels", fontsize=10, loc="left")
    ax.legend(fontsize=8, frameon=False)
    ax.grid(color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def weekly_bands(ranked: pd.DataFrame, path) -> None:
    z = ranked[ranked.priority.isin(BANDS)].copy()
    z["week_start"] = pd.to_datetime(z.week_start)
    t = z.groupby(["week_start", "priority"]).size().unstack(fill_value=0).reindex(columns=list(BANDS), fill_value=0)
    fig, ax = plt.subplots(figsize=(9, 2.8), dpi=150)
    bottom = np.zeros(len(t))
    for b in ["High", "Medium", "Low"]:
        ax.bar(t.index, t[b], bottom=bottom, width=5.2, color=BANDS[b], edgecolor="white", linewidth=0.6, label=b)
        bottom += t[b].to_numpy()
    ax.set_ylabel("Zero reports")
    ax.set_title("Zero reports by priority each week, 2020 (real data)", fontsize=10, loc="left")
    ax.legend(fontsize=8, frameon=False, ncol=3, loc="upper left")
    ax.grid(axis="y", color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def write(fig_dir, ranked, results, model) -> dict:
    methods = ["Model B · zero-report prioritizer", "Model A v2 alone", "Zero-streak length (baseline)",
               "Historical mean, 26 weeks (baseline)", "Old Model B rule (fixed)", "Supervised GBM on real swap labels (experiment)"]
    week = priority_week(ranked, model, fig_dir / "1_priority_list_week.png")
    indicators(ranked, model, fig_dir / "2_contributing_indicators.png")
    budget(results, fig_dir / "3_weekly_budget_recall.png", methods)
    reliability(results, fig_dir / "4_calibration.png")
    weekly_bands(ranked, fig_dir / "5_weekly_priority_counts.png")
    return {"sample_week": week, "files": sorted(p.name for p in fig_dir.glob("*.png"))}
