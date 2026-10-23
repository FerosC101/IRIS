# IRIS design-alignment audit

**Date:** 23 October 2026 (PHT) · **Branch:** `feat/iris-frontend-design` · **Base commit:** `0346c1f`
**Scope:** Align the frontend with the five card-version mockups (Dashboard, Reports & Analysis, Reporting Network, Investigations & Actions, Data & Models) and wire every interaction to the existing backend.

Baseline at audit time: backend **40 passed** (`uv run pytest`), frontend **26 passed**, production build passes with a 786.32 kB entry chunk (237.17 kB gzip).

## Approved decisions (23 Oct 2026)

| # | Topic | Decision |
|---|---|---|
| 1 | Data alignment | **Option C (hybrid).** Keep the engine, fictional geography, units and storyline. Add a zero-run detection channel, one injected zero-run DENGUE scenario, display IDs (`RPT-xxxx`, `INV-xxxx`) and the approved endpoints. UI numbers come from the backend and will not equal the mockup's 42/48. No real place names on synthetic counts. Filter-bar badge reads **"Synthetic demo data"**; series and bands keep "Observed" / "Simulated" labels. Tests and e2e scripts are updated deliberately, not deleted. |
| 2 | Calendar | ISO weeks. Show "ISO W40 · 28 Sep–04 Oct" and the backend as-of date. |
| 3 | Photos | Follow the mockups (three hero photos). Rename by content: `hero-stethoscope`, `hero-masked-closeup`, `hero-or-window`, `hero-or-light` (Close-the-loop banner), `hero-lightbox` (reserved). White edge strips cropped in CSS only. |
| 4 | Logos | A transparent light SVG mark and favicon will be supplied. Until then: dark-teal logo on light surfaces, typeset "IRIS" (Space Grotesk) on dark ones, behind one swappable import in `src/assets/index.ts`. Logo files are never edited. 1920 px photos accepted. |
| 5 | Dependencies | Approved: `@fontsource/space-grotesk`, `@fontsource/inter`, Radix popover / dropdown-menu / tooltip / switch, `sharp` (dev, one-off WebP/AVIF script writing to `optimized/`). Poppins removed. |
| 6 | Backend (phase B0) | Approved: e1–e8 except e9, e10–e13, `GET /detection/summary`, f1–f4. Declined: priority change, `POST /detection/preview`, evidence file upload. Export is client-side only. Fields with no source are dropped or shown as "Not recorded"; the "2025 historical" line becomes a backend trailing median. |
| 7 | Models panel | "Network-aware (in use)" with the zero-run channel listed as one of its channels; threshold and EWMA are "Comparison (evaluation only)". No versions, shadow model or latency. Precision from the latest synthetic experiment with its replication count. "Review configuration" diffs params between two real experiment runs. Human verification locked on. "Include simulated inputs" disabled: "All demo inputs are simulated". |
| 8 | Placements | Route plan and placements approved, including `/data` changing meaning (legacy redirects kept) and removing `DemoBanner`. Disclaimer stays in the footer, filter-bar badge and "Simulated" labels. Contrast fixes approved. |
| 9 | Housekeeping | Assets renamed to kebab-case; nested `frontend/frontend/` removed; mockups moved to `docs/design/` and tracked; `design-reference/` and `public/brand/*` retired once grep confirms no use. |

## Headline findings

1. **Theme polarity.** The current app is a dark glass theme (Poppins, `#04121C` page, left sidebar). The mockups are light (off-white page, white cards, Space Grotesk + Inter, pill top nav). Brand hexes are shared; every surface flips. The dark "compatibility bridge" in `foundation.css` must be removed and all pages restyled, including those without a mockup.
2. **Logos.** All three supplied logos are 527×527 24-bit RGB with no alpha on solid white. None can be used on the dark nav, footer or Close-the-loop banner.
3. **Photo naming.** The mockups use three photos; five were supplied, and their filenames do not match the mockup placement.
4. **Missing backend support.** Zero-run detection, checklist, evidence attachment, manual investigation creation, reminders, checksum, lineage and geographic coordinates had no data or endpoint.
5. **Resolve was not gated.** Backend `resolve` only required a reason, so a UI-only lock could be bypassed.

## (a) Design tokens (sampled at 1440 px)

