from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from iris import config
from iris.db import get_session
from iris.evaluation.runner import EvaluationConfig, run_evaluation
from iris.models import ExperimentRun, User
from iris.schemas import ExperimentIn
from iris.services import audit, recovery, surveillance
from iris.services.clock import now
from iris.services.context import Actor, get_actor

router = APIRouter(tags=["analytics"])


@router.get("/recovery")
def get_recovery(dataset_id: str = config.DEMO_DATASET_ID, province: str | None = None, unit_id: str | None = None, unit_type: str | None = None,
                 category: str | None = None, w_from: int | None = None, w_to: int | None = None,
                 session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("recovery.view")
    return recovery.recovery(session, dataset_id, province or None, unit_id or None, unit_type or None, category or None, w_from, w_to)


def _run_summary(r: ExperimentRun, users: dict[str, str]) -> dict:
    m = (r.results or {}).get("methods", {})
    return {
        "id": r.id, "name": r.name, "created_at": r.created_at, "created_by": users.get(r.created_by or "", "IRIS demo setup"),
        "status": r.status, "config": r.config, "duration_ms": r.duration_ms, "error": r.error,
        "headline": {k: {"precision": v["overall"]["precision"], "recall": v["overall"]["recall"], "false_alarm_rate": v["overall"]["false_alarm_rate"]} for k, v in m.items()},
    }


@router.get("/experiments")
def list_experiments(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    return [_run_summary(r, users) for r in session.execute(select(ExperimentRun).order_by(ExperimentRun.created_at.desc())).scalars()]


@router.get("/experiments/{run_id}")
def get_experiment(run_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    r = session.get(ExperimentRun, run_id)
    if r is None:
        raise HTTPException(status_code=404, detail=f"Experiment {run_id} was not found.")
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    return {**_run_summary(r, users), "results": r.results}


@router.post("/experiments")
def create_experiment(body: ExperimentIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("experiment.run")
    n = session.execute(select(func.count()).select_from(ExperimentRun)).scalar_one()
    run_id = f"E-{n + 1:04d}"
    while session.get(ExperimentRun, run_id) is not None:
        n += 1
        run_id = f"E-{n + 1:04d}"
    cfg = EvaluationConfig(replications=body.replications, base_seed=body.base_seed)
    started = now()
    try:
        res = run_evaluation(cfg)
        run = ExperimentRun(id=run_id, name=(body.name or "").strip() or f"Evaluation, {body.replications} replications, seed {body.base_seed}",
                            created_at=started, created_by=actor.user_id, status="completed", config=res["config"], results=res,
                            duration_ms=int(res["elapsed_seconds"] * 1000))
    except Exception as exc:  # record failures honestly instead of hiding them
        run = ExperimentRun(id=run_id, name=body.name or "Failed evaluation", created_at=started, created_by=actor.user_id, status="failed",
                            config=cfg.as_dict(), results={}, duration_ms=0, error=str(exc))
    session.add(run)
    audit.record(session, actor, "experiment", run_id, f"experiment.{run.status}", f"{actor.display_name} ran evaluation {run_id} ({run.status}).")
    session.commit()
    if run.status == "failed":
        raise HTTPException(status_code=500, detail=f"The evaluation failed: {run.error}")
    return get_experiment(run_id, session, actor)


@router.get("/surveillance/summary")
def surveillance_summary(category: str = "DENGUE", week: int | None = None, province: str | None = None, unit_type: str | None = None,
                         dataset_id: str = config.DEMO_DATASET_ID, heat_weeks: int = Query(6, ge=1, le=26), trend_weeks: int = Query(12, ge=2, le=26),
                         session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Weekly reporting summary for one category: received, zero-case, blank and missing reports kept separate."""
    return surveillance.summary(session, actor, dataset_id, category, week, province or None, unit_type or None, heat_weeks, trend_weeks)
