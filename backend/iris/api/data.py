from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from iris import config
from iris.db import get_session
from iris.models import AuditEvent, DataRecord, Dataset, ImportRecord, ReportingConcern, ReportingUnit, User
from iris.schemas import ImportCommitIn, ImportValidateIn, UnitPatch
from iris.services import audit, datasets, explorer, ids, imports, lineage, network
from iris.services.clock import now
from iris.services.context import Actor, get_actor

router = APIRouter(tags=["data"])


def _dataset_dict(ds: Dataset) -> dict:
    return {
        "id": ds.id, "name": ds.name, "description": ds.description, "source": ds.source, "designation": ds.designation,
        "geographic_level": ds.geographic_level, "imported_at": ds.imported_at, "imported_by": ds.imported_by,
        "coverage_start": ds.coverage_start, "coverage_end": ds.coverage_end, "row_count": ds.row_count,
        "validation_status": ds.validation_status, "known_limitations": ds.known_limitations,
        "has_expectations": ds.has_expectations, "has_timestamps": ds.has_timestamps, "has_units": ds.has_units,
        "is_demo": ds.is_demo,
        "checksum": ds.checksum, "checksum_basis": ds.checksum_basis, "checksum_algorithm": "SHA-256" if ds.checksum else None,
    }


@router.get("/datasets")
def list_datasets(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    return [_dataset_dict(d) for d in session.execute(select(Dataset).order_by(Dataset.is_demo.desc(), Dataset.imported_at)).scalars()]


@router.get("/datasets/{dataset_id}")
def dataset_detail(dataset_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    imps = session.execute(select(ImportRecord).where(ImportRecord.dataset_id == dataset_id).order_by(ImportRecord.at.desc())).scalars().all()
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    q = explorer.quality(session, dataset_id, search=None, province=None, unit_id=None, category=None, status=None, date_from=None, date_to=None)
    return {
        **_dataset_dict(ds), "data_dictionary": ds.data_dictionary, "column_mapping": ds.column_mapping,
        "imported_by_name": users.get(ds.imported_by or "", "IRIS demo setup" if ds.is_demo else None),
        "imports": [{"id": i.id, "filename": i.filename, "at": i.at, "by": users.get(i.by_user_id or ""), "status": i.status,
                     "row_count": i.row_count, "errors": i.errors, "warnings": i.warnings} for i in imps],
        "quality": q,
        "concerns": session.query(ReportingConcern).filter(ReportingConcern.dataset_id == dataset_id).count(),
        "integrity": _integrity(session, ds),
    }


def _integrity(session: Session, ds: Dataset) -> dict:
    """Whether the records still match the canonical checksum recorded at ingestion."""
    if not ds.records_checksum:
        return {"recorded": False, "records_unchanged": None, "current_records_checksum": None,
                "note": "No checksum was recorded when this dataset was ingested."}
    current = datasets.records_checksum(session, ds.id)
    same = current == ds.records_checksum
    return {"recorded": True, "records_unchanged": same, "current_records_checksum": current, "records_checksum_at_ingestion": ds.records_checksum,
            "note": "Records match the checksum recorded at ingestion." if same else
            "Records changed after ingestion (for example, reports submitted or corrected in IRIS)."}


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("datasets.manage")
    ds = datasets.get_dataset(session, dataset_id)
    if ds.is_demo:
        raise HTTPException(status_code=409, detail="Demo datasets cannot be deleted. Use ‘Reset demo data’ instead.")
    session.execute(delete(DataRecord).where(DataRecord.dataset_id == dataset_id))
    for imp in session.execute(select(ImportRecord).where(ImportRecord.dataset_id == dataset_id)).scalars():
        imp.dataset_id = None
    session.delete(ds)
    audit.record(session, actor, "dataset", dataset_id, "dataset.deleted", f"{actor.display_name} deleted imported dataset '{ds.name}'.")
    session.commit()
    datasets.bump(dataset_id)
    return {"deleted": dataset_id}


def _filters(search, province, unit_id, category, status, date_from, date_to) -> dict:
    return {"search": search or None, "province": province or None, "unit_id": unit_id or None, "category": category or None,
            "status": status or None, "date_from": date_from, "date_to": date_to}


@router.get("/datasets/{dataset_id}/records")
def records(dataset_id: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=5, le=200), sort: str = "period_start", order: str = "desc",
            search: str | None = None, province: str | None = None, unit_id: str | None = None, category: str | None = None,
            status: str | None = None, date_from: date | None = None, date_to: date | None = None,
            session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    if actor.role == "rhu_staff":
        unit_id = actor.reporting_unit_id
    return explorer.rows(session, dataset_id, page, page_size, sort, order, **_filters(search, province, unit_id, category, status, date_from, date_to))


def _visible_record(session: Session, actor: Actor, record_id: int | None, label: str) -> DataRecord:
    """A record the actor may read. RHU staff see only their own unit's records; to them
    another unit's record does not exist (404), as with concerns."""
    r = session.get(DataRecord, record_id) if record_id is not None else None
    if r is None or (actor.role == "rhu_staff" and r.reporting_unit_id != actor.reporting_unit_id):
        raise HTTPException(status_code=404, detail=f"{label} was not found.")
    return r


@router.get("/datasets/{dataset_id}/records/{record_id}")
def record(dataset_id: str, record_id: int, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    _visible_record(session, actor, record_id, f"Record {record_id}")
    return explorer.record_detail(session, dataset_id, record_id)


@router.get("/reports/{report_id}")
def report_by_id(report_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Resolve a display report id (``RPT-0042``) to its record, in whichever dataset holds it."""
    r = _visible_record(session, actor, ids.parse_report_id(report_id), f"Report {report_id}")
    return explorer.record_detail(session, r.dataset_id, r.id)


@router.get("/datasets/{dataset_id}/trends")
def trends(dataset_id: str, variable: str = "cases", group_by: str = "category", search: str | None = None, province: str | None = None,
           unit_id: str | None = None, category: str | None = None, status: str | None = None, date_from: date | None = None,
           date_to: date | None = None, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    if variable not in ("cases", "completeness", "timeliness"):
        raise HTTPException(status_code=422, detail="Unknown variable.")
    if actor.role == "rhu_staff":
        unit_id = actor.reporting_unit_id
    return explorer.trends(session, dataset_id, variable, group_by, **_filters(search, province, unit_id, category, status, date_from, date_to))


@router.get("/datasets/{dataset_id}/quality")
def quality(dataset_id: str, search: str | None = None, province: str | None = None, unit_id: str | None = None, category: str | None = None,
            status: str | None = None, date_from: date | None = None, date_to: date | None = None,
            session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    if actor.role == "rhu_staff":
        unit_id = actor.reporting_unit_id
    return explorer.quality(session, dataset_id, **_filters(search, province, unit_id, category, status, date_from, date_to))


@router.get("/datasets/{dataset_id}/filters")
def filter_options(dataset_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    t = explorer.table(session, dataset_id)
    units = t[["unit_id", "unit_name"]].dropna().drop_duplicates().sort_values("unit_name") if ds.has_units or ds.has_expectations else None
    return {
        "provinces": sorted(t["province"].dropna().unique().tolist()) if "province" in t else [],
        "categories": sorted(t["category_code"].dropna().unique().tolist()),
        "units": [] if units is None else [{"id": r.unit_id, "name": r.unit_name} for r in units.itertuples()],
        "statuses": ["on_time", "late", "not_received"] if ds.has_expectations else (["on_time", "late"] if ds.has_timestamps else []),
        "value_statuses": ["reported", "zero", "blank"],
        "date_min": ds.coverage_start, "date_max": ds.coverage_end,
        "has_units": bool(ds.has_units or ds.has_expectations), "has_expectations": ds.has_expectations, "has_timestamps": ds.has_timestamps,
    }


@router.get("/categories")
def categories(session: Session = Depends(get_session)) -> list[dict]:
    return explorer.categories(session)


# --- Imports -------------------------------------------------------------

@router.post("/imports/preview")
async def import_preview(file: UploadFile = File(...), session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    content = await file.read(config.MAX_UPLOAD_BYTES + 1)
    return imports.preview(session, actor, file.filename or "upload.csv", content)


@router.post("/imports/validate")
def import_validate(body: ImportValidateIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("dataset.import")
    return imports.validate(session, body.token, body.mapping, body.date_format, body.keep_last_duplicate)


@router.post("/imports/commit")
def import_commit(body: ImportCommitIn, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    ds = imports.commit(session, actor, body.token, body.mapping, body.date_format, body.keep_last_duplicate, body.metadata.model_dump())
    session.commit()
    return _dataset_dict(ds)


@router.delete("/imports/{token}")
def import_cancel(token: str, actor: Actor = Depends(get_actor)) -> dict:
    imports.cancel(token)
    return {"cancelled": True}


@router.get("/imports")
def import_history(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    return [{"id": i.id, "dataset_id": i.dataset_id, "filename": i.filename, "at": i.at, "by": users.get(i.by_user_id or ""), "status": i.status,
             "row_count": i.row_count, "errors": i.errors, "warnings": i.warnings}
            for i in session.execute(select(ImportRecord).order_by(ImportRecord.at.desc())).scalars()]


# --- Network & units -----------------------------------------------------

@router.get("/network")
def get_network(dataset_id: str = config.DEMO_DATASET_ID, w_from: int = Query(config.N_WEEKS - 4, ge=0), w_to: int = Query(config.N_WEEKS - 1, ge=0),
                session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("network.view")
    if w_from > w_to:
        raise HTTPException(status_code=422, detail="The start week must be on or before the end week.")
    return network.graph(session, dataset_id, w_from, min(w_to, config.N_WEEKS - 1))


@router.get("/network/units/{unit_id}")
def get_unit(unit_id: str, dataset_id: str = config.DEMO_DATASET_ID, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    if actor.role == "rhu_staff" and unit_id != actor.reporting_unit_id:
        raise HTTPException(status_code=403, detail="RHU staff can view only their own unit.")
    return network.unit_detail(session, dataset_id, unit_id)


@router.get("/units")
def list_units(session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> list[dict]:
    return [{"id": u.id, "name": u.name, "unit_type": u.unit_type, "province": u.province, "municipality": u.municipality,
             "active": u.active, "is_sentinel": u.is_sentinel, "notes": u.notes, "simulated": u.simulated, "updated_at": u.updated_at,
             "geo_x": u.geo_x, "geo_y": u.geo_y}
            for u in session.execute(select(ReportingUnit).order_by(ReportingUnit.province, ReportingUnit.unit_type, ReportingUnit.name)).scalars()]


@router.patch("/units/{unit_id}")
def patch_unit(unit_id: str, body: UnitPatch, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("units.manage")
    u = session.get(ReportingUnit, unit_id)
    if u is None:
        raise HTTPException(status_code=404, detail=f"Reporting unit {unit_id} was not found.")
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None and getattr(u, k) != v}
    if not changes:
        raise HTTPException(status_code=422, detail="No changes to save.")
    before = {k: getattr(u, k) for k in changes}
    for k, v in changes.items():
        setattr(u, k, v.strip() if isinstance(v, str) else v)
    u.updated_at = now()
    audit.record(session, actor, "unit", u.id, "unit.updated", f"{actor.display_name} updated {u.name}: {', '.join(changes)}.", {"before": before, "after": changes})
    session.commit()
    return {"id": u.id, "name": u.name, "active": u.active, "is_sentinel": u.is_sentinel, "notes": u.notes, "updated_at": u.updated_at}


@router.get("/audit")
def audit_log(entity_type: str | None = None, actor_id: str | None = None, search: str | None = None, page: int = Query(1, ge=1),
              page_size: int = Query(30, ge=10, le=200), session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    actor.require("audit.view")
    q = select(AuditEvent)
    if entity_type:
        q = q.where(AuditEvent.entity_type == entity_type)
    if actor_id:
        q = q.where(AuditEvent.actor_user_id == actor_id)
    if search:
        q = q.where(AuditEvent.summary.ilike(f"%{search.strip()}%"))
    rows = session.execute(q.order_by(AuditEvent.at.desc(), AuditEvent.id.desc())).scalars().all()
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    total = len(rows)
    pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, pages)
    return {"rows": [{"id": e.id, "at": e.at, "actor": users.get(e.actor_user_id or "", "System"), "actor_role": e.actor_role, "entity_type": e.entity_type,
                      "entity_id": e.entity_id, "action": e.action, "summary": e.summary} for e in rows[(page - 1) * page_size: page * page_size]],
            "total": total, "page": page, "pages": pages, "page_size": page_size}


@router.get("/datasets/{dataset_id}/lineage")
def dataset_lineage(dataset_id: str, session: Session = Depends(get_session), actor: Actor = Depends(get_actor)) -> dict:
    """Where the dataset came from, what was derived from it, and the runs that touched it."""
    actor.require("data.view")
    return lineage.lineage(session, dataset_id)
