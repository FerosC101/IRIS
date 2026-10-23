# IRIS frontend — Phase 2

Completed on `feat/iris-frontend-design`, 16 October 2026. This phase implements
Overview, Dataset Management/detail, and Dataset Import & Validation within the
existing application. Phase 1 changes and the untracked design references were
preserved. No commits, pushes, or Phase 3 work were performed.

## Screens and visual changes

| Step | Routes | Delivered |
|---|---|---|
| 2A — Overview | `/` | Title/subtitle-only header; separate scope/period toolbar; taller photographic hero; four real-data metric cards; reporting chart; priority concern; full queue; RHU tasks; workspace context; recent closures; retained dismissible guide |
| 2B — Dataset Management | `/data-management`, `/data-management/:id` | Search/classification/validation filters; dark registry; selected-dataset preview with real category metadata; preserved detail navigation; provenance, quality, dictionary, import history, explorer link, and administrative actions |
| 2C — Import | `/data/import` | Native file selection; source summary and scrollable schema preview alongside mapping; three light validation cards; separate dark findings table; missingness/semantic context; provenance form; final confirmation and result navigation |

The rendered HTML references 02–04 informed the compositions. Their fixed canvas,
illustrative numbers, unsupported actions, and fake registry entries were not
copied. These screens use responsive grids and natural document scrolling.

Phase 1 `Panel`, `Button`, `Badge`, `Field`, `Input`, `Select`, `Textarea`, dialogs,
tabs, tables, charts, Poppins, colors, and glass tokens are reused. `Panel` now
accepts an optional decorative `motif` (`records`, `trends`, `verify`, `network`).
The reusable `MetricCard` uses the existing light metric surface and typography.
Purpose-specific motifs and two faint photographs vary the card treatment without
obscuring content. Existing logos and sidebar/session behavior are preserved.

Table scroll regions are named and keyboard-focusable. Source/validation tables
retain captions and scoped column headers. A shared tab-color correction makes
the active management tab readable on the dark canvas. Optional provenance-field
errors are now visibly associated with their inputs; pending validation prevents
mapping edits and conflicting navigation. Confirmation cannot be dismissed while
its commit is pending. Expired validation blocks Continue and offers Start again.

## Real-data semantics

- Overview counters are scope-wide because that is what the API returns. The
  selected period filters the work queue; reporting trends cover the backend's
  last twelve weeks. These scopes are stated beside the indicators and controls.
- The four Overview indicators use completeness, open concerns, active follow-up
  actions (RHU tasks for RHU users), and overdue follow-ups. No verified-issue or
  selected-plan total is invented to match the reference.
- Priority concerns come from the returned active queue. Status is not presented
  as verification, and priority is explicitly advisory.
- Registry source, coverage, classification, counts, validation, and capabilities
  come from dataset metadata. Categories are requested through the existing
  filters endpoint for the selected dataset; cadence is not guessed.
- Accepted Records is available only when validation passes and supplies a
  summary. The number means ready for confirmation, not already persisted.
- Rejected Records counts distinct source rows only when the complete error list
  identifies every erroneous row. File-level/schema/duplicate errors or capped
  error details produce an unavailable value, not zero. Error totals are displayed
  separately. Warning counts explicitly describe the returned warning list.
- Blank received values, explicit zero, reported values, and late submissions
  remain distinct. A report not received requires a schedule; imports do not
  create expectations or network relationships. Missing values are never imputed.

## APIs, permissions, and workflows preserved

No backend files, schemas, algorithms, authentication/session code, React routes,
API client/types, or navigation permission definitions were edited. Additional
dataset-category presentation uses an existing API endpoint.

| Workflow | Existing API relationship |
|---|---|
| Overview/queue filters | GET `/api/overview` with existing period/status parameters |
| Dataset registry/detail/categories | GET `/api/datasets`, `/api/datasets/{id}`, `/api/datasets/{id}/filters` |
| Explorer and quality | Existing `/api/datasets/{id}/records`, record, trends, and quality calls remain unchanged |
| Management tabs | Existing imports, units, audit, and scenario reads remain available |
| CSV import | Existing POST preview/validate/commit and DELETE staged-token cancellation |
| Dataset deletion | Existing permission-gated confirmation and DELETE behavior retained; not executed against the current database |
| RHU reporting | Existing `SubmitReportDialog`, submission mutation, and query invalidation retained; live check opens/cancels without submitting |

