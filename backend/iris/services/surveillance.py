"""Weekly surveillance summary for one reporting category.

Every count comes from the reporting slots (``services.slots``), so the
summary uses the same completeness definition as every other page:

* a report with cases, a zero-case report and a report with a blank value are
  all *received* and count toward completeness;
* a missing submission (expected but not received) is not a report and does not.

Blank and zero stay separate: a blank field is not a zero.
"""

from __future__ import annotations

import statistics

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.models import InterventionAction, InterventionAssignment, ReportingCategory, ReportingConcern, ReportingUnit
from iris.services import datasets, explorer, ids
from iris.services.concerns import OPEN_STATUSES
from iris.services.context import Actor
from iris.services.slots import summarize

UNIT_TYPES = ("rhu", "hospital", "laboratory")
VERIFYING = ("under_review", "clarification_requested", "in_investigation")
TRAILING_WEEKS = 8
TRAILING_MIN = 4


def _state(row) -> str:
    if row.status == "not_received":
        return "missing"
    if row.value_status == "blank":
        return "blank"
    if row.value_status == "zero":
        return "zero"
    return "reported"


def _counts(sub: pd.DataFrame) -> dict:
    states = [_state(r) for r in sub.itertuples(index=False)]
    s = summarize(sub)
    return {
        "expected": s["expected"], "received": s["received"], "on_time": s["on_time"], "late": s["late"],
        "with_cases": states.count("reported"), "zero": states.count("zero"), "blank": states.count("blank"), "missing": states.count("missing"),
        "completeness": s["completeness"], "timeliness": s["timeliness"],
    }


def _cases(sub: pd.DataFrame) -> float | None:
    vals = pd.to_numeric(sub.loc[sub["status"] != "not_received", "value"], errors="coerce").dropna()
    return float(vals.sum()) if len(vals) else None


