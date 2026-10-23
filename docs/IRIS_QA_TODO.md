# QA scripts: stale selectors and routes

Working list for phase (j). Each entry names the script, the line at the time it was noticed, what changed and the fix.
Old routes still work through redirects in `frontend/src/app/App.tsx`, so route entries fail only where a page's own content changed.

## Already failing before the redesign (Phase 3–4 UI text changes)

Verified on 23 Oct 2026 by running the pre-B0 commit's own `e2e-workflow.mjs` against the pre-B0 app: the same 6 of 11 workflows fail.

| Workflow | Failure |
|---|---|
| dismissal requires a reason | `More actions` → `Close as not a problem` click times out |
| planner: budget changes selection | sentence text `of 4 hours` not found |
| follow-up: progress … close | `Start` button click times out (depends on the planner step) |
| evaluation: run an experiment | `Number of runs` field not found |
| CSV import: row-level errors | expected error text not visible |
| CSV import: valid file | `setInputFiles` times out |

## Phase (a) shell

| Script | Line | Change | Fix |
|---|---|---|---|
| `e2e-workflow.mjs` | 194–195 | Sidebar link `Data` and `<h1>Data</h1>` no longer exist; the explorer is `/reports` (hero h1 "From report to understanding.") and `/data` is Data & Models | Open the mobile menu, click `Reports & Analysis`, expect the hero heading |
| `e2e-workflow.mjs` | 104 | Plan sheet links are now `/investigations/follow-up?assignment=` | Match `a[href^="/investigations/follow-up?assignment="]` |
| `e2e-workflow.mjs` | 88, 108, 136 | `/planner`, `/follow-up`, `/evaluation` redirect | Use `/investigations/plan`, `/investigations/follow-up`, `/data/evaluation` |
| `check-responsive.mjs` | 11 | `/data` and `/data?tab=trends` were the explorer | Use `/reports` and `/reports?tab=trends`; keep `/data` for Data & Models |
| `check-responsive.mjs` | 13 | RHU `/data` is now role-gated (no h1 on the access notice) | Use `/reports` for RHU staff |
| `check-responsive.mjs` | 12, 14, 15 | `/planner`, `/follow-up`, `/recovery`, `/evaluation`, `/data-management…` redirect | Use the new routes |
| `check-foundation.mjs`, `check-phase3.mjs`, `render-phase4-references.mjs` | — | Validate the retired dark design and load `public/brand/*` | Retire with `public/brand/*` (needs approval) |
