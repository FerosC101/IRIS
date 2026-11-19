# Model B · zero-report prioritizer

Ranks **explicit zero-case dengue reports** for human verification when investigation time is limited. It reads Model A v2's
scores, adds transparent zero-specific indicators, and returns a ranked list with a priority score, a band, a calibrated
probability, the reasons, data warnings and verification steps. It feeds the Model B v2 planner; it does not replace it.

```
clean dengue table ─► Model A v2 (scores_v2.csv) ─► zero-report prioritizer ─► ranked list ─► planner / dashboard
```

Run from `models/pipeline/`: `python -m iris_pipeline zero-priority` (about 20 s once Model A's fits are cached; part of `all`).
Results: `outputs/zero_priority/report.md`.

## Why this approach

- **No verified failure labels exist.** The only real labels for zero reports are the cleaning plan's swapped cases/deaths rows
  (2016: 196, 2017: 174, 2018–2019: none, 2020: 157 zeros). They mark one source error, so no supervised model is deployed.
  A gradient-boosting model trained on them is reported as an experiment.
- **No testing, timeliness or submission metadata** and no real neighbour data: every output says the cause of a zero cannot be
  determined, and regional context uses region membership only (no graph model).
- **Explicit zeros and missing reports are different.** Only `report_status = reported` with `cases = 0` is ranked. Missing weeks
  are returned as "Missing report (not ranked)" for the planner.

## Score (v2)

Two routes, and the higher one sets the priority: `score = 100 × max(local, regional)`.

- **Local route:** `Σ w_k·c_k / Σ w_k` over the place's own evidence: Model A's `p_low`, expected cases, how unusual zeros
  are for the place, zero streak, recent cases and zero/non-zero switching. Each component is 0–1 with fixed anchors
  (`config.ZERO_PRIORITY`); indicators use past weeks only.
- **Regional route:** how far this week's share of other places in the region at zero is above the region's usual share
  (the median of its previous weeks), as a share of the room left: `(share − usual) / (1 − usual)`, clipped to 0–1.

So a zero ranks high when either a quiet place suddenly reports nothing, or more of its region than usual does at once.
v1 averaged a raw regional share with the local evidence: it lifted genuine zeros when whole regions were quiet (COVID-19,
2020) and halved isolated failures that only Model A could see.

Tuned on 2016–2019 only (`tune.py`): mean average precision of synthetic 2019 (injected zeros vs real normal zeros) and real
2016–2017 (swaps vs normal zeros), with the same pre-registered parsimony rule as v1. **Bands** (High / Medium) are set so
at most 5% / 25% of real 2019 normal zeros reach them; bands that follow recent weeks were tried and rejected on 2016–2019
data (they missed most bad zeros after the first bad week; see the design log). `p_priority` is isotonic on the score, prior-shifted to the real
2016–2018 share of swapped zeros, capped to 1–99%, with a bootstrap interval. The design log in `config.py` records every
change, including that v2 was designed after v1's 2020 results had been read, so v2's 2020 numbers are a second look,
not an independent test. The frozen v1 model is kept as `outputs/zero_priority/model_v1.json` and scored alongside v2.

## Using it

```python
from iris_pipeline.zero_priority.api import load_model, prepare_history, rank_alerts
from iris_pipeline.zero_priority.inputs import load_dengue

d = load_dengue()
hist = prepare_history(pd.read_csv("outputs/model_a_v2/scores_v2.csv"), d.cal, d.locs)  # Model A contract → indicator frame
ranked = rank_alerts(hist, load_model(), d.cal, week_start="2020-12-27")             # or candidates_df=<location_id, week_start>
```

`history` must include the candidate weeks and up to two years before them.

## Output columns (`ranked_alerts_2020.csv`, `rank_alerts()`)

| column | meaning |
|---|---|
| `week_start`, `mw_year`, `mw`, `location_id`, `location`, `region_id`, `region` | the report |
| `report_status`, `cases` | always `reported` / `0` for ranked rows; missing weeks have `priority = Missing report (not ranked)` |
| `expected`, `p_low`, `model_a_flag` | Model A v2 evidence (`model_a_flag` = 1 if `p_low` < Model A's frozen threshold) |
| `priority_score` | 0–100 ranking score (not a probability) |
| `priority` | High / Medium / Low (bands set on real 2019 normal zeros) |
| `rank_in_week` | order to verify within the week (use this when the bands drift, e.g. 2020) |
| `p_priority`, `p_priority_low`, `p_priority_high` | calibrated share of comparable zeros expected to be wrong, with a 90% interval |
| `data_sufficiency` | Adequate history (Model A scored and ≥ 52 past reports) / Limited / Insufficient |
| `top_indicators`, `explanation` | the indicators that drove the rank, in words |
| `data_warnings`, `verification_steps` | what the data can't show, and what to check (separated by ` \| `) |
| `c_<component>` | each component's 0–1 value |
| `model_version` | `zero_priority_v1` |

## Files

| file | role |
|---|---|
| `inputs.py` | Dengue-only loader (clean file or `data/surveillance.csv`), with the cleaning plan's expected counts |
| `evidence.py` | Model A v2 scores on the real data and the evaluation copy (pipeline's cached fits and pooling) |
| `features.py` | Past-only indicators and regional context |
| `score.py` | Components, the model (plain-JSON persistence), explanations, warnings, verification steps |
| `labels.py`, `tune.py` | Evaluation sets (labels joined only after scoring) and 2019 tuning |
| `supervised.py` | Gradient-boosting experiment on real swap labels (forward chaining) |
| `evaluate.py` | AUC, average precision, High-band recall / precision / false alerts, delay, weekly budget, calibration |
| `api.py` | `prepare_history`, `rank_alerts`, `load_model` |
| `figures.py`, `report.py`, `run.py` | Outputs and the pipeline step |
