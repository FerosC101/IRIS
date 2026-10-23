# IRIS frontend - Phase 3

Implemented 17 October 2026 on `feat/iris-frontend-design`.

## 1. Overview

Phase 3 refines the reporting network, adds a dedicated supported analysis view,
and upgrades the investigation queue and evidence review workspace. React/FastAPI
contracts, statistical methods, thresholds, schemas, demo identity, and backend
state transitions are unchanged. No commit, push, reset, or Phase 4 work occurred.
The initial working tree was clean. The first frontend test execution occurred
after initial edits; a separate untouched-baseline test run was not performed.

Reviewed the project status and Phase 1/2 reports, shared UI/display/layout code,
foundation/tokens, API client/types, network/investigation features, FastAPI data
and concern routes, network/concern services, and detection implementations.
Rendered and visually inspected HTML references 05, 07, 08, and 09 with their assets.
Their illustrative data and unsupported playback, model settings, export, and
inconclusive controls were not copied into the application.

## 2. Implemented screens

| Screen | Route | Result |
|---|---|---|
| Reporting Network | `/network` | Title/subtitle header, compact synthetic context, dominant dark Cytoscape canvas, search/filter controls, graph/list alternatives, contextual unit details and legend |
| Anomaly Analysis | `/anomalies` | Reporting metric chart, unit context, exact backend method names, explicit detection dialog, prioritized findings, selected evidence and investigation link |
| Investigation Queue | `/investigations` | Scope-wide API summary cards, sortable table, separate workflow/verification tags, filtering, pagination and URL state |
| Investigation Review | `/investigations/:id` | Selected concern brief beside workflow controls, visible weekly evidence, uncertainty, units/dependencies, notes/history and technical detail tabs |

The new analysis route shares the existing coordinator/analyst roles and route
guard. Existing concern detail paths and workflow entry points remain available.
RHU staff retain their concern access; administrators retain network access.

## 3. Files created and modified

Created:
- `frontend/src/features/investigations/AnomalyPage.tsx`
- `frontend/scripts/check-phase3.mjs`
- `docs/IRIS_FRONTEND_PHASE3.md`

Modified:
- `frontend/src/app/App.tsx`: lazy analysis route.
- `frontend/src/lib/navigation.ts`: analysis navigation and clearer existing labels.
- `frontend/src/features/network/NetworkPage.tsx`: composition, real unit search,
  no-schedule legend/filter, empty filtered graph, compact synthetic context.
- `frontend/src/features/network/NetworkGraph.tsx`: patterned dark canvas and
  ResizeObserver cleanup for responsive Cytoscape sizing.
- `frontend/src/features/network/NodeDetails.tsx`: conditional simulation badge
  and navigable defined relationships.
- `frontend/src/features/investigations/InvestigationsPage.tsx`: shared explicit
  detection control, scope metrics, table, sorting and URL filters.
- `frontend/src/features/investigations/InvestigationPage.tsx`: summary/workflow
  composition, separate verification badge, primary timeline and mutation errors.
- `frontend/src/features/investigations/ActionDialogs.tsx`: pending dismissal
  guards and refreshed current assignee on dialog open.
- `frontend/src/features/investigations/WeekStrip.tsx`: named, focusable scroll region.
- `frontend/src/styles/workspaces.css`: small canvas/finding composition extensions.

## 4. Shared components reused

Panel and its established surface variants/motifs; MetricCard; PageHeader;
DataTable and SortState; FilterBar/FilterField/ChipFilter; Pagination; TrendChart
and its accessible data table; status/severity/verification badges; buttons,
fields, selects and inputs; Radix dialogs/tabs; existing WeekStrip, evidence and
action dialogs. Shared Poppins, palette, patterns, logos, sidebar, focus treatment,
and glass tokens remain in use. No duplicate visual system or dependencies added.

## 5. API integration mapping

