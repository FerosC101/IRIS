"""Concern workflow: review, verification, clarification, assignment, resolution."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from iris import config
from iris.detection.methods import METHOD_LABELS, DetectionParams
from iris.models import (
    AuditEvent,
    EvidenceItem,
    InterventionAction,
    InterventionAssignment,
    Investigation,
    InvestigationNote,
    ReportingConcern,
    ReportingUnit,
    User,
)
from iris.services import audit, datasets
from iris.services.clock import now, today
from iris.services.concern_builder import ConcernSpec, build_specs, via_name
from iris.services.context import Actor

OPEN_STATUSES = ("open", "under_review", "clarification_requested", "in_investigation")
CLOSED_STATUSES = ("resolved", "dismissed")

STATUS_LABELS = {
    "open": "New",
    "under_review": "Being reviewed",
    "clarification_requested": "Waiting for reply",
    "in_investigation": "Being fixed",
    "resolved": "Resolved",
    "dismissed": "Not a problem",
}
TYPE_LABELS = {
    "missing_submission": "Missing submission",
    "late_report": "Late report",
    "incomplete_record": "Incomplete record",
    "count_drop": "Unexpected drop in counts",
    "shared_problem": "Possible shared problem",
    "zero_case_run": "Zero-case run",
}

MIN_REASON = 10


def _reason(text: str | None, what: str) -> str:
    text = (text or "").strip()
    if len(text) < MIN_REASON:
        raise HTTPException(status_code=422, detail=f"Please give a reason for {what} (at least {MIN_REASON} characters).")
    return text


def next_concern_id(session: Session) -> str:
    n = session.execute(select(func.count()).select_from(ReportingConcern)).scalar_one()
    while True:
        n += 1
        cid = f"C-{n:04d}"
        if session.get(ReportingConcern, cid) is None:
            return cid


def scope_filter(actor: Actor):
    """SQL filter limiting which concerns an actor sees (UI-level demo scoping)."""
    if actor.role == "rhu_staff" and actor.reporting_unit_id:
        from iris.models import concern_units
        return ReportingConcern.id.in_(select(concern_units.c.concern_id).where(concern_units.c.unit_id == actor.reporting_unit_id))
    if actor.role == "provincial_coordinator" and actor.province:
        return ReportingConcern.province == actor.province
    return None


def ensure_visible(actor: Actor, concern: ReportingConcern) -> None:
    if actor.role == "rhu_staff" and actor.reporting_unit_id not in {u.id for u in concern.units}:
        raise HTTPException(status_code=404, detail="This concern is not assigned to your reporting unit.")
    if actor.role == "provincial_coordinator" and actor.province and concern.province != actor.province:
        raise HTTPException(status_code=404, detail="This concern is outside your province.")


def get(session: Session, concern_id: str, actor: Actor | None = None) -> ReportingConcern:
    c = session.get(ReportingConcern, concern_id)
    if c is None:
        raise HTTPException(status_code=404, detail=f"Concern {concern_id} was not found.")
    if actor is not None:
        ensure_visible(actor, c)
    return c


def create_from_spec(session: Session, spec: ConcernSpec, dataset_id: str, created_at: datetime, actor=None) -> ReportingConcern:
    c = ReportingConcern(
        id=next_concern_id(session), dataset_id=dataset_id, concern_type=spec.concern_type, title=spec.title,
        summary=spec.summary, severity=spec.severity, status="open", verification="unverified",
        category_code=spec.categories[0] if spec.categories else None,
        period_start=config.week_start(spec.w0), period_end=config.week_end(spec.w1),
        week_start_index=spec.w0, week_end_index=spec.w1, primary_unit_id=spec.primary_unit_id,
        province=spec.province, shared_via=spec.shared_via, detection_method=spec.detection_method, score=spec.score,
        uncertainty_note=spec.uncertainty_note, created_at=created_at, updated_at=created_at,
        detection_detail={**spec.detail, "categories": spec.categories},
    )
    c.units = [session.get(ReportingUnit, u) for u in spec.unit_ids]
    for ev in spec.evidence:
        c.evidence.append(EvidenceItem(kind=ev["kind"], title=ev["title"], detail=ev.get("detail", ""), data=ev.get("data", {}), created_at=created_at))
    session.add(c)
    session.flush()
    audit.record(session, actor, "concern", c.id, "concern.created",
                 f"Concern flagged by {METHOD_LABELS[spec.detection_method]} detection: {c.title}", {"severity": c.severity}, at=created_at)
    return c


def _overlaps_existing(session: Session, spec: ConcernSpec, dataset_id: str) -> bool:
    existing = session.execute(select(ReportingConcern).where(ReportingConcern.dataset_id == dataset_id)).scalars().all()
    for c in existing:
        if c.week_start_index <= spec.w1 and spec.w0 <= c.week_end_index and {u.id for u in c.units} & set(spec.unit_ids):
            if c.concern_type == spec.concern_type or "shared_problem" in (c.concern_type, spec.concern_type):
                return True
    return False


def run_detection(session: Session, dataset_id: str, method: str, actor=None, created_at: datetime | None = None) -> tuple[list[ReportingConcern], int]:
    ds = datasets.get_dataset(session, dataset_id)
    results = datasets.detection(session, dataset_id, method)
    sl = datasets.slots(session, dataset_id)
    if results is None or sl is None:
        raise HTTPException(status_code=422, detail=f"Detection needs explicit reporting expectations, which dataset '{ds.name}' does not define.")
    units = {u.id: {"name": u.name, "province": u.province} for u in session.execute(select(ReportingUnit)).scalars()}
    peer = datasets.peer_groups(session, dataset_id) if method == "network" else {}
    specs = build_specs(results, sl, peer, units, datasets.case_categories(session), method, DetectionParams())
    created, skipped = [], 0
    for spec in specs:
        if _overlaps_existing(session, spec, dataset_id):
            skipped += 1
            continue
        at = created_at or now()
        created.append(create_from_spec(session, spec, dataset_id, at, actor))
    return created, skipped


# ---------------------------------------------------------------------------
# Workflow transitions

def _touch(c: ReportingConcern, at: datetime | None = None) -> None:
    c.updated_at = at or now()


def _note(session: Session, c: ReportingConcern, actor: Actor, body: str, note_type: str, at: datetime | None = None) -> InvestigationNote:
    n = InvestigationNote(concern_id=c.id, author_user_id=actor.user_id, body=body, note_type=note_type, created_at=at or now())
    session.add(n)
    return n


def _require_open(c: ReportingConcern, action: str) -> None:
    if c.status in CLOSED_STATUSES:
        raise HTTPException(status_code=409, detail=f"Concern {c.id} is {STATUS_LABELS[c.status].lower()}; reopen it before you {action}.")


def mark_for_review(session: Session, c: ReportingConcern, actor: Actor, note: str | None = None, at: datetime | None = None) -> None:
    actor.require("concern.review")
    _require_open(c, "mark it for review")
    if c.status != "open":
        raise HTTPException(status_code=409, detail=f"Concern {c.id} is already {STATUS_LABELS[c.status].lower()}.")
    c.status = "under_review"
    _touch(c, at)
    if note:
        _note(session, c, actor, note.strip(), "note", at)
    audit.record(session, actor, "concern", c.id, "concern.marked_for_review", f"{actor.display_name} marked {c.id} for review.", at=at)


def confirm(session: Session, c: ReportingConcern, actor: Actor, reason: str, at: datetime | None = None) -> None:
    actor.require("concern.confirm")
    _require_open(c, "confirm it")
    reason = _reason(reason, "confirming this concern")
    if c.verification == "confirmed":
        raise HTTPException(status_code=409, detail=f"Concern {c.id} is already confirmed.")
    c.verification = "confirmed"
    c.confirmation_reason = reason
    if c.status in ("open", "under_review", "clarification_requested"):
        c.status = "in_investigation"
    _touch(c, at)
    c.evidence.append(EvidenceItem(kind="confirmed_by_reviewer", title=f"Confirmed by {actor.display_name}", detail=reason, data={}, created_at=at or now(), created_by=actor.user_id))
    _note(session, c, actor, reason, "confirmation", at)
    audit.record(session, actor, "concern", c.id, "concern.confirmed", f"{actor.display_name} confirmed {c.id}.", {"reason": reason}, at=at)


def dismiss(session: Session, c: ReportingConcern, actor: Actor, reason: str, at: datetime | None = None) -> None:
    actor.require("concern.dismiss")
    _require_open(c, "dismiss it")
    reason = _reason(reason, "dismissing this alert")
    c.status = "dismissed"
    c.verification = "dismissed"
    c.dismissal_reason = reason
    c.resolved_at = at or now()
    _touch(c, at)
    _close_investigation(session, c, at)
    _retire_actions(session, c)
    _note(session, c, actor, reason, "dismissal", at)
    audit.record(session, actor, "concern", c.id, "concern.dismissed", f"{actor.display_name} dismissed {c.id} as a false alarm.", {"reason": reason}, at=at)


def request_clarification(session: Session, c: ReportingConcern, actor: Actor, message: str, due: date | None, at: datetime | None = None) -> None:
    actor.require("concern.clarify")
    _require_open(c, "request clarification")
    message = _reason(message, "the clarification request")
    c.status = "clarification_requested"
    c.follow_up_due = due or ((at or now()).date() + timedelta(days=3))
    c.assigned_role = c.assigned_role or "rhu_staff"
    _touch(c, at)
    _note(session, c, actor, message, "clarification_request", at)
    audit.record(session, actor, "concern", c.id, "concern.clarification_requested",
                 f"{actor.display_name} requested clarification on {c.id} (due {c.follow_up_due.isoformat()}).", {"message": message}, at=at)


def respond_clarification(session: Session, c: ReportingConcern, actor: Actor, message: str, at: datetime | None = None) -> None:
    actor.require("concern.respond")
    if c.status != "clarification_requested":
        raise HTTPException(status_code=409, detail=f"Concern {c.id} has no open clarification request.")
    message = _reason(message, "your response")
    c.status = "under_review"
    _touch(c, at)
    _note(session, c, actor, message, "clarification_response", at)
    audit.record(session, actor, "concern", c.id, "concern.clarification_responded", f"{actor.display_name} responded to the clarification request on {c.id}.", {"message": message}, at=at)


def assign(session: Session, c: ReportingConcern, actor: Actor, user_id: str, due: date | None, note: str | None = None, at: datetime | None = None) -> Investigation:
    actor.require("concern.assign")
    _require_open(c, "assign it")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=422, detail=f"User {user_id} does not exist.")
    inv = session.execute(select(Investigation).where(Investigation.concern_id == c.id)).scalar_one_or_none()
    if inv is None:
        inv = Investigation(id=c.id.replace("C-", "INV-"), concern_id=c.id, owner_user_id=user.id, status="open", opened_at=at or now())
        session.add(inv)
    else:
        inv.owner_user_id = user.id
        inv.status = "open"
        inv.closed_at = None
    c.assigned_user_id = user.id
    c.assigned_role = user.role_id
    c.status = "in_investigation"
    if due:
        c.follow_up_due = due
    _touch(c, at)
    if note:
        _note(session, c, actor, note.strip(), "note", at)
    audit.record(session, actor, "concern", c.id, "concern.assigned", f"{actor.display_name} assigned the investigation of {c.id} to {user.display_name}.",
                 {"assignee": user.id, "due": due.isoformat() if due else None}, at=at)
    return inv


def add_note(session: Session, c: ReportingConcern, actor: Actor, body: str, at: datetime | None = None) -> InvestigationNote:
    actor.require("concern.note")
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="A note cannot be empty.")
    if len(body) > 4000:
        raise HTTPException(status_code=422, detail="Notes are limited to 4,000 characters.")
    n = _note(session, c, actor, body, "note", at)
    _touch(c, at)
    audit.record(session, actor, "concern", c.id, "concern.note_added", f"{actor.display_name} added a note to {c.id}.", at=at)
    return n


def resolve(session: Session, c: ReportingConcern, actor: Actor, summary: str, at: datetime | None = None) -> None:
    actor.require("concern.resolve")
    _require_open(c, "resolve it")
    summary = _reason(summary, "the resolution")
    c.status = "resolved"
    c.resolution_summary = summary
    c.resolved_at = at or now()
    _touch(c, at)
    _close_investigation(session, c, at)
    _note(session, c, actor, summary, "resolution", at)
    audit.record(session, actor, "concern", c.id, "concern.resolved", f"{actor.display_name} recorded a resolution for {c.id}.", {"summary": summary}, at=at)


def reopen(session: Session, c: ReportingConcern, actor: Actor, reason: str, at: datetime | None = None) -> None:
    actor.require("concern.reopen")
    if c.status not in CLOSED_STATUSES:
        raise HTTPException(status_code=409, detail=f"Concern {c.id} is not closed.")
    reason = _reason(reason, "reopening this concern")
    previous = c.status
    c.status = "under_review"
    if c.verification == "dismissed":
        c.verification = "unverified"
    c.resolved_at = None
    _touch(c, at)
    _note(session, c, actor, reason, "note", at)
    audit.record(session, actor, "concern", c.id, "concern.reopened", f"{actor.display_name} reopened {c.id} (was {STATUS_LABELS[previous].lower()}).", {"reason": reason}, at=at)


def _close_investigation(session: Session, c: ReportingConcern, at: datetime | None) -> None:
    inv = session.execute(select(Investigation).where(Investigation.concern_id == c.id)).scalar_one_or_none()
    if inv and inv.status == "open":
        inv.status = "closed"
        inv.closed_at = at or now()


def _retire_actions(session: Session, c: ReportingConcern) -> None:
    for a in session.execute(select(InterventionAction).where(InterventionAction.concern_id == c.id, InterventionAction.status == "candidate")).scalars():
        a.status = "not_applicable"


# ---------------------------------------------------------------------------
# Presentation helpers

def next_step(session: Session, c: ReportingConcern) -> dict:
    names = {u.id: u.name for u in c.units}
    unit = names.get(c.primary_unit_id or "", "the unit")
    if c.status == "dismissed":
        return {"text": "Nothing to do. It was closed as not a problem.", "action": None}
    if c.status == "resolved":
        return {"text": "Nothing to do. Keep an eye on this unit's next reports.", "action": None}
    if c.status == "open":
        return {"text": "Look at the evidence and start the review.", "action": "review"}
    if c.status == "clarification_requested":
        due = c.follow_up_due.strftime("%b %d") if c.follow_up_due else "soon"
        return {"text": f"Waiting for the unit to reply (due {due}). Then confirm it or close it.", "action": "respond"}
    if c.status == "under_review":
        by_type = {
            "shared_problem": "Check with the hub whether reports were held up, then confirm or close it.",
            "missing_submission": f"Ask {unit} why the reports are missing.",
            "late_report": f"Ask {unit} why the reports were late.",
            "incomplete_record": f"Ask {unit} whether the blank fields mean zero cases.",
            "count_drop": f"Ask {unit} to check the counts against its case register.",
            "zero_case_run": f"Ask {unit} to check the zero-case reports against its case register.",
        }
        return {"text": by_type.get(c.concern_type, "Verify the concern."), "action": "clarify"}
    # in_investigation
    if c.verification != "confirmed":
        return {"text": "Check with the unit, then confirm it or close it as not a problem.", "action": "confirm"}
    approved = session.execute(
        select(InterventionAssignment).join(InterventionAction, InterventionAssignment.action_id == InterventionAction.id)
        .where(InterventionAction.concern_id == c.id)
    ).scalars().first()
    if approved is None:
        return {"text": "Plan an action to fix it.", "action": "plan"}
    if approved.status in ("approved", "in_progress"):
        return {"text": "An action is under way. Track it until it is done.", "action": "follow_up"}
    return {"text": "The action is done. If reporting is back to normal, mark this as resolved.", "action": "resolve"}


def activity(session: Session, c: ReportingConcern) -> list[dict]:
    events = session.execute(select(AuditEvent).where(AuditEvent.entity_type == "concern", AuditEvent.entity_id == c.id).order_by(AuditEvent.at.desc(), AuditEvent.id.desc())).scalars().all()
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    return [{"id": e.id, "at": e.at, "action": e.action, "summary": e.summary, "actor": users.get(e.actor_user_id or "", "System"), "detail": e.detail} for e in events]


def related(session: Session, c: ReportingConcern) -> list[ReportingConcern]:
    unit_ids = {u.id for u in c.units}
    out = []
    for other in session.execute(select(ReportingConcern).where(ReportingConcern.id != c.id, ReportingConcern.dataset_id == c.dataset_id)).scalars():
        ou = {u.id for u in other.units}
        near = other.week_start_index <= c.week_end_index + 2 and c.week_start_index <= other.week_end_index + 2
        same_hub = c.shared_via and other.shared_via == c.shared_via
        if (ou & unit_ids) or (near and same_hub):
            out.append(other)
        elif near and c.concern_type == "shared_problem" and other.concern_type != "shared_problem":
            pass
    out.sort(key=lambda o: o.week_start_index, reverse=True)
    return out[:8]


def via_label(session: Session, c: ReportingConcern) -> str | None:
    if not c.shared_via:
        return None
    names = {u.id: u.name for u in session.execute(select(ReportingUnit)).scalars()}
    return via_name(c.shared_via, names)
