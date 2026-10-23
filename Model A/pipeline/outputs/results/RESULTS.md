# IRIS results

Team Nex · PJDSC 2026 · generated 2026-10-23 13:58 UTC by `python -m iris_pipeline results` from the saved outputs (Model A run `20261023T075030Z-73b3e833`).

## In plain words

- **IRIS has two jobs.** Model A spots weekly reports that look wrong. Model B decides what to fix first when staff time is limited.
- **Spotting (real data, 2020).** Model A v2 cut false alarms from 12% to 5.5% of normal weeks and region-wide false alarms from 62% to 9%, but it catches fewer real errors (49% → 9%). The COVID-19 drop in 2020 is the hardest case: no version holds the 1% alarm budget through it.
- **Shared failures (simulation).** Using the reporting network, IRIS names the broken hub in 72% of hub outages; without it, never.
- **Fixing (simulation).** With the same 24 staff-hours a week, network-aware planning restores about 6x more failed reports than fixing facilities one by one (176 vs 29 a year).
- **Every alert is a lead to verify**, the network is synthetic, and no real-world recovery effect is claimed.

## Proposal objectives

| objective (proposal) | status | evidence |
|---|---|---|
| 1. Detect reporting anomalies | Partly met | Real 2020 swaps: Model A v2 catches 9% at 5.5% false alerts; v1 49% at 12.1%; best simple baseline 4%. Neither version holds the 1% budget in the COVID year. |
| 1. Detect shared network disruptions | Met in simulation; partly on real data | Simulation: right hub named in 72% of hub outages (0% without the graph). Real 2020: false region alerts 62% (v1) → 9% (v2). |
| 1. Temporal graph | Met (synthetic network) | Facility → hub → RESU and facility → lab graph of 506 facilities over the real 126 locations; graph ablation done. The real reporting pathways are not available. |
| 1. Multiple diseases | Met (Model A) | Dengue (province-weekly), 18 EDCS diseases incl. measles and rubella (national weekly), TB (monthly). Measles and TB have few labels. |
| 2. Recommend actions under limited resources | Met in simulation | Model B v2 integer program: 176 vs 29 failed facility-weeks restored per year (facility-first), same 24 h/week; shared source handled first in 84% of shared failures. Real 2020 plan produced. |
| 3. Evaluate (precision, recall, F1, false alarms, delay, recovery, baselines, time order, ablation) | Met | All in the table below; train 2016–2018 / tune 2019 / test 2020; 20 simulation replicates with 95% intervals. |
| Dashboard prototype | Met (Streamlit prototype) | pipeline/app/streamlit_app.py: completeness, priority list with evidence, network, plan, recovery. |

## The results table

### A. Detection on real data: the 158 swapped dengue reports of 2020

Test year 2020, scored once; thresholds frozen on 2019 at a 1% alert budget. 95% intervals: cluster bootstrap over places. Old Model B rules can only flag zero reports.

| method | precision | recall (95% CI) | F1 | false-alert rate (95% CI) | weeks to detect | AUC |
|---|---|---|---|---|---|---|
| Model A v2 | 0.039 | 0.089 (0.010–0.175) | 0.054 | 0.055 (0.036–0.077) | 0.000 | 0.790 |
| Model A v1 | 0.092 | 0.494 (0.377–0.618) | 0.156 | 0.121 (0.097–0.149) | 0.000 | 0.842 |
| Rolling median | 0.167 | 0.032 (0.000–0.070) | 0.053 | 0.004 (0.002–0.006) | 0.000 | 0.700 |
| EWMA | 0.156 | 0.044 (0.014–0.075) | 0.069 | 0.006 (0.004–0.008) | 0.000 | 0.800 |
| CUSUM | 0.008 | 0.013 (0.000–0.044) | 0.010 | 0.038 (0.021–0.060) | 4.000 | 0.381 |
| Old Model B, as published (within-date ranks) | 0.132 | 0.285 (0.160–0.437) | 0.180 | 0.047 (0.037–0.059) | 0.308 | 0.905 |
| Old Model B, fixed (absolute) | 0.079 | 0.329 (0.197–0.466) | 0.128 | 0.095 (0.079–0.111) | 0.000 | 0.881 |

### A2. Detection on simulated failures injected into real 2020 data (407 location-weeks)

