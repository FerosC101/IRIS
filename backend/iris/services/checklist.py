"""Verification checklists for concerns.

Each concern gets the steps for its type when it is created. People tick the
checks (with an optional note; who and when is recorded). The final step,
recording a finding and choosing a disposition, is completed only by resolving
the concern, which itself needs a human-reviewed finding and attached evidence.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris.models import InvestigationChecklistItem, ReportingConcern, User
from iris.services import audit
from iris.services.clock import now
from iris.services.context import Actor

RESOLUTION_STEP = ("Record finding and choose disposition", "Requires attached evidence and a reviewer's sign-off. Completed by resolving the concern.")

TEMPLATES: dict[str, list[tuple[str, str]]] = {
    "zero_case_run": [
        ("Confirm submission was received", "Check that each zero-case report arrived and belongs to this period."),
        ("Validate reporting-unit identity", "Match the submitting unit against the unit registry."),
        ("Reconcile zero count with source register", "Compare the reported zeros with the unit's case register or logbook."),
        ("Call the unit's surveillance focal person", "Confirm whether the zero count is accurate."),
    ],
    "missing_submission": [
        ("Check other channels for the report", "The report may have been sent by another route (email, paper, courier)."),
        ("Contact the unit about the missing report", "Ask whether the report was prepared and why it was not received."),
        ("Record the reason given by the unit", "Note staffing, connectivity or other causes the unit reports."),
        ("Confirm the backlog was received", "Check that the missing weeks have since been submitted."),
    ],
    "late_report": [
        ("Confirm when the reports arrived", "Compare received times with the due dates."),
        ("Ask the unit about the delay", "Record the cause the unit gives."),
        ("Check whether the delay recurs", "Look at the unit's recent weeks for the same pattern."),
    ],
    "incomplete_record": [
        ("Review the received forms", "Identify which required fields are blank."),
        ("Ask what the blank fields mean", "A blank field is not a zero: confirm whether cases were zero or unknown."),
        ("Check the form template", "Look for a template or software change that hides fields."),
    ],
    "count_drop": [
        ("Confirm the reports were received", "A count drop is assessed only on received reports."),
        ("Compare counts with the source register", "Ask the unit to check reported counts against its register."),
        ("Rule out a data-entry error", "Check for transposed or missing entries."),
        ("Consider a genuine change in cases", "Seasonal declines are possible; a flag does not establish under-reporting."),
    ],
    "shared_problem": [
        ("Ask the hub whether reports were held up", "Check consolidated submissions upstream."),
        ("Ask at least one affected unit", "Confirm whether its reports were prepared on time."),
        ("Compare with units that reported normally", "Co-occurrence alone does not establish a shared cause."),
    ],
    "reviewer_raised": [
        ("Review the reported records", "Check the records for the units and weeks in question."),
        ("Contact the unit", "Ask the unit about what was observed."),
        ("Record what was found", "Summarise the outcome of the checks in a note."),
    ],
}


def create_items(session: Session, c: ReportingConcern, at: datetime | None = None) -> None:
    steps = [*TEMPLATES.get(c.concern_type, TEMPLATES["reviewer_raised"]), RESOLUTION_STEP]
    for i, (label, detail) in enumerate(steps):
        session.add(InvestigationChecklistItem(
            concern_id=c.id, position=i, label=label, detail=detail, kind="resolution" if i == len(steps) - 1 else "check",
            done=False, note="", created_at=at or now(),
        ))


def items(session: Session, concern_id: str) -> list[InvestigationChecklistItem]:
    return list(session.execute(select(InvestigationChecklistItem).where(InvestigationChecklistItem.concern_id == concern_id)
                                .order_by(InvestigationChecklistItem.position)).scalars())


def as_dict(session: Session, concern_id: str) -> dict:
    rows = items(session, concern_id)
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    return {
        "items": [{"id": r.id, "position": r.position, "label": r.label, "detail": r.detail, "kind": r.kind, "done": r.done,
                   "done_by": users.get(r.done_by or "") if r.done_by else None, "done_at": r.done_at, "note": r.note} for r in rows],
        "done": sum(1 for r in rows if r.done),
        "total": len(rows),
    }


def update(session: Session, c: ReportingConcern, actor: Actor, item_id: int, done: bool | None, note: str | None,
           at: datetime | None = None) -> InvestigationChecklistItem:
    from iris.services.concerns import CLOSED_STATUSES, STATUS_LABELS

    actor.require("concern.review")
    if c.status in CLOSED_STATUSES:
        raise HTTPException(status_code=409, detail=f"Concern {c.id} is {STATUS_LABELS[c.status].lower()}; reopen it before you change its checklist.")
    item = session.get(InvestigationChecklistItem, item_id)
    if item is None or item.concern_id != c.id:
        raise HTTPException(status_code=404, detail=f"Checklist item {item_id} was not found on {c.id}.")
    if done is None and note is None:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    if done is not None and item.kind == "resolution":
        raise HTTPException(status_code=409, detail="This step is completed by resolving the concern, which needs a confirmed finding and attached evidence.")
    at = at or now()
    changes = []
    if done is not None and done != item.done:
        item.done, item.done_by, item.done_at = done, (actor.user_id if done else None), (at if done else None)
        changes.append("checked" if done else "unchecked")
    if note is not None and note.strip() != item.note:
        item.note = note.strip()
        changes.append("note updated")
    if not changes:
        return item
    c.updated_at = at
    audit.record(session, actor, "concern", c.id, "concern.checklist_updated",
                 f"{actor.display_name} {' and '.join(changes)} '{item.label}' on {c.id}.", {"item": item.id, "done": item.done}, at=at)
    return item


def complete_resolution(session: Session, c: ReportingConcern, actor: Actor, at: datetime | None) -> None:
    for r in items(session, c.id):
        if r.kind == "resolution":
            r.done, r.done_by, r.done_at = True, actor.user_id, at or now()


def reopen_resolution(session: Session, c: ReportingConcern) -> None:
    for r in items(session, c.id):
        if r.kind == "resolution":
            r.done, r.done_by, r.done_at = False, None, None
