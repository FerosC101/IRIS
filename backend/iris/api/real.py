"""Real-data models (read-only outputs of the pipeline in "Model A/pipeline") and human reviews of their leads."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from iris.db import get_session
from iris.schemas import LeadReviewIn
from iris.services import real_models as rm
from iris.services.context import Actor, get_actor

router = APIRouter(prefix="/real", tags=["real-data models"])


@router.get("/status")
def status(actor: Actor = Depends(get_actor)) -> dict:
    actor.require("real.view")
    return rm.status()


@router.get("/zero-reports")
def zero_reports(week: str | None = None, band: str | None = None, region: str | None = None, review: str | None = None,
                 page: int = Query(1, ge=1), page_size: int = Query(25, ge=5, le=200),
                 session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("real.view")
    return rm.zero_reports(session, week or None, band or None, region or None, review or None, page, page_size)


@router.get("/alerts")
def alerts(disease: str = "dengue", year: str | None = Query(None, pattern=r"^(all|\d{4})$"), week: str | None = None, region: str | None = None,
           review: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=5, le=200),
           session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("real.view")
    return rm.alerts(session, disease, year, week or None, region or None, review or None, page, page_size)


@router.get("/plan")
def plan(week: str | None = None, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("real.view")
    return rm.plan(session, week or None)


@router.get("/metrics")
def metrics(actor: Actor = Depends(get_actor)) -> dict:
    actor.require("real.view")
    return rm.metrics()


@router.get("/reviews")
def reviews(lead_type: str, lead_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    actor.require("real.view")
    return rm.history(session, lead_type, lead_id)


@router.post("/reviews")
def add_review(body: LeadReviewIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    return rm.add_review(session, actor, body.lead_type, body.lead_id, body.status, body.note or "", body.evidence or "")
