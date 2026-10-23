from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.data import seed
from iris.data.simulate import SCENARIO_KIND_LABELS, demo_scenarios
from iris.data.world import build_world
from iris.db import get_session
from iris.detection.methods import METHOD_LABELS
from iris.models import ReportingCategory, ReportingUnit, Role, User
from iris.optimization.planner import ACTION_TYPES
from iris.schemas import RESET_CONFIRMATION, ResetIn
from iris.services import audit, datasets
from iris.services.concerns import STATUS_LABELS, TYPE_LABELS
from iris.services.context import PERMISSIONS, Actor, get_actor

router = APIRouter(tags=["meta"])


@router.get("/meta")
def meta(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    users = session.execute(select(User).order_by(User.role_id, User.id)).scalars().all()
    roles = session.execute(select(Role)).scalars().all()
    units = session.execute(select(ReportingUnit).order_by(ReportingUnit.province, ReportingUnit.name)).scalars().all()
    return {
        "app": {"name": "IRIS", "full_name": "Integrated Reporting Intervention System", "tagline": "See the connections. Restore what matters.",
                "prototype_notice": "Research prototype. Not an officially deployed DOH system. All demonstration data is simulated."},
        "as_of": config.AS_OF.isoformat(),
        "demo_dataset_id": config.DEMO_DATASET_ID,
        "actor": {"user_id": actor.user_id, "role": actor.role, "display_name": actor.display_name,
                  "reporting_unit_id": actor.reporting_unit_id, "province": actor.province,
                  "permissions": sorted(PERMISSIONS.get(actor.role, set()))},
        "roles": [{"id": r.id, "name": r.name, "description": r.description} for r in roles],
        "users": [{"id": u.id, "display_name": u.display_name, "role": u.role_id, "reporting_unit_id": u.reporting_unit_id, "province": u.province} for u in users],
        "units": [{"id": u.id, "name": u.name, "unit_type": u.unit_type, "province": u.province, "municipality": u.municipality, "active": u.active} for u in units],
        "provinces": sorted({u.province for u in units}),
        "categories": [{"code": c.code, "name": c.name, "description": c.description, "frequency": c.frequency} for c in session.execute(select(ReportingCategory)).scalars()],
        "weeks": datasets.week_labels(),
        "labels": {"status": STATUS_LABELS, "concern_type": TYPE_LABELS, "method": METHOD_LABELS, "action_type": ACTION_TYPES,
                   "scenario_kind": SCENARIO_KIND_LABELS},
    }


@router.get("/demo/scenarios")
def scenarios() -> list[dict]:
    world = build_world()
    names = {u.id: u.name for u in world.units}
    out = []
    for s in demo_scenarios(world):
        d = s.as_dict()
        d["unit_names"] = [names[u] for u in s.units]
        d["period"] = f"{config.week_start(s.start_week).isoformat()} – {config.week_end(s.end_week).isoformat()}"
        out.append(d)
    return out


@router.post("/demo/reset")
def reset(body: ResetIn, actor: Actor = Depends(get_actor)) -> dict:
    """Rebuild the demo database. Available to every demo role: it is a demo control, not a data operation.

    Destructive: every table is recreated, so the caller must send the typed confirmation.
    """
    if (body.confirm or "").strip() != RESET_CONFIRMATION:
        raise HTTPException(status_code=422, detail=f"Type {RESET_CONFIRMATION} to confirm. Resetting deletes every change made in this demo.")
    result = seed.reset(body.scenario_ids)
    from iris.db import SessionLocal
    with SessionLocal() as s:
        audit.record(s, actor.user_id, "system", "demo", "demo.reset", f"{actor.display_name} reset the demo data.", {"scenarios": result["scenarios"]})
        s.commit()
    return result
