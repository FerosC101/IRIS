## Model A: IRIS pipeline (Model A v2, reporting network, Model B v2, results, dashboard)

Implements the roadmap in `Model A/IRIS_MODEL_REVIEW_AND_ROADMAP.md`. All changes are inside `Model A/`; `backend/`, `frontend/` and `docs/` are untouched.

### What's in it

- **Data contract** (`Model A/pipeline/CONTRACT.md`): one schema for Model A's output, which Model B reads, enforced by `validate()`.
- **Model A v2:** the count model now follows recent levels and has honest uncertainty, a `p_fail` probability, `shortfall`, and correlation-adjusted region pooling. Selected on 2016–2019 and tested once on 2020. v1 is reproduced exactly by the new code.
- **Synthetic reporting network:** facilities → hubs → RESU and facility → lab, over the real 126 locations. Failures are simulated with known truth, plus a with/without-graph ablation.
- **Model B v2:** an integer program that picks actions (call/visit a facility, fix a hub, fix a lab, call a RESU) within a weekly staff budget. Hours and success rates come from `backend/iris/optimization/planner.py`. Compared with facility-first planning in a recovery simulation.
- **Results:** `Model A/pipeline/outputs/results/RESULTS.md`, one table for the proposal.
- **JSON for the IRIS app:** `Model A/pipeline/outputs/contract/{alerts,plan,network,metrics}.json`, with JSON Schemas and a README. A FastAPI route could serve them as they are; nothing has been added to the backend.
- **Streamlit prototype:** `Model A/pipeline/app/streamlit_app.py`, with completeness, priority list with evidence, network, live plan and simulated recovery.

### Key results

| | |
|---|---|
| False alarms, real 2020 normal weeks | v1 12.1% → v2 5.5% (target 1%: not met in the COVID year) |
| Real 2020 swapped reports caught | v1 49%, v2 9%, best simple baseline 4% (v2 trades recall for fewer false alarms) |
| False region alerts, 2020 | 62% → 9% |
| Right hub named in simulated hub outages | 72% with the graph, 0% without |
| Failed reports restored per year, 24 staff-h/week | network-aware 176 vs facility-first 29 (simulation, 20 replicates) |

### How to check

```
cd "Model A/pipeline"
pip install -r requirements.txt
python -m pytest -q                 # 76 tests (needs the cleaned data; see SYNC_TO_IRIS.md)
python -m iris_pipeline all         # rebuilds every output, about 25 min
streamlit run app/streamlit_app.py
```

### Limits

Alerts are leads to verify. The network and its recovery effects are simulated. Action hours and success rates are the planner's assumptions. Model A v2 doesn't hold the 1% alert budget through the 2020 COVID drop.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