| Token | Value | Sampled from |
|---|---|---|
| page | `#F7F9F9` | page background |
| surface / border | `#FFFFFF` / 1px `#A9BAC0` | cards, filter bar |
| surface-muted | `#E0E7E8` (border `#A0B3B9`) | surveillance-flow strip |
| surface-tint | `#E7F1F2` | verify card, configuration panel |
| nav / dark card | `#0A3A4A` | nav pill, Signals card, queue panel |
| footer | `#0A3A4A` centre → `#04131D` edges | footer |
| primary | `#0E6680` | links, solid chart line, table header |
| data | `#1A9EA0` | KPI numerals, bars, observed dot |
| data-bright | `#5DD9DB` / `#30C8C0` | donut zero segment, hero eyebrow |
| mint | `#98E0D8` | zero-case cells, map |
| mint-pale | `#B7ECE9`, `#DBECEC`, `#E4F8F7` | chips, map background, donut track |
| alert / alert-pale | `#B65F59` / `#FCD3D0` | missing values / missing cells, model-flag callout |
| series-2 | `#7893A8` dashed | comparison series |
| ink | `#0A3A4A` | headings and body |

Contrast problems found in the mockups (fixed, not copied):

| Pair | Ratio | Fix |
|---|---|---|
| `#30C8C0` "With cases" on white | 2.07:1 | use `#0E6680` |
| `#79BD5F` green "Zero-case" | 2.27:1 | one zero-case colour everywhere |
| `#1A9EA0` on white | 3.26:1 | large numerals only |
| `#B65F59` text on white | 4.40:1 | darker red for small text; keep for fills |
| `#5DD9DB` eyebrow on `#0E647E` | 3.95:1 | lighten |

Hero overlay checkpoints: both variants share a solid `#0E647E` left stop to ~18% of the width. Bright (Dashboard): `#0B4A5D` at 22%, `#183743` at 45%, then the grayscale photo (`#434444`–`#4A5055`). Deep (others): `#0B4153` at 30%, `#223A45` at 52%, near-black `#0C151B`–`#0F1010` on the right. Bottom vignette ~`#0B222B`.

Layout: content 1344 px with 48 px gutters; nav pill 1374×70 at top 25, fully rounded; hero 1344×330; 24 px vertical rhythm; card/hero radius ~8 px, chips/buttons 4–6 px; card padding 20 px. Type: Space Grotesk display (hero ~44/58, card titles 19–20, KPIs ~40), Inter body 13–14, eyebrows 10–11 uppercase tracked (±1 px).

## (b) Reconciliation per screen

Global differences: dark → light, sidebar → pill top nav, `PageHeader` → photo hero, per-page filters → global filter bar, `DemoBanner` → footer disclaimer, Poppins → Space Grotesk/Inter.

| Screen | Reuse | Differs | Missing |
|---|---|---|---|
| Dashboard (`OverviewPage`) | `TrendChart` + `DataTableToggle`, `MetricCard`, priority concern, recently closed, RHU tasks | KPIs are workflow counts | hero, flow strip, donut, heatmap, schematic map, recent alerts, export |
| Reports & Analysis (`DataExplorerPage`, `RecordSheet`, `AnomalyPage`) | records incl. not-received, blank vs zero vs not-received, search/sort/pagination, record history, quality | columns, status filter, sheet vs side panel | zero-run chart, "Why this was flagged", verify card, view source, send reminder |
| Reporting Network (`NetworkPage`, `NetworkGraph`, `NodeDetails`) | Cytoscape, fit/zoom/reset, node details, legend, list view, week range | canvas styling, filters, hub styling | geographic view, history scrubber, find a unit, legend toggles, peer comparison, peers drawer, shared-disruption callout |
| Investigations & Actions (`InvestigationsPage`, `InvestigationPage`, `ActionDialogs`, `EvidenceSections`) | full review/confirm/dismiss/clarify/assign/note/resolve/reopen workflow, activity timeline, evidence badges | separate list/detail routes | checklist, corrective-actions table, Close-the-loop, new investigation, attach evidence, gated resolve |
| Data & Models (`DataManagementPage`, `DatasetPage`, `ImportWizard`, `EvaluationPage`) | registry, CSV wizard, import history, activity, evaluation lab | layout; evaluation is method comparison | quality panel, pipeline strip, flags chart, configuration panel, lineage, checksum |

Phase 5 overlap: follow-up refinement → Investigations corrective actions and Follow-up tab; audit/reproducibility → Data & Models run history, lineage and provenance drawer; validation → phases (i)–(j). Phase 5 backend items (authorization, scope contracts) remain out of scope.

## (c) Screen → feature map

| Screen | Features |
|---|---|
| Dashboard | overview + new weekly summary |
| Reports & Analysis | data explorer, anomaly analysis, recovery |
| Reporting Network | network |
| Investigations & Actions | investigations, planner, follow-up (corrective actions = intervention assignments) |
| Data & Models | data management, CSV import, evaluation, detection summary (detector parameters are constants; read-only) |

## (d) Assets

