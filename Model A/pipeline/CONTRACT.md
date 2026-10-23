# IRIS data contract

Generated from `iris_pipeline/contract.py`; `validate()` enforces every rule below.

## `scores_v2.csv`

Primary key: disease, location_id, period_start, model_version.

| column | type | required | meaning |
|---|---|---|---|
| `disease` | str | yes | Disease code, e.g. dengue, measles, tb. |
| `location_id` | str | yes | Location ID from shared/locations.csv; PH for national series. |
| `region_id` | str | no | Region ID from shared/locations.csv; empty for national series. |
| `hub_id` | str | no | Reporting hub the location reports through. Real data has no hub table, so this is the region's RESU (hub_id = 'RESU-' + region_id); empty for national series. |
| `period_start` | date | yes | First day of the week (Sunday, DOH morbidity week) or month. |
| `resolution` | str | yes | week or month. |
| `cases` | int | no | Reported count; empty when the period was not reported. |
| `report_status` | str | yes | reported, missing (expected but not received) or not_in_source. |
| `expected` | float | no | Model's expected count from past periods only; empty when the series has too little history. |
| `pi_low` | float | no | Lower end of the 90% prediction range. |
| `pi_high` | float | no | Upper end of the 90% prediction range. |
| `p_low` | prob | no | Mid-p probability of a count this low or lower if reporting were normal. Small = suspicious. |
| `p_fail` | prob | no | Calibrated probability that the report is a real reporting failure (isotonic on 2019, prior-corrected to the 2016-2018 real failure rate). Calibrated on dengue province-weeks. |
| `flag` | flag | no | 1 if p_low < tau (frozen threshold, see config.json), 0 if not, empty if unscored. |
| `shortfall` | float | no | Cases likely missing: max(expected - cases, 0); expected when the period is missing. |
| `pooled_region_p` | prob | no | Fisher-pooled p over the region's locations that week (v1 method, assumes independence). |
| `hub_p` | prob | no | Correlation-adjusted Stouffer p over the hub's locations that week (v2 shared-source evidence). |
| `pooled_disease_p` | prob | no | Fisher-pooled p over the 18 EDCS diseases that week (national series only). |
| `model_version` | str | yes | model_a_v2:<fit level>, e.g. model_a_v2:nb_full. |
| `run_id` | str | yes | Identifies the run; matches config.json run_id. |

## `plan_real_2020.csv`

Primary key: week_start, action, target.

| column | type | required | meaning |
|---|---|---|---|
| `week_start` | date | yes | Week the plan is for (the week whose reports triggered it). |
| `action` | str | yes | call_location (verify a province/city's report) or call_resu (check the region's reporting pathway). |
| `target` | str | yes | location_id or RESU-<region_id>. |
| `region_id` | str | yes | Region of the target. |
| `hours` | float | yes | Staff hours the action takes (IRIS planner assumptions). |
| `expected_cases_recovered` | float | yes | success probability x P(cause is here) x cases likely missing. |
| `locations` | str | yes | Locations the action covers, ';'-separated. |
| `missing_reports` | int | yes | Covered locations whose report was due but never arrived (a certain reporting gap). |
| `reported_cases` | int | yes | Cases reported that week by the covered locations. |
| `expected_cases` | float | yes | Model A v2 expected cases for the covered locations. |
| `shortfall` | float | yes | Cases likely missing for the covered locations. |
| `p_fail_max` | prob | no | Highest p_fail among the covered locations. |
| `hub_p` | prob | no | The region's correlation-adjusted Stouffer p that week. |
| `P_region` | prob | yes | Probability that the region-week holds a real reporting failure (isotonic on 2016-2018 labels). |
| `status` | str | yes | Always 'lead to verify': a plan item is not a confirmed failure. |
| `run_id` | str | yes | The Model A v2 run the plan was built from. |

## Rules checked by `validate()`

- Exactly these columns; required columns never empty; types and ranges as listed.
- `cases` is set if and only if `report_status = reported`.
- `flag` is set if and only if `p_low` is set.
- `pi_low <= pi_high`; `shortfall >= 0`; one `run_id` per file; no duplicate primary keys.

## Inputs both models may read

- `MODEL A/data/shared/locations.csv`: location and region IDs (126 locations, 17 regions).
- `MODEL A/data/shared/calendar_weeks.csv`: the week grid. A week that was due but not received stays a row with `report_status = missing`; it is never dropped or shifted.
- The clean disease files under `MODEL A/data/*/clean/`. Never the raw files.

## Shared split

Train 2016-2018 (history only), tune 2019 (every threshold and model choice), test 2020 (scored once).
