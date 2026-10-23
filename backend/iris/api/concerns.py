from __future__ import annotations

import time
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from iris import config
from iris.db import get_session
from iris.detection.methods import METHOD_LABELS
from iris.models import InterventionAction, InterventionAssignment, Investigation, InvestigationNote, ReportingConcern, User
from iris.schemas import (
    ActionIn, AssignIn, BodyIn, ChecklistPatch, DetectionRunIn, EvidenceIn, MessageIn, NewConcernIn, NoteIn, ReasonIn, ReminderIn, ReportIn,
    SummaryIn,
)
from iris.services import concerns as cs
from iris.services import audit, checklist, datasets, ids, interventions as iv, overview as ov, reminders, reports
from iris.services import detection_summary as detection_summary_service
from iris.services.context import Actor, get_actor

router = APIRouter(tags=["concerns"])


def _concern_dict(session: Session, c: ReportingConcern, users: dict[str, str]) -> dict:
    inv = session.execute(select(Investigation.id).where(Investigation.concern_id == c.id)).scalar_one_or_none()
    return {
        "id": c.id, "investigation_id": inv, "display_id": inv or c.id, "dataset_id": c.dataset_id, "concern_type": c.concern_type, "concern_type_label": cs.TYPE_LABELS[c.concern_type],
        "title": c.title, "summary": c.summary, "severity": c.severity, "status": c.status, "status_label": cs.STATUS_LABELS[c.status],
        "verification": c.verification, "category_code": c.category_code, "categories": (c.detection_detail or {}).get("categories", []),
        "period_start": c.period_start, "period_end": c.period_end, "week_start_index": c.week_start_index, "week_end_index": c.week_end_index,
        "primary_unit_id": c.primary_unit_id, "province": c.province, "shared_via": c.shared_via,
        "detection_method": c.detection_method, "detection_method_label": cs.METHOD_DISPLAY.get(c.detection_method, c.detection_method),
        "score": c.score, "uncertainty_note": c.uncertainty_note, "created_at": c.created_at, "updated_at": c.updated_at,
        "assigned_user_id": c.assigned_user_id, "assigned_user": users.get(c.assigned_user_id or ""), "assigned_role": c.assigned_role,
        "follow_up_due": c.follow_up_due, "confirmation_reason": c.confirmation_reason, "dismissal_reason": c.dismissal_reason,
        "resolution_summary": c.resolution_summary, "resolved_at": c.resolved_at, "simulated": c.simulated,
        "units": [{"id": u.id, "name": u.name, "unit_type": u.unit_type, "province": u.province} for u in c.units],
    }


def _users(session: Session) -> dict[str, str]:
    return {u.id: u.display_name for u in session.execute(select(User)).scalars()}