def summary(session: Session, actor: Actor, dataset_id: str, category: str, week: int | None, province: str | None,
            unit_type: str | None, heat_weeks: int = 6, trend_weeks: int = 12) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    cat = session.get(ReportingCategory, category)
    if cat is None:
        raise HTTPException(status_code=422, detail=f"Unknown reporting category {category}.")
    if cat.frequency != "weekly":
        raise HTTPException(status_code=422, detail=f"{cat.name} is reported monthly; the weekly summary needs a weekly category.")
    if unit_type and unit_type not in UNIT_TYPES:
        raise HTTPException(status_code=422, detail="Unit group must be rhu, hospital or laboratory.")
    last = config.N_WEEKS - 1
    week = last if week is None else week
    if not 0 <= week <= last:
        raise HTTPException(status_code=422, detail=f"Week must be between 0 and {last}.")
    labels = {w["week"]: w for w in datasets.week_labels()}
    base = {"dataset": {"id": ds.id, "name": ds.name, "designation": ds.designation},
            "category": {"code": cat.code, "name": cat.name}, "week": labels[week], "as_of": config.AS_OF.isoformat()}

    sl = datasets.slots(session, dataset_id)
    if sl is None:
        return {**base, "available": False,
                "message": "Not calculable from this dataset: it does not define which units are expected to report."}

    units = {u.id: u for u in session.execute(select(ReportingUnit)).scalars()}
    scope_province = actor.province if actor.role == "provincial_coordinator" and actor.province else province
    sub = sl[(sl["frequency"] == "weekly") & (sl["category_code"] == category)]
    if actor.role == "rhu_staff":
        sub = sub[sub["unit_id"] == actor.reporting_unit_id]
    if scope_province:
        sub = sub[sub["unit_id"].map(lambda u: units[u].province if u in units else None) == scope_province]
    if unit_type:
        sub = sub[sub["unit_id"].map(lambda u: units[u].unit_type if u in units else None) == unit_type]

    current, previous = sub[sub["week"] == week], sub[sub["week"] == week - 1]
    cur_cases, prev_cases = _cases(current), _cases(previous) if week > 0 else None
    change = (cur_cases - prev_cases) / prev_cases if cur_cases is not None and prev_cases else None

    totals = {t: _cases(sub[sub["week"] == t]) for t in range(0, week + 1)}
    trend = []
    for t in range(max(0, week - trend_weeks + 1), week + 1):
        prior = [v for k, v in totals.items() if t - TRAILING_WEEKS <= k < t and v is not None]
        c = _counts(sub[sub["week"] == t])
        trend.append({**{k: labels[t][k] for k in ("week", "iso_week", "start", "end")}, "cases": totals[t],
                      "trailing_median": statistics.median(prior) if len(prior) >= TRAILING_MIN else None,
                      "received": c["received"], "expected": c["expected"], "blank": c["blank"], "completeness": c["completeness"]})

    unit_ids = set(sub["unit_id"])
    links, inv_ids = explorer.linked_concerns(session, dataset_id), ids.investigation_ids(session)
    heat_range = list(range(max(0, week - heat_weeks + 1), week + 1))
    heat_rows = []
    for uid in sorted(unit_ids, key=lambda u: units[u].name if u in units else u):
        cells = []
        g = sub[sub["unit_id"] == uid].set_index("week")
        for t in heat_range:
            if t not in g.index:
                cells.append({"week": t, "state": "not_expected", "value": None, "report_id": None, "concern_id": None})
                continue
            r = g.loc[t]
            rid = None if pd.isna(r["record_id"]) else int(r["record_id"])
            link = explorer.link_fields(links, inv_ids, uid, t, category)
            cells.append({"week": t, "state": _state(r), "value": None if pd.isna(r["value"]) else float(r["value"]),
                          "report_id": ids.report_id(rid), "record_id": rid, "concern_id": link["concern_id"],
                          "investigation_id": link["investigation_id"]})
        u = units.get(uid)
        heat_rows.append({"unit_id": uid, "name": u.name if u else uid, "unit_type": u.unit_type if u else None,
                          "province": u.province if u else None, "cells": cells})

    concerns = [c for c in session.execute(select(ReportingConcern).where(ReportingConcern.dataset_id == dataset_id,
                                                                          ReportingConcern.status.in_(OPEN_STATUSES))).scalars()
                if c.week_start_index <= week <= c.week_end_index and {u.id for u in c.units} & unit_ids]
    flag_ids = {c.id for c in concerns}
    verifying = [c for c in concerns if c.status in VERIFYING and c.verification == "unverified"]
    active = session.execute(select(InterventionAssignment).join(InterventionAction, InterventionAssignment.action_id == InterventionAction.id)
                             .where(InterventionAction.concern_id.in_(flag_ids), InterventionAssignment.status.in_(("approved", "in_progress")))).scalars().all()
    counts = _counts(current)
    return {
        **base, "available": True,
        "scope": {"role": actor.role, "province": scope_province, "unit_type": unit_type,
                  "unit_id": actor.reporting_unit_id if actor.role == "rhu_staff" else None},
        "units": counts,
        "cases": {"total": cur_cases, "previous_total": prev_cases, "change": change,
                  "note": "Totals include received reports only. Blank values and missing submissions are not counted as zero."},
        "flow": {"expected_units": counts["expected"], "reports_received": counts["received"], "flags": len(concerns),
                 "under_verification": len(verifying), "actions_assigned": len(active),
                 "flag_ids": sorted(flag_ids), "verifying_ids": sorted(c.id for c in verifying)},
        "trend": trend,
        "trend_note": f"Trailing median: the median weekly total of the previous {TRAILING_WEEKS} weeks in this dataset (observed, not a forecast).",
        "heatmap": {"weeks": [labels[t] for t in heat_range], "units": heat_rows},
        "notes": [
            "Zero-case reports are reports and count toward completeness. Missing submissions do not.",
            "A blank value is a received report without a count; it is not a zero.",
        ],
    }
