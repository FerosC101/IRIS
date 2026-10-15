"""Recovery analytics: did reporting improve?

Completeness and timeliness come from :mod:`iris.services.slots`. When a
dataset does not define expected submissions or timestamps, the metric is
reported as not calculable instead of being estimated.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session
from statsmodels.stats.proportion import proportion_confint

from iris import config
from iris.models import InterventionAction, InterventionAssignment, InterventionOutcome, ReportingConcern, ReportingUnit
from iris.services import datasets
from iris.services.slots import summarize

NOT_CALC_EXPECTED = "Not calculable from this dataset: it does not define expected submissions (reporting schedules)."
NOT_CALC_TIMESTAMPS = "Not calculable from this dataset: it has no due-date and received timestamps."


def _ci(k: int, n: int) -> list[float] | None:
    if n == 0:
        return None
    lo, hi = proportion_confint(k, n, alpha=0.05, method="wilson")
    return [round(float(lo), 4), round(float(hi), 4)]


def filter_slots(session: Session, sl: pd.DataFrame, province: str | None, unit_id: str | None, unit_type: str | None, category: str | None) -> pd.DataFrame:
    units = {u.id: u for u in session.execute(select(ReportingUnit)).scalars()}
    out = sl
    if unit_id:
        out = out[out["unit_id"] == unit_id]
    if province:
        out = out[out["unit_id"].map(lambda u: units[u].province if u in units else None) == province]
    if unit_type:
        out = out[out["unit_id"].map(lambda u: units[u].unit_type if u in units else None) == unit_type]
    if category:
        out = out[out["category_code"] == category]
    return out


def series(sl: pd.DataFrame, monthly: bool) -> list[dict]:
    sub = sl[sl["frequency"] == ("monthly" if monthly else "weekly")]
    rows = []
    for ps, g in sub.groupby("period_start", sort=True):
        s = summarize(g)
        rows.append({"period_start": ps.isoformat(), "week": int(g["week"].iloc[0]), **s})
    return rows


def window_metrics(sl: pd.DataFrame, w0: int, w1: int) -> dict | None:
    if w1 < w0 or w0 > config.N_WEEKS - 1:
        return None
    w1 = min(w1, config.N_WEEKS - 1)
    g = sl[(sl["frequency"] == "weekly") & (sl["week"] >= w0) & (sl["week"] <= w1)]
    if g.empty:
        return None
    s = summarize(g)
    rec = g[g["status"] != "not_received"]
    incomplete = int(((rec["value_status"] == "blank") | (pd.to_numeric(rec["fields_complete"], errors="coerce") < 0.8)).sum())
    return {**s, "weeks": [w0, w1], "completeness_ci": _ci(s["received"], s["expected"]), "timeliness_ci": _ci(s["on_time"], s["expected"]),
            "incomplete": incomplete, "incomplete_share": incomplete / len(rec) if len(rec) else None}


def recovery(session: Session, dataset_id: str, province: str | None = None, unit_id: str | None = None,
             unit_type: str | None = None, category: str | None = None, w_from: int | None = None, w_to: int | None = None) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    sl = datasets.slots(session, dataset_id)
    out: dict = {
        "dataset": {"id": ds.id, "name": ds.name, "designation": ds.designation},
        "completeness_available": sl is not None,
        "timeliness_available": sl is not None or ds.has_timestamps,
        "messages": [],
    }
    if sl is None:
        out["messages"].append(NOT_CALC_EXPECTED)
        recs = datasets.records_frame(session, dataset_id)
        if ds.has_timestamps and not recs.empty:
            r = recs.dropna(subset=["due_at", "received_at"])
            if len(r):
                on = int((pd.to_datetime(r["received_at"]) <= pd.to_datetime(r["due_at"])).sum())
                out["received_records_on_time_share"] = {"on_time": on, "records": int(len(r)), "share": on / len(r),
                                                         "note": "Share of received records that arrived by their due date. Records that were never received cannot be counted without expected submissions."}
        else:
            out["messages"].append(NOT_CALC_TIMESTAMPS)
        out.update({"series": [], "overall": None, "concerns": [], "resolution": [], "before_after": []})
        return out

    monthly = bool(category) and sl[sl["category_code"] == category]["frequency"].eq("monthly").any()
    f = filter_slots(session, sl, province, unit_id, unit_type, category)
    if w_from is not None:
        f = f[(f["week"] >= w_from) | (f["frequency"] == "monthly")]
    if w_to is not None:
        f = f[(f["week"] <= w_to) | (f["frequency"] == "monthly")]
    out["frequency"] = "monthly" if monthly else "weekly"
    out["series"] = series(f, monthly)
    out["overall"] = summarize(f[f["frequency"] == out["frequency"]])
    if not monthly:
        out["messages"].append("The latest week may still receive late reports, so its completeness can rise after the snapshot date.")

    # Concern flow per week
    units_scope = set(f["unit_id"].unique())
    concerns = [c for c in session.execute(select(ReportingConcern).where(ReportingConcern.dataset_id == dataset_id)).scalars()
                if {u.id for u in c.units} & units_scope]
    flow = []
    for t in range(config.N_WEEKS):
        end = config.week_end(t)
        created = [c for c in concerns if c.created_at.date() <= end]
        closed = [c for c in created if c.resolved_at and c.resolved_at.date() <= end]
        flow.append({
            "week": t, "period_start": config.week_start(t).isoformat(),
            "new": sum(1 for c in concerns if config.week_start(t) <= c.created_at.date() <= end),
            "resolved": sum(1 for c in concerns if c.resolved_at and c.status == "resolved" and config.week_start(t) <= c.resolved_at.date() <= end),
            "dismissed": sum(1 for c in concerns if c.resolved_at and c.status == "dismissed" and config.week_start(t) <= c.resolved_at.date() <= end),
            "open_at_end": len(created) - len(closed),
        })
    out["concerns"] = flow
    out["concerns_after_snapshot"] = sum(1 for c in concerns if c.created_at.date() > config.week_end(config.N_WEEKS - 1))
    out["concern_totals"] = {
        "open": sum(1 for c in concerns if c.status not in ("resolved", "dismissed")),
        "resolved": sum(1 for c in concerns if c.status == "resolved"),
        "dismissed": sum(1 for c in concerns if c.status == "dismissed"),
    }

    res_rows = []
    for kind in sorted({c.concern_type for c in concerns}):
        res = [(c.resolved_at - c.created_at).total_seconds() / 86400 for c in concerns if c.concern_type == kind and c.status == "resolved" and c.resolved_at]
        dis = [(c.resolved_at - c.created_at).total_seconds() / 86400 for c in concerns if c.concern_type == kind and c.status == "dismissed" and c.resolved_at]
        res_rows.append({
            "concern_type": kind, "resolved": len(res), "median_days_to_resolution": round(float(np.median(res)), 1) if res else None,
            "dismissed": len(dis), "median_days_to_dismissal": round(float(np.median(dis)), 1) if dis else None,
            "open": sum(1 for c in concerns if c.concern_type == kind and c.status not in ("resolved", "dismissed")),
        })
    out["resolution"] = res_rows

    # Before / during / after for completed corrective actions
    rows = []
    q = select(InterventionAssignment).where(InterventionAssignment.status.in_(("completed", "closed")))
    for asg in session.execute(q).scalars():
        action = session.get(InterventionAction, asg.action_id)
        concern = session.get(ReportingConcern, action.concern_id) if action else None
        if concern is None or concern.dataset_id != dataset_id:
            continue
        if unit_id and unit_id not in asg.target_unit_ids:
            continue
        if not set(asg.target_unit_ids) & units_scope:
            continue
        target = sl[sl["unit_id"].isin(asg.target_unit_ids)]
        done_week = config.week_index(asg.completed_at.date()) if asg.completed_at else None
        before = window_metrics(target, concern.week_start_index - 4, concern.week_start_index - 1)
        during = window_metrics(target, concern.week_start_index, concern.week_end_index)
        after = window_metrics(target, done_week + 1, done_week + 4) if done_week is not None else None
        outcomes = session.execute(select(InterventionOutcome).where(InterventionOutcome.assignment_id == asg.id).order_by(InterventionOutcome.recorded_at)).scalars().all()
        rows.append({
            "assignment_id": asg.id, "title": asg.title, "concern_id": concern.id, "target_unit_ids": asg.target_unit_ids,
            "completed_at": asg.completed_at.isoformat() if asg.completed_at else None,
            "before": before, "during": during, "after": after,
            "after_message": None if after else "Not yet observable in this dataset: no reporting weeks after the action was completed.",
            "change_vs_during": None if not (after and during) else round(after["completeness"] - during["completeness"], 4),
            "outcomes": [{"status": o.outcome_status, "source": o.source, "summary": o.summary, "recorded_at": o.recorded_at.isoformat()} for o in outcomes],
            "data_label": "Synthetic scenario outcome" if ds.designation == "synthetic" else "Observed in imported data",
        })
    out["before_after"] = rows
    out["causality_note"] = ("Before/after comparisons show association only. Reporting can improve for reasons unrelated to an action "
                             "(for example a scenario ending in the simulation, or regression to the usual pattern).")
    return out