@router.get("/overview")
def get_overview(period: str = "4w", province: str | None = None, status: str = "active",
                 session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    return ov.overview(session, actor, period, province or None, status)


@router.get("/concerns")
def list_concerns(
    status: str | None = None, concern_type: str | None = None, severity: str | None = None, province: str | None = None,
    unit_id: str | None = None, search: str | None = None, verification: str | None = None,
    sort: str = "updated_at", order: str = "desc", page: int = Query(1, ge=1), page_size: int = Query(20, ge=5, le=100),
    session: Session = Depends(get_session), actor: Actor = Depends(get_actor),
) -> dict:
    q = select(ReportingConcern)
    sf = cs.scope_filter(actor)
    if sf is not None:
        q = q.where(sf)
    if status == "active":
        q = q.where(ReportingConcern.status.in_(cs.OPEN_STATUSES))
    elif status == "closed":
        q = q.where(ReportingConcern.status.in_(cs.CLOSED_STATUSES))
    elif status:
        q = q.where(ReportingConcern.status == status)
    if concern_type:
        q = q.where(ReportingConcern.concern_type == concern_type)
    if severity:
        q = q.where(ReportingConcern.severity == severity)
    if province:
        q = q.where(ReportingConcern.province == province)
    if verification:
        q = q.where(ReportingConcern.verification == verification)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(ReportingConcern.title.ilike(like), ReportingConcern.id.ilike(like), ReportingConcern.summary.ilike(like)))
    rows = list(session.execute(q).scalars())
    if unit_id:
        rows = [c for c in rows if unit_id in {u.id for u in c.units}]
    key = {
        "updated_at": lambda c: c.updated_at, "created_at": lambda c: c.created_at, "period_start": lambda c: c.period_start,
        "severity": lambda c: {"high": 0, "medium": 1, "low": 2}[c.severity], "id": lambda c: c.id, "status": lambda c: c.status,
        "title": lambda c: c.title.lower(),
    }.get(sort, lambda c: c.updated_at)
    rows.sort(key=key, reverse=order == "desc")
    total = len(rows)
    pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, pages)
    users = _users(session)
    inv_ids = ids.investigation_ids(session)
    return {"rows": [ov.concern_row(c, users, inv_ids) for c in rows[(page - 1) * page_size: page * page_size]],
            "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.post("/concerns")
def create_concern(body: NewConcernIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Open an investigation by hand. It starts unverified, with an owner and a checklist."""
    c = cs.create_manual(session, actor, body.dataset_id or config.DEMO_DATASET_ID, body.unit_ids, body.category_code or None,
                         body.week_from, body.week_to, body.title, body.reason, body.severity, body.assignee_user_id, body.due)
    return _done(session, c, actor)


@router.get("/concerns/{concern_id}")
def concern_detail(concern_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    c = cs.get(session, concern_id, actor)
    users = _users(session)
    notes = session.execute(select(InvestigationNote).where(InvestigationNote.concern_id == c.id).order_by(InvestigationNote.created_at.desc(), InvestigationNote.id.desc())).scalars().all()
    inv = session.execute(select(Investigation).where(Investigation.concern_id == c.id)).scalar_one_or_none()
    iv.sync_actions(session)
    actions = session.execute(select(InterventionAction).where(InterventionAction.concern_id == c.id)).scalars().all()
    assignments = session.execute(select(InterventionAssignment).join(InterventionAction, InterventionAssignment.action_id == InterventionAction.id)
                                  .where(InterventionAction.concern_id == c.id)).scalars().all()
    session.commit()
    weeks = {w["week"]: w for w in datasets.week_labels()}
    detail = c.detection_detail or {}
    return {
        "concern": _concern_dict(session, c, users),
        "via_label": cs.via_label(session, c),
        "evidence": [{"id": e.id, "kind": e.kind, "title": e.title, "detail": e.detail, "data": e.data, "created_at": e.created_at,
                      "created_by": users.get(e.created_by or "")} for e in c.evidence],
        "timeline": {"units": detail.get("units", {}), "weeks": [weeks[w] for w in sorted({r["week"] for rows in detail.get("units", {}).values() for r in rows}) if w in weeks]},
        "notes": [{"id": n.id, "note_type": n.note_type, "body": n.body, "created_at": n.created_at, "author": users.get(n.author_user_id, n.author_user_id)} for n in notes],
        "investigation": None if inv is None else {"id": inv.id, "owner": users.get(inv.owner_user_id), "owner_user_id": inv.owner_user_id,
                                                   "status": inv.status, "opened_at": inv.opened_at, "closed_at": inv.closed_at},
        "next_step": cs.next_step(session, c),
        "resolution_requirements": cs.resolution_requirements(c),
        "checklist": checklist.as_dict(session, c.id),
        "activity": cs.activity(session, c),
        "related": [ov.concern_row(o, users, ids.investigation_ids(session)) for o in cs.related(session, c) if actor.role not in ("rhu_staff",) or actor.reporting_unit_id in {u.id for u in o.units}],
        "actions": [{"id": a.id, "title": a.title, "action_type": a.action_type, "status": a.status} for a in actions],
        "assignments": [{"id": a.id, "title": a.title, "status": a.status, "due_date": a.due_date, "assignee_user_id": a.assignee_user_id,
                         "assignee": users.get(a.assignee_user_id or ""), "responsible_role": a.responsible_role,
                         "evidence_of_completion": a.evidence_of_completion} for a in assignments],
        "assignable_users": [{"id": u.id, "display_name": u.display_name, "role": u.role_id} for u in session.execute(select(User).where(User.role_id != "admin")).scalars()],
        "detection_params": detail.get("params", {}),
    }


def _done(session: Session, c: ReportingConcern, actor: Actor) -> dict:
    session.commit()
    return concern_detail(c.id, session, actor)


@router.post("/concerns/{concern_id}/review")
def review(concern_id: str, body: NoteIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.mark_for_review(session, c, actor, body.note)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/confirm")
def confirm(concern_id: str, body: ReasonIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.confirm(session, c, actor, body.reason)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/dismiss")
def dismiss(concern_id: str, body: ReasonIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.dismiss(session, c, actor, body.reason)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/clarify")
def clarify(concern_id: str, body: MessageIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.request_clarification(session, c, actor, body.message, body.due)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/respond")
def respond(concern_id: str, body: MessageIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.respond_clarification(session, c, actor, body.message)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/assign")
def assign(concern_id: str, body: AssignIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.assign(session, c, actor, body.user_id, body.due, body.note)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/notes")
def note(concern_id: str, body: BodyIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.add_note(session, c, actor, body.body)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/evidence")
def attach_evidence(concern_id: str, body: EvidenceIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.attach_evidence(session, c, actor, body.title, body.detail, body.link)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/actions")
def add_action(concern_id: str, body: ActionIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    iv.add_direct_action(session, actor, c, body.action_type, body.title, body.assignee_user_id, body.due_date, body.note)
    return _done(session, c, actor)


@router.patch("/concerns/{concern_id}/checklist/{item_id}")
def update_checklist(concern_id: str, item_id: int, body: ChecklistPatch, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    checklist.update(session, c, actor, item_id, body.done, body.note)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/resolve")
def resolve(concern_id: str, body: SummaryIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.resolve(session, c, actor, body.summary)
    return _done(session, c, actor)


@router.post("/concerns/{concern_id}/reopen")
def reopen(concern_id: str, body: ReasonIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)):
    c = cs.get(session, concern_id, actor)
    cs.reopen(session, c, actor, body.reason)
    return _done(session, c, actor)


@router.post("/detection/run")
def run_detection(body: DetectionRunIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("detection.run")
    dataset_id = body.dataset_id or config.DEMO_DATASET_ID
    started = time.perf_counter()
    created, skipped = cs.run_detection(session, dataset_id, body.method, actor)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    audit.record(session, actor, "dataset", dataset_id, "detection.run",
                 f"{actor.display_name} ran {METHOD_LABELS[body.method]} detection: {len(created)} new concern(s), {skipped} already open.",
                 {"method": body.method, "created": [c.id for c in created], "skipped_existing": skipped, "elapsed_ms": elapsed_ms})
    session.commit()
    return {"created": [c.id for c in created], "skipped_existing": skipped, "method": body.method, "method_label": METHOD_LABELS[body.method]}


@router.get("/tasks")
def tasks(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    return reports.tasks(session, actor)


@router.post("/reports")
def submit_report(body: ReportIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    rec = reports.submit(session, actor, body.unit_id, body.category_code, body.period_start, body.value, body.blank, body.note)
    session.commit()
    late = bool(rec.due_at and rec.received_at and rec.received_at > rec.due_at)
    return {"id": rec.id, "revision": rec.revision, "value": rec.value, "value_status": rec.value_status,
            "received_at": rec.received_at, "due_at": rec.due_at, "late": late}


@router.post("/reminders")
def send_reminder(body: ReminderIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Record a simulated reminder for a missing submission. Nothing is sent."""
    out = reminders.send(session, actor, body.unit_id, body.category_code, body.period_start, body.message)
    session.commit()
    return out


@router.get("/reminders")
def list_reminders(unit_id: str | None = None, category_code: str | None = None, period_start: date | None = None,
                   session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    actor.require("concern.clarify")
    return reminders.history(session, unit_id, category_code, period_start)


@router.get("/detection/summary")
def detection_summary(dataset_id: str = config.DEMO_DATASET_ID, w_from: int | None = None, w_to: int | None = None, province: str | None = None,
                      session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Weekly flags per detection method and channel, current parameters and the latest synthetic evaluation."""
    actor.require("data.view")
    return detection_summary_service.summary(session, dataset_id, w_from, w_to, province or None)