| Original file | New name | Dims | Size | Placement |
|---|---|---|---|---|
| `hero-dashboard-stethoscope.png` | `hero-stethoscope.png` | 1920×1080 | 1.96 MB | Dashboard hero; small photo surfaces |
| `hero-reports-masked.png` | `hero-masked-closeup.png` | 1920×1080 | 2.21 MB | Reports, Investigations heroes |
| `hero-investigations and actions.png` | `hero-or-window.png` | 1920×1080 | 2.02 MB | Network, Data & Models heroes (1 px light line at bottom) |
| `hero-network-operating-room.png` | `hero-or-light.png` | 1920×1080 | 3.22 MB | Close-the-loop banner (6 px white strip right, ~2 px top) |
| `hero-report and analysis.png` | `hero-lightbox.png` | 1920×1080 | 2.45 MB | Reserved |
| `Logo-dark teal.png` | `logo-dark-teal.png` | 527×527, no alpha | 33 KB | light surfaces |
| `Logo-White.png` | `logo-white.png` | 527×527, no alpha | 11 KB | unusable on dark (white on white) |
| `Logo-bright teal.png` | `logo-bright-teal.png` | 527×527, no alpha | 26 KB | unused |

All photos are 1920 px wide (below the 2700 px ideal; accepted). WebP/AVIF copies are generated separately; originals stay untouched.

## (e) Data, endpoint and detector gaps

Mockup vs repository: real Cebu LGUs vs fictional provinces; 48 vs 20 reporting units (18 report DENGUE); dengue-only vs seven categories; "EW 40 · 27 Sep–03 Oct" (matches neither ISO W40 nor MMWR EW40) vs ISO W40 28 Sep–04 Oct; integer record IDs; no zero-run detection; no submitter/focal-person fields; no prior-year series.

| ID | Gap | Decision |
|---|---|---|
| e1 | Weekly summary (counts incl. blank, completeness, deltas, flow counts, heatmap, trailing median) | approved |
| e2 | Zero-run detection channel + evaluation scenario kind | approved |
| e3 | Simulated reference band in evidence | approved |
| e4 | Attach evidence (text/link) | approved |
| e5 | Backend-enforced gated resolve | approved |
| e6 | Checklist table (note, user, timestamp) | approved |
| e7 | Human-created investigation | approved |
| e8 | Add corrective action | approved |
| e9 | Priority change | declined |
| e10 | Reminders (audit event only, simulated) | approved |
| e11 | Schematic `geo_x`/`geo_y` | approved |
| e12 | SHA-256 dataset checksum | approved |
| e13 | Lineage endpoint | approved |
| e14 | Export | client-side only |
| e15 | Fields with no source | drop or "Not recorded"; trailing median replaces "2025 historical" |
| — | `GET /detection/summary` | approved |
| — | `POST /detection/preview` | declined |

## (f) Backend issues touching the UI

| # | Issue | Fix |
|---|---|---|
| f1 | Half-hour rounding can exceed the budget | floor capacity, ceil costs; regression test |
| f2 | F1 null for a defined zero | 0.0 when precision + recall = 0; regression test |
| f3 | Unknown `X-IRIS-User` falls back to default | unknown explicit id → 400; missing header → default |
| f4 | Reset drops tables without confirmation | require typed confirmation `RESET`; UI confirmation dialog |

## (g) Routes

`/`, `/reports`, `/reports/:reportId`, `/reports/analysis`, `/reports/recovery`, `/network`, `/investigations`, `/investigations/:id`, `/investigations/plan`, `/investigations/follow-up`, `/data`, `/data/datasets/:id`, `/data/import`, `/data/evaluation`, `/data/runs`, `/settings`, `/help`, `*`. Global filters in the URL. Legacy redirects from `/data-management`, `/evaluation`, `/planner`, `/follow-up`, `/anomalies` and the old `/data` explorer.

## (h) Non-mockup features

Planner and Follow-up are sub-tabs of Investigations & Actions. Recovery and anomaly analysis are sub-tabs of Reports & Analysis. Run detection sits on the Data & Models pipeline; evaluation at `/data/evaluation`; quality, dictionary and provenance in the dataset drawer; unit metadata in the registry drawer; system activity in Run history; demo scenarios and reset in an overflow menu and Settings. RHU tasks appear on the Dashboard for RHU staff. Settings, Help, preferences, demo role and "About this demo" live in the user chip menu. Tabs are hidden by role via `canAccess`.

## (i) Phases

B0 backend (one commit per item) → (a) tokens, shell, hero, filter bar, assets → (b) shared components → (c) Dashboard → (d) Reports & Analysis → (e) Reporting Network → (f) Investigations & Actions → (g) Data & Models → (h) global overlays, exports, states → (i) responsive, accessibility, code splitting, restyle of non-mockup pages → (j) tests, e2e, README.

Mockup issues fixed rather than copied: "Updated" label overlapping the photo, clipped flags-chart axis, empty hero gap on Reports, inconsistent detector naming, failing contrast pairs.
