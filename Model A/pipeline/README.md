# IRIS pipeline

One tested pipeline for the roadmap in `../IRIS_MODEL_REVIEW_AND_ROADMAP.md`:

```
clean data -> Model A (detect) -> Model B (decide) -> dashboard
```

Model A v1 stays unchanged in `../MODEL A/notebooks/model_a.ipynb`. This package ports it exactly (checked by a test) and adds Model A v2.

## Run

From this folder, with the packages in `requirements.txt`:

```powershell
python -m iris_pipeline all        # every step (~25 min the first time)
python -m pytest -q                # 76 tests
streamlit run app/streamlit_app.py # dashboard
```

Steps can also be run one at a time: `contract`, `select`, `model-a`, `model-b` (add `--quick` for a 3-replicate smoke run), `results`, `contract-json`. Model A fits are cached in `outputs/model_a_v2/_cache/`; delete it to recompute from scratch.

The clean data files are not in git because their licences aren't confirmed. Rebuild them with `../MODEL A/scripts/clean_*.py` first.

## What it produces

| file | what it is |
|---|---|
| `outputs/results/RESULTS.md` | **Start here:** the proposal's objectives scorecard and the one results table |
| `../MODEL A/notebooks/model_a_v2.ipynb` | Presentation notebook for Model A v2 (calls this package; same numbers as the reports) |
| `../MODEL A/notebooks/model_b_v2.ipynb` | Presentation notebook for the network and Model B v2 |
| `CONTRACT.md` | The data contract: every column of `scores_v2.csv` and `plan_real_2020.csv`, with the rules `validate()` enforces |
| `outputs/contract/*.json` | Alerts, plan, network and metrics for the IRIS app, each with a JSON Schema (`outputs/contract/README.md`) |
| `app/streamlit_app.py` | Dashboard: completeness, priority list with evidence, network, live plan, simulated recovery, results |
| `SYNC_TO_IRIS.md`, `PR_DESCRIPTION.md` | How to copy this into the IRIS repo's `Model A/` folder, and the pull request text |
| `outputs/model_a_v2/scores_v2.csv` | Model A v2 scores, the input Model B reads |
| `outputs/model_a_v2/eval_report.md` | Results in plain words, the roadmap checklist, and the full tables |
| `outputs/model_a_v2/metrics.json` | The same results, machine-readable |
| `outputs/model_a_v2/config.json` | Run manifest: run_id, thresholds, chosen variant, input hashes, versions |
| `outputs/model_a_v2/selection*.{json,csv}` | The variant choice, made on 2016-2019 before 2020 was scored |
| `outputs/model_a_v2/test_runs/` | Every earlier scoring of the 2020 test year, kept for transparency |
| `../MODEL A/data/synthetic/network/` | The synthetic reporting network: nodes, edges, facilities, true weekly counts |
| `outputs/network/` | Graph ablation by seed, simulated failure ground truth, tuned thresholds (`tuned.pkl`) |
| `outputs/model_b/report_b.md` | Steps 3 and 4 in plain words: graph ablation, policy comparison, old Model B on real labels |
| `outputs/model_b/recovery_by_seed.csv` | Recovery simulation, one row per seed x policy x staff budget |
| `outputs/model_b/plan_real_2020.csv` | A weekly action plan for the real 2020 alerts (leads to verify) |

## Layout

| module | role |
|---|---|
| `config.py` | Every setting, the split, the v2 candidates and the selection rule |
| `contract.py` | Schemas, `validate()` and the answer-key wall |
| `data.py` | Loads and checks the clean files |
| `model_a/countmodel.py` | Negative-binomial count model: v1 port plus the v2 options |
| `model_a/run.py` | Parallel per-series scoring, with a cache |
| `model_a/pooling.py` | Fisher (v1) and correlation-adjusted Stouffer (v2) |
| `model_a/calibrate.py` | Thresholds and `p_fail` |
| `model_a/select.py` | Phase 1: choose the variant on 2016-2019 |
| `model_a/v2.py` | Phase 2: freeze on 2019, test on 2020 |
| `network/build.py` | Synthetic network over the real 126 locations |
| `network/simulate.py` | Isolated, hub and lab failures; repairs; common random numbers |
| `network/scorer.py` | Model A v2 per facility, scored online |
| `network/sources.py` | Shared-source tests (summed-count NB, correlated Stouffer) and attribution |
| `network/ablation.py` | Tuning on simulated replicates and the with/without-graph comparison |
| `model_b/actions.py` | Action catalogue (IRIS planner numbers) and expected values |
| `model_b/optimizer.py` | The integer program (HiGHS via scipy) |
| `model_b/policies.py` | Network-aware, facility-first, old-B fixed, random, oracle, none |
| `model_b/recovery.py` | Weekly recovery simulation and its metrics |
| `model_b/old_b.py` | Today's Model B rule, published and fixed, on real labels |
| `model_b/real_plan.py` | Weekly plan for the real 2020 alerts |
| `evaluation/` | Shared metrics, split, reports and the combined results table |
| `contract_json.py` | JSON files and schemas for the IRIS app |
| `app/streamlit_app.py` | The dashboard (tested headless in `tests/test_app.py`) |
