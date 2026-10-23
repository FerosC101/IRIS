# IRIS: Model A and Model B review and roadmap

**Team Nex · PJDSC 2026 · 23 Oct 2026**

Compares Model A (`MODEL A/notebooks/model_a.ipynb`) and Model B (`MODEL B/IRIS_Model_B.ipynb`) with the proposal's objectives (`PJDSC26_Nex_Proposal.pdf`), then sets out what to improve and in what order.

## 1. What the proposal promises

| # | Objective | What "done" looks like |
|---|---|---|
| 1 | **Detect** reporting anomalies **and shared network disruptions**, across **multiple diseases**, with a temporal graph | Flags single bad reports, and also notices when a whole hub or region fails together |
| 2 | **Optimize interventions**: recommend corrective actions **under limited resources** | "With 5 staff this week, fix these hubs first", compared with fixing facilities one by one |
| 3 | **Evaluate**: precision, recall, F1, false-alarm rate, detection delay, simulated recovery, against baselines, in time order, with graph ablation | One honest evaluation across both parts |

There's also a dashboard prototype (Streamlit or React).

## 2. What each model actually is

| | Model A | Model B |
|---|---|---|
| Question it answers | "Is this week's count suspiciously low?" | "Which zero reports should we look at first?" |
| Method | Count model per place (trend, season, holidays), past weeks only, plus pooling across a region and across diseases | Rule: 70% × rank of the 26-week average + 30% × rank of the zero streak, ranked within each date, giving a 0–100 score |
| Data | Cleaned files (fixed names and regions, missing weeks kept as missing) | **Raw** HDX file (misspelled names, wrong region label, missing weeks skipped silently) |
| Diseases | Dengue, measles, TB | Dengue only |
| What it can catch | Zeros **and** partial reports | **Zeros only** |
| Tested on | Real labels (581 swaps, region gaps) and simulated failures, tuned on 2019 and tested on 2020 | Simulated 3-week zero gaps only |

## 3. Are the goals met?

| Objective | Model A | Model B | Overall |
|---|---|---|---|
| 1. Detect anomalies | ✅ Works: catches 49% of the real swaps in 2020 (simple baselines: 4%) | ⚠️ Zeros only, and no better than chance on real errors (section 4) | **Partly met** |
| 1. Shared disruptions | ⚠️ Region pooling works in 2017, fails in 2020 (62% false region alerts) | ❌ None | **Partly met** |
| 1. Temporal graph | ❌ Regions act as hubs, but no facility network is built | ❌ None | **Not met** |
| 1. Multi-disease | ✅ Dengue, measles, TB | ❌ Dengue only | Met by A |
| 2. Resource-limited intervention plan | ❌ Not its job | ❌ Ranks alerts, but has no resources, costs, recovery or plan | **Not met** |
| 3. Evaluation | ✅ Most metrics, baselines, time order. ❌ No recovery simulation, no graph ablation | ⚠️ Precision and recall @100 on its own simulation only; no false-alarm rate, no real labels | **Partly met** |
| Dashboard | ❌ | ❌ | **Not started** |

**In short:** detection (objective 1) is roughly half done, and almost all of it comes from Model A. Intervention optimization (objective 2), which is what makes IRIS different from a plain anomaly detector, **hasn't been built yet**.

## 4. Are the two models on the same page? No.

1. **Overlapping roles.** Both are detectors. Model B ranks zero reports, which is a weaker version of Model A's job. The plan was for B to act on A's alerts, not to re-detect from raw data.
2. **Different data.** B reads the raw file, so it scores places like "NUEVA VISCAYA" and "BASILIG CITY" under their misspellings and wrong regions. It also treats a missing week as if it were the next week.
3. **Different definition of "failure".** A flags any count that is too low; B only looks at exact zeros. That means B can never see the 54 swapped rows with 1–3 cases, or any partial report.
4. **Different outputs, no handoff.** A writes `scores.csv` with probabilities; B writes its own CSV with a 0–100 rank. Neither reads the other's output.
5. **Different evaluation.** A is graded on real errors with a fixed false-alarm budget. B is graded only on gaps it injected itself, and its weights (0.7/0.3) were picked on that same simulation.

### Model B checked on the real errors

Model B's exact scoring was re-run. The numbers match its notebook's 3,064 alerts and its High/Medium/Low counts exactly. Its scores were then compared with the 527 swapped zero rows found during cleaning:

| Check | Model B result |
|---|---|
| Ranking AUC (real swap zeros vs. normal zeros) | **0.50, a coin flip** (Model A: 0.84) |
| Real swaps among "High" alerts | 11.8%, **lower** than among all alerts (17%) |
| Real swaps in its top 100 | **2** |
| Batanes alerts | 171, of which **0** are real errors (Batanes simply has many real zero weeks) |

