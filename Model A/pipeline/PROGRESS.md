# IRIS roadmap progress

Plan: 3 sessions, implementing `IRIS_MODEL_REVIEW_AND_ROADMAP.md`. Plan file: `~/.claude/plans/pasted-content-id-548e-step-1-glimmering-pebble.md`.

## Session 1: done (2026-10-23)

**Step 1 contract and step 2 Model A v2.**

- **Contract:** `CONTRACT.md` and `iris_pipeline/contract.py`. `scores_v2.csv` adds `region_id`, `hub_id` (= `RESU-<region>`; real data has no hub table), `p_fail`, `shortfall`, `hub_p` and `run_id`. `validate()` enforces every rule and is tested against 11 kinds of breach.
- **Shared split and evaluation:** train 2016-2018, tune 2019, test 2020 (`evaluation/`). Metrics come with cluster-bootstrap CIs.
- **v1 port reproduces the published `scores.csv`** to within its 6-digit rounding (`tests/test_v1_reproduces.py`).
- **Variant chosen on 2016-2019 only** (pre-registered rule): `recent1+uncertainty`, meaning a recent-level term at lag 1 plus parameter and year-to-year uncertainty.
- **2020 was scored twice.** Run 1 had a bug in the threshold cap, and run 2 fixed it. Both runs are disclosed in the report and kept in `outputs/model_a_v2/test_runs/`.
- **Tests:** 28 pass. They cover no-leakage (the future can't change the past), the contract, the v1 reproduction, calibration and pooling.

### Key numbers (2020 test, frozen thresholds)

| | v1 | v2 | best baseline |
|---|---|---|---|
| False-alert rate, normal weeks (target ≤ 2%) | 12.1% | 5.5% | 0.4% |
| Recall on real swaps | 49% | 9% | 4% |
| Recall on injected failures | 35% | 20% | 12% |
| AUC on injected failures | 0.77 | 0.85 | 0.89 (EWMA) |
| 90% range coverage, 2017-2019 / 2020 | 0.75 / 0.56 | 0.86 / 0.79 | n/a |
| False region alerts 2020 | 62% (v1 report) / 18% (own threshold) | 9% (Stouffer) | n/a |

**Roadmap targets met: 1 of 4** (coverage in the selection years). v2 is a trade-off, not a strict improvement: it cuts false alarms but catches far fewer real 2020 swaps. Neither version holds the 1% budget through the April-June 2020 COVID drop.

### Open points (not fixable now without tuning on the test year)

- The recent-level term adapts slowly to an abrupt drop. Its coefficient is learned on years without a shock, and it refits every 4 weeks. Faster adaptation or an adaptive alert budget needs a fresh holdout year to validate, and 2021 has only 126 rows.
- `p_fail` over-predicts in the 0.25-0.5 bin in 2020, because the distribution shifted. It ranks well, but its absolute values in a shock period are too high.

## Session 2: done (2026-10-23)

**Step 3 graph and step 4 Model B v2.** Report: `outputs/model_b/report_b.md`.

- **Synthetic network** (`network/build.py`, written to `MODEL A/data/synthetic/network/`): 506 facilities, 70 hubs, 36 labs and 17 RESUs over the real 126 locations. Facility counts are a multinomial split of each location's real cleaned counts.
- **Simulator** (`network/simulate.py`): isolated, hub and lab failures with geometric durations and repairs. Action outcomes use common random numbers.
- **Facility-level Model A v2** (`network/scorer.py`): the same model and options, fitted once per simulated year and scored online.
- **Shared-source tests** (`network/sources.py`): a summed-count NB test with a correlation term (primary) and correlated Stouffer. Attribution goes to the most significant declared source.
- **Model B v2** (`model_b/`): candidate actions with expected values, an exact integer program (HiGHS via scipy), and 6 policies. The action numbers come from the IRIS backend planner.
- **Real data:** today's Model B rule (published and fixed) graded on real labels, and `plan_real_2020.csv`, which is validated against `CONTRACT.md`.
- **Tests:** 69 pass (41 new). The integer program equals brute force (25 instances) and the IRIS knapsack (10 instances). The simulator is deterministic, events don't overlap, repairs work and the luck is shared across policies.

### Design log (reported in report_b.md)

- **Base year.** Tuning and testing in different years let the change of year dominate false alarms: 5.9% (2019 → 2020) and 7.4% (2018 → 2019), against a 1% budget. So tuning and test replicates share base year 2018, and 2019 and 2020 are stress tests.
- **Summed-count test.** It got a correlation term after the first trial over-alarmed.
- **Optimizer bug, caught by a test.** It could pick zero-value actions on ties. Fixed with a negligible per-hour cost, and the full run was redone.

### Key numbers (20 test replicates, 95% intervals)

| | result |
|---|---|
| Right hub named in hub failures | 72% with graph (NB sum) vs 0% without |
| Right lab named in lab failures | 35% with graph vs 0% without |
| Failing facility-weeks flagged | 40% with graph vs 14% facility-only (false alerts 2.1% vs 0.4%) |
| Recovered submissions per year, 24 h/week | network-aware 176 (132–221) vs facility-first 29 (24–34); oracle 333 |
| Recovered per staff-hour | 0.14 vs 0.02 |
| Shared source acted on first | 84% vs 0% |
| Weeks to recover, shared failures | 2.7 vs 4.7 |
| Stress years 2019 / 2020 | false alarms well above budget (year shift); ranking of methods unchanged |

**Real labels (2020 swaps).** Today's Model B rule is a coin flip among zeros (AUC 0.52). But 157 of the 158 swaps are zeros, and at the 1% budget it catches 28% at 4.7% false alerts, against Model A v2's 9% at 5.5%. Model A v2 ranks zeros best (AUC 0.66) and is the only method that sees partial reports.

### Open points

- **Model A v3 candidate:** give a zero report more weight once the model has followed a low level. It must be chosen on pre-2020 data.
- **Refitting during the year:** the facility models are fitted once per simulated year. Refitting every 4 weeks would help in shock years, but each policy and seed would then need its own refits.
- **Detection is the main gap to the oracle** (176 vs 333 recovered): isolated facility failures are found only about 20–25% of the time.

## Session 3: done (2026-10-23)

**Step 5: evaluate and present.**

- **Results:** `outputs/results/RESULTS.md` and `results.json` (`python -m iris_pipeline results`). It has the objectives scorecard and one table: (A) detection on real 2020 swaps, covering Model A v1/v2, the baselines and old Model B published/fixed, each with 95% CIs; (A2) injected failures; (B) shared-source identification with and without the graph; (C) recovery efficiency per policy. Everything is read from saved outputs, nothing is recomputed.
- **JSON contract for the IRIS app:** `outputs/contract/{alerts,plan,network,metrics}.json`. Each is validated against its JSON Schema (`schemas/`) before writing, and `README.md` shows a FastAPI example.
- **Dashboard:** `app/streamlit_app.py` with 5 pages plus Results. The plan page re-solves the integer program live from a staff-hours slider, and every page shows the limits banner. Tested headless with streamlit AppTest (`tests/test_app.py`); the server health check passed.
- **Sync:** `SYNC_TO_IRIS.md` (PowerShell commands for the user to run) and `PR_DESCRIPTION.md`. `paths.py` finds the data in either layout (PJDS or `IRIS/Model A/pipeline`).
- **Also:** old Model B now has F1, detection delay and bootstrap CIs. `real_plan` was refactored into per-week functions, with identical output (479 actions).
- **Tests:** 76 pass.

### Objectives scorecard (from RESULTS.md)

| objective | status |
|---|---|
| 1. Detect reporting anomalies | Partly met (v2: 9% of real 2020 swaps at 5.5% false alerts; the COVID year breaks the 1% budget) |
| 1. Shared network disruptions | Met in simulation (72% of hubs named); partly on real data (region false alerts 62% → 9%) |
| 1. Temporal graph | Met (synthetic network) |
| 1. Multiple diseases | Met (Model A) |
| 2. Actions under limited resources | Met in simulation (176 vs 29 restored per year) |
| 3. Evaluation | Met |
| Dashboard | Met (Streamlit prototype) |

## Notebooks: done (2026-10-23)

- `MODEL A/notebooks/model_a_v2.ipynb` (9 sections) and `MODEL A/notebooks/model_b_v2.ipynb` (7 sections). They call the tested package and read the saved outputs; small live demos run in about 1 minute. Saved with outputs.
- The originals are unchanged: `model_a.ipynb` (the v1 baseline) and `MODEL B/IRIS_Model_B.ipynb` (the other team's old rule, graded in section 1 of `model_b_v2`).
- Checking the notebook text against live outputs found a real gap: **missing reports got no priority in the real plan** (no `p_low`, so no `p_fail`). Fixed: a report that never arrived is a certain gap (p = 1, shortfall = expected), and 3 or more missing in one region raise P_region to the share missing. `plan_real_2020` gained `missing_reports`. In the week of 15 Nov 2020 (a real regional gap) the plan now checks the NCR, R12 and Caraga RESUs, covering 34 silent locations. A test was added, and outputs were regenerated.
