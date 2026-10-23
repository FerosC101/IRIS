"""Dataset lineage: where the data came from and what was derived from it.

Composed from records IRIS already keeps (dataset metadata, imports, audit
events, concerns and assignments). Nothing here is inferred or invented: a
step without supporting records says so.
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from iris.models import AuditEvent, ExperimentRun, ImportRecord, InterventionAction, InterventionAssignment, ReportingConcern, User
from iris.services import datasets
from iris.services.concerns import METHOD_DISPLAY, OPEN_STATUSES

RUN_ACTIONS = ("demo.seeded", "demo.reset", "detection.run", "dataset.imported", "experiment.completed", "experiment.failed")


def lineage(session: Session, dataset_id: str) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    users = {u.id: u.display_name for u in session.execute(select(User)).scalars()}
    imports = session.execute(select(ImportRecord).where(ImportRecord.dataset_id == dataset_id).order_by(ImportRecord.at)).scalars().all()
    concerns = session.execute(select(ReportingConcern).where(ReportingConcern.dataset_id == dataset_id)).scalars().all()
    concern_ids = [c.id for c in concerns]
    assignments = session.execute(select(InterventionAssignment).join(InterventionAction, InterventionAssignment.action_id == InterventionAction.id)
                                  .where(InterventionAction.concern_id.in_(concern_ids))).scalars().all() if concern_ids else []
    sl = datasets.slots(session, dataset_id)
    by = users.get(ds.imported_by or "", "IRIS demo setup" if ds.is_demo else None)

    steps = [
        {"id": "source", "kind": "source", "label": "Source", "detail": ds.source, "designation": ds.designation, "at": ds.imported_at},
        {"id": "ingest", "kind": "ingest", "label": "Generated" if ds.is_demo else "Imported", "at": ds.imported_at, "by": by,
         "detail": f"{ds.row_count:,} records" + (f", coverage {ds.coverage_start.isoformat()} to {ds.coverage_end.isoformat()}" if ds.coverage_start and ds.coverage_end else ""),
         "checksum": ds.checksum, "checksum_basis": ds.checksum_basis},
    ]
    for imp in imports:
        steps.append({"id": f"import:{imp.id}", "kind": "import", "label": f"Import {imp.id}", "at": imp.at, "by": users.get(imp.by_user_id or ""),
                      "detail": f"{imp.filename}: {imp.row_count:,} rows, {imp.status}, {len(imp.warnings)} warning(s)"})
    steps.append({"id": "validate", "kind": "validate", "label": "Validated", "status": ds.validation_status,
                  "detail": {"valid": "No validation problems.", "valid_with_warnings": "Accepted with warnings; see the known limitations.",
                             "invalid": "Validation failed."}.get(ds.validation_status, ds.validation_status)})
    steps.append({"id": "slots", "kind": "derive", "label": "Expected vs received", "available": sl is not None,
                  "detail": f"{len(sl):,} expected submissions from explicit reporting schedules" if sl is not None
                  else "Not calculable: the dataset defines no reporting schedule."})
    methods = Counter(METHOD_DISPLAY.get(c.detection_method, c.detection_method) for c in concerns)
    steps.append({"id": "analysis", "kind": "analysis", "label": "Flags", "available": bool(concerns),
                  "detail": (", ".join(f"{n} from {m}" for m, n in methods.most_common()) if concerns else "No flags have been raised for this dataset."),
                  "count": len(concerns)})
    verif = Counter(c.verification for c in concerns)
    steps.append({"id": "review", "kind": "review", "label": "Human review", "available": bool(concerns),
                  "detail": f"{verif.get('confirmed', 0)} confirmed, {verif.get('dismissed', 0)} dismissed, {verif.get('unverified', 0)} not yet verified",
                  "open": sum(1 for c in concerns if c.status in OPEN_STATUSES)})
    status = Counter(a.status for a in assignments)
    steps.append({"id": "respond", "kind": "respond", "label": "Actions", "available": bool(assignments),
                  "detail": ", ".join(f"{n} {s.replace('_', ' ')}" for s, n in status.most_common()) if assignments else "No actions recorded.",
                  "count": len(assignments)})

    q = select(AuditEvent).where(AuditEvent.action.in_(RUN_ACTIONS)).order_by(AuditEvent.at.desc(), AuditEvent.id.desc())
    runs = []
    for e in session.execute(q).scalars():
        if e.action == "dataset.imported" and e.entity_id != dataset_id:
            continue
        if e.action == "detection.run" and e.entity_id != dataset_id:
            continue
        if e.action.startswith("demo.") and not ds.is_demo:
            continue
        if e.action.startswith("experiment.") and not ds.is_demo:
            continue
        exp = session.get(ExperimentRun, e.entity_id) if e.action.startswith("experiment.") else None
        runs.append({"id": e.id, "at": e.at, "action": e.action, "by": users.get(e.actor_user_id or "", "System"), "summary": e.summary,
                     "elapsed_ms": (e.detail or {}).get("elapsed_ms") if e.action == "detection.run" else (exp.duration_ms if exp else None),
                     "simulated": e.action.startswith(("demo.", "experiment."))})
    return {
        "dataset": {"id": ds.id, "name": ds.name, "designation": ds.designation, "is_demo": ds.is_demo},
        "steps": steps,
        "edges": [[steps[i]["id"], steps[i + 1]["id"]] for i in range(len(steps) - 1)],
        "runs": runs,
        "note": "Composed from dataset metadata, import records and the activity log. Evaluation experiments re-simulate the network; they do not use these records.",
    }