**Why:** B ranks zeros **against other zeros on the same date**. On a swap date, every swapped zero competes with the others, so a whole region going to zero can't stand out. And a place like Batanes, the lone zero on a quiet week, scores 100.

Two claims in B's own report also overstate:
- **"Flagged 100% of injected gaps"** only means the injected zeros were listed. They scored 37–40, which is **Low** priority.
- **"No data leakage"** was checked only on the first row of each place.

## 5. Target design: one pipeline, two clear roles

```
clean data -> Model A (detect: how suspicious, how many cases missing, which hub)
           -> Model B (decide: which hubs or facilities to fix first, under a staff budget)
           -> dashboard (evidence -> verification -> action plan -> recovery)
```

## 6. Roadmap

### Step 1: Agree on one contract (about 1 day, both teams)
- Both models read only the **clean files**: `locations.csv` for IDs and regions, and the calendar grid for weeks.
- Model A's `scores.csv` becomes **Model B's input**, adding two columns: `shortfall = expected − cases` (cases likely missing) and `hub_id`.
- One shared evaluation module and one shared split: train 2016–2018, tune 2019, test 2020. Same labels, same metrics.

### Step 2: Fix Model A's two known weaknesses (2–3 days)
1. **Follow recent levels.** Add a recent-level term, such as the log of the last 4 reported weeks (an "endemic–epidemic" model), or the `covid_period` flag. Choose it on 2016–2019 only.
   - *Done when:* the 2020 false-alarm rate is close to 1%, and recall on swaps stays well above the baselines.
2. **Honest uncertainty.** Widen the 90% range to account for parameter uncertainty and year-to-year epidemic size.
   - *Done when:* 85–95% of normal weeks fall inside the "90%" range.
3. Tune the threshold on 2019 **with** injected failures, so the alert budget is balanced against detection.

### Step 3: Build the graph the proposal promises (3–4 days)
- Build a **synthetic reporting network**: facilities → labs → reporting hubs → RESU. Simulate isolated failures, **shared-hub failures** and recoveries with known outcomes. Keep it in `data/synthetic/`, never mixed with real data.
- **Shared-source detection:** Fisher pooling over regions is a start. Next, replace it with a hub-level model that tolerates correlation, such as Stouffer with an estimated correlation, or a hierarchical model. A graph neural network is optional, if there's time.
- **Graph ablation** (required by the proposal): compare with the graph against without it. Measure how often the **shared source** is correctly identified, and how much detection improves.

### Step 4: Rebuild Model B as the intervention optimizer (3–4 days)
1. **Priority** = (chance the report is a real failure, from A) × (impact: cases likely missing, or population) × (shared-source bonus: how many facilities sit behind the hub).
2. **Optimizer:** a simple knapsack or integer program. Choose actions (visit a facility, fix a hub, call a RESU) to maximize expected **recovered submissions**, within staff hours and costs.
3. **Compare** network-aware planning with facility-first planning (the proposal's baseline), using the recovery simulation from step 3.
   - *Metrics:* recovery time, recovered submissions per resource unit, and how often the shared source is fixed first.
4. Keep today's Model B as a **baseline**, after fixing it: clean data, calendar weeks, absolute rather than within-date scores, and the false-alarm rate reported on real labels.

### Step 5: Evaluate and present (2–3 days)
- **One results table for the proposal:** precision, recall, F1, false alarms and detection delay for detection; shared-source accuracy with and without the graph; recovery efficiency for the network-aware plan against facility-first.
- **Streamlit dashboard:**
  - reporting completeness;
  - a priority list showing the evidence behind each alert (expected vs. reported, region heat strip);
  - the network view;
  - the intervention plan;
  - simulated recovery.
- Disclose limits throughout: alerts are **leads to verify**, the network is synthetic, and no real recovery effect is claimed.

## 7. Priority if time is short

1. **Must:** step 1 (contract), step 4 (Model B as the optimizer, on A's output), and the recovery simulation. Without these, objective 2 isn't met at all.
2. **Should:** step 2 (fix A's 2020 false alarms) and graph ablation.
3. **Could:** a graph neural network, the full dashboard polish.

## 8. Sources

- Proposal: `PJDSC26_Nex_Proposal.pdf` (objectives, methodology, Appendix B evaluation)
- Model A results: `MODEL A/outputs/model_a/eval_report.md`, `MODEL A/notebooks/MODEL_A_SUMMARY.md`
- Model B: `MODEL B/IRIS_Model_B.ipynb`
- Real labels: `MODEL A/data/dengue/clean/dengue_province_weekly.csv` (`qa_flag`)
