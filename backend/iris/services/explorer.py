"""Data explorer: records, trends and data-quality summaries."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.models import AuditEvent, DataRecord, ReportingCategory, ReportingConcern, ReportingUnit
from iris.services import datasets, ids
from iris.services.concerns import OPEN_STATUSES

SORTABLE = {"period_start", "unit_name", "category_code", "value", "status", "received_at", "days_late", "area"}


def _units(session: Session) -> pd.DataFrame:
    return pd.DataFrame([{"unit_id": u.id, "unit_name": u.name, "province": u.province, "unit_type": u.unit_type}
                         for u in session.execute(select(ReportingUnit)).scalars()])


def table(session: Session, dataset_id: str) -> pd.DataFrame:
    """Unified explorer table: slots (with not-received rows) or raw records."""
    ds = datasets.get_dataset(session, dataset_id)
    sl = datasets.slots(session, dataset_id)
    if sl is not None:
        t = sl.merge(_units(session), on="unit_id", how="left")
        t["area"] = t["province"]
        rec = datasets.records_frame(session, dataset_id)[["id", "revision"]].rename(columns={"id": "record_id"})
        t = t.merge(rec, on="record_id", how="left")
    else:
        r = datasets.records_frame(session, dataset_id).copy()
        r = r.rename(columns={"reporting_unit_id": "unit_id", "id": "record_id"})
        if ds.has_units:
            r = r.merge(_units(session), on="unit_id", how="left")
        else:
            r["unit_name"] = None
            r["province"] = r["area"]
            r["unit_type"] = None
        received = pd.to_datetime(r["received_at"])
        due = pd.to_datetime(r["due_at"])
        r["status"] = np.where(received.notna() & due.notna(), np.where(received <= due, "on_time", "late"), "received")
        r["days_late"] = ((received - due).dt.total_seconds() / 86400).where(r["status"] == "late").round(1)
        r["frequency"] = None
        r["week"] = -1
        t = r
    return t


def apply_filters(t: pd.DataFrame, search: str | None, province: str | None, unit_id: str | None, category: str | None,
                  status: str | None, date_from: date | None, date_to: date | None) -> pd.DataFrame:
    if province:
        t = t[t["province"] == province]
    if unit_id:
        t = t[t["unit_id"] == unit_id]
    if category:
        t = t[t["category_code"] == category]
    if status:
        if status in ("blank", "zero", "reported"):
            t = t[t["value_status"] == status]
        else:
            t = t[t["status"] == status]
    if date_from:
        t = t[pd.to_datetime(t["period_start"]) >= pd.Timestamp(date_from)]
    if date_to:
        t = t[pd.to_datetime(t["period_start"]) <= pd.Timestamp(date_to)]
    if search:
        s = search.strip().lower()
        hay = (t["unit_name"].fillna("") + " " + t["area"].fillna("") + " " + t["category_code"].fillna("") + " " + t["record_id"].astype(str)).str.lower()
        t = t[hay.str.contains(s, regex=False)]
    return t


def _clean(v):
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (pd.Timestamp,)):
        return None if pd.isna(v) else v.isoformat()
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if v is pd.NaT:
        return None
    return v


def rows(session: Session, dataset_id: str, page: int, page_size: int, sort: str, order: str, **filters) -> dict:
    t = apply_filters(table(session, dataset_id), **filters)
    if sort not in SORTABLE:
        sort = "period_start"
    if sort in t.columns:
        t = t.sort_values([sort, "unit_name" if sort != "unit_name" else "period_start"], ascending=order == "asc", na_position="last", kind="mergesort")
    total = int(len(t))
    page_size = max(5, min(page_size, 200))
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, pages))
    chunk = t.iloc[(page - 1) * page_size: page * page_size]
    cols = ["record_id", "unit_id", "unit_name", "province", "area", "unit_type", "category_code", "frequency", "period_start", "period_end",
            "week", "value", "value_status", "due_at", "received_at", "status", "days_late", "fields_complete", "revision"]
    out = [{c: _clean(r.get(c)) for c in cols} for r in chunk.to_dict("records")]
    links, inv_ids = linked_concerns(session, dataset_id), ids.investigation_ids(session)
    for r in out:
        # Missing submissions make the merged column float; ids are integers.
        r["record_id"] = None if r["record_id"] is None else int(r["record_id"])
        r["revision"] = None if r["revision"] is None else int(r["revision"])
        r["report_id"] = ids.report_id(r["record_id"])
        r.update(link_fields(links, inv_ids, r["unit_id"], r["week"], r["category_code"]))
    return {"rows": out, "total": total, "page": page, "page_size": page_size, "pages": pages}


def linked_concerns(session: Session, dataset_id: str) -> dict[tuple[str, int], list[tuple[ReportingConcern, set[str]]]]:
    """(unit, week) -> concerns covering that unit-week, with the categories each one is about (empty = all)."""
    out: dict[tuple[str, int], list[tuple[ReportingConcern, set[str]]]] = {}
    for c in session.execute(select(ReportingConcern).where(ReportingConcern.dataset_id == dataset_id)).scalars():
        cats = set((c.detection_detail or {}).get("categories") or ([c.category_code] if c.category_code else []))
        if c.concern_type not in ("count_drop", "zero_case_run"):
            cats = set()  # reporting problems concern every category the unit reports
        for u in c.units:
            for w in range(c.week_start_index, c.week_end_index + 1):
                out.setdefault((u.id, w), []).append((c, cats))
    return out


def link_fields(links: dict, inv_ids: dict[str, str], unit_id: str | None, week: int | None, category: str | None) -> dict:
    """The concern a report (or missing submission) belongs to: an open one first, then the most recent."""
    match = [c for c, cats in links.get((unit_id, week), []) if not cats or category in cats] if unit_id and week is not None and week >= 0 else []
    match.sort(key=lambda c: (c.status not in OPEN_STATUSES, -c.updated_at.timestamp()))
    c = match[0] if match else None
    return {"concern_id": c.id if c else None, "investigation_id": inv_ids.get(c.id) if c else None, "concern_status": c.status if c else None,
            "concern_verification": c.verification if c else None, "concern_type": c.concern_type if c else None}


def record_detail(session: Session, dataset_id: str, record_id: int) -> dict:
    r = session.get(DataRecord, record_id)
    if r is None or r.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail=f"Record {record_id} was not found in this dataset.")
    unit = session.get(ReportingUnit, r.reporting_unit_id) if r.reporting_unit_id else None
    history = session.execute(select(AuditEvent).where(AuditEvent.entity_type == "record", AuditEvent.entity_id == str(record_id)).order_by(AuditEvent.at.desc())).scalars().all()
    status = None
    if r.due_at and r.received_at:
        status = "on_time" if r.received_at <= r.due_at else "late"
    ds = datasets.get_dataset(session, dataset_id)
    week = config.week_index(r.period_start) if ds.has_expectations and r.period_end and (r.period_end - r.period_start).days == 6 else None
    link = link_fields(linked_concerns(session, dataset_id), ids.investigation_ids(session), r.reporting_unit_id, week, r.category_code)
    return {
        "id": r.id, "report_id": ids.report_id(r.id), "dataset_id": r.dataset_id, "dataset_name": ds.name, "designation": ds.designation,
        "week": week, **link, "unit": {"id": unit.id, "name": unit.name, "province": unit.province} if unit else None,
        "area": r.area, "category_code": r.category_code, "period_start": r.period_start.isoformat(), "period_end": r.period_end.isoformat() if r.period_end else None,
        "value": r.value, "value_status": r.value_status, "due_at": r.due_at.isoformat() if r.due_at else None,
        "received_at": r.received_at.isoformat() if r.received_at else None, "status": status, "fields_complete": r.fields_complete,
        "source_row": r.source_row, "revision": r.revision, "note": r.note,
        "history": [{"at": e.at.isoformat(), "summary": e.summary, "action": e.action} for e in history],
    }


def trends(session: Session, dataset_id: str, variable: str, group_by: str, **filters) -> dict:
    t = apply_filters(table(session, dataset_id), **filters)
    sl_available = datasets.slots(session, dataset_id) is not None
    if variable in ("completeness", "timeliness") and not sl_available:
        return {"available": False, "message": "Not calculable from this dataset: it does not define expected submissions.", "series": [], "groups": []}
    if t["frequency"].notna().any():
        t = t[t["frequency"] == "weekly"] if not filters.get("category") or (t["frequency"] == "weekly").any() else t
    key = {"category": "category_code", "province": "province", "none": None}.get(group_by)
    t = t.assign(_g=t[key].fillna("Unspecified") if key else "All")
    out_rows: dict[str, dict] = {}
    groups = sorted(t["_g"].unique().tolist())
    for (ps, grp), g in t.groupby(["period_start", "_g"]):
        k = ps.isoformat() if hasattr(ps, "isoformat") else str(ps)
        row = out_rows.setdefault(k, {"period_start": k})
        if variable == "cases":
            vals = pd.to_numeric(g["value"], errors="coerce")
            row[grp] = float(vals.sum()) if vals.notna().any() else None
            row[f"{grp}__blank"] = int((g["value_status"] == "blank").sum())
        elif variable == "completeness":
            row[grp] = float((g["status"] != "not_received").mean())
        else:
            row[grp] = float((g["status"] == "on_time").mean())
    series = sorted(out_rows.values(), key=lambda r: r["period_start"])
    note = None
    if variable == "cases":
        note = "Sums include only values that were reported. Blank fields and reports not received are not counted as zero."
    return {"available": True, "series": series, "groups": groups, "note": note}


def quality(session: Session, dataset_id: str, **filters) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    t = apply_filters(table(session, dataset_id), **filters)
    received = t[t["status"] != "not_received"]
    n = int(len(t))
    fields = []
    for col, label in (("value", "Reported value"), ("received_at", "Received timestamp"), ("due_at", "Due date"), ("unit_id", "Reporting unit"), ("area", "Geographic area"), ("category_code", "Category")):
        if col not in received.columns:
            continue
        blank = int(received[col].isna().sum())
        fields.append({"field": col, "label": label, "records": int(len(received)), "missing": blank,
                       "missing_share": blank / len(received) if len(received) else None})
    vs = received["value_status"].value_counts().to_dict() if "value_status" in received else {}
    dup_cols = [c for c in ("unit_id", "area", "category_code", "period_start") if c in received.columns]
    raw = datasets.records_frame(session, dataset_id)
    dup_keys = [c for c in ("reporting_unit_id", "area", "category_code", "period_start") if c in raw.columns]
    dups = int(raw.duplicated(subset=dup_keys, keep=False).sum()) if len(raw) else 0
    per_unit = []
    if datasets.slots(session, dataset_id) is not None:
        for (uid, name), g in t.groupby(["unit_id", "unit_name"]):
            rec = g[g["status"] != "not_received"]
            per_unit.append({
                "unit_id": uid, "unit_name": name, "expected": int(len(g)), "not_received": int((g["status"] == "not_received").sum()),
                "late": int((g["status"] == "late").sum()), "blank": int((rec["value_status"] == "blank").sum()),
                "zero": int((rec["value_status"] == "zero").sum()), "incomplete_forms": int((pd.to_numeric(rec["fields_complete"], errors="coerce") < 0.8).sum()),
            })
        per_unit.sort(key=lambda r: -(r["not_received"] + r["blank"]))
    return {
        "dataset_id": ds.id,
        "rows": n,
        "expected_available": datasets.slots(session, dataset_id) is not None,
        "not_received": int((t["status"] == "not_received").sum()),
        "late": int((t["status"] == "late").sum()),
        "value_status": {"reported": int(vs.get("reported", 0)), "zero": int(vs.get("zero", 0)), "blank": int(vs.get("blank", 0))},
        "fields": fields,
        "duplicates": dups,
        "per_unit": per_unit,
        "notes": [
            "‘Zero’ means the unit explicitly reported zero cases. ‘Blank’ means the field was left empty. ‘Not received’ means an expected report did not arrive.",
        ],
    }


def categories(session: Session) -> list[dict]:
    return [{"code": c.code, "name": c.name, "description": c.description, "frequency": c.frequency} for c in session.execute(select(ReportingCategory)).scalars()]