| Interface | Existing API |
|---|---|
| Network/week selection | GET `/api/network?w_from=...&w_to=...` |
| Unit selection, relationships and history | GET `/api/network/units/{id}` |
| Scope metrics and scope-wide trend | GET `/api/overview?period=all&status=active` |
| Queue and analysis findings | GET `/api/concerns` with supported status, concern_type, severity, province, search, unit_id, page, page_size, sort and order |
| Evidence/method/uncertainty | GET `/api/concerns/{id}` |
| Explicit detection | POST `/api/detection/run` with existing `method` |
| Investigation mutations | POST `/api/concerns/{id}/{review,confirm,dismiss,clarify,respond,assign,notes,resolve,reopen}` |
| Context and permissions | Existing GET `/api/meta` and session context |

Detection identifiers remain `threshold`, `ewma`, and `network`. Display names
come directly from metadata: Statistical threshold, Time-series (EWMA), and
Network-aware. Statistical threshold is a robust historical comparison, not an
invented fixed-count threshold or trained model. Parameters remain backend-owned.

Analysis charts show actual completeness/timeliness percentages; scope charts use
the backend's latest 12 weeks, independent of selected finding periods. Selected
unit charts use available unit history. Finding periods are displayed separately.
No anomaly marker is inferred onto an unrelated scope chart. Shared TrendChart
retains `connectNulls={false}` and table alternatives. No missing value is imputed.

## 6. Visual improvements

The graph uses the existing dark teal palette, restrained dot grid, consistent
node types/status boundaries, defined edge styles, and selected-node accents.
Network statistics are compact text so the canvas dominates. Investigation
summaries use the shared light metric surfaces; queue rows remain dark and dense.
Analysis uses a prominent waveform-motif chart and supporting network/evidence
panels. Detail uses medium glass summary/workflow panels above dark evidence.
No decorative asset was generated or external typography introduced.

## 7. Investigation workflows preserved

Review, confirm, dismiss, clarification request/reply, assign, notes, resolve and
reopen still call their existing mutations and retain reasons, validation,
permissions, state rules, reviewer data and query invalidation. Direct review
errors are now visible outside dialogs. Pending detection and action dialogs
cannot be dismissed into a second conflicting operation. Assign opens with the
current owner. Workflow status and reviewer verification are separate fields.
Confirmation denotes a reviewer decision on reporting evidence, not proof of a
public-health event. No inconclusive mutation was introduced.

Queue filters, page and sorting live in the URL, preserving browser Back state.
Only API-supported sorts are sent. The table shows ID, priority, entities,
suspected disruption, workflow status, verification, reviewer and updated date.
The list API omits detection method and creation time, so these are not invented
as queue columns; actual detail responses supply that information on review.

## 8. Network functionality

Preserved preset topology, existing node coordinates and directed relationships,
pan/zoom, fit/reset, selection, graph/list switching, province/type/status/week
filters, real history and linked concerns. Added name/ID search and explicit
no-schedule state. Only defined API edges are rendered. The responsive table/card
alternative supports keyboard inspection without canvas interaction. Connected
relationship names navigate to their actual unit details. Filtered counts refer
to visible nodes and edges; no relationships are inferred geographically.

## 9. Tests and verification

Executed:
- `npm test`: 21 tests passed across four files, including final regression run.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing >500 kB bundle warning remains.
- `node scripts/check-phase3.mjs --isolated`: 38 verification groups passed (24 viewport
  renders and 14 behavior/workflow groups), recorded in the JSON artifact below; covers six widths (1600, 1440, 1024, 768, 375, 320) on all four
  screens, fonts/assets, console/HTTP errors, document overflow and workflow checks.
- `git diff --check`: passed.

Browser coverage includes search/empty network/list/node details, zoom/fit/reset,
queue sorting/back/reset, unit chart/data table, detection dialog cancellation,
all three real detection runs, simulated 422 failure feedback, note persistence,
required dismissal reason, reopen, clarify/respond, confirm, assign, resolve,
start review, 320px dialog bounds/focus containment/mobile navigation, and RHU,
provincial and administrator navigation. Render/navigation assertions observe
zero automatic writes. The simulated error response is confined to the test.