The import page now explains unavailable import access for roles without the
existing `dataset.import` permission. This does not change route or backend
permissions. Imports still require provenance and explicit final confirmation;
successful imports invalidate queries and navigate to their actual dataset.
Cancellation also clears the local date-format/duplicate-policy state for the
next upload. No saved-draft persistence was added.

## Files modified and created in Phase 2

Paths are relative to `frontend/` unless stated otherwise. Earlier Phase 1
modifications remain in the working tree and are not new Phase 2 changes.

| Modified | Purpose |
|---|---|
| `src/features/overview/OverviewPage.tsx` | Responsive dashboard composition; existing queries/task dialog retained |
| `src/features/data-management/DataManagementPage.tsx` | Registry composition and new heading; all management tabs retained |
| `src/features/data-management/DatasetPage.tsx` | Quality metrics, surfaces, keyboard-scroll regions, all detail actions retained |
| `src/features/data-management/ImportWizard.tsx` | Functional import composition, pending/error/cancellation safeguards |
| `src/components/ui/panel.tsx` | Optional decorative motif API |
| `src/components/ui/tabs.tsx` | Readable active tab styling |
| `src/components/data-display/PageHeader.tsx` | Safe wrapping for long dataset names |
| `src/components/data-display/DataTable.tsx` | Named keyboard-focusable horizontal scrolling |
| `src/index.css` | Imports Phase 2 composition styles |
| `scripts/check-foundation.mjs` | Adjusts actor-text assertion to the new Overview toolbar |

| Created | Purpose |
|---|---|
| `src/components/data-display/MetricCard.tsx` | Reusable light metric surface |
| `src/features/data-management/DatasetRegistry.tsx` | API-backed filtered registry and selected-dataset preview |
| `src/features/data-management/DatasetBadges.tsx` | Extracted shared validation badge; old export remains compatible |
| `src/features/data-management/ValidationFindings.tsx` | Three metrics, dark issue table, and data-semantics summary |
| `src/features/data-management/validation-summary.ts` | Conservative error-versus-row metric derivation |
| `src/styles/workspaces.css` | Responsive composition and decorative motif styles |
| `src/test/validation-summary.test.ts` | Four semantic regression cases |
| `scripts/check-phase2.mjs` | Safe live and isolated real-API browser verification |
| `public/brand/motif_records.svg`, `motif_trends.svg`, `motif_verify.svg`, `motif_network.svg` | Unchanged copies of supplied analytical motifs |
| `public/brand/photo_reporting.webp`, `photo_review.webp` | Unchanged supplied photographs for validation metrics |
| `docs/IRIS_FRONTEND_PHASE2.md` (repository root) | This report |

All six newly copied assets match their design-reference originals by SHA-256.
No dependencies or new component libraries were introduced.

## Verification results

| Check | Before Phase 2 | After implementation |
|---|---|---|
| `npm test` | 17 tests passed, 3 files | 21 tests passed, 4 files |
| `npm run typecheck` | Passed | Passed |
| `npm run build` | Passed | Passed |
| Build warning | Existing chunk above 500 kB (about 795 kB) | Same warning class; largest chunk about 783 kB |
| `git diff --check` | — | Passed |

The four new unit cases cover multiple errors on one row, file-level errors,
truncated error lists, post-duplicate accepted totals, and unavailable summaries.

**Live browser checks:** 32 route/viewport combinations passed, plus three
functional check groups (35 groups in the script). All four affected routes were
checked at 1600, 1440, 1024, 768, 375, and 320px. Additional phone checks covered
admin import history/unit management/audit, RHU overview/explorer/import access,
and coordinator overview/explorer. Checks verified page headings, no horizontal
page overflow, no visible errors, successful HTTP reads, no console/page errors,
loaded Poppins weights, and loaded images. Functional checks exercised queue
period/status reads, chart table alternatives, registry search/clear/classification,
preview/detail/explorer navigation, and the RHU report dialog without submission.
An additional final keyboard check at 768px focused the registry's named scroll
region and confirmed ArrowRight scrolled its 790px table within a 718px viewport
(40px scroll movement), without widening the page. The normal Overview still
rendered after the isolated server had stopped.

