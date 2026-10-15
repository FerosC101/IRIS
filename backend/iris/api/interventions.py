from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris.db import get_session
from iris.models import InterventionAction, InterventionAssignment, InterventionOutcome, InterventionPlan, ReportingConcern, ReportingUnit, User
from iris.optimization.planner import ACTION_TYPES, DEFAULT_ASSUMPTIONS
from iris.schemas import AssignmentPatch, CompareIn, DecisionIn, OutcomeIn, PlanIn
from iris.services import interventions as iv
from iris.services.clock import today
from iris.services.context import Actor, get_actor

router = APIRouter(tags=["interventions"])


@router.get("/actions")
def candidate_actions(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    pool = iv.candidate_pool(session, actor)
    assumptions = iv.merge_assumptions(None)
    cs = {c.id: c for c in iv.costed(session, pool, assumptions)}
    session.commit()
    return {"actions": [iv.action_dict(session, a, cs[a.id]) for a in pool], "assumptions": assumptions, "action_types": ACTION_TYPES,
            "default_assumptions": DEFAULT_ASSUMPTIONS}


@router.post("/plans/compare")
def compare(body: CompareIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    out = iv.compare(session, actor, body.budget_hours, body.action_ids, body.assumptions.as_overrides() if body.assumptions else None)
    session.commit()
    return out


def _plan_dict(session: Session, p: InterventionPlan, users: dict[str, str], full: bool = False) -> dict:
    d = {"id": p.id, "name": p.name, "method": p.method, "budget_hours": p.budget_hours, "action_ids": p.action_ids,
         "total_cost_hours": p.total_cost_hours, "total_expected_benefit": p.total_expected_benefit, "status": p.status,
         "notes": p.notes, "created_by": users.get(p.created_by, p.created_by), "created_at": p.created_at,
         "decided_by": users.get(p.decided_by or ""), "decided_at": p.decided_at, "decision_note": p.decision_note}
    if full:
        actions = [session.get(InterventionAction, a) for a in p.action_ids]
        cs = {c.id: c for c in iv.costed(session, [a for a in actions if a], p.assumptions)}
        d["assumptions"] = p.assumptions
        d["actions"] = [iv.action_dict(session, a, cs.get(a.id)) for a in actions if a]
        d["assignments"] = [{"id": a.id, "title": a.title, "status": a.status, "due_date": a.due_date}
                            for a in session.execute(select(InterventionAssignment).where(InterventionAssignment.plan_id == p.id)).scalars()]
    return d


def _users(session: Session) -> dict[str, str]:
    return {u.id: u.display_name for u in session.execute(select(User)).scalars()}


@router.get("/plans")
def list_plans(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    users = _users(session)
    return [_plan_dict(session, p, users) for p in session.execute(select(InterventionPlan).order_by(InterventionPlan.created_at.desc())).scalars()]


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    p = session.get(InterventionPlan, plan_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} was not found.")
    return _plan_dict(session, p, _users(session), full=True)


@router.post("/plans")
def create_plan(body: PlanIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    iv.sync_actions(session)
    p = iv.save_plan(session, actor, body.name, body.method, body.budget_hours, body.action_ids,
                     body.assumptions.as_overrides() if body.assumptions else None, body.notes or "")
    session.commit()
    return _plan_dict(session, p, _users(session), full=True)


@router.post("/plans/{plan_id}/decision")
def decide(plan_id: str, body: DecisionIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    p = session.get(InterventionPlan, plan_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} was not found.")
    iv.decide_plan(session, actor, p, body.decision, body.note or "")
    session.commit()
    return _plan_dict(session, p, _users(session), full=True)


def _assignment_dict(session: Session, a: InterventionAssignment, users: dict[str, str], names: dict[str, str]) -> dict:
    action = session.get(InterventionAction, a.action_id)
    concern = session.get(ReportingConcern, action.concern_id) if action else None
    plan = session.get(InterventionPlan, a.plan_id)
    outcomes = session.execute(select(InterventionOutcome).where(InterventionOutcome.assignment_id == a.id).order_by(InterventionOutcome.recorded_at.desc())).scalars().all()
    return {
        "id": a.id, "title": a.title, "plan_id": a.plan_id, "plan_name": plan.name if plan else None, "action_id": a.action_id,
        "action_type": action.action_type if action else None, "action_type_label": ACTION_TYPES.get(action.action_type) if action else None,
        "concern_id": concern.id if concern else None, "concern_title": concern.title if concern else None, "concern_status": concern.status if concern else None,
        "severity": concern.severity if concern else None, "responsible_role": a.responsible_role,
        "assignee_user_id": a.assignee_user_id, "assignee": users.get(a.assignee_user_id or ""),
        "target_unit_ids": a.target_unit_ids, "target_units": [names.get(u, u) for u in a.target_unit_ids],
        "due_date": a.due_date, "follow_up_date": a.follow_up_date, "overdue": a.status in ("approved", "in_progress") and a.due_date < today(),
        "status": a.status, "stage": iv.stage(a, outcomes),
        "follow_up_notes": [{**n, "by_name": users.get(n.get("by", ""), n.get("by"))} for n in a.follow_up_notes],
        "evidence_of_completion": a.evidence_of_completion, "completed_at": a.completed_at, "closed_at": a.closed_at,
        "created_at": a.created_at, "updated_at": a.updated_at,
        "outcomes": [{"id": o.id, "outcome_status": o.outcome_status, "source": o.source, "summary": o.summary,
                      "recorded_by": users.get(o.recorded_by, o.recorded_by), "recorded_at": o.recorded_at} for o in outcomes],
        "allowed_transitions": sorted(iv.ASSIGNMENT_TRANSITIONS.get(a.status, set())),
    }


@router.get("/assignments")
def list_assignments(status: str | None = None, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    users = _users(session)
    names = {u.id: u.name for u in session.execute(select(ReportingUnit)).scalars()}
    q = select(InterventionAssignment)
    if status == "active":
        q = q.where(InterventionAssignment.status.in_(("approved", "in_progress")))
    elif status:
        q = q.where(InterventionAssignment.status == status)
    rows = []
    for a in session.execute(q.order_by(InterventionAssignment.due_date)).scalars():
        if actor.role == "rhu_staff" and actor.reporting_unit_id not in a.target_unit_ids:
            continue
        d = _assignment_dict(session, a, users, names)
        if actor.role == "provincial_coordinator" and actor.province:
            concern = session.get(ReportingConcern, d["concern_id"]) if d["concern_id"] else None
            if concern and concern.province and concern.province != actor.province:
                continue
        rows.append(d)
    return rows


@router.get("/assignments/{assignment_id}")
def get_assignment(assignment_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    a = session.get(InterventionAssignment, assignment_id)
    if a is None:
        raise HTTPException(status_code=404, detail=f"Follow-up action {assignment_id} was not found.")
    return _assignment_dict(session, a, _users(session), {u.id: u.name for u in session.execute(select(ReportingUnit)).scalars()})


@router.patch("/assignments/{assignment_id}")
def patch_assignment(assignment_id: str, body: AssignmentPatch, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    a = session.get(InterventionAssignment, assignment_id)
    if a is None:
        raise HTTPException(status_code=404, detail=f"Follow-up action {assignment_id} was not found.")
    iv.update_assignment(session, actor, a, body.status, body.note, body.evidence, body.follow_up_date)
    session.commit()
    return get_assignment(assignment_id, session, actor)


@router.post("/assignments/{assignment_id}/outcomes")
def add_outcome(assignment_id: str, body: OutcomeIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    a = session.get(InterventionAssignment, assignment_id)
    if a is None:
        raise HTTPException(status_code=404, detail=f"Follow-up action {assignment_id} was not found.")
    iv.record_outcome(session, actor, a, body.outcome_status, body.summary)
    session.commit()
    return get_assignment(assignment_id, session, actor)
