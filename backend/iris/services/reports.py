"""Report submission and corrections by reporting units."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.models import DataRecord, InvestigationNote, ReportingCategory, ReportingConcern, ReportingExpectation, ReportingUnit
from iris.services import audit, datasets
from iris.services.clock import now
from iris.services.context import Actor


def tasks(session: Session, actor: Actor) -> list[dict]:
    """Outstanding work for an RHU: missing reports and open clarification requests."""
    unit_id = actor.reporting_unit_id
    if not unit_id:
        return []
    out: list[dict] = []
    sl = datasets.slots(session, config.DEMO_DATASET_ID)
    cats = {c.code: c.name for c in session.execute(select(ReportingCategory)).scalars()}
    if sl is not None:
        monthly_starts = sorted(sl.loc[sl["frequency"] == "monthly", "period_start"].unique())[-2:]
        recent = sl[(sl["unit_id"] == unit_id) & (sl["status"] == "not_received") &
                    (((sl["frequency"] == "weekly") & (sl["week"] >= config.N_WEEKS - 4)) |
                     ((sl["frequency"] == "monthly") & sl["period_start"].isin(monthly_starts)))]
        for r in recent.sort_values("due_at", ascending=False).itertuples(index=False):
            out.append({
                "kind": "missing_report", "id": f"T-{unit_id}-{r.category_code}-{r.period_start.isoformat()}",
                "title": f"Submit {cats.get(r.category_code, r.category_code)} report",
                "category_code": r.category_code, "category": cats.get(r.category_code, r.category_code),
                "period_start": r.period_start.isoformat(), "period_end": r.period_end.isoformat(),
                "due_at": r.due_at.isoformat(), "frequency": r.frequency, "unit_id": unit_id,
            })
    for c in session.execute(select(ReportingConcern).where(ReportingConcern.status == "clarification_requested")).scalars():
        if unit_id in {u.id for u in c.units}:
            req = session.execute(select(InvestigationNote).where(InvestigationNote.concern_id == c.id, InvestigationNote.note_type == "clarification_request")
                                  .order_by(InvestigationNote.created_at.desc())).scalars().first()
            out.append({
                "kind": "clarification", "id": f"T-CLAR-{c.id}", "title": f"Respond to clarification request on {c.id}",
                "concern_id": c.id, "message": req.body if req else None,
                "due_at": c.follow_up_due.isoformat() if c.follow_up_due else None, "unit_id": unit_id,
            })
    return out


def submit(session: Session, actor: Actor, unit_id: str, category_code: str, period_start: date, value: float | None,
           blank: bool, note: str | None, dataset_id: str = config.DEMO_DATASET_ID) -> DataRecord:
    actor.require("report.submit")
    if actor.role == "rhu_staff" and actor.reporting_unit_id != unit_id:
        raise HTTPException(status_code=403, detail="RHU staff can submit reports only for their own unit.")
    unit = session.get(ReportingUnit, unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail=f"Reporting unit {unit_id} was not found.")
    exp = session.execute(select(ReportingExpectation).where(
        ReportingExpectation.dataset_id == dataset_id, ReportingExpectation.reporting_unit_id == unit_id,
        ReportingExpectation.category_code == category_code)).scalars().first()
    if exp is None:
        raise HTTPException(status_code=422, detail=f"{unit.name} is not scheduled to report {category_code}.")
    if exp.frequency == "weekly":
        t = config.week_index(period_start)
        if config.week_start(t) != period_start or not 0 <= t < config.N_WEEKS:
            raise HTTPException(status_code=422, detail="The period start must be the Monday of a reporting week in the dataset.")
        period_end = config.week_end(t)
        due = config.weekly_due(t)
    else:
        if period_start.day != 1:
            raise HTTPException(status_code=422, detail="Monthly reports start on the first day of the month.")
        nxt = date(period_start.year + period_start.month // 12, period_start.month % 12 + 1, 1)
        period_end = nxt - timedelta(days=1)
        due_d = date(nxt.year, nxt.month, config.MONTHLY_DUE_DAY)
        from datetime import datetime
        due = datetime(due_d.year, due_d.month, due_d.day, config.DUE_HOUR)
    if blank:
        value, status = None, "blank"
    else:
        if value is None:
            raise HTTPException(status_code=422, detail="Enter a value, or mark the field as not available (blank). A blank is different from zero.")
        if value < 0 or value != int(value):
            raise HTTPException(status_code=422, detail="Counts must be whole numbers of zero or more.")
        status = "zero" if value == 0 else "reported"
    existing = session.execute(select(DataRecord).where(
        DataRecord.dataset_id == dataset_id, DataRecord.reporting_unit_id == unit_id,
        DataRecord.category_code == category_code, DataRecord.period_start == period_start)).scalars().first()
    at = now()
    if existing:
        if not note or len(note.strip()) < 10:
            raise HTTPException(status_code=422, detail="A report already exists for this period. Give a reason for the correction (at least 10 characters).")
        old = existing.value
        existing.value, existing.value_status = value, status
        existing.revision += 1
        existing.note = note.strip()
        rec = existing
        audit.record(session, actor, "record", str(rec.id), "report.corrected",
                     f"{actor.display_name} corrected {category_code} for {unit.name}, period {period_start.isoformat()} ({old} → {value}).",
                     {"reason": note.strip(), "old": old, "new": value})
    else:
        rec = DataRecord(dataset_id=dataset_id, reporting_unit_id=unit_id, area=unit.province, category_code=category_code,
                         period_start=period_start, period_end=period_end, value=value, value_status=status, due_at=due,
                         received_at=at, fields_complete=1.0, note=(note or "").strip())
        session.add(rec)
        session.flush()
        audit.record(session, actor, "record", str(rec.id), "report.submitted",
                     f"{actor.display_name} submitted {category_code} for {unit.name}, period {period_start.isoformat()} ({'blank' if value is None else int(value)}).",
                     {"late": at > due})
    datasets.bump(dataset_id)
    return rec
