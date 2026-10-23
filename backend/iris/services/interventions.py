"""Candidate actions, intervention plans and follow-up assignments."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from iris import config
from iris.models import (
    InterventionAction,
    InterventionAssignment,
    InterventionOutcome,
    InterventionPlan,
    ReportingConcern,
    ReportingExpectation,
    ReportingUnit,
    User,
)
from iris.optimization.planner import ACTION_TYPES, Candidate, baseline, cost_actions, explain, merge_assumptions, optimize
from iris.services import audit
from iris.services.clock import now, today
from iris.services.concern_builder import via_name
from iris.services.concerns import OPEN_STATUSES
from iris.services.context import Actor

SEVERITY_PRIORITY = {"high": 1, "medium": 2, "low": 3}

# (action_type, depends_on action types, title template, rationale, responsible role)
TEMPLATES: dict[str, list[tuple[str, list[str], str, str, str]]] = {
    "missing_submission": [
        ("verify_contact", [], "Contact {unit} to verify the missing submissions",
         "Confirms whether reports exist but were not transmitted, which is the cheapest way to recover them.", "provincial_coordinator"),
        ("technical_support", ["verify_contact"], "Provide technical support to {unit}",
         "Addresses a persistent local cause (for example encoding tools or connectivity) once it is verified.", "provincial_coordinator"),
    ],
    "late_report": [
        ("verify_contact", [], "Contact {unit} about the delayed reports",
         "Identifies the cause of delays before committing support resources.", "provincial_coordinator"),
        ("support_visit", ["verify_contact"], "Schedule a simulated support visit to {unit}",
         "Recurring delays may need on-site help with reporting routines.", "provincial_coordinator"),
    ],
    "incomplete_record": [
        ("validation_review", [], "Review the data-validation issue with {unit}",
         "Clarifies whether blank fields mean zero cases or missing information.", "resu_analyst"),
        ("support_visit", ["validation_review"], "Schedule simulated form-completion training for {unit}",
         "Training can prevent recurring blank fields once the cause is known.", "provincial_coordinator"),
    ],
    "count_drop": [
        ("verify_contact", [], "Ask {unit} to verify reported counts against registers",
         "Separates a data problem from a genuine decline before any other action.", "provincial_coordinator"),
        ("validation_review", ["verify_contact"], "Review case-count validation for {unit}",
         "If counts were wrong, a validation review finds where cases were lost.", "resu_analyst"),
    ],
    "shared_problem": [
        ("restore_connection", [], "Restore the simulated reporting connection for {via}",
         "A single shared fix can restore reporting for every affected unit.", "resu_analyst"),
        ("verify_contact", [], "Contact the affected units to confirm the shared problem",
         "Confirms that the cause is shared before or while the connection is restored.", "provincial_coordinator"),
        ("support_visit", ["restore_connection"], "Schedule a simulated support visit for the affected units",
         "Helps units clear their reporting backlog after the connection is restored.", "provincial_coordinator"),
    ],
    "reviewer_raised": [
        ("verify_contact", [], "Contact {unit} about the issue raised",
         "Confirms what happened before any other action.", "provincial_coordinator"),
    ],
    "zero_case_run": [
        ("verify_contact", [], "Ask {unit} to reconcile its zero-case reports with the register",
         "Confirms whether the zeros are correct before any other action.", "provincial_coordinator"),
        ("validation_review", ["verify_contact"], "Review how zero cases are entered at {unit}",
         "If the zeros were not correct, a validation review finds whether a form default or entry step caused them.", "resu_analyst"),
    ],
}


def _weekly_expected(session: Session, unit_ids: list[str]) -> float:
    n = session.execute(
        select(func.count()).select_from(ReportingExpectation)
        .where(ReportingExpectation.reporting_unit_id.in_(unit_ids), ReportingExpectation.frequency == "weekly")
    ).scalar_one()
    return float(n)


def sync_actions(session: Session) -> None:
    """Create candidate actions for open concerns; retire candidates of closed concerns."""
    names = {u.id: u.name for u in session.execute(select(ReportingUnit)).scalars()}
    concerns = session.execute(select(ReportingConcern)).scalars().all()
    existing = {a.id: a for a in session.execute(select(InterventionAction)).scalars()}
    for c in concerns:
        is_open = c.status in OPEN_STATUSES
        for i, (atype, deps, title, rationale, _role) in enumerate(TEMPLATES.get(c.concern_type, [])):
            aid = f"A-{c.id}-{atype}"
            unit_ids = [u.id for u in c.units]
            if aid in existing:
                a = existing[aid]
                if a.status == "candidate" and not is_open:
                    a.status = "not_applicable"
                elif a.status == "not_applicable" and is_open:
                    a.status = "candidate"
                continue
            if not is_open:
                continue
            session.add(InterventionAction(
                id=aid, concern_id=c.id, action_type=atype,
                title=title.format(unit=names.get(c.primary_unit_id or "", "the unit"), via=via_name(c.shared_via, names) or "the affected group"),
                unit_ids=unit_ids, expected_reports_per_week=_weekly_expected(session, unit_ids),
                priority=SEVERITY_PRIORITY[c.severity], depends_on=[f"A-{c.id}-{d}" for d in deps],
                rationale=rationale, status="candidate", created_at=now(),
            ))
    session.flush()


def _responsible_role(action: InterventionAction, concern_type: str) -> str:
    for atype, _d, _t, _r, role in TEMPLATES.get(concern_type, []):
        if atype == action.action_type:
            return role
    return "provincial_coordinator"


def candidate_pool(session: Session, actor: Actor) -> list[InterventionAction]:
    sync_actions(session)
    q = select(InterventionAction).join(ReportingConcern, InterventionAction.concern_id == ReportingConcern.id).where(InterventionAction.status == "candidate")
    if actor.role == "provincial_coordinator" and actor.province:
        q = q.where(ReportingConcern.province == actor.province)
    return list(session.execute(q.order_by(InterventionAction.priority, InterventionAction.id)).scalars())


def _concern_order(session: Session) -> dict[str, int]:
    return {c.id: i for i, c in enumerate(session.execute(select(ReportingConcern).order_by(ReportingConcern.week_start_index)).scalars())}


def costed(session: Session, actions: list[InterventionAction], assumptions: dict):
    order = _concern_order(session)
    cands = [Candidate(a.id, a.concern_id, a.action_type, a.priority, len(a.unit_ids), a.expected_reports_per_week, list(a.depends_on), order.get(a.concern_id, 0)) for a in actions]
    return cost_actions(cands, assumptions)


def satisfied_dependencies(session: Session) -> set[str]:
    """Dependencies already met by approved or completed actions."""
    return {a.id for a in session.execute(select(InterventionAction).where(InterventionAction.status.in_(("approved", "completed")))).scalars()}


def plan_summary(chosen: list[str], costed_by_id: dict, actions_by_id: dict[str, InterventionAction], budget: float, method: str, all_costed) -> dict:
    sel = [costed_by_id[i] for i in chosen]
    units = sorted({u for i in chosen for u in actions_by_id[i].unit_ids})
    concerns = sorted({actions_by_id[i].concern_id for i in chosen})
    return {
        "method": method,
        "action_ids": chosen,
        "total_cost_hours": round(sum(a.cost_hours for a in sel), 2),
        "total_expected_benefit": round(sum(a.expected_benefit for a in sel), 2),
        "budget_hours": budget,
        "remaining_hours": round(budget - sum(a.cost_hours for a in sel), 2),
        "units_covered": units,
        "concerns_covered": concerns,
        "max_time_days": max((a.time_days for a in sel), default=0),
        "explanations": explain(all_costed, chosen, budget),
    }


def compare(session: Session, actor: Actor, budget: float, action_ids: list[str] | None, overrides: dict | None) -> dict:
    if budget < 0 or budget > 2000:
        raise HTTPException(status_code=422, detail="Budget must be between 0 and 2,000 staff-hours.")
    assumptions = merge_assumptions(overrides)
    for k, v in assumptions["action_types"].items():
        if not 0 <= v["success_probability"] <= 1:
            raise HTTPException(status_code=422, detail=f"Success probability for {ACTION_TYPES[k]} must be between 0 and 1.")
        if v["base_hours"] < 0 or v["hours_per_unit"] < 0:
            raise HTTPException(status_code=422, detail=f"Hours for {ACTION_TYPES[k]} cannot be negative.")
    pool = candidate_pool(session, actor)
    if action_ids is not None:
        wanted = set(action_ids)
        pool = [a for a in pool if a.id in wanted]
    by_id = {a.id: a for a in pool}
    cs = costed(session, pool, assumptions)
    cby = {c.id: c for c in cs}
    done = satisfied_dependencies(session)
    opt = optimize(cs, budget, done)
    base = baseline(cs, budget, done)
    return {
        "assumptions": assumptions,
        "candidates": [action_dict(session, by_id[c.id], c) for c in cs],
        "optimized": plan_summary(opt, cby, by_id, budget, "optimized", cs),
        "baseline": plan_summary(base, cby, by_id, budget, "baseline", cs),
    }


def action_dict(session: Session, a: InterventionAction, c=None) -> dict:
    concern = session.get(ReportingConcern, a.concern_id)
    return {
        "id": a.id, "concern_id": a.concern_id, "concern_title": concern.title if concern else None,
        "concern_severity": concern.severity if concern else None, "concern_status": concern.status if concern else None,
        "action_type": a.action_type, "action_type_label": ACTION_TYPES[a.action_type], "title": a.title,
        "unit_ids": a.unit_ids, "priority": a.priority, "depends_on": a.depends_on, "rationale": a.rationale,
        "status": a.status, "expected_reports_per_week": a.expected_reports_per_week,
        "cost_hours": c.cost_hours if c else None, "expected_benefit": c.expected_benefit if c else None,
        "success_probability": c.success_probability if c else None, "time_days": c.time_days if c else None,
        "responsible_role": _responsible_role(a, concern.concern_type) if concern else None,
        "uncertainty": "Cost, success probability and benefit are simulation assumptions you can change. They are not validated estimates of real-world effectiveness.",
    }


def _next_id(session: Session, model, prefix: str) -> str:
    n = session.execute(select(func.count()).select_from(model)).scalar_one()
    while True:
        n += 1
        pid = f"{prefix}-{n:04d}"
        if session.get(model, pid) is None:
            return pid


def save_plan(session: Session, actor: Actor, name: str, method: str, budget: float, action_ids: list[str], overrides: dict | None, notes: str = "", at: datetime | None = None) -> InterventionPlan:
    actor.require("plan.create")
    name = (name or "").strip()
    if len(name) < 3:
        raise HTTPException(status_code=422, detail="Give the plan a name (at least 3 characters).")
    if not action_ids:
        raise HTTPException(status_code=422, detail="A plan needs at least one action.")
    if method not in ("optimized", "baseline", "manual"):
        raise HTTPException(status_code=422, detail="Unknown plan method.")
    assumptions = merge_assumptions(overrides)
    actions = [session.get(InterventionAction, i) for i in action_ids]
    missing = [i for i, a in zip(action_ids, actions) if a is None]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown actions: {', '.join(missing)}")
    not_candidate = [a.id for a in actions if a.status != "candidate"]
    if not_candidate:
        raise HTTPException(status_code=409, detail=f"These actions are no longer candidates: {', '.join(not_candidate)}")
    done = satisfied_dependencies(session)
    chosen = set(action_ids)
    for a in actions:
        unmet = [d for d in a.depends_on if d not in chosen and d not in done]
        if unmet:
            raise HTTPException(status_code=422, detail=f"'{a.title}' depends on an action that is not in the plan.")
    cs = costed(session, actions, assumptions)
    total_cost = round(sum(c.cost_hours for c in cs), 2)
    if total_cost > budget + 1e-9:
        raise HTTPException(status_code=422, detail=f"Selected actions need {total_cost} staff-hours, more than the budget of {budget}.")
    plan = InterventionPlan(
        id=_next_id(session, InterventionPlan, "P"), name=name, method=method, budget_hours=budget, action_ids=action_ids,
        total_cost_hours=total_cost, total_expected_benefit=round(sum(c.expected_benefit for c in cs), 2),
        assumptions=assumptions, status="draft", notes=notes, created_by=actor.user_id, created_at=at or now(),
    )
    session.add(plan)
    session.flush()
    audit.record(session, actor, "plan", plan.id, "plan.saved", f"{actor.display_name} saved draft plan {plan.id} ({len(action_ids)} actions, {total_cost} h).", at=at)
    return plan


def decide_plan(session: Session, actor: Actor, plan: InterventionPlan, decision: str, note: str, at: datetime | None = None) -> InterventionPlan:
    actor.require("plan.decide")
    if plan.status != "draft":
        raise HTTPException(status_code=409, detail=f"Plan {plan.id} was already {plan.status}.")
    note = (note or "").strip()
    if decision == "reject" and len(note) < 10:
        raise HTTPException(status_code=422, detail="Please give a reason for rejecting the plan (at least 10 characters).")
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=422, detail="Decision must be 'approve' or 'reject'.")
    at = at or now()
    plan.status = "approved" if decision == "approve" else "rejected"
    plan.decided_by = actor.user_id
    plan.decided_at = at
    plan.decision_note = note or None
    if decision == "approve":
        for aid in plan.action_ids:
            a = session.get(InterventionAction, aid)
            if a is None or a.status != "candidate":
                raise HTTPException(status_code=409, detail=f"Action {aid} is no longer a candidate; the plan cannot be approved as saved.")
            concern = session.get(ReportingConcern, a.concern_id)
            cs = costed(session, [a], plan.assumptions)[0]
            role = _responsible_role(a, concern.concern_type)
            assignee = _default_assignee(session, role, concern)
            a.status = "approved"
            asg = InterventionAssignment(
                id=_next_id(session, InterventionAssignment, "F"), plan_id=plan.id, action_id=a.id, title=a.title,
                responsible_role=role, assignee_user_id=assignee, target_unit_ids=a.unit_ids,
                due_date=at.date() + timedelta(days=max(cs.time_days, 1) + 2),
                follow_up_date=at.date() + timedelta(days=max(cs.time_days, 1) + 9),
                status="approved", follow_up_notes=[], created_at=at, updated_at=at,
            )
            session.add(asg)
            session.flush()
            audit.record(session, actor, "assignment", asg.id, "assignment.created", f"Action approved in {plan.id}: {a.title}", {"plan": plan.id}, at=at)
    audit.record(session, actor, "plan", plan.id, f"plan.{plan.status}", f"{actor.display_name} {plan.status} plan {plan.id}.", {"note": note}, at=at)
    return plan


def _default_assignee(session: Session, role: str, concern: ReportingConcern) -> str | None:
    q = select(User).where(User.role_id == role)
    if role == "provincial_coordinator" and concern.province:
        q = q.where(User.province == concern.province)
    u = session.execute(q.order_by(User.id)).scalars().first()
    return u.id if u else None


ASSIGNMENT_TRANSITIONS = {
    "approved": {"in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": {"closed", "in_progress"},
    "closed": set(),
    "cancelled": set(),
}


def update_assignment(session: Session, actor: Actor, asg: InterventionAssignment, status: str | None, note: str | None,
                      evidence: str | None, follow_up_date: date | None, at: datetime | None = None) -> InterventionAssignment:
    actor.require("assignment.update")
    if actor.role == "rhu_staff" and actor.reporting_unit_id not in asg.target_unit_ids:
        raise HTTPException(status_code=403, detail="RHU staff can update only actions that target their own unit.")
    at = at or now()
    changes = []
    if status and status != asg.status:
        if status not in ASSIGNMENT_TRANSITIONS.get(asg.status, set()):
            raise HTTPException(status_code=409, detail=f"An action that is '{asg.status.replace('_', ' ')}' cannot move to '{status.replace('_', ' ')}'.")
        if status == "completed" and not ((evidence or asg.evidence_of_completion or "").strip()):
            raise HTTPException(status_code=422, detail="Describe the evidence of completion before marking the action completed.")
        if status == "closed" and not session.execute(select(InterventionOutcome).where(InterventionOutcome.assignment_id == asg.id)).first():
            raise HTTPException(status_code=422, detail="Record an outcome (even 'not yet verified') before closing the action.")
        if status == "cancelled" and len((note or "").strip()) < 10:
            raise HTTPException(status_code=422, detail="Give a reason for cancelling (at least 10 characters).")
        changes.append(f"status {asg.status} → {status}")
        asg.status = status
        action = session.get(InterventionAction, asg.action_id)
        if status == "completed":
            asg.completed_at = at
            if action:
                action.status = "completed"
        elif status == "closed":
            asg.closed_at = at
        elif status == "in_progress" and action and action.status == "completed":
            action.status = "approved"
            asg.completed_at = None
        elif status == "cancelled" and action:
            action.status = "candidate"
    if evidence is not None and evidence.strip():
        asg.evidence_of_completion = evidence.strip()
        changes.append("evidence recorded")
    if follow_up_date:
        asg.follow_up_date = follow_up_date
        changes.append(f"follow-up {follow_up_date.isoformat()}")
    if note and note.strip():
        asg.follow_up_notes = [*asg.follow_up_notes, {"at": at.isoformat(), "by": actor.user_id, "text": note.strip()}]
        changes.append("note added")
    if not changes:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    asg.updated_at = at
    audit.record(session, actor, "assignment", asg.id, "assignment.updated", f"{actor.display_name} updated {asg.id}: {', '.join(changes)}.", at=at)
    return asg


def record_outcome(session: Session, actor: Actor, asg: InterventionAssignment, outcome_status: str, summary: str, at: datetime | None = None, source: str | None = None) -> InterventionOutcome:
    actor.require("assignment.update")
    if outcome_status not in ("not_yet_verified", "observed_unverified", "verified"):
        raise HTTPException(status_code=422, detail="Unknown outcome status.")
    if asg.status not in ("completed", "closed"):
        raise HTTPException(status_code=409, detail="Outcomes can be recorded only after the action is completed.")
    summary = (summary or "").strip()
    if len(summary) < 10:
        raise HTTPException(status_code=422, detail="Describe the outcome (at least 10 characters).")
    if outcome_status == "verified" and actor.role == "rhu_staff":
        raise HTTPException(status_code=403, detail="Only coordinators or analysts can mark an outcome as verified by a reviewer.")
    src = source or ("reviewer" if outcome_status == "verified" else "observed_in_data" if outcome_status == "observed_unverified" else "reviewer")
    o = InterventionOutcome(assignment_id=asg.id, outcome_status=outcome_status, source=src, summary=summary, recorded_by=actor.user_id, recorded_at=at or now())
    session.add(o)
    asg.updated_at = at or now()
    audit.record(session, actor, "assignment", asg.id, "assignment.outcome_recorded", f"{actor.display_name} recorded an outcome for {asg.id} ({outcome_status.replace('_', ' ')}).", at=at)
    return o


def stage(asg: InterventionAssignment, outcomes: list[InterventionOutcome]) -> str:
    """Where an action is in proposed → approved → completed → outcome."""
    if asg.status == "cancelled":
        return "cancelled"
    if asg.status in ("completed", "closed"):
        if any(o.outcome_status == "verified" for o in outcomes):
            return "outcome_verified"
        if any(o.outcome_status == "observed_unverified" for o in outcomes):
            return "outcome_observed"
        return "completed_outcome_not_verified"
    return "approved"


def add_direct_action(session: Session, actor: Actor, concern: ReportingConcern, action_type: str, title: str,
                      assignee_id: str | None, due: date | None, note: str | None, at: datetime | None = None) -> InterventionAssignment:
    """Add one corrective action to a concern without going through the planner.

    It is recorded the same way as planner actions: an approved single-action
    plan whose assignment is then tracked as follow-up.
    """
    actor.require("plan.create")
    actor.require("plan.decide")
    if concern.status not in OPEN_STATUSES:
        raise HTTPException(status_code=409, detail=f"Concern {concern.id} is closed; reopen it before adding actions.")
    if action_type not in ACTION_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown action type. Choose one of: {', '.join(ACTION_TYPES.values())}.")
    title = (title or "").strip()
    if len(title) < 5:
        raise HTTPException(status_code=422, detail="Describe the action (at least 5 characters).")
    assignee = session.get(User, assignee_id) if assignee_id else None
    if assignee_id and assignee is None:
        raise HTTPException(status_code=422, detail=f"User {assignee_id} does not exist.")
    at = at or now()
    n = session.execute(select(func.count()).select_from(InterventionAction).where(InterventionAction.concern_id == concern.id)).scalar_one()
    aid = f"A-{concern.id}-x{n + 1}"
    while session.get(InterventionAction, aid) is not None:
        n += 1
        aid = f"A-{concern.id}-x{n + 1}"
    unit_ids = [u.id for u in concern.units]
    session.add(InterventionAction(
        id=aid, concern_id=concern.id, action_type=action_type, title=title, unit_ids=unit_ids,
        expected_reports_per_week=_weekly_expected(session, unit_ids), priority=SEVERITY_PRIORITY[concern.severity], depends_on=[],
        rationale="Added directly from the investigation.", status="candidate", created_at=at,
    ))
    session.flush()
    cost = costed(session, [session.get(InterventionAction, aid)], merge_assumptions(None))[0].cost_hours
    plan = save_plan(session, actor, f"Direct action — {title[:150]}", "manual", cost, [aid], None,
                     notes=f"Single action added from {concern.id}.", at=at)
    decide_plan(session, actor, plan, "approve", "Added directly from the investigation.", at=at)
    asg = session.execute(select(InterventionAssignment).where(InterventionAssignment.action_id == aid)).scalar_one()
    if assignee is not None:
        asg.assignee_user_id = assignee.id
        asg.responsible_role = assignee.role_id
    if due:
        asg.due_date = due
        asg.follow_up_date = due + timedelta(days=7)
    if note and note.strip():
        asg.follow_up_notes = [{"at": at.isoformat(), "by": actor.user_id, "text": note.strip()}]
    audit.record(session, actor, "concern", concern.id, "concern.action_added", f"{actor.display_name} added action {asg.id} to {concern.id}: {title}",
                 {"assignment": asg.id, "plan": plan.id}, at=at)
    return asg
