# IRIS frontend - Phase 4

Implemented on `feat/iris-frontend-design`, 17 October 2026.

## 1. Implementation summary

Refined the existing Intervention Planner, Recovery Assessment and Evaluation Lab
using the Phase 1-3 IRIS components. No backend algorithms, schemas, APIs, identity
logic or authorization rules changed. No reset, commit, push or Phase 5 work was
performed. Existing uncommitted Phase 3 changes were present at the start and
preserved. The baseline test run before Phase 4 application edits passed 21 tests.

Inspected the project status and Phase 1-3 reports; routing/navigation/tokens;
shared UI, display and layout foundations; planner, plan sheet and follow-up;
recovery and evaluation; API client/types; FastAPI intervention/analytics schemas,
services, optimization and evaluation code. Follow-up is located under
`features/interventions/FollowUpPage.tsx`; there is no separate `features/follow-up`
folder. Supplied references 10-12 were rendered with their existing assets and
visually inspected before changing the page implementations.

## 2. Screens implemented

| Screen | Route | Main changes |
|---|---|---|
| Intervention Planner | `/planner` | Dark photographic planning summary, staff-hour controls, explicit optimization, translucent metric cards, recommended action list, priority-first comparison, saved-plan lifecycle |
| Recovery Assessment | `/recovery` | Dataset/scope/period summary, real reporting metrics, prominent observation chart, missing-data states, before/during/after evidence and follow-up links |
| Evaluation Lab | `/evaluation` | Stored experiments, explicit reproducible configuration, synthetic-result hero, per-method metrics with denominators, accessible precision/recall chart and full result tables |

Subphase checks: planner TypeScript and isolated budget/workflow checks passed
before recovery work; recovery TypeScript and chart/null checks passed before
evaluation work. Final source checks include all three screens.

## 3. Files created and modified

Created:
- `frontend/src/lib/decision-support.ts`: budget bounds, exact budget preservation,
  resource-limit checking, experiment input validation and null-safe metric change text.
- `frontend/src/test/decision-support.test.ts`: five scientific/input-contract tests.
- `frontend/scripts/check-phase4.mjs`: disposable-backend browser verification.
- `frontend/scripts/render-phase4-references.mjs`: supplied HTML reference captures.
- `docs/IRIS_FRONTEND_PHASE4.md`: this completion report.

Modified for Phase 4:
- `frontend/src/features/interventions/PlannerPage.tsx`
- `frontend/src/features/interventions/PlanSheet.tsx`
- `frontend/src/features/recovery/RecoveryPage.tsx`
- `frontend/src/features/evaluation/EvaluationPage.tsx`
- `frontend/src/styles/workspaces.css` (scoped Phase 4 composition extensions)

Earlier phase changes remain in Git status and are not additional Phase 4 work.
No package, backend or database file was modified by this implementation.

## 4. Shared components reused or extended

Reused Panel variants/motifs, MetricCard, PageHeader, Button, Badge and semantic
badges, Field/Input/Select/Textarea/Checkbox, Radix dialog/sheet, DataTable,
FilterBar, TrendChart, ProportionBar, SimpleTable and shared loading/error/empty
states. Existing Recharts supplies the new comparison chart. Poppins, palette,
sidebar, route permissions and demo identity remain unchanged.

The photographic heroes are dark Panel compositions using supplied
`photo_reporting.webp`, `photo_review.webp` and `healthcare_analysts.webp` with
varied gradient direction/placement. Phase 4 metric cards override only their
background opacity, retaining shared tokens and dark teal text. A reduced
transparency fallback is provided. Bar animation is disabled, consistent with
existing chart behavior and reduced-motion support. No new dependencies or
parallel design system were introduced.

## 5. API integration mapping

| Behavior | Existing API |
|---|---|
| Candidate pool/default assumptions | GET `/api/actions` |
| Saved plans and detail | GET `/api/plans`, `/api/plans/{id}` |
| Explicit optimization and baseline | POST `/api/plans/compare` |
| Save draft | POST `/api/plans` |
| Approval/rejection and assignments | POST `/api/plans/{id}/decision` |
| Follow-up lifecycle | Existing GET/PATCH `/api/assignments/{id}` and POST `/api/assignments/{id}/outcomes` |
| Recovery and evidence windows | GET `/api/recovery` with existing dataset/province/unit/type/category/week parameters |
| Experiment history/result | GET `/api/experiments`, `/api/experiments/{id}` |
| Explicit evaluation | POST `/api/experiments` with name, replications and base_seed |

TanStack Query remains responsible for reads, caching and invalidation. Planner
comparison now uses an explicit mutation instead of the previous debounced
POST query. Saving uses the compared budget and assumption snapshot. Completed
experiments populate their detail cache immediately and refresh stored history.

## 6. Planner functionality preserved

