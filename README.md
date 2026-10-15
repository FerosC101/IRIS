# IRIS — Integrated Reporting Intervention System

*See the connections. Restore what matters.*

IRIS is a **research prototype** of a decision-support tool for public-health reporting networks: Regional Epidemiology and Surveillance Units (RESUs), Rural Health Units (RHUs) and other authorized personnel. It helps users review reporting irregularities, investigate possibly connected disruptions, prioritize corrective actions and assess reporting recovery.

> **IRIS is not an officially deployed Department of Health system.** It is not endorsed by any government agency, does not connect to any government system, and has not been validated in real-world use. **All demonstration data is simulated**: the provinces, municipalities, facilities, people and relationships are fictional, and no patient information is used.

The workflow it supports:

**Review reporting concerns → inspect evidence → verify a concern → investigate possible connections → compare corrective actions → record an intervention → assess recovery.**

---

## Quick start

Requirements: Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node.js 20+ and npm.

```bash
# 1. Backend (FastAPI + SQLite) — http://127.0.0.1:8000
cd backend
uv sync
uv run uvicorn iris.main:app --port 8000

# 2. Frontend (React + Vite) — http://localhost:5180
cd frontend
npm install
npm run dev
```

Open **http://localhost:5180**. On first start the backend creates `backend/iris.db` and seeds it. Seeding generates the simulated network and data, runs detection, plays the demo storyline and executes one 20-replication evaluation, which takes about 3 seconds. The Vite dev server proxies `/api` to port 8000.

Use the **Demo role** selector (sidebar on desktop, menu on mobile) to switch between users:

| Demo user | Role | What to try |
|---|---|---|
| Hiraya RHU Encoder | RHU reporting staff | Submit missing reports, respond to a clarification request (C-0014) |
| Malaya Provincial Coordinator | Provincial coordinator | Kalinaw shared-connection investigation (C-0010), overdue follow-up F-0004, planner |
| RESU Surveillance Analyst (default) | RESU analyst | Everything: network, run detection, model evaluation, approve plans |
| Data Manager | Administrator | CSV import, unit metadata, system activity |

**Reset the demo** from *Settings* or *Data sources → Demo scenarios* (where you can also choose which scenarios are injected).

## Tests

```bash
cd backend && uv run pytest              # 40 tests: simulation, metrics, detection, planner, evaluation, API workflows, CSV import
cd frontend && npm test                  # 17 tests: formatting, role access, form validation, API client, table/filter components
cd frontend && npm run typecheck         # TypeScript strict mode
cd frontend && npm run build             # production build

# Browser checks (both servers running; one-time: npx playwright install chromium)
cd frontend && npm run qa:e2e                                             # resets the demo, then clicks through the workflows
cd frontend && npm run qa:responsive -- http://localhost:5180 ./qa-screenshots
```

`qa:e2e` drives 11 workflows in a real browser:
- review → confirm (reason enforced) → assign → note → resolve an investigation
- dismissal that requires a reason
- overview filters and their reset
- budget-dependent planning → save → approve
- follow-up through evidence, outcome and close
- network list and node details
- running an evaluation
- CSV import, both rejected and accepted
- RHU report submission and clarification response at phone width
- the mobile navigation drawer

The responsive QA script loads 28 routes as four demo roles at 320, 375, 768, 1024 and 1440 px. It fails on horizontal page overflow, console errors, server errors, visible error states or a missing page heading. `scripts/find-overflow.mjs <width> <route>` helps locate an overflowing element.

## Design for clarity

The interface is built to stay simple for people without a data background:
- **Plain names.** Main menu items are Home, Concerns, Plan actions, Track actions, Network, Recovery and Data. Advanced pages sit under **More**.
- **One next step.** Each concern shows a four-step progress bar (Review → Verify → Act → Close) with a single main button; other actions are in a **More actions** menu.
- **Detail on demand.** Filters hide behind a **Filters** button, and long content sits in tabs or "Show more" sections. The planner suggests a plan automatically from the staff-hours you enter and explains it in one sentence.
- **Short guide.** Home shows a "How IRIS works" guide that can be dismissed.

## What is implemented

