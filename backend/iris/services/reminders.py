"""Simulated reminders for missing submissions.

IRIS does not send messages. A reminder is recorded as an audit event,
labelled simulated, so the interface can show that a person followed up.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.models import AuditEvent, ReportingCategory, ReportingUnit, User
from iris.services import audit, datasets
from iris.services.clock import now
from iris.services.context import Actor

ACTION = "reminder.simulated"
NOTE = "Simulated: IRIS does not send messages. This records that a reminder would have been sent."


def _row(e: AuditEvent, users: dict[str, str]) -> dict:
    d = e.detail or {}
    return {"id": e.id, "at": e.at, "by": users.get(e.actor_user_id or "", e.actor_user_id), "unit_id": e.entity_id,
            "category_code": d.get("category_code"), "period_start": d.get("period_start"), "message": d.get("message"),
            "simulated": True, "delivered": False, "summary": e.summary, "note": NOTE}


def send(session: Session, actor: Actor, unit_id: str, category_code: str, period_start: date, message: str | None,
         dataset_id: str = config.DEMO_DATASET_ID, at: datetime | None = None) -> dict:
    actor.require("concern.clarify")
    unit = session.get(ReportingUnit, unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail=f"Reporting unit {unit_id} was not found.")
    if actor.role == "provincial_coordinator" and actor.province and unit.province != actor.province:
        raise HTTPException(status_code=403, detail=f"Coordinators can send reminders only to units in {actor.province}.")
    cat = session.get(ReportingCategory, category_code)
    sl = datasets.slots(session, dataset_id)
    if sl is None or cat is None:
        raise HTTPException(status_code=422, detail="This dataset does not define which reports are expected.")
    slot = sl[(sl["unit_id"] == unit_id) & (sl["category_code"] == category_code) & (sl["period_start"] == period_start)]
    if slot.empty:
        raise HTTPException(status_code=404, detail=f"{unit.name} is not expected to report {cat.name} for that period.")
    if (slot["status"] != "not_received").any():
        raise HTTPException(status_code=409, detail="That report has been received, so no reminder is needed.")
    message = (message or "").strip()[:2000] or None
    ev = audit.record(session, actor, "unit", unit_id, ACTION,
                      f"Simulated reminder to {unit.name} for the missing {cat.name.lower()} report for the week of {period_start.isoformat()}. No message was sent.",
                      {"category_code": category_code, "period_start": period_start.isoformat(), "message": message, "simulated": True}, at=at or now())
    session.flush()
    return _row(ev, {u.id: u.display_name for u in session.execute(select(User)).scalars()})


def history(session: Session, unit_id: str | None = None, category_code: str | None = None, period_start: date | None = None) -> list[dict]:
    q = select(AuditEvent).where(AuditEvent.action == ACTION)
    if unit_id:
        q = q.where(AuditEvent.entity_id == unit_id)
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    rows = [_row(e, users) for e in session.execute(q.order_by(AuditEvent.at.desc(), AuditEvent.id.desc())).scalars()]
    return [r for r in rows if (not category_code or r["category_code"] == category_code)
            and (not period_start or r["period_start"] == period_start.isoformat())]