Candidates retain backend ordering and dependencies. Inclusion checkboxes describe
the user-defined candidate pool, while the recommendation is the backend-selected
subset. Existing concern focus, advanced assumptions, action rationale, cost,
assumed success, benefit estimates, saved-plan comparison and decision notes remain.

Unknown dependency names retain their actual action identifiers rather than being
assumed completed. Budget display retains the returned numeric precision.

Budget is staff time, not money: 0-2,000 staff-hours, including fractional values.
Blank, nonfinite and out-of-range inputs are rejected without clamping. Changing
inputs marks previous results stale and disables saving until an explicit rerun.
Pending comparison disables the budget/run controls. Failed/missing comparison
responses never become a successful recommendation. No comparison POST occurs on
page load. Over-budget backend recommendations are flagged and cannot be saved
from the optimized-plan control. Save still relies on backend dependency, candidate
status and total-cost validation. The baseline remains highest-priority-first.

Draft saving, plan inspection, two saved-plan comparison, approval/rejection,
automatic backend assignment creation and follow-up navigation are preserved.
Decision-note rejection validation remains; fields respect API text limits.
Pending save/decision sheets resist dismissal, and plan changes clear prior notes.
Existing follow-up completion and outcome recording code was not rewritten.

Benefits are assumed report-weeks over a planning horizon. They are not guaranteed
recoveries or public-health improvements. Candidate eligibility includes open
concerns, not only confirmed reporting issues. The UI states that verification may
still be needed. The frontend does not impose a fictional verified-only policy.

## 7. Recovery functionality preserved

Dataset, province, type, unit, category and week filters remain functional. Data
classification is read from the response rather than always called simulated.
Metrics use received/expected counts, timeliness, not-received submissions and
available concern totals. Null indicators remain unavailable. An all-null series
has an explicit empty state, separate from a numeric zero observation. Old query
placeholder data is hidden while a new filter context loads.

TrendChart retains percentage axes, legends, tooltips, data-table alternatives
and missing-value gaps. Concern flow, resolution medians, confidence intervals and
completed-action windows remain available. Actual investigation links were added
to the evidence rows; follow-up links continue to expose plans and assignments.
Outcome labels show supplied provenance. The backend causality note is displayed.

Scientific scope details are stated: monthly submissions are not constrained by
week filters; concern totals span all concern periods in the returned selection;
concern flow covers the backend timeline; before/during/after windows may extend
outside chart week/category filters. Observation does not establish causation.
No disease-count change is presented as reporting reliability by itself.

## 8. Evaluation functionality preserved

Methods remain `threshold`, `ewma`, `network` with returned labels. Each run compares
all three on identical simulated inputs. Configurable inputs remain replication
count (integer 3-60), base seed (integer 0-10,000,000), and optional name (200 chars).
Empty, fractional and out-of-range configuration fields disable execution.

Runs are explicit; inputs and experiment switching lock while pending. Server
failures and failed stored experiments are shown, without synthetic success.
Stored experiment history, configuration, scenario mix, detection parameters,
unit-week denominators, event detection and delay, scenario/severity breakdowns,
false-alarm contexts and shared-source attribution measures remain.

Metric cards describe the selected method, not an invented winning method.
Precision/recall/false-alarm denominators are displayed. Zero remains zero;
null/undefined precision, recall, F1 and rates remain unavailable. Null network
deltas are not described as unchanged. A new grouped bar comparison has a full
numerical table immediately below it. The existing threshold-versus-network
comparison is retained without inventing a separate edge-removal experiment.
Synthetic evaluation is explicitly distinguished from real operational validation.

## 9. Differences from visual references

Kept the references' dark photographic emphasis, light metric hierarchy, dense
analytical surfaces, pale/bright teal series and resource/evidence motifs. Used
actual existing workflows instead of copying illustrative IDs, numbers or labels.
The planner baseline is priority-first, not facility-first. Eligibility is based
on the backend candidate rules. Recovery shows reporting observations, not the
reference's optimized/baseline/no-action trajectories. Evaluation retains all
supported methods instead of adding graph ablation, chronological splits or model
versions. No fake export or persistent-history controls were added; experiment
history is genuinely supported by the current API.

## 10. Unsupported backend features

No monetary budgeting, new optimizer, external intervention execution, guaranteed
health benefit, verified-only candidate contract, counterfactual recovery curves,
time-to-recovery prediction, train/test split, trained model pipeline, configurable
ablations or custom detector hyperparameters was implemented. Complete export
packages are not exposed. Those require separate backend/product scope decisions.

## 11. Tests executed and results

- Before Phase 4 edits: `npm test`, 21 tests passed across four files.
- Final `npm test`: 26 tests passed across five files.
- `npm run typecheck`: passed during each subphase and final verification.
- `npm run build`: passed; existing >500 kB bundle warning remains.
- `git diff --check`: passed.
- Full isolated browser suite: 40 verification groups passed (18 required viewport
  renders, nine earlier-route checks, a recovery rerender and 12 behavior groups).