| Section | Purpose | Highlights |
|---|---|---|
| **Home** | What needs attention? | Work queue of concerns and follow-up actions (ID, unit, category, period, type, severity, status, updated, assignee), filters by period, province and status, overdue first. Also RHU task list with report submission, compact completeness trend, recently closed concerns, intervention updates |
| **Concerns** | Why was this flagged? | Searchable list; workspace answers *what happened / what evidence / what is uncertain / what next*; evidence labelled *Observed in dataset*, *Possible explanation*, *Requires verification*, *Confirmed by reviewer*, *Simulated example*; week-by-week timeline; method and uncertainty; review, confirm (reason required), dismiss (reason required), clarify, respond, assign, note, resolve, reopen; activity history; related issues; "Run detection" with method choice |
| **Network** | What might be connected? | Cytoscape graph (shape = unit type, border = status, line style = relationship type), legend, filters (province, type, week range, status), fit/zoom/reset, node details with reporting history, accessible list view |
| **Data** | What does the data show? | Records table that includes expected-but-not-received reports; search, filters, sort, pagination; record inspection with change history; small-multiple trends; data quality (blank vs zero vs not received, field missingness, duplicates, per-unit); metadata and provenance |
| **CSV import** | — | Upload → column mapping with preview → validation (row/column errors for dates, numbers, negatives, unknown units, duplicates; missingness summary) → required provenance (real / synthetic / unknown) → confirmation. Failed imports are logged with their errors |
| **Plan actions** | What should we do first? | Candidate actions from open concerns; budget; include/exclude; editable assumptions; exact budget-constrained optimization vs priority-first baseline; selection reasons; save draft; compare saved plans; approve or reject (reason required) |
| **Track actions** | What happened after we acted? | Proposed → approved → completed → outcome tracking; status transitions with rules (evidence required to complete, outcome required to close, reason required to cancel); notes, follow-up dates, outcomes labelled *not yet verified / observed / verified* and *simulated / observed / reviewer* |
| **Recovery** | Did reporting improve? | Completeness and timeliness over time, open vs closed concerns, time to resolution, before / during / after windows with Wilson 95% CIs and an explicit association-not-causation note; "Not calculable from this dataset" when schedules or timestamps are missing |
| **Model evaluation** (under More) | Is the method useful? | Run experiments from the UI; precision, recall, false-alarm rate, F1, event detection, detection delay; results by scenario type and severity; false-alarm sources; network vs no-network comparison; shared-cause attribution. Shows "Not evaluated yet" when no experiment exists |
| **Data sources** (under More) | Can I trust the data? | Datasets with provenance, designation, coverage, validation status, limitations and data dictionary; import history; reporting-unit metadata editing (admin); system activity log; demo scenario configuration |
| **Settings / Help** | — | Demo role, density, date format, larger text, reduced motion, link underlines, stronger focus, answer-key toggle, reset; glossary, status labels, metric and method definitions, limitations |

### Detection methods (`backend/iris/detection/`)

Every unit-week is assessed seven days after its due date. The *delay share* is (½ × late reports + reports not received) ÷ expected reports.

- **Statistical threshold**: robust z-score of the delay share against the unit's previous 8 weeks (median and MAD, floor 0.15). At least 6 weeks of history are required; otherwise a network-wide default baseline is used and the evidence says so.
- **Time-series (EWMA)**: an exponentially weighted moving average (λ = 0.5) of the delay share, compared with the same baseline.
- **Network-aware**: threshold z-score + 3 × the share of *connected* units that were also delayed. Connected means the same reporting hub or a shared-resource edge, and only relationships defined by the dataset count. A unit is flagged only if it has some delay of its own.
- **Shared by all methods**: incomplete records (≥ 50% of received reports blank or incomplete) and count drops (Poisson lower-tail p < 0.001 versus recent weeks, assessed only when most reports arrived). A count drop is never presented as proof of under-reporting.

Concerns group consecutive flagged weeks. When at least half of a hub's independent units are affected, or both units on a shared resource are, the network-aware method merges them into a *possible shared problem*.

### Evaluation (`backend/iris/evaluation/`)

Each replication re-simulates the network with randomly placed scenarios: a hub outage, a shared-resource failure, isolated problems, incomplete records, a count drop, a holiday delay and a genuine outbreak. Each scenario gets a random severity. All three methods run on identical data. Metrics are computed from that run only: nothing is hard-coded, and results are shown even where the network-aware method does worse. In the seeded run it has the best precision and false-alarm rate but lower recall for isolated problems.

