# Sync this work to the IRIS repo (branch `model_A`)

Everything goes into the `Model A/` folder of the IRIS repo. The team's `backend/`, `frontend/` and `docs/` are not touched.
Run these in PowerShell, one block at a time.

## 1. (Optional) Save the work in PJDS first

```powershell
cd "$HOME\Desktop\PJDS"
git add "MODEL A" pipeline IRIS_MODEL_REVIEW_AND_ROADMAP.md
git status          # check: no MODEL B/, no data/raw, no data/*/clean, no _cache
git commit -m "Add IRIS pipeline: Model A v2, network, Model B v2, results, dashboard"
```

## 2. Go to the IRIS copy and get the latest from GitHub

```powershell
cd "$HOME\Desktop\IRIS"
git switch model_A
git pull origin model_A
```

## 3. Copy the files

```powershell
robocopy "..\PJDS\MODEL A" ".\Model A" /E /XD .git
robocopy "..\PJDS\pipeline" ".\Model A\pipeline" /E /XD _cache __pycache__ .pytest_cache
Copy-Item "..\PJDS\IRIS_MODEL_REVIEW_AND_ROADMAP.md" ".\Model A\"
```

robocopy reports success with exit codes 0–7, so a "1" or "3" at the end is normal.

## 4. Check what will be uploaded

```powershell
git add "Model A"
git status
```

Everything listed should start with `Model A/`. The following must **not** appear, because the `.gitignore` files keep them out:
- `data/raw/`, `data/*/clean/`
- `pipeline/outputs/model_a_v2/_cache/`
- `pipeline/outputs/network/tuned.pkl`

## 5. Save and upload

```powershell
git commit -m "Model A: add IRIS pipeline (Model A v2, network, Model B v2, results, dashboard)"
git push origin model_A
```

## 6. Open the pull request

Go to https://github.com/FerosC101/IRIS/compare/main...model_A and paste `pipeline/PR_DESCRIPTION.md` as the description.

## Two decisions for you

- **Data counts in outputs:** `pipeline/outputs/model_a_v2/scores_v2.csv` and `MODEL A/data/synthetic/network/facility_true_weekly.csv` contain weekly case counts derived from the cleaned data. Your earlier push already included `outputs/model_a/scores.csv`, which contains the same kind of counts. If the data licence should keep counts out of the repo, unstage these two files before committing:
  `git restore --staged "Model A/pipeline/outputs/model_a_v2/scores_v2.csv" "Model A/data/synthetic/network/facility_true_weekly.csv"`
- **PDFs:** `Model A/EventPrimer.pdf` (30 MB) and `Model A/PJDSC26_Nex_Proposal.pdf` are in the branch from the first push. To remove them: `git rm --cached "Model A/EventPrimer.pdf" "Model A/PJDSC26_Nex_Proposal.pdf"` (the files stay on your computer).

## After syncing: running it from the IRIS folder

The pipeline finds its data whether it sits in `PJDS/pipeline` or `IRIS/Model A/pipeline`. The cleaned data is not in git, so a teammate first rebuilds it with `Model A/scripts/clean_*.py` (the data READMEs list the download links), then:

```powershell
cd "Model A\pipeline"
pip install -r requirements.txt
python -m pytest -q
streamlit run app/streamlit_app.py
```
