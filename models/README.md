# IRIS models

Everything behind the two models lives in this folder: the data cleaning, the research notebooks, and the tested pipeline that produces the files the IRIS app reads on its *Real dengue data* page.

```
clean data  →  Model A (detect)  →  Model B (decide)  →  JSON contract  →  IRIS app
```

| Model | Question it answers | How |
|---|---|---|
| **Model A** · detect | Is this week's count suspiciously low? | A negative-binomial count model per place (trend, season, holidays), using past weeks only, pooled across a region and across diseases. v2 cuts false alarms and is chosen on 2016–2019 before 2020 is scored. |
| **Model B** · decide | What should staff check or fix first? | Two parts. The **zero-report prioritizer** ranks zero-case dengue reports by how likely they hide a reporting problem. The **planner** picks corrective actions for a weekly staff-hour budget with an integer program, handling shared failures (a hub or lab) before single facilities. |

Results in plain words, with the proposal's objectives scorecard: [`pipeline/outputs/results/RESULTS.md`](pipeline/outputs/results/RESULTS.md). Every alert is a lead to verify, not a confirmed error. The reporting network used by the planner is synthetic.

## Folder layout

| Path | What it holds |
|---|---|
| [`pipeline/`](pipeline/README.md) | The `iris_pipeline` package: Model A v1 port and v2, the synthetic network, Model B (planner and zero-report prioritizer), evaluation, the JSON contract for the app, a Streamlit prototype, and tests |
| `pipeline/outputs/` | Saved model outputs; `outputs/contract/*.json` is what the IRIS backend serves |
| `notebooks/` | Research notebooks: Model A v1 (`model_a.ipynb`), and presentation notebooks for Model A v2 and Model B v2 |
| `scripts/` | Data cleaning: `clean_dengue.py`, `clean_measles.py`, `clean_tb.py`, `build_surveillance.py` |
| `data/` | Cleaning plans and data dictionaries per disease, shared location and calendar tables, the synthetic network |
| `outputs/model_a/` | Model A v1 outputs and figures, kept as the reference the v2 port is checked against |
| `plan/` | The data-cleaning plan and its final report |
| [`IRIS_MODEL_REVIEW_AND_ROADMAP.md`](IRIS_MODEL_REVIEW_AND_ROADMAP.md) | How the models compare with the proposal, and what was improved |

## Run it

The raw and cleaned disease files are not in git (their licences are not confirmed). Download the raw files from the links in each `data/<disease>/README.md` into `data/raw/<disease>/`, then rebuild the clean files with the scripts.

```bash
cd models
python scripts/clean_dengue.py           # also clean_measles.py, clean_tb.py
cd pipeline
pip install -r requirements.txt
python -m iris_pipeline all              # every step (~25 min the first time; Model A fits are cached)
python -m pytest -q                      # tests that need the cleaned data skip without it
```

The IRIS backend reads `pipeline/outputs/contract/*.json` and `data/shared/locations.csv` read-only, and re-reads them when they change. Override the locations with `IRIS_MODEL_CONTRACT_DIR` and `IRIS_MODEL_LOCATIONS_FILE`.

## Data

- **Real:** HDX / Department of Health (Philippines) Epidemic-prone Disease Case Surveillance (dengue by province and city, weekly, 2016–2021; national weekly EDCS counts) and WHO TB notifications. See each `data/<disease>/README.md` for sources, cleaning decisions and checks.
- **Synthetic:** the reporting network over the real 126 locations, and the injected failures used to evaluate detection and recovery. Synthetic files sit under `data/synthetic/` and are never mixed with real data.
