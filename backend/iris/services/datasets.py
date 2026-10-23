"""Loading dataset frames and cached slot / detection results."""

from __future__ import annotations

from functools import lru_cache
from threading import Lock

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.detection.features import unit_week_features
from iris.detection.methods import DetectionParams, detect, own_evidence, peer_groups_from_edges
from iris.models import DataRecord, Dataset, ReportingCategory, ReportingExpectation, ReportingRelationship, ReportingUnit
from iris.services.slots import build_slots

_versions: dict[str, int] = {}
_lock = Lock()
_cache: dict[tuple, object] = {}

CASE_COUNT_EXCLUDE = {"MCS"}


def bump(dataset_id: str | None = None) -> None:
    """Invalidate cached computations after data changes."""
    with _lock:
        if dataset_id is None:
            _versions.clear()
            _cache.clear()
        else:
            _versions[dataset_id] = _versions.get(dataset_id, 0) + 1


def _key(dataset_id: str, kind: str, *extra) -> tuple:
    return (dataset_id, _versions.get(dataset_id, 0), kind, *extra)


def get_dataset(session: Session, dataset_id: str) -> Dataset:
    ds = session.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} was not found.")
    return ds


def records_frame(session: Session, dataset_id: str) -> pd.DataFrame:
    key = _key(dataset_id, "records")
    if key in _cache:
        return _cache[key]  # type: ignore[return-value]
    rows = session.execute(select(DataRecord).where(DataRecord.dataset_id == dataset_id)).scalars().all()
    df = pd.DataFrame([{
        "id": r.id, "reporting_unit_id": r.reporting_unit_id, "area": r.area, "category_code": r.category_code,
        "period_start": r.period_start, "period_end": r.period_end, "value": r.value, "value_status": r.value_status,
        "due_at": r.due_at, "received_at": r.received_at, "fields_complete": r.fields_complete,
        "source_row": r.source_row, "revision": r.revision, "note": r.note,
    } for r in rows], columns=["id", "reporting_unit_id", "area", "category_code", "period_start", "period_end", "value",
                               "value_status", "due_at", "received_at", "fields_complete", "source_row", "revision", "note"])
    _cache[key] = df
    return df


def expectations_frame(session: Session, dataset_id: str) -> pd.DataFrame:
    rows = session.execute(select(ReportingExpectation).where(ReportingExpectation.dataset_id == dataset_id)).scalars().all()
    return pd.DataFrame([{
        "reporting_unit_id": e.reporting_unit_id, "category_code": e.category_code, "frequency": e.frequency,
        "start_date": e.start_date, "end_date": e.end_date,
    } for e in rows], columns=["reporting_unit_id", "category_code", "frequency", "start_date", "end_date"])


def slots(session: Session, dataset_id: str) -> pd.DataFrame | None:
    """Expected-vs-received slots, or ``None`` when the dataset defines no expectations."""
    key = _key(dataset_id, "slots")
    if key in _cache:
        return _cache[key]  # type: ignore[return-value]
    exp = expectations_frame(session, dataset_id)
    if exp.empty:
        _cache[key] = None
        return None
    out = build_slots(exp, records_frame(session, dataset_id), as_of=config.AS_OF, record_cutoff=None)
    _cache[key] = out
    return out


def case_categories(session: Session) -> set[str]:
    return {c.code for c in session.execute(select(ReportingCategory)).scalars()} - CASE_COUNT_EXCLUDE


def peer_groups(session: Session, dataset_id: str) -> dict[str, dict[str, list[str]]]:
    rels = session.execute(select(ReportingRelationship).where(ReportingRelationship.dataset_id == dataset_id)).scalars().all()
    units = {u.id for u in session.execute(select(ReportingUnit).where(ReportingUnit.unit_type != "hub")).scalars()}
    return peer_groups_from_edges([(r.source_id, r.target_id, r.relationship_type) for r in rels], units)


def detection(session: Session, dataset_id: str, method: str, params: DetectionParams | None = None) -> pd.DataFrame | None:
    params = params or DetectionParams()
    key = _key(dataset_id, "detect", method)
    if key in _cache:
        return _cache[key]  # type: ignore[return-value]
    sl = slots(session, dataset_id)
    if sl is None:
        return None
    # Detection features are frozen at the dataset snapshot: reports entered
    # in the app later change completeness metrics, not past detection runs.
    feats = unit_week_features(sl, case_categories(session), as_of=config.AS_OF)
    ev = own_evidence(feats, params)
    out = detect(feats, method, params, peer_groups=peer_groups(session, dataset_id) if method == "network" else None, evidence=ev)
    _cache[key] = out
    return out


@lru_cache(maxsize=1)
def week_labels() -> list[dict]:
    out = []
    for t in range(config.N_WEEKS):
        s, e = config.week_start(t), config.week_end(t)
        out.append({"week": t, "start": s.isoformat(), "end": e.isoformat(), "iso_week": s.isocalendar().week,
                    "label": f"W{s.isocalendar().week} · {s.strftime('%b')} {s.day}–{e.strftime('%b') + ' ' if e.month != s.month else ''}{e.day}",
                    # e.g. "ISO W40 · 28 Sep–04 Oct" (ISO weeks run Monday to Sunday)
                    "iso_label": f"ISO W{s.isocalendar().week} · {s.strftime('%d %b')}–{e.strftime('%d %b')}"})
    return out
