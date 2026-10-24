"""Reporting network graph built only from relationships defined in a dataset."""

from __future__ import annotations

import networkx as nx
import pandas as pd
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.data.world import GEO_SIZE, PROVINCE_OUTLINES, RELATIONSHIP_TYPES
from iris.models import ReportingConcern, ReportingExpectation, ReportingRelationship, ReportingUnit
from iris.services import datasets
from iris.services.concerns import OPEN_STATUSES
from iris.services.slots import summarize

STATUS_LABELS = {
    "normal": "Reporting normally",
    "delayed": "Some late reports",
    "missing": "Missing reports",
    "no_schedule": "No reporting schedule",
}


# A unit is "missing" below this share of expected reports arrived, and "delayed" below this share on time.
STATUS_THRESHOLDS = {"completeness": 0.8, "timeliness": 0.75}


def _status(s: dict) -> str:
    if s["expected"] == 0:
        return "no_schedule"
    if s["completeness"] < STATUS_THRESHOLDS["completeness"]:
        return "missing"
    if s["timeliness"] < STATUS_THRESHOLDS["timeliness"]:
        return "delayed"
    return "normal"


def _geography(units: list[ReportingUnit]) -> dict:
    available = any(u.geo_x is not None for u in units)
    return {
        "available": available, "width": GEO_SIZE[0], "height": GEO_SIZE[1],
        "provinces": [{"name": name, "outline": [list(p) for p in pts]} for name, pts in PROVINCE_OUTLINES.items()] if available else [],
        "note": "Schematic geography. The provinces and municipalities are fictional; positions do not describe real places."
        if available else "No map positions are defined for these units.",
    }


def graph(session: Session, dataset_id: str, w_from: int, w_to: int) -> dict:
    datasets.get_dataset(session, dataset_id)
    units = list(session.execute(select(ReportingUnit).order_by(ReportingUnit.id)).scalars())
    rels = list(session.execute(select(ReportingRelationship).where(ReportingRelationship.dataset_id == dataset_id)).scalars())
    if not rels:
        return {"defined": False, "message": "This dataset does not define reporting relationships, so no network can be drawn.", "nodes": [], "edges": []}
    sl = datasets.slots(session, dataset_id)
    window = sl[(sl["frequency"] == "weekly") & (sl["week"] >= w_from) & (sl["week"] <= w_to)] if sl is not None else pd.DataFrame(columns=["unit_id"])
    g = nx.DiGraph()
    for u in units:
        g.add_node(u.id)
    for r in rels:
        g.add_edge(r.source_id, r.target_id)
    open_counts: dict[str, int] = {}
    for c in session.execute(select(ReportingConcern).where(ReportingConcern.status.in_(OPEN_STATUSES), ReportingConcern.dataset_id == dataset_id)).scalars():
        for u in c.units:
            open_counts[u.id] = open_counts.get(u.id, 0) + 1
    nodes = []
    for u in units:
        if u.unit_type == "hub":
            members = list(nx.ancestors(g, u.id))
            s = summarize(window[window["unit_id"].isin(members)])
        else:
            members = []
            s = summarize(window[window["unit_id"] == u.id])
        st = _status(s)
        nodes.append({
            "id": u.id, "name": u.name, "unit_type": u.unit_type, "province": u.province, "municipality": u.municipality,
            "active": u.active, "is_sentinel": u.is_sentinel, "x": u.x, "y": u.y, "geo_x": u.geo_x, "geo_y": u.geo_y,
            "status": st, "status_label": STATUS_LABELS[st], "completeness": s["completeness"], "timeliness": s["timeliness"],
            "expected": s["expected"], "open_concerns": open_counts.get(u.id, 0),
            "downstream_units": len(members) if u.unit_type == "hub" else None,
            "degree": g.in_degree(u.id) + g.out_degree(u.id), "simulated": u.simulated,
        })
    edges = [{"id": r.id, "source": r.source_id, "target": r.target_id, "relationship_type": r.relationship_type,
              "description": r.description, "simulated": r.simulated} for r in rels]
    return {
        "defined": True, "nodes": nodes, "edges": edges,
        "relationship_types": [{"type": k, "description": v} for k, v in RELATIONSHIP_TYPES.items()],
        "status_labels": STATUS_LABELS,
        "status_thresholds": STATUS_THRESHOLDS,
        "window": {"from": w_from, "to": w_to},
        "note": "All units and relationships are simulated. Edges exist only where the simulated network defines them.",
        "geography": _geography(units),
    }


def unit_detail(session: Session, dataset_id: str, unit_id: str) -> dict:
    u = session.get(ReportingUnit, unit_id)
    if u is None:
        raise HTTPException(status_code=404, detail=f"Reporting unit {unit_id} was not found.")
    names = {x.id: x.name for x in session.execute(select(ReportingUnit)).scalars()}
    rels = session.execute(select(ReportingRelationship).where(ReportingRelationship.dataset_id == dataset_id,
                           (ReportingRelationship.source_id == unit_id) | (ReportingRelationship.target_id == unit_id))).scalars().all()
    exps = session.execute(select(ReportingExpectation).where(ReportingExpectation.dataset_id == dataset_id, ReportingExpectation.reporting_unit_id == unit_id)).scalars().all()
    sl = datasets.slots(session, dataset_id)
    history = []
    if sl is not None:
        if u.unit_type == "hub":
            members = [r.source_id for r in session.execute(select(ReportingRelationship).where(ReportingRelationship.dataset_id == dataset_id, ReportingRelationship.target_id == unit_id, ReportingRelationship.relationship_type == "reports_through")).scalars()]
            sub = sl[sl["unit_id"].isin(members)]
        else:
            sub = sl[sl["unit_id"] == unit_id]
        for t in range(config.N_WEEKS):
            g = sub[(sub["frequency"] == "weekly") & (sub["week"] == t)]
            s = summarize(g)
            history.append({"week": t, "period_start": config.week_start(t).isoformat(), **s})
    concerns = [c for c in session.execute(select(ReportingConcern).where(ReportingConcern.dataset_id == dataset_id).order_by(ReportingConcern.week_start_index.desc())).scalars()
                if unit_id in {x.id for x in c.units} or c.shared_via == unit_id]
    return {
        "unit": {"id": u.id, "name": u.name, "unit_type": u.unit_type, "province": u.province, "municipality": u.municipality,
                 "active": u.active, "is_sentinel": u.is_sentinel, "notes": u.notes, "simulated": u.simulated},
        "relationships": [{
            "id": r.id, "direction": "outgoing" if r.source_id == unit_id else "incoming",
            "other_id": r.target_id if r.source_id == unit_id else r.source_id,
            "other_name": names.get(r.target_id if r.source_id == unit_id else r.source_id),
            "relationship_type": r.relationship_type, "description": r.description, "simulated": r.simulated,
        } for r in rels],
        "expectations": [{"category_code": e.category_code, "frequency": e.frequency, "start_date": e.start_date.isoformat(), "end_date": e.end_date.isoformat()} for e in exps],
        "history": history,
        "history_note": "For hubs, history aggregates the units that report through the hub." if u.unit_type == "hub" else None,
        "concerns": [{"id": c.id, "title": c.title, "status": c.status, "severity": c.severity, "concern_type": c.concern_type,
                      "period_start": c.period_start.isoformat(), "period_end": c.period_end.isoformat()} for c in concerns],
    }