**Isolated import checks:** eight groups passed using the existing FastAPI app
and a new disposable SQLite database. These used real API responses, not mocked
responses. Synthetic CSV fixtures existed only in that test environment:

1. Invalid date/count errors on the same row yield one rejected record and block
   Continue; accepted count remains unavailable.
2. Missing required mapping produces file-level errors and no guessed row total.
3. Cancellation releases the staged token and resets file selection.
4. Duplicate policy revalidates and returns the actual post-duplicate count.
5. A genuinely cancelled/expired token returns 410 and offers Start again.
6. A held real validation request verifies pending controls; it then continues to
   the isolated server without response substitution.
7. Mapping and valid-with-warning findings render without overflow at all six
   widths; exactly three light validation metrics are present.
8. Required provenance, confirmation/back, commit, result navigation, and explorer
   work; stored records preserve reported/zero/blank values and late timing.

The harness overrides **both** `IRIS_DB_PATH` and `IRIS_DATABASE_URL` for its child
server, uses a separate dynamically allocated loopback port, and redirects its
browser API requests there. It stops that child server afterward. The disposable
database path is recorded in `isolated/results.json` and retained in the temporary
directory for inspection. The live application database was not used for mutation
tests. Neither mode permits `/api/demo/reset`; live mode blocks all API mutations.
No reset-dependent E2E script was run.

Installed Microsoft Edge was used; bundled Playwright Chromium remains absent.
The pre-existing demo-role refresh issue remains unchanged. Tests establish roles
before page load, accounting for the required reload.

Reproduce from `frontend/` with the normal frontend/backend running:

```powershell
npm test
npm run typecheck
npm run build
$env:IRIS_BROWSER_CHANNEL = 'msedge'
node scripts/check-phase2.mjs
node scripts/check-phase2.mjs --isolated
```

The isolated mode requires the existing backend virtual environment. Generated
screenshots/results use the already ignored `frontend/qa-screenshots/` directory.

## Screenshots

Representative full-page captures:

- [Overview, 1600px](../frontend/qa-screenshots/phase2/live/overview-1600.png)
- [Overview, 320px](../frontend/qa-screenshots/phase2/live/overview-320.png)
- [Dataset registry, 1600px](../frontend/qa-screenshots/phase2/live/datasets-1600.png)
- [Dataset detail, 375px](../frontend/qa-screenshots/phase2/live/dataset-detail-375.png)
- [Import upload, 320px](../frontend/qa-screenshots/phase2/live/import-upload-320.png)
- [Mapping, 1600px](../frontend/qa-screenshots/phase2/isolated/import-mapping-1600.png)
- [Valid findings, 1600px](../frontend/qa-screenshots/phase2/isolated/validation-valid-1600.png)
- [Invalid findings, 320px](../frontend/qa-screenshots/phase2/isolated/validation-invalid-320.png)
- [Confirmed import result, 320px](../frontend/qa-screenshots/phase2/isolated/import-result-320.png)

Machine-readable logs: [live results](../frontend/qa-screenshots/phase2/live/results.json)
and [isolated results](../frontend/qa-screenshots/phase2/isolated/results.json).

## Remaining limitations and Phase 3 recommendation

No WHO/DOH integrations, saved import drafts, snapshot exports, guessed disease or
cadence metadata, fake authentication/logout, or unsupported suggested-action
columns were added. Schedule-free imports still cannot calculate completeness or
support schedule-dependent detection; the frontend explains this constraint.
Warnings and errors are limited to the details returned by the backend.

Browser checks establish selected rendering/control/workflow behavior in Edge,
not formal WCAG certification or exhaustive cross-browser/permission coverage.
Dataset deletion, report submission, and unit metadata mutations were not executed
against the live database. Backend tests and algorithms were not changed. The
pre-existing session-refresh and bundle-size issues remain separate work.

After approval, Phase 3 can compose Reporting Network, Anomaly Analysis, and
Investigation Queue/Detail using the same surfaces and existing real evidence and
transition APIs. Full audit-trail composition and unsupported backend capabilities
remain separate phases. No Phase 3 implementation has started.
