"""JSON files for the IRIS app (React + FastAPI): alerts, plan, network, metrics.

Each file is an envelope {schema, generated_at, run_id, disclaimer, ...} validated against a JSON Schema
(draft 2020-12) in outputs/contract/schemas/ before it is written. Missing values are null, never NaN.
The IRIS backend can serve these files as they are; nothing in the team's code needs to change.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone

import pandas as pd
from jsonschema import Draft202012Validator

from .config import PLAN
from .data import read
from .model_a.v2 import read_scores
from .paths import MODEL_A_V2_DIR, OUT_DIR, SYN_DIR

CONTRACT_DIR = OUT_DIR / "contract"
SCHEMA_DIR = CONTRACT_DIR / "schemas"
DISCLAIMER = ("Alerts and plan items are leads for surveillance staff to verify, not confirmed errors. "
              "The reporting network is simulated. No real-world recovery effect is claimed.")

NUM = {"type": ["number", "null"]}
PROB = {"type": ["number", "null"], "minimum": 0, "maximum": 1}
STR = {"type": "string"}
DATE = {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"}


def _envelope(name: str, body: dict, required: list[str]) -> dict:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema", "title": f"IRIS {name}", "type": "object",
        "required": ["schema", "generated_at", "run_id", "disclaimer", *required],
        "properties": {"schema": {"const": f"iris.{name}/1.0"}, "generated_at": STR, "run_id": STR,
                       "disclaimer": STR, **body},
    }


ALERT = {
    "type": "object",
    "required": ["alert_id", "disease", "location_id", "period_start", "resolution", "cases", "expected", "p_low",
                 "p_fail", "shortfall", "priority", "status", "model_version"],
    "properties": {
        "alert_id": STR, "disease": STR, "location_id": STR, "location_name": {"type": ["string", "null"]},
        "region_id": {"type": ["string", "null"]}, "hub_id": {"type": ["string", "null"]},
        "period_start": DATE, "resolution": {"enum": ["week", "month"]},
        "cases": {"type": ["integer", "null"], "minimum": 0}, "expected": NUM, "pi_low": NUM, "pi_high": NUM,
        "p_low": PROB, "p_fail": PROB, "shortfall": {"type": ["number", "null"], "minimum": 0}, "hub_p": PROB,
        "priority": {"type": "number", "minimum": 0}, "status": {"const": "lead_to_verify"}, "model_version": STR,
    },
    "additionalProperties": False,
}
PLAN_ACTION = {
    "type": "object",
    "required": ["action", "target", "region_id", "hours", "expected_cases_recovered", "locations", "status"],
    "properties": {
        "action": {"enum": ["call_location", "call_resu"]}, "target": STR, "region_id": STR,
        "hours": {"type": "number", "exclusiveMinimum": 0}, "expected_cases_recovered": {"type": "number", "minimum": 0},
        "locations": {"type": "array", "items": STR, "minItems": 1}, "missing_reports": {"type": "integer", "minimum": 0},
        "reported_cases": {"type": "integer"},
        "expected_cases": {"type": "number"}, "shortfall": {"type": "number"}, "p_fail_max": PROB, "hub_p": PROB,
        "P_region": PROB, "status": {"const": "lead_to_verify"},
    },
    "additionalProperties": False,
}
SCHEMAS = {
    "alerts": _envelope("alerts", {"threshold": {"type": "object"}, "count": {"type": "integer"},
                                   "items": {"type": "array", "items": ALERT}}, ["threshold", "count", "items"]),
    "plan": _envelope("plan", {"hours_per_week": {"type": "number"}, "cost_php_per_week": {"type": "number"},
                               "weeks": {"type": "array", "items": {
                                   "type": "object", "required": ["week_start", "hours_used", "actions"],
                                   "properties": {"week_start": DATE, "hours_used": {"type": "number"},
                                                  "expected_cases_recovered": {"type": "number"},
                                                  "actions": {"type": "array", "items": PLAN_ACTION}}}}},
                      ["hours_per_week", "weeks"]),
    "network": _envelope("network", {
        "simulated": {"const": True},
        "nodes": {"type": "array", "items": {"type": "object", "required": ["id", "type", "region_id"],
                                             "properties": {"id": STR, "type": {"enum": ["facility", "hub", "lab", "resu"]},
                                                            "region_id": STR, "location_id": {"type": ["string", "null"]},
                                                            "name": STR, "n_facilities": {"type": "integer"}}}},
        "edges": {"type": "array", "items": {"type": "object", "required": ["source", "target", "relationship"],
                                             "properties": {"source": STR, "target": STR, "relationship": STR}}}},
        ["simulated", "nodes", "edges"]),
    "metrics": _envelope("metrics", {"objectives": {"type": "array"}, "detection_real_swaps_2020": {"type": "array"},
                                     "shared_source_identification": {"type": "array"}, "recovery": {"type": "array"}},
                         ["objectives", "detection_real_swaps_2020", "shared_source_identification", "recovery"]),
}


def _clean(v):
    """JSON-safe value: NaN -> null, numpy -> python."""
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def validate_doc(name: str, doc: dict) -> None:
    errors = sorted(Draft202012Validator(SCHEMAS[name]).iter_errors(doc), key=lambda e: list(e.path))
    if errors:
        msg = "\n".join(f"- {'/'.join(map(str, e.path))}: {e.message}" for e in errors[:10])
        raise ValueError(f"{name}.json breaks its schema ({len(errors)} errors):\n{msg}")


def build() -> dict:
    CONTRACT_DIR.mkdir(parents=True, exist_ok=True)
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((MODEL_A_V2_DIR / "config.json").read_text(encoding="utf-8"))
    run_id, now = cfg["run_id"], datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    head = lambda name: {"schema": f"iris.{name}/1.0", "generated_at": now, "run_id": run_id, "disclaimer": DISCLAIMER}  # noqa: E731

    s = read_scores(MODEL_A_V2_DIR / "scores_v2.csv")
    names = read("shared/locations.csv", []).set_index("location_id").location
    a = s[s.flag == 1].copy()
    a["priority"] = (a.p_fail.fillna(0) * a.shortfall.fillna(0)).round(4)
    a = a.sort_values(["period_start", "priority"], ascending=[True, False])
    items = [{
        "alert_id": f"{r.disease}|{r.location_id}|{r.period_start}|{r.model_version.split(':')[-1]}",
        "disease": r.disease, "location_id": r.location_id, "location_name": names.get(r.location_id),
        "region_id": r.region_id, "hub_id": r.hub_id, "period_start": r.period_start, "resolution": r.resolution,
        "cases": None if pd.isna(r.cases) else int(r.cases), "expected": r.expected, "pi_low": r.pi_low,
        "pi_high": r.pi_high, "p_low": r.p_low, "p_fail": r.p_fail, "shortfall": r.shortfall, "hub_p": r.hub_p,
        "priority": r.priority, "status": "lead_to_verify", "model_version": r.model_version,
    } for r in a.itertuples(index=False)]
    docs = {"alerts": {**head("alerts"), "threshold": {"rule": "p_low < tau", "tau": cfg["TAU_model_a_v2"],
                                                        "alert_budget": cfg["alert_budget"]},
                       "count": len(items), "items": items}}

    plan = pd.read_csv(OUT_DIR / "model_b" / "plan_real_2020.csv", keep_default_na=False, na_values=[""])
    weekly = pd.read_csv(OUT_DIR / "model_b" / "plan_real_2020_weekly.csv")
    weeks = []
    for w in weekly.itertuples(index=False):
        acts = plan[plan.week_start == w.week_start]
        weeks.append({"week_start": w.week_start, "hours_used": w.hours_used,
                      "expected_cases_recovered": w.expected_cases_recovered,
                      "actions": [{"action": r.action, "target": r.target, "region_id": r.region_id, "hours": r.hours,
                                   "expected_cases_recovered": r.expected_cases_recovered,
                                   "locations": r.locations.split(";"), "missing_reports": int(r.missing_reports),
                                   "reported_cases": int(r.reported_cases),
                                   "expected_cases": r.expected_cases, "shortfall": r.shortfall,
                                   "p_fail_max": r.p_fail_max, "hub_p": r.hub_p, "P_region": r.P_region,
                                   "status": "lead_to_verify"} for r in acts.itertuples(index=False)]})
    docs["plan"] = {**head("plan"), "hours_per_week": PLAN["STAFF_HOURS_PER_WEEK"],
                    "cost_php_per_week": PLAN["COST_PHP_PER_WEEK"], "weeks": weeks}

    nodes = pd.read_csv(SYN_DIR / "network" / "nodes.csv", keep_default_na=False, na_values=[""])
    edges = pd.read_csv(SYN_DIR / "network" / "edges.csv")
    docs["network"] = {**head("network"), "simulated": True,
                       "nodes": [{"id": r.node_id, "type": r.node_type, "region_id": r.region_id,
                                  "location_id": None if pd.isna(r.location_id) else r.location_id, "name": r.name,
                                  "n_facilities": int(r.n_facilities)} for r in nodes.itertuples(index=False)],
                       "edges": edges.to_dict("records")}

    res = json.loads((OUT_DIR / "results" / "results.json").read_text(encoding="utf-8"))
    docs["metrics"] = {**head("metrics"), **{k: res[k] for k in ("objectives", "detection_real_swaps_2020",
                                                                 "detection_injected_2020", "shared_source_identification",
                                                                 "recovery", "model_a_done_when", "thresholds")}}
    for name, doc in docs.items():
        doc = _clean(doc)
        validate_doc(name, doc)
        (CONTRACT_DIR / f"{name}.json").write_text(json.dumps(doc, indent=1, allow_nan=False), encoding="utf-8")
        (SCHEMA_DIR / f"{name}.schema.json").write_text(json.dumps(SCHEMAS[name], indent=2), encoding="utf-8")
        docs[name] = doc
    (CONTRACT_DIR / "README.md").write_text(README, encoding="utf-8")
    return docs


README = """# IRIS JSON contract