- Final focused workflow suite: 17 verification groups passed, including
  same-seed reproducibility and mobile controls/dialog keyboard checks.

New unit tests cover exact fractional/zero budgets, invalid-budget rejection,
backend cost exceeding the actual budget, reproducible integer configuration
bounds, and null versus zero metric-change semantics.

Browser tests use a new temporary SQLite database and separately spawned FastAPI
server. Every browser API request is proxied there; `/api/demo/reset` is blocked.
No mutation workflow or reset-dependent E2E script was run against the active
project database. Existing GET `/actions` synchronizes/persists candidates inside
the backend even though it is a read-shaped endpoint; this existing service
side effect is unchanged, and all browser testing of it was isolated.

Failure/null/missing-result test cases intercept selected responses in the test
browser only; application screens and screenshots otherwise use real backend
responses. A synthetic failed-response fixture is not represented as a real
experiment result. No production application fixture or mock value was introduced.

Not executed: backend regression suite (backend unchanged), exhaustive permission
matrix, all saved-plan comparison combinations, every advanced-assumption edit,
real assistive-technology audit, physical touch devices or production deployment.
Known backend defects are documented, not claimed fixed by passing frontend tests.

## 12. Browser and responsive checks

Full suite covers all three routes at 1600, 1440, 1024, 768, 375 and 320 pixels.
Checks assert no document-level horizontal overflow, console/runtime errors or
HTTP errors during rendering, plus loaded Poppins weights and images. Earlier
Overview, dataset registry/detail/import, network, anomalies, queue/detail and
follow-up routes are also rendered at 1440px.

Isolated workflow checks cover explicit fractional-budget comparison, zero budget,
stale-result saving prevention, pending/error/missing planner results, draft save,
rejection reason and decision, approval/assignment creation, assignment completion,
observed outcome recording, recovery data tables and unavailable series, evaluation
input bounds, explicit execution/pending state, undefined/zero metrics, failed
stored/results requests and representative provincial/admin/RHU restrictions.
Repeated evaluation with the same seed and replication count returned identical
per-method metrics. At 320px, configuration inputs remained usable and the plan
sheet stayed within the viewport, trapped keyboard focus and closed with Escape.

## 13. Screenshot paths

React application captures:
`frontend/qa-screenshots/phase4/isolated/` (ignored by existing Git rules).

Exact 1600 x 1000 captures:
- [Intervention Planner](../frontend/qa-screenshots/phase4/isolated/planner-1600x1000.png)
- [Recovery Assessment](../frontend/qa-screenshots/phase4/isolated/recovery-1600x1000.png)
- [Evaluation Lab](../frontend/qa-screenshots/phase4/isolated/evaluation-1600x1000.png)

Full-page captures: `{planner,recovery,evaluation}-{width}.png`.
Result captures: `planner-result-1600.png`, `evaluation-result-1600.png`.
Representative mobile captures include each screen at 375px and 320px. Additional
focused captures include `evaluation-form-320.png` and `plan-sheet-320.png`. Supplied reference renders are under
`frontend/qa-screenshots/phase4/references/` and are separate from React captures.

Run commands from `frontend/`:
`node scripts/render-phase4-references.mjs`
`node scripts/check-phase4.mjs --isolated`
`node scripts/check-phase4.mjs --isolated --workflows-only`
The frontend must be running at localhost:5180 (or IRIS_FRONTEND_URL).
Node/browser commands need approved execution outside this environment's Node
filesystem sandbox restriction. Disposable DB files may remain under OS temp;
the spawned backend is terminated when the suite ends.

## 14. Outstanding limitations

Backend half-hour optimization can exceed a fractional budget; the UI flags and
blocks the recommendation rather than rounding the user's budget. Backend save
validation remains authoritative. Action costs are rounded to half hours, and
action-duration assumptions are converted to integer days by existing services.
The backend F1 calculation can return null when precision or recall is zero;
this frontend preserves that null and does not silently recompute a different
score. Those backend defects remain dependencies for separately authorized work.

Object-level access enforcement, broad open-concern intervention eligibility,
read-endpoint candidate synchronization, recovery actor scoping and fixed demo
dates remain existing limitations. UI role gates do not repair backend security.
Recovery's before/after windows use backend-defined scope semantics rather than
pretending every filter applies uniformly. A new action completed after the
fixed dataset snapshot may have no observable post-action weeks; this is shown
as unavailable, not as evidence of no benefit.

## 15. Recommended Phase 5 scope

Only with separate authorization: refine follow-up/operational outcome management
and audit/reproducibility navigation; extend permission/assistive-technology
coverage. Backend-first priorities include precise budget feasibility, F1 zero
semantics, object authorization, verified-only eligibility policy decisions,
consistent recovery scope contracts, and reliable schedule/relationship ingestion.
Address bundle size separately. No Phase 5 implementation was started.