| method | precision | recall (95% CI) | F1 | false-alert rate (95% CI) | weeks to detect | AUC |
|---|---|---|---|---|---|---|
| Model A v2 | 0.308 | 0.199 (0.139–0.251) | 0.242 | 0.031 (0.018–0.048) | 0.036 | 0.852 |
| Model A v1 | 0.221 | 0.349 (0.277–0.422) | 0.271 | 0.084 (0.066–0.108) | 0.000 | 0.769 |
| Rolling median | 0.595 | 0.054 (0.030–0.078) | 0.099 | 0.003 (0.001–0.004) | 0.000 | 0.859 |
| EWMA | 0.761 | 0.125 (0.094–0.159) | 0.215 | 0.003 (0.001–0.004) | 0.000 | 0.892 |
| CUSUM | 0.066 | 0.042 (0.018–0.070) | 0.051 | 0.040 (0.018–0.066) | 0.067 | 0.609 |

### B. Shared-source identification, with and without the graph (simulation, 20 replicates)

| method | right hub named | right lab named | failing facility-weeks flagged | false alerts (normal facility-weeks) | false source alerts |
|---|---|---|---|---|---|
| facility only (no graph) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 14% (12%–16%) | 0.4% (0.3%–0.4%) | n/a |
| region pooling (no graph) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 24% (19%–28%) | 2.9% (2.7%–3.1%) | 1.3% (1.1%–1.5%) |
| graph: hub + lab, Stouffer | 55% (48%–62%) | 40% (28%–52%) | 36% (30%–43%) | 2.8% (2.6%–3.0%) | 1.0% (1.0%–1.1%) |
| graph: hub + lab, NB sum | 72% (64%–80%) | 35% (23%–47%) | 40% (33%–46%) | 2.1% (2.0%–2.3%) | 1.0% (0.9%–1.1%) |

### C. Recovery efficiency (simulation, 20 replicates, 24 staff-hours/week)

| policy | recovered submissions / year | per staff-hour | weeks to recover, shared failures | shared source acted on first | staff hours used / year |
|---|---|---|---|---|---|
| Network-aware (Model B v2) | 176.10 (131.62–220.58) | 0.14 (0.11–0.18) | 2.71 (2.34–3.07) | 84% (78%–90%) | 1227 |
| Facility-first (proposal baseline) | 29.15 (24.02–34.28) | 0.02 (0.02–0.03) | 4.68 (4.24–5.12) | 0.0% (0.0%–0.0%) | 1248 |
| Old Model B rule, fixed | 35.50 (28.53–42.47) | 0.03 (0.02–0.03) | 4.68 (4.24–5.12) | 0.0% (0.0%–0.0%) | 1248 |
| Random | 10.50 (7.90–13.10) | 0.01 (0.01–0.01) | 4.68 (4.24–5.12) | 0.0% (0.0%–0.0%) | 1248 |
| Oracle (knows the truth) | 333.00 (289.89–376.11) | 0.72 (0.63–0.81) | 1.60 (1.39–1.81) | 100% (100%–100%) | 462 |

## Model A v2 against the roadmap's targets

1 of 4 met:

| target (roadmap step 2) | Model A v1 | Model A v2 | met |
|---|---|---|---|
| 2020 false-alert rate close to 1% (≤ 2%) | 0.121 | 0.055 | no |
| 2020 recall on real swaps well above the baselines (best baseline 0.044) | 0.494 | 0.089 (CI 0.010–0.175) | no |
| 85–95% of normal weeks inside the 90% range, 2017–2019 (selection years) | 0.750 | 0.859 | yes |
| 85–95% of normal weeks inside the 90% range, 2020 (test year) | 0.556 | 0.793 | no |

## Where each number comes from

| block | file | produced by |
|---|---|---|
| A, A2, targets | `outputs/model_a_v2/metrics.json`, `eval_report.md` | `python -m iris_pipeline model-a` |
| A (old Model B rows) | `outputs/model_b/old_model_b_real_eval.csv` | `python -m iris_pipeline model-b` |
| B, C | `outputs/model_b/metrics_b.json`, `report_b.md` | `python -m iris_pipeline model-b` |
| Machine-readable copies for the IRIS app | `outputs/contract/*.json` | `python -m iris_pipeline contract-json` |

## Limits

- Real labels are the errors found during cleaning (581 swapped rows, 3 regional gaps); other errors are unknown and count as normal weeks.
- 2020 contains the COVID-19 drop, a shift larger than anything in 2016–2019; thresholds tuned on 2019 do not hold there.
- The reporting network, its failures and recovery effects are simulated; action hours and success rates are the IRIS planner's assumptions.
- Measles and TB results rest on very few labelled events.
- Alerts are leads for surveillance staff to verify, not confirmed errors.
