# QA scripts: stale selectors and routes

Working list for phase (j). Each entry names the script, the line at the time it was noticed, what changed and the fix.
Old routes still work through redirects in `frontend/src/app/App.tsx`, so route entries fail only where a page's own content changed.

## Already failing before the redesign (Phase 3–4 UI text changes)

Verified on 23 Oct 2026 by running the pre-B0 commit's own `e2e-workflow.mjs` against the pre-B0 app: the same 6 of 11 workflows fail.

| Workflow | Failure |
|---|---|
| planner: budget changes selection | sentence text `of 4 hours` not found |
| follow-up: progress … close | `Start` button click times out (depends on the planner step) |
| evaluation: run an experiment | `Number of runs` field not found |
| CSV import: row-level errors | expected error text not visible |
| CSV import: valid file | `setInputFiles` times out |

Status after phase (b) step 1 (isolated run, 15 workflows): 10 pass. "Dismissal requires a reason" now passes; the 5 above it still fail.

## Phase (a) shell

| Script | Line | Change | Fix |
|---|---|---|---|
| `e2e-workflow.mjs` | mobile drawer | Sidebar link `Data` and `<h1>Data</h1>` no longer exist | Done in phase (b): opens `Reports & Analysis`, expects the hero heading |
| `e2e-workflow.mjs` | network step | `getByLabel("Province")` also matched the Region chip ("…All provinces") | Done in phase (b): `exact: true` |
| `e2e-workflow.mjs` | 104 | Plan sheet links are now `/investigations/follow-up?assignment=` | Match `a[href^="/investigations/follow-up?assignment="]` |
| `e2e-workflow.mjs` | 88, 108, 136 | `/planner`, `/follow-up`, `/evaluation` redirect | Use `/investigations/plan`, `/investigations/follow-up`, `/data/evaluation` |
| `check-responsive.mjs` | 11 | `/data` and `/data?tab=trends` were the explorer | Use `/reports` and `/reports?tab=trends`; keep `/data` for Data & Models |
| `check-responsive.mjs` | 13 | RHU `/data` is now role-gated (no h1 on the access notice) | Use `/reports` for RHU staff |
| `check-responsive.mjs` | 12, 14, 15 | `/planner`, `/follow-up`, `/recovery`, `/evaluation`, `/data-management…` redirect | Use the new routes |
| `check-foundation.mjs`, `check-phase3.mjs`, `render-phase4-references.mjs` | — | Loaded `public/brand/*` and `design-reference/` | Done: foundation checks the nav mark and favicons, phase 3 no longer renders the HTML references, and the phase-4 renderer became `compare-heroes.mjs` |
| `check-foundation.mjs`, `check-phase2.mjs`, `check-phase3.mjs`, `check-phase4.mjs` | — | Other assertions still target Phase 1–4 page copy and the sidebar | Review in phase (j); keep only checks that still apply |

## Running QA next to a normal dev server

`qa:e2e` resets the demo database. Run it against an isolated pair:

```bash
IRIS_DB_PATH=/tmp/iris-qa.db uv run uvicorn iris.main:app --port 8011          # backend/
IRIS_API_URL=http://127.0.0.1:8011 IRIS_VITE_CACHE=/tmp/iris-vite npx vite --port 5190   # frontend/
node scripts/e2e-workflow.mjs http://localhost:5190
```