### Intervention optimization (`backend/iris/optimization/`)

Benefit = expected weekly reports at affected units × planning horizon × assumed success probability. Cost = base hours + hours per unit × units. Selection is an exact multiple-choice knapsack over dependency-respecting action subsets per concern. A unit test checks it against brute force. The baseline takes actions in priority order. **All benefits are illustrative simulation assumptions**, editable in the UI and saved with each plan.

## Data provenance

- `DS-DEMO-FACILITY` — *IRIS demo — simulated facility reporting*. Generated by `backend/iris/data/simulate.py` with fixed seed `20260412`. It covers 26 weekly periods (Apr 6 – Oct 4, 2026) plus monthly summaries for 20 reporting units (14 RHUs, 4 hospitals, 2 laboratories) and 4 hubs in three fictional provinces (Masagana, Malaya, Tahimik). There are seven reporting categories with explicit schedules: not every unit reports every category, ILI comes from sentinel sites only, laboratories report confirmations only, and one category is monthly. Ten storyline scenarios are injected (`demo_scenarios` in `simulate.py`); each concern's *Simulation answer key* shows the ground truth.
- `DS-DEMO-PROVINCIAL` — *Simulated provincial weekly aggregates*. Province-level totals without facility IDs, schedules or timestamps (about 4% of cells deliberately blank). It shows how IRIS behaves when completeness and timeliness are not calculable.
- Imported datasets carry the origin the importer declares (real / synthetic / unknown). IRIS does not verify that declaration.

The demo storyline (reviews, dismissals, plans, outcomes) is played through the same service functions as the API, with timestamps on the simulated timeline. Actions you take are stamped with the current time.

## Architecture

```
backend/iris/
  api/            FastAPI routers (meta, concerns, data, interventions, analytics)
  schemas/        Pydantic request models
  models/         SQLAlchemy ORM: User, Role, Organization, ReportingUnit, ReportingRelationship, ReportingCategory,
                  Dataset, DataRecord, ReportingExpectation, ImportRecord, ReportingConcern, EvidenceItem,
                  Investigation, InvestigationNote, InterventionAction, InterventionPlan, InterventionAssignment,
                  InterventionOutcome, ExperimentRun, AuditEvent
  services/       slots (single definition of completeness/timeliness), concern builder & workflow,
                  interventions, recovery, network, overview, explorer, imports, reports, audit, context (roles)
  detection/      features + three methods
  optimization/   knapsack planner + baseline
  evaluation/     synthetic experiment runner
  data/           simulated world, simulator, seed/storyline
  tests/
frontend/src/
  app/            router, query client
  components/     ui/ (shadcn-style primitives on Radix), layout/, data-display/ (tables, filters, charts, badges)
  features/       overview, investigations, network, data-explorer, interventions, recovery, evaluation,
                  data-management, settings
  services/       typed API client      types/   API types      hooks/   session, preferences, toasts
  lib/            formatting, labels, role-aware navigation
```

All analytics run in the backend, so the frontend holds no duplicated business logic. Design tokens live in `frontend/src/index.css`, which removes Tailwind's default palette so only IRIS colors can be used. Charts use at most two series: deep teal solid and muted teal dashed. That pair was checked for colour-vision separation. Every chart has a data-table alternative, and wider comparisons use small multiples or labelled tables.

## Limitations

- **Prototype only.** Thresholds, scores and planning assumptions are tuned for the simulation and have not been validated on real surveillance data. Evaluation results come from synthetic scenarios with known answers.
- **No real authentication.** The demo role selector sends a user ID header. The server checks that role's permissions for every action, but anyone can pick any role.
- **Persistence.** Data lives in a local SQLite file (`backend/iris.db`; set `IRIS_DB_PATH` or `IRIS_DATABASE_URL` to change it). Staged CSV uploads are held in server memory and are lost on restart. Display preferences are stored in the browser's localStorage.
- **Scale.** Slot and detection computations are cached in memory per dataset and are sized for the demo, not for national data volumes.
- **Before/after comparisons show association, not causation.** Seeded outcomes are simulated and labelled as such.
- **Light theme only.**
- **Port.** The frontend dev server uses port 5180. If it is taken, run `npx vite --port <free port>` and add that origin to the CORS list in `backend/iris/main.py`. CORS is only needed when not using the proxy.