Files for the IRIS app (React + FastAPI), produced by `python -m iris_pipeline contract-json`. Each file is
validated against `schemas/<name>.schema.json` (JSON Schema 2020-12) before it is written. Missing values are `null`.

Every file starts with the same envelope:

| field | meaning |
|---|---|
| `schema` | `iris.<name>/1.0`; the version changes if a field changes meaning |
| `generated_at` | UTC time the file was written |
| `run_id` | Model A v2 run the numbers come from (`outputs/model_a_v2/config.json`) |
| `disclaimer` | Show this to users: alerts are leads to verify; the network is simulated |

## `alerts.json`

Every location-week (or national week/month) that Model A v2 flagged (`p_low < tau`), oldest first, highest priority first within a period.

| field | meaning |
|---|---|
| `alert_id` | `disease|location_id|period_start|fit level`, unique |
| `cases`, `expected`, `pi_low`, `pi_high` | reported count, expected count and its 90% range (past weeks only) |
| `p_low` | chance of a count this low if reporting were normal (small = suspicious) |
| `p_fail` | calibrated chance this is a real reporting failure |
| `shortfall` | cases likely missing |
| `hub_p` | region-level (RESU) evidence of a shared failure that week |
| `priority` | `p_fail x shortfall`: expected missing cases; sort by this |

## `plan.json`

Model B v2's weekly plan for the real 2020 alerts, within `hours_per_week` staff hours. `call_location` = verify a
province/city's report; `call_resu` = ask the RESU to check the region's reporting pathway.
`expected_cases_recovered` = success probability x probability the cause is there x cases likely missing.

## `network.json`

The simulated reporting network (`simulated: true`): facilities, provincial reporting hubs, labs and RESUs, with
`reports_through`, `specimen_referral`, `forwards_reports_to` and `reports_results_to` edges. Fictional names.

## `metrics.json`

The proposal's results: objectives scorecard, detection metrics on real 2020 errors, shared-source identification with
and without the graph, and recovery efficiency per planning policy. Same numbers as `outputs/results/RESULTS.md`.

## Serving from FastAPI (example, not added to the team's code)

```python
from pathlib import Path
import json
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/model")
CONTRACT = Path("Model A/pipeline/outputs/contract")

@router.get("/{name}")
def get(name: str):
    if name not in {"alerts", "plan", "network", "metrics"}:
        raise HTTPException(404)
    return json.loads((CONTRACT / f"{name}.json").read_text(encoding="utf-8"))
```
"""