All mutation checks use a separately spawned FastAPI instance with a freshly
seeded disposable SQLite file under the OS temporary directory. Browser API
requests are explicitly proxied there, and `/api/demo/reset` is blocked in both
live and isolated modes. The server is terminated after the suite; temporary DB
files may remain for inspection. The current project database is never reset or
mutated. The existing reset-dependent E2E script was not executed.

Node initially failed with sandbox filesystem EPERM; checks ran successfully
with execution approval. An absent frontend server and an early harness locator
issue were corrected. A cancelled proxy read during live editing exposed an
unhandled test-harness rejection; the proxy now catches cancellations and allows
limited transport retries. Final browser checks run against stable source.

Not executed: backend regression suite (backend unchanged), every role at every
viewport, a full screen-reader audit, touch-device testing, production deployment,
or mutation tests against the current development database.

## 10. Browser screenshots

Local artifacts (ignored by existing Git rules):
`frontend/qa-screenshots/phase3/isolated/`.

Exact 1600 x 1000 viewport captures:
- [Reporting Network](../frontend/qa-screenshots/phase3/isolated/network-1600x1000.png)
- [Anomaly Analysis](../frontend/qa-screenshots/phase3/isolated/analysis-1600x1000.png)
- [Investigation Queue](../frontend/qa-screenshots/phase3/isolated/queue-1600x1000.png)
- [Investigation Review](../frontend/qa-screenshots/phase3/isolated/detail-1600x1000.png)

Full-page captures for each screen use `{network,analysis,queue,detail}-{width}.png`.
Rendered supplied references are `reference-{05,07,08,09}.png`.
The machine-readable run log is
[results.json](../frontend/qa-screenshots/phase3/isolated/results.json).
Screenshots use real responses from the isolated seeded application.

## 11. Unsupported or deferred features

No arbitrary threshold editing, new trained models, graph playback, export queue,
network ingestion, unsupported category/date detection filters, custom dataset
selection, or inconclusive mutation was added. Imports still lack the schedules
and relationships needed for those capabilities. Chart/finding unit selection
does not constrain a detection run; the dialog explicitly explains the full
supported demo dataset scope. Detection deduplication retains existing concerns,
so switching methods may produce no newly created concerns rather than a new
method comparison. A comparison experiment belongs to the existing evaluation
workflow and was not recreated here.

## 12. Known issues and backend dependencies

The known incomplete object-level access enforcement and broader intervention
eligibility remain backend limitations. Network data and unit history are not
uniformly actor-scoped by the backend; frontend role gates are not a security fix.
Detection scans the selected/default dataset rather than chart/queue filters.
Demo analysis relies on fixed simulation dates and explicit schedules. Imported
datasets without expectations cannot supply missing-report detection. No visual
label changes these facts. Existing hub graph-window aggregation and unit-history
aggregation have different relationship traversals; the UI retains the backend's
history notes rather than silently recomputing them.

The responsive shared DataTable becomes labeled rows/cards below 768px and a
keyboard-focusable horizontally scrollable table above that breakpoint. Dense
network labels require zoom or the list alternative on smaller displays. Summary
metrics are reporting-scope-wide, independent of queue filters. No unsupported
confirmed-issue aggregate is derived from only one paginated response.

## 13. Recommendations for Phase 4

Continue with intervention/recovery screens only after a separate instruction.
Before expanding beyond the prototype, prioritize backend authorization and
verified-only intervention policy decisions, explicit dataset/analysis scope
contracts, and schedule/relationship ingestion. Consider backend list method and
created-date fields if those queue columns are required, and a supported export
contract. Review the existing bundle-size warning separately. Retain isolated
workflow tests and extend role/assistive-technology coverage as scope grows.
