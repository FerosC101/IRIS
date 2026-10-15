"""Work queue: what needs attention?"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.models import AuditEvent, InterventionAction, InterventionAssignment, ReportingConcern, ReportingUnit, User
from iris.services import datasets, reports
from iris.services.clock import today
from iris.services.concerns import CLOSED_STATUSES, OPEN_STATUSES, STATUS_LABELS, TYPE_LABELS, scope_filter
from iris.services.context import Actor
from iris.services.slots import summarize

PERIODS = {
    "latest": ("Latest week", config.N_WEEKS - 1),
    "4w": ("Last 4 weeks", config.N_WEEKS - 4),
    "13w": ("Last 13 weeks", config.N_WEEKS - 13),
    "all": ("All periods", 0),
}
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _units_label(units: list[ReportingUnit]) -> str:
    if len(units) == 1:
        return units[0].name
    return f"{units[0].name} + {len(units) - 1} more"


def concern_row(c: ReportingConcern, users: dict[str, str]) -> dict:
    cats = (c.detection_detail or {}).get("categories") or []
    return {
        "kind": "concern", "id": c.id, "title": c.title, "units": [u.id for u in c.units], "units_label": _units_label(c.units),
        "province": c.province, "category": ", ".join(cats) if cats else ("All weekly reports" if c.concern_type != "count_drop" else None),
        "period_start": c.period_start.isoformat(), "period_end": c.period_end.isoformat(),
        "concern_type": c.concern_type, "concern_type_label": TYPE_LABELS[c.concern_type],
        "severity": c.severity, "status": c.status, "status_label": STATUS_LABELS[c.status], "verification": c.verification,
        "updated_at": c.updated_at.isoformat(), "assigned": users.get(c.assigned_user_id or "") or ({"rhu_staff": "RHU staff"}.get(c.assigned_role or "") if c.assigned_role else None),
        "due": c.follow_up_due.isoformat() if c.follow_up_due else None,
        "overdue": bool(c.follow_up_due and c.follow_up_due < today() and c.status in OPEN_STATUSES),
        "link": f"/investigations/{c.id}",
    }


def overview(session: Session, actor: Actor, period: str = "4w", province: str | None = None, status: str = "active") -> dict:
    ds_id = config.DEMO_DATASET_ID
    if period not in PERIODS:
        period = "4w"
    w_from = PERIODS[period][1]
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    q = select(ReportingConcern).where(ReportingConcern.dataset_id == ds_id)
    sf = scope_filter(actor)
    if sf is not None:
        q = q.where(sf)
    all_concerns = list(session.execute(q).scalars())
    in_scope = [c for c in all_concerns if (not province or c.province == province)]
    in_period = [c for c in in_scope if c.week_end_index >= w_from]

    if status == "active":
        shown = [c for c in in_period if c.status in OPEN_STATUSES]
    elif status == "all":
        shown = in_period
    else:
        shown = [c for c in in_period if c.status == status]

    rows = [concern_row(c, users) for c in shown]

    # Follow-up actions in progress
    concern_ids = {c.id for c in in_scope}
    follow = []
    for asg in session.execute(select(InterventionAssignment).where(InterventionAssignment.status.in_(("approved", "in_progress")))).scalars():
        action = session.get(InterventionAction, asg.action_id)
        if action is None or action.concern_id not in concern_ids:
            continue
        if actor.role == "rhu_staff" and actor.reporting_unit_id not in asg.target_unit_ids:
            continue
        concern = next(c for c in in_scope if c.id == action.concern_id)
        unit_objs = [session.get(ReportingUnit, u) for u in asg.target_unit_ids]
        follow.append({
            "kind": "follow_up", "id": asg.id, "title": asg.title, "units": asg.target_unit_ids, "units_label": _units_label(unit_objs),
            "province": concern.province, "category": None, "period_start": concern.period_start.isoformat(), "period_end": concern.period_end.isoformat(),
            "concern_type": concern.concern_type, "concern_type_label": "Follow-up action", "severity": concern.severity,
            "status": asg.status, "status_label": asg.status.replace("_", " ").capitalize(), "verification": None,
            "updated_at": asg.updated_at.isoformat(), "assigned": users.get(asg.assignee_user_id or "") or asg.responsible_role,
            "due": asg.due_date.isoformat(), "overdue": asg.due_date < today(), "link": f"/follow-up?assignment={asg.id}",
        })
    if status in ("active", "all"):
        rows += follow

    tasks = reports.tasks(session, actor) if actor.role == "rhu_staff" else []
    rows.sort(key=lambda r: (not r["overdue"], SEVERITY_ORDER.get(r["severity"], 3), r["updated_at"]), reverse=False)

    # Compact completeness trend for the scope
    sl = datasets.slots(session, ds_id)
    trend = []
    if sl is not None:
        sub = sl[sl["frequency"] == "weekly"]
        if actor.role == "rhu_staff" and actor.reporting_unit_id:
            sub = sub[sub["unit_id"] == actor.reporting_unit_id]
        else:
            prov = province or (actor.province if actor.role == "provincial_coordinator" else None)
            if prov:
                unit_prov = {u.id: u.province for u in session.execute(select(ReportingUnit)).scalars()}
                sub = sub[sub["unit_id"].map(unit_prov) == prov]
        for t in range(max(0, config.N_WEEKS - 12), config.N_WEEKS):
            s = summarize(sub[sub["week"] == t])
            trend.append({"week": t, "period_start": config.week_start(t).isoformat(), "completeness": s["completeness"], "timeliness": s["timeliness"]})

    recent_closed = sorted([c for c in in_scope if c.status in CLOSED_STATUSES and c.resolved_at], key=lambda c: c.resolved_at, reverse=True)[:5]
    updates = session.execute(select(AuditEvent).where(AuditEvent.entity_type.in_(("assignment", "plan"))).order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).limit(6)).scalars().all()

    open_c = [c for c in in_scope if c.status in OPEN_STATUSES]
    return {
        "period": {"key": period, "label": PERIODS[period][0], "from_week": w_from, "to_week": config.N_WEEKS - 1,
                   "start": config.week_start(w_from).isoformat(), "end": config.week_end(config.N_WEEKS - 1).isoformat()},
        "scope": {"role": actor.role, "province": actor.province if actor.role == "provincial_coordinator" else None,
                  "unit_id": actor.reporting_unit_id if actor.role == "rhu_staff" else None},
        "counts": {
            "new": sum(1 for c in open_c if c.status == "open"),
            "under_review": sum(1 for c in open_c if c.status == "under_review"),
            "clarification_requested": sum(1 for c in open_c if c.status == "clarification_requested"),
            "in_investigation": sum(1 for c in open_c if c.status == "in_investigation"),
            "overdue_follow_ups": sum(1 for r in follow if r["overdue"]) + sum(1 for c in open_c if c.follow_up_due and c.follow_up_due < today()),
            "follow_ups_active": len(follow),
            "tasks": len(tasks),
        },
        "queue": rows,
        "tasks": tasks,
        "trend": trend,
        "recently_closed": [{"id": c.id, "title": c.title, "status": c.status, "status_label": STATUS_LABELS[c.status],
                             "units_label": _units_label(c.units), "closed_at": c.resolved_at.isoformat(),
                             "concern_type_label": TYPE_LABELS[c.concern_type]} for c in recent_closed],
        "intervention_updates": [{"id": e.id, "at": e.at.isoformat(), "summary": e.summary, "entity_type": e.entity_type, "entity_id": e.entity_id} for e in updates],
        "dataset_as_of": config.AS_OF.isoformat(),
    }
