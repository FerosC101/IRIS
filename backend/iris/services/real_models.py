"""Real-data models: Model A v2 flags, the Model B zero-report prioritizer and the Model B v2 weekly plan.

The pipeline in "Model A/pipeline" writes JSON contract files (outputs/contract/*.json), each validated against its
schema before it is written. This service reads them read-only, re-reading a file whenever it changes on disk, and
joins every lead with its latest human review. Model output is a flag, never a finding: closing a lead (confirmed
or not a problem) needs a human reason and the evidence that was checked.
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.models import LeadReview
from iris.services import audit
from iris.services.clock import now

FILES = {"alerts": "alerts", "zero_priority": "zero_priority", "plan": "plan", "metrics": "metrics"}
LEAD_TYPES = {"model_a_alert": "Model A flag", "zero_report": "Zero report (Model B)", "plan_action": "Plan action (Model B v2)"}
REVIEW_STATUS = {"in_review": "In review", "confirmed": "Confirmed reporting problem", "not_a_problem": "Not a problem"}
CLOSING = {"confirmed", "not_a_problem"}
ACTION_LABELS = {"call_location": "Verify the province/city report", "call_resu": "Ask the RESU to check the region's reporting pathway"}
SOURCE = ("HDX / Department of Health (Philippines) Epidemic-prone Disease Case Surveillance: dengue cases by province "
          "and city, weekly, 2016-01-10 to 2021-01-10 (doh-epi-dengue-data-2016-2021.csv), cleaned by the IRIS pipeline.")
# Same wording as iris_pipeline.zero_priority.score.LABELS, which the contract file does not carry.
INDICATOR_LABELS = {
    "unexpected": "Model A finds this zero unlikely",
    "missing_cases": "Cases that may be missing",
    "rare_zero": "Zeros are unusual for this place",
    "streak": "Zeros in a row",
    "recent_activity": "Cases in recent weeks",
    "on_off": "Switching between zero and non-zero",
    "regional": "Other places in the region also zero",
}
MIN_REASON = 10
MIN_EVIDENCE = 5

_cache: dict[str, tuple[float, dict]] = {}


def contract_dir() -> Path:
    return Path(config.MODEL_CONTRACT_DIR)


def load(name: str) -> dict | None:
    path = contract_dir() / f"{FILES[name]}.json"
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    hit = _cache.get(name)
    if hit and hit[0] == mtime:
        return hit[1]
    doc = json.loads(path.read_text(encoding="utf-8"))
    expected = f"iris.{name}/1.0"
    if doc.get("schema") != expected:
        raise HTTPException(status_code=500, detail=f"{path.name} has schema {doc.get('schema')!r}, expected {expected!r}. Re-run the pipeline's contract-json step.")
    _cache[name] = (mtime, doc)
    return doc


def require(name: str) -> dict:
    doc = load(name)
    if doc is None:
        raise HTTPException(status_code=404, detail={
            "code": "model_output_missing",
            "message": f"The {name} output has not been produced yet. Run the pipeline in 'Model A/pipeline' "
                       f"(python -m iris_pipeline all, or the zero-priority and contract-json steps).",
        })
    return doc


def locations() -> pd.DataFrame:
    p = Path(config.MODEL_LOCATIONS_FILE)
    if not p.exists():
        return pd.DataFrame(columns=["location_id", "location", "region_id", "region"])
    return pd.read_csv(p, keep_default_na=False, na_values=[""])[["location_id", "location", "region_id", "region"]]


def _num(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def _latest_reviews(session: Session, lead_type: str) -> dict[str, LeadReview]:
    rows = session.execute(select(LeadReview).where(LeadReview.lead_type == lead_type).order_by(LeadReview.at, LeadReview.id)).scalars()
    out: dict[str, LeadReview] = {}
    for r in rows:
        out[r.lead_id] = r
    return out


def review_dict(r: LeadReview | None) -> dict | None:
    if r is None:
        return None
    return {"status": r.status, "status_label": REVIEW_STATUS[r.status], "note": r.note, "evidence": r.evidence,
            "by": r.reviewer_name, "role": r.reviewer_role, "at": r.at, "model_run_id": r.model_run_id}


def _review_filter(items: list[dict], review: str | None) -> list[dict]:
    if not review:
        return items
    if review == "unreviewed":
        return [i for i in items if i["review"] is None]
    return [i for i in items if i["review"] and i["review"]["status"] == review]


def _page(items: list[dict], page: int, page_size: int) -> dict:
    total = len(items)
    pages = max(1, math.ceil(total / page_size))
    page = max(1, min(page, pages))
    return {"items": items[(page - 1) * page_size: page * page_size], "total": total, "page": page, "page_size": page_size, "pages": pages}


# ---- status -------------------------------------------------------------------------------------------------

def status() -> dict:
    out = {"source": SOURCE, "contract_dir": str(contract_dir()), "review_statuses": REVIEW_STATUS,
           "min_reason": MIN_REASON, "min_evidence": MIN_EVIDENCE, "outputs": {}}
    for name in FILES:
        try:
            doc = load(name)
        except HTTPException as exc:
            out["outputs"][name] = {"available": False, "error": exc.detail}
            continue
        if doc is None:
            out["outputs"][name] = {"available": False}
            continue
        n = doc.get("count") if "count" in doc else len(doc.get("weeks", [])) if "weeks" in doc else None
        out["outputs"][name] = {"available": True, "generated_at": doc.get("generated_at"), "run_id": doc.get("model_run_id", doc.get("run_id")),
                                "model_a_run_id": doc.get("run_id"), "count": n, "disclaimer": doc.get("disclaimer")}
    out["available"] = any(v.get("available") for v in out["outputs"].values())
    return out


# ---- Model B · zero-report prioritizer ---------------------------------------------------------------------

def zero_reports(session: Session, week: str | None, band: str | None, region: str | None, review: str | None,
                 page: int, page_size: int) -> dict:
    doc = require("zero_priority")
    items = doc["items"]
    reviews = _latest_reviews(session, "zero_report")
    weeks = {}
    for i in items:
        w = weeks.setdefault(i["week_start"], {"week_start": i["week_start"], "mw": i.get("mw"), "mw_year": i.get("mw_year"),
                                                "zero_reports": 0, "high": 0, "missing": 0, "reviewed": 0})
        if i["report_status"] == "missing":
            w["missing"] += 1
        else:
            w["zero_reports"] += 1
            w["high"] += i["priority"] == "High"
        w["reviewed"] += i["alert_id"] in reviews
    week_list = sorted(weeks.values(), key=lambda w: w["week_start"])
    week = week or (week_list[-1]["week_start"] if week_list else None)
    sel = [i for i in items if i["week_start"] == week]
    if band:
        sel = [i for i in sel if i["priority"] == band]
    if region:
        sel = [i for i in sel if i.get("region_id") == region]
    sel = [{**i, "review": review_dict(reviews.get(i["alert_id"]))} for i in sel]
    sel = _review_filter(sel, review)
    sel.sort(key=lambda i: (i["rank_in_week"] is None, i["rank_in_week"] or 0))
    regions = sorted({(i["region_id"], i["region_name"]) for i in items if i.get("region_id")}, key=lambda r: r[1] or "")
    return {"week": week, "weeks": week_list, "regions": [{"id": a, "name": b} for a, b in regions],
            "model": doc["model"], "indicator_labels": INDICATOR_LABELS, "review_statuses": REVIEW_STATUS,
            "disclaimer": doc["disclaimer"], "run_id": doc.get("model_run_id"),
            "model_a_run_id": doc["run_id"], "generated_at": doc["generated_at"], **_page(sel, page, page_size)}


# ---- Model A v2 flags ---------------------------------------------------------------------------------------

def alerts(session: Session, disease: str, year: int | None, week: str | None, region: str | None, review: str | None,
           page: int, page_size: int) -> dict:
    doc = require("alerts")
    locs = locations().set_index("location_id")
    reviews = _latest_reviews(session, "model_a_alert")
    items = doc["items"]
    diseases = sorted({i["disease"] for i in items})
    years = sorted({int(i["period_start"][:4]) for i in items if i["disease"] == disease}, reverse=True)
    sel = [i for i in items if i["disease"] == disease]
    if year:
        sel = [i for i in sel if i["period_start"].startswith(str(year))]
    if week:
        sel = [i for i in sel if i["period_start"] == week]
    if region:
        sel = [i for i in sel if i.get("region_id") == region]
    out = []
    for i in sel:
        name = i.get("location_name") or (locs.location.get(i["location_id"]) if i["location_id"] in locs.index else None)
        out.append({**i, "location_name": name or ("Philippines (national)" if i["location_id"] == "PH" else i["location_id"]),
                    "region_name": locs.region.get(i["location_id"]) if i["location_id"] in locs.index else None,
                    "review": review_dict(reviews.get(i["alert_id"]))})
    out = _review_filter(out, review)
    out.sort(key=lambda i: (i["period_start"], i["priority"] or 0), reverse=True)
    regions = locs.reset_index()[["region_id", "region"]].drop_duplicates().sort_values("region")
    return {"diseases": diseases, "disease": disease, "years": years, "threshold": doc["threshold"],
            "regions": [{"id": r.region_id, "name": r.region} for r in regions.itertuples()],
            "disclaimer": doc["disclaimer"], "run_id": doc["run_id"], "generated_at": doc["generated_at"], **_page(out, page, page_size)}


# ---- Model B v2 weekly plan ---------------------------------------------------------------------------------

def plan_lead_id(week: str, action: dict) -> str:
    return f"{week}|{action['action']}|{action['target']}"


def plan(session: Session, week: str | None) -> dict:
    doc = require("plan")
    locs = locations().set_index("location_id")
    regions = locs.reset_index()[["region_id", "region"]].drop_duplicates().set_index("region_id").region
    reviews = _latest_reviews(session, "plan_action")
    weeks = [{"week_start": w["week_start"], "hours_used": w["hours_used"], "expected_cases_recovered": w.get("expected_cases_recovered"),
              "actions": len(w["actions"])} for w in doc["weeks"]]
    week = week or (weeks[-1]["week_start"] if weeks else None)
    w = next((x for x in doc["weeks"] if x["week_start"] == week), None)
    if w is None:
        raise HTTPException(status_code=404, detail=f"No plan for the week of {week}.")
    acts = []
    for a in w["actions"]:
        lid = plan_lead_id(week, a)
        acts.append({**a, "lead_id": lid, "action_label": ACTION_LABELS.get(a["action"], a["action"]),
                     "target_name": regions.get(a["region_id"], a["region_id"]) + " RESU" if a["action"] == "call_resu"
                     else (locs.location.get(a["target"]) if a["target"] in locs.index else a["target"]),
                     "region_name": regions.get(a["region_id"]),
                     "location_names": [locs.location.get(l, l) if l in locs.index else l for l in a["locations"]],
                     "review": review_dict(reviews.get(lid))})
    return {"week": week, "weeks": weeks, "hours_per_week": doc["hours_per_week"], "hours_used": w["hours_used"],
            "expected_cases_recovered": w.get("expected_cases_recovered"), "actions": acts,
            "disclaimer": doc["disclaimer"], "run_id": doc["run_id"], "generated_at": doc["generated_at"]}


# ---- results ------------------------------------------------------------------------------------------------

def metrics() -> dict:
    m = load("metrics")
    z = load("zero_priority")
    if m is None and z is None:
        require("metrics")
    out = {"model_a": None, "model_b_zero": None}
    if m is not None:
        out["model_a"] = {k: m.get(k) for k in ("objectives", "detection_real_swaps_2020", "detection_injected_2020",
                                                "recovery", "model_a_done_when", "thresholds", "run_id", "generated_at", "disclaimer")}
    if z is not None:
        out["model_b_zero"] = {"model": z["model"], "summary": z["summary"], "run_id": z.get("model_run_id"),
                               "generated_at": z["generated_at"], "disclaimer": z["disclaimer"]}
    return out


# ---- reviews ------------------------------------------------------------------------------------------------

def _find_lead(lead_type: str, lead_id: str) -> tuple[dict, str]:
    """The lead as the model produced it, and the run id it came from. 404 if it is not in the current outputs."""
    if lead_type == "zero_report":
        doc = require("zero_priority")
        hit = next((i for i in doc["items"] if i["alert_id"] == lead_id), None)
        run = doc.get("model_run_id") or doc["run_id"]
    elif lead_type == "model_a_alert":
        doc = require("alerts")
        hit = next((i for i in doc["items"] if i["alert_id"] == lead_id), None)
        run = doc["run_id"]
    elif lead_type == "plan_action":
        doc = require("plan")
        hit = None
        for w in doc["weeks"]:
            for a in w["actions"]:
                if plan_lead_id(w["week_start"], a) == lead_id:
                    hit = a
        run = doc["run_id"]
    else:
        raise HTTPException(status_code=422, detail=f"Unknown lead type {lead_type!r}.")
    if hit is None:
        raise HTTPException(status_code=404, detail=f"{LEAD_TYPES[lead_type]} {lead_id!r} is not in the current model outputs.")
    return hit, run


def history(session: Session, lead_type: str, lead_id: str) -> list[dict]:
    rows = session.execute(select(LeadReview).where(LeadReview.lead_type == lead_type, LeadReview.lead_id == lead_id)
                           .order_by(LeadReview.at.desc(), LeadReview.id.desc())).scalars()
    return [review_dict(r) | {"id": r.id} for r in rows]


def add_review(session: Session, actor, lead_type: str, lead_id: str, status: str, note: str, evidence: str) -> dict:
    actor.require("real.review")
    if status not in REVIEW_STATUS:
        raise HTTPException(status_code=422, detail="Status must be in_review, confirmed or not_a_problem.")
    note, evidence = (note or "").strip(), (evidence or "").strip()
    if status in CLOSING:
        if len(note) < MIN_REASON:
            raise HTTPException(status_code=422, detail=f"Give a reason for this decision (at least {MIN_REASON} characters).")
        if len(evidence) < MIN_EVIDENCE:
            raise HTTPException(status_code=422, detail="Say what you checked (for example a call log, register page or link). A model flag is closed only with evidence.")
    _, run = _find_lead(lead_type, lead_id)
    at = now()
    r = LeadReview(lead_type=lead_type, lead_id=lead_id, status=status, note=note, evidence=evidence, model_run_id=run,
                   reviewer_user_id=actor.user_id, reviewer_name=actor.display_name, reviewer_role=actor.role, at=at)
    session.add(r)
    audit.record(session, actor, "real_lead", lead_id[:60], f"real_lead.{status}",
                 f"{actor.display_name} marked {LEAD_TYPES[lead_type].lower()} {lead_id} as '{REVIEW_STATUS[status].lower()}'.",
                 {"lead_type": lead_type, "lead_id": lead_id, "note": note, "evidence": evidence, "model_run_id": run}, at=at)
    session.commit()
    return {"lead_type": lead_type, "lead_id": lead_id, "review": review_dict(r), "history": history(session, lead_type, lead_id)}
