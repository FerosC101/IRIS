# IRIS JSON contract

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

## `zero_priority.json`

Model B · zero-report prioritizer (written when `python -m iris_pipeline zero-priority` has been run): every 2020 zero-case
dengue report, ranked within its week, plus missing weeks returned as `Missing report (not ranked)`. Its own `disclaimer`
replaces the shared one.

| field | meaning |
|---|---|
| `priority_score`, `rank_in_week` | 0-100 ranking score and the order to verify within the week |
| `priority` | High / Medium / Low (bands set on real 2019 normal zeros), or `Missing report (not ranked)` |
| `p_priority`, `p_priority_low`, `p_priority_high` | calibrated share of comparable zeros expected to be wrong, 90% interval |
| `top_indicators`, `explanation` | why the report was ranked where it is |
| `data_warnings`, `verification_steps` | what the data can't show, and what to check |
| `components` | each indicator's 0-1 value |
| `model`, `summary` | weights and bands; results on real and synthetic sets, reported separately |

## Serving from FastAPI (example, not added to the team's code)

```python
from pathlib import Path
import json
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/model")
CONTRACT = Path("models/pipeline/outputs/contract")

@router.get("/{name}")
def get(name: str):
    if name not in {"alerts", "plan", "network", "metrics"}:
        raise HTTPException(404)
    return json.loads((CONTRACT / f"{name}.json").read_text(encoding="utf-8"))
```
