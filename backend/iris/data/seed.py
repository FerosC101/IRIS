"""Build the demo database: simulated network, data, concerns and storyline.

Everything here is synthetic. The storyline (reviews, dismissals, plans,
follow-ups) is played through the same service functions the API uses, with
timestamps placed on the simulated timeline.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
from sqlalchemy.orm import Session

from iris import config
from iris.data.simulate import DISRUPTION_KINDS, SCENARIO_KIND_LABELS, demo_scenarios, simulate
from iris.data.world import CATEGORIES, PROVINCE_HUB, RELATIONSHIP_TYPES, build_world
from iris.db import SessionLocal, create_all, drop_all
from iris.detection.methods import DetectionParams
from iris.evaluation.runner import EvaluationConfig, run_evaluation
from iris.models import (
    DataRecord,
    Dataset,
    ExperimentRun,
    InterventionAssignment,
    Organization,
    ReportingCategory,
    ReportingConcern,
    ReportingExpectation,
    ReportingRelationship,
    ReportingUnit,
    Role,
    User,
)
from iris.services import audit, checklist, concerns as cs, datasets, interventions as iv
from iris.services.clock import now, today
from iris.services.concern_builder import build_specs
from iris.services.context import ROLE_LABELS, Actor

ROLE_DESCRIPTIONS = {
    "rhu_staff": "Submits weekly reports, responds to clarification requests and records actions for their own unit.",
    "provincial_coordinator": "Reviews concerns across units in a province, assigns investigations and coordinates follow-up.",
    "resu_analyst": "Reviews patterns across the regional network, compares methods, prioritises corrective actions and approves plans.",
    "admin": "Imports and validates datasets, manages reporting-unit metadata and reviews system activity.",
}

USERS = [
    ("U-RHU-HIRAYA", "Hiraya RHU Encoder (demo)", "rhu_staff", "ORG-PESU-MSG", "RHU-HIRAYA", "Masagana"),
    ("U-RHU-KALINAW", "Kalinaw RHU I Nurse (demo)", "rhu_staff", "ORG-PESU-MLY", "RHU-KALINAW-1", "Malaya"),
    ("U-PROV-MLY", "Malaya Provincial Coordinator (demo)", "provincial_coordinator", "ORG-PESU-MLY", None, "Malaya"),
    ("U-PROV-MSG", "Masagana Provincial Coordinator (demo)", "provincial_coordinator", "ORG-PESU-MSG", None, "Masagana"),
    ("U-PROV-THM", "Tahimik Provincial Coordinator (demo)", "provincial_coordinator", "ORG-PESU-THM", None, "Tahimik"),
    ("U-RESU-1", "RESU Surveillance Analyst (demo)", "resu_analyst", "ORG-RESU", None, None),
    ("U-RESU-2", "RESU Epidemiologist (demo)", "resu_analyst", "ORG-RESU", None, None),
    ("U-ADMIN", "Data Manager (demo)", "admin", "ORG-RESU", None, None),
]

DEMO_DICTIONARY = [
    {"field": "reporting_unit_id", "label": "Reporting unit", "description": "Simulated reporting unit that submitted the report."},
    {"field": "category_code", "label": "Reporting category", "description": "Disease or reporting category (see Settings → Help for definitions)."},
    {"field": "period_start / period_end", "label": "Reporting period", "description": "Monday–Sunday for weekly categories; calendar month for monthly summaries."},
    {"field": "value", "label": "Reported value", "description": "Count reported by the unit. Empty when the field was left blank."},
    {"field": "value_status", "label": "Value status", "description": "reported (>0), zero (explicit zero report) or blank (field left empty). Blank is never treated as zero."},
    {"field": "due_at", "label": "Due date", "description": "Weekly: Tuesday 17:00 after the week. Monthly: the 5th of the next month, 17:00."},
    {"field": "received_at", "label": "Received", "description": "When the report arrived (simulated). Missing reports have no record."},
    {"field": "fields_complete", "label": "Form completeness", "description": "Share of required form fields completed (0–1)."},
]


def _actor(uid: str) -> Actor:
    u = next(x for x in USERS if x[0] == uid)
    return Actor(u[0], u[2], u[1], u[4], u[5])


def build(session: Session, scenario_ids: list[str] | None = None, seed: int = config.DEMO_SEED, run_experiment: bool = True) -> dict:
    world = build_world()
    scenarios = demo_scenarios(world)
    if scenario_ids is not None:
        scenarios = [s for s in scenarios if s.id in set(scenario_ids)]
    sim = simulate(world, scenarios, seed)
    seeded_at = now()

    for rid, label in ROLE_LABELS.items():
        session.add(Role(id=rid, name=label, description=ROLE_DESCRIPTIONS[rid]))
    session.add(Organization(id="ORG-RESU", name="Simulated Regional Epidemiology and Surveillance Unit", level="regional"))
    for prov, hub in PROVINCE_HUB.items():
        session.add(Organization(id=f"ORG-PESU-{hub[-3:]}", name=f"{prov} Provincial Surveillance Office (simulated)", level="provincial", province=prov, parent_id="ORG-RESU"))
    for c in CATEGORIES:
        session.add(ReportingCategory(code=c.code, name=c.name, description=c.description, frequency=c.frequency))
    for u in world.units:
        org = f"ORG-PESU-{PROVINCE_HUB[u.province][-3:]}" if u.id not in ("HOSP-REG", "LAB-REG", "HUB-REG") else "ORG-RESU"
        session.add(ReportingUnit(id=u.id, name=u.name, unit_type=u.unit_type, province=u.province, municipality=u.municipality,
                                  organization_id=org, active=True, is_sentinel=u.is_sentinel, x=u.x, y=u.y,
                                  geo_x=u.geo_x, geo_y=u.geo_y, simulated=True))
    session.flush()
    for uid, name, role, org, unit, prov in USERS:
        session.add(User(id=uid, display_name=name, role_id=role, organization_id=org, reporting_unit_id=unit, province=prov))

    first, last = config.week_start(0), config.week_end(config.N_WEEKS - 1)
    session.add(Dataset(
        id=config.DEMO_DATASET_ID, name="IRIS demo — simulated facility reporting",
        description="Weekly and monthly submissions from a simulated network of RHUs, hospitals and laboratories, with injected reporting disruptions.",
        source=f"Generated by the IRIS simulator (seed {seed}). No real facility, patient or government data.",
        designation="synthetic", geographic_level="facility", imported_at=seeded_at, imported_by=None,
        coverage_start=first, coverage_end=last, row_count=len(sim.records), validation_status="valid",
        known_limitations=[
            "All units, places and relationships are fictional.",
            "Disruptions were injected deliberately to demonstrate the workflow; their frequency is not realistic.",
            "Reports received after the snapshot date are treated as not yet received.",
            "Case counts follow simple seasonal Poisson patterns and are not epidemiological estimates.",
        ],
        has_expectations=True, has_timestamps=True, has_units=True, data_dictionary=DEMO_DICTIONARY, column_mapping={}, is_demo=True,
    ))
    session.add(Dataset(
        id=config.DEMO_AGGREGATE_DATASET_ID, name="Simulated provincial weekly aggregates",
        description="Province-level weekly totals for dengue and leptospirosis, without facility detail or timestamps.",
        source=f"Aggregated from the simulated facility dataset (seed {seed}), with some cells blanked deliberately.",
        designation="synthetic", geographic_level="province", imported_at=seeded_at, imported_by=None,
        coverage_start=first, coverage_end=last, row_count=0, validation_status="valid_with_warnings",
        known_limitations=[
            "No reporting schedule: completeness cannot be calculated.",
            "No due/received timestamps: timeliness cannot be calculated.",
            "No facility identifiers: network analysis is not available.",
            "About 4% of cells were blanked to demonstrate missing-value handling.",
        ],
        has_expectations=False, has_timestamps=False, has_units=False,
        data_dictionary=[
            {"field": "area", "label": "Province", "description": "Simulated province."},
            {"field": "category_code", "label": "Category", "description": "DENGUE or LEPTO."},
            {"field": "period_start", "label": "Week start", "description": "Monday of the reporting week."},
            {"field": "value", "label": "Total cases", "description": "Sum of received facility reports. Blank where the cell was not reported."},
        ],
        column_mapping={}, is_demo=True,
    ))
    session.flush()
    for e in world.edges:
        session.add(ReportingRelationship(id=e.id, dataset_id=config.DEMO_DATASET_ID, source_id=e.source, target_id=e.target,
                                          relationship_type=e.relationship_type, description=e.description, simulated=True))
    for r in sim.expectations.itertuples(index=False):
        session.add(ReportingExpectation(dataset_id=config.DEMO_DATASET_ID, reporting_unit_id=r.reporting_unit_id, category_code=r.category_code,
                                         frequency=r.frequency, start_date=r.start_date, end_date=r.end_date))
    for r in sim.records.itertuples(index=False):
        session.add(DataRecord(dataset_id=config.DEMO_DATASET_ID, reporting_unit_id=r.reporting_unit_id, area=world.unit_by_id[r.reporting_unit_id].province,
                               category_code=r.category_code, period_start=r.period_start, period_end=r.period_end,
                               value=None if r.value is None or (isinstance(r.value, float) and np.isnan(r.value)) else float(r.value),
                               value_status=r.value_status, due_at=r.due_at.to_pydatetime() if hasattr(r.due_at, "to_pydatetime") else r.due_at,
                               received_at=r.received_at.to_pydatetime() if hasattr(r.received_at, "to_pydatetime") else r.received_at,
                               fields_complete=float(r.fields_complete)))
    # Province aggregates
    rng = np.random.default_rng(seed + 1)
    agg = sim.records[(sim.records["frequency"] == "weekly") & sim.records["category_code"].isin(["DENGUE", "LEPTO"])].copy()
    agg["province"] = agg["reporting_unit_id"].map(lambda u: world.unit_by_id[u].province)
    n_agg = 0
    for (prov, cat, ps), g in agg.groupby(["province", "category_code", "period_start"]):
        blank = rng.random() < 0.04
        total = float(g["value"].fillna(0).sum())
        session.add(DataRecord(dataset_id=config.DEMO_AGGREGATE_DATASET_ID, reporting_unit_id=None, area=prov, category_code=cat,
                               period_start=ps, period_end=ps + timedelta(days=6), value=None if blank else total,
                               value_status="blank" if blank else ("zero" if total == 0 else "reported")))
        n_agg += 1
    session.get(Dataset, config.DEMO_AGGREGATE_DATASET_ID).row_count = n_agg
    session.flush()
    datasets.bump()

    # Detection -> concerns, each created on the review date of the week its flag was raised
    results = datasets.detection(session, config.DEMO_DATASET_ID, "network")
    sl = datasets.slots(session, config.DEMO_DATASET_ID)
    units = {u.id: {"name": u.name, "province": u.province} for u in world.units}
    specs = build_specs(results, sl, datasets.peer_groups(session, config.DEMO_DATASET_ID), units, datasets.case_categories(session), "network", DetectionParams())
    created: list[ReportingConcern] = []
    for spec in specs:
        at = min(config.weekly_due(spec.detection_week) + timedelta(hours=16), config.AS_OF - timedelta(hours=1))
        c = cs.create_from_spec(session, spec, config.DEMO_DATASET_ID, at)
        match = next((s for s in scenarios if s.start_week <= spec.w1 and spec.w0 <= s.end_week + (3 if s.kind == "outbreak" else 0)
                      and set(s.units) & set(spec.unit_ids)), None)
        if match:
            c.scenario_ref = match.id
            c.evidence.append(_answer_key(match))
        else:
            c.evidence.append(_answer_key(None))
        created.append(c)
    session.flush()
    _storyline(session, created, scenarios)
    session.flush()

    if run_experiment:
        res = run_evaluation(EvaluationConfig(replications=20))
        session.add(ExperimentRun(id="E-0001", name="Demo setup evaluation (20 replications)", created_at=now(), created_by=None,
                                  status="completed", config=res["config"], results=res, duration_ms=int(res["elapsed_seconds"] * 1000)))
    audit.record(session, None, "system", "demo", "demo.seeded",
                 f"Demo data generated (seed {seed}, {len(scenarios)} scenarios, {len(created)} concerns).", {"seed": seed, "scenarios": [s.id for s in scenarios]})
    session.commit()
    datasets.bump()
    return {"concerns": len(created), "records": int(len(sim.records)), "scenarios": [s.id for s in scenarios]}


def _answer_key(sc):
    from iris.models import EvidenceItem
    if sc is None:
        return EvidenceItem(kind="simulated_example", title="Simulation answer key (demo only)",
                            detail="No disruption was injected for these units and weeks. In the simulation's ground truth, this flag is a false alarm caused by ordinary random variation.",
                            data={"scenario": None}, created_at=now())
    verdict = "a real reporting disruption" if sc.is_disruption else "NOT a reporting failure"
    return EvidenceItem(kind="simulated_example", title="Simulation answer key (demo only)",
                        detail=f"Injected scenario {sc.id} — {SCENARIO_KIND_LABELS[sc.kind]}: {sc.description} In the ground truth this is {verdict}.",
                        data={"scenario": sc.as_dict()}, created_at=now())


def _h(base: datetime, hours: float) -> datetime:
    return base + timedelta(hours=hours)


def _prov_actor(c: ReportingConcern) -> Actor:
    return _actor({"Malaya": "U-PROV-MLY", "Masagana": "U-PROV-MSG", "Tahimik": "U-PROV-THM"}.get(c.province or "", "U-RESU-1"))


def _plan(session: Session, actor: Actor, name: str, action_ids: list[str], at: datetime, approve_at: datetime | None, approver: Actor):
    iv.sync_actions(session)
    cost = sum(c.cost_hours for c in iv.costed(session, [session.get(iv.InterventionAction, a) for a in action_ids], iv.merge_assumptions(None)))
    plan = iv.save_plan(session, actor, name, "manual", max(cost, 1.0), action_ids, None, at=at)
    if approve_at:
        iv.decide_plan(session, approver, plan, "approve", "Approved for the demo storyline (simulated).", at=approve_at)
    return plan


def _assignment(session: Session, action_id: str) -> InterventionAssignment:
    from sqlalchemy import select
    return session.execute(select(InterventionAssignment).where(InterventionAssignment.action_id == action_id)).scalar_one()


def _storyline(session: Session, created: list[ReportingConcern], scenarios) -> None:
    resu, resu2 = _actor("U-RESU-1"), _actor("U-RESU-2")
    by_ref: dict[str, ReportingConcern] = {}
    for c in created:
        if c.scenario_ref and c.scenario_ref not in by_ref:
            by_ref[c.scenario_ref] = c
    handled: set[str] = set()

    def story(ref: str):
        c = by_ref.get(ref)
        if c is not None:
            handled.add(c.id)
        return c

    if c := story("S01-HOLIDAY-MSG"):
        t = c.created_at
        cs.mark_for_review(session, c, resu, at=_h(t, 2))
        cs.dismiss(session, c, resu, "Confirmed with the Masagana hub: reports were delayed by the public holiday and all arrived within two days. Not a reporting failure.", at=_h(t, 30))

    if c := story("S02-ISO-LUNTIAN"):
        p, t = _prov_actor(c), c.created_at
        cs.mark_for_review(session, c, p, at=_h(t, 3))
        cs.request_clarification(session, c, p, "Weekly reports for these weeks were not received. Were they prepared? Please describe any staffing or connectivity problem.", None, at=_h(t, 4))
        cs.respond_clarification(session, c, p, "Phone call with the RHU (simulated): the only encoder was on leave; paper forms were kept and will be encoded on return.", at=_h(t, 40))
        cs.confirm(session, c, p, "The RHU confirmed reports were not transmitted because the encoder was on leave.", at=_h(t, 42))
        cs.assign(session, c, p, p.user_id, None, at=_h(t, 42))
        cs.attach_evidence(session, c, p, "Backlog received", "The missing weekly reports for these weeks were received after the encoder returned (simulated).", at=_h(t, 24 * 12 - 2))
        _resolve(session, c, p, "Backlog was encoded after the encoder returned; a back-up encoder was named (simulated outcome).", at=_h(t, 24 * 12))

    if c := story("S03-OUTBREAK-HABAGAT"):
        p, t = _prov_actor(c), c.created_at
        cs.mark_for_review(session, c, p, at=_h(t, 5))
        cs.dismiss(session, c, p, "Counts returned to usual levels after a genuine dengue increase; registers match the reports. Not under-reporting.", at=_h(t, 50))

    if c := story("S04-INCOMPLETE-SAMPAGUITA"):
        p, t = _prov_actor(c), c.created_at
        cs.mark_for_review(session, c, p, at=_h(t, 2))
        cs.confirm(session, c, p, "Reviewed the received forms: case-count fields were blank in most reports for these weeks.", at=_h(t, 20))
        cs.assign(session, c, resu2, resu2.user_id, None, at=_h(t, 22))
        plan = _plan(session, resu2, "Sampaguita form validation", [f"A-{c.id}-validation_review"], _h(t, 24), _h(t, 28), resu)
        asg = _assignment(session, f"A-{c.id}-validation_review")
        iv.update_assignment(session, resu2, asg, "in_progress", "Called the RHU and reviewed the form template together (simulated).", None, None, at=_h(t, 50))
        iv.update_assignment(session, resu2, asg, "completed", None, "Template fields were hidden after a software update; template restored (simulated).", None, at=_h(t, 24 * 4))
        iv.record_outcome(session, resu2, asg, "verified", "Simulated outcome: subsequent reports from the unit had complete fields (reviewer check of later forms).", at=_h(t, 24 * 14), source="simulated")
        iv.update_assignment(session, resu2, asg, "closed", "Closed after reviewing later forms.", None, None, at=_h(t, 24 * 14))
        cs.attach_evidence(session, c, resu2, "Later forms reviewed", "Forms submitted after the template fix had every required field completed (simulated reviewer check).", at=_h(t, 24 * 15 - 2))
        _resolve(session, c, resu2, "Form template corrected; later reports complete. Recorded as a simulated outcome.", at=_h(t, 24 * 15))

    if c := story("S05-HUB-THM"):
        t = c.created_at
        cs.mark_for_review(session, c, resu, at=_h(t, 1))
        cs.confirm(session, c, resu, "The Tahimik hub reported that its upload service failed for three weeks (simulated). Five units were affected.", at=_h(t, 24 * 9))
        cs.assign(session, c, resu, resu.user_id, None, at=_h(t, 24 * 9))
        plan = _plan(session, resu, "Restore Tahimik hub reporting", [f"A-{c.id}-restore_connection", f"A-{c.id}-verify_contact"], _h(t, 24 * 9 + 2), _h(t, 24 * 9 + 4), resu2)
        for aid, done_h, ev, outcome in (
            (f"A-{c.id}-restore_connection", 24 * 12, "Hub upload service restored; queued reports re-sent (simulated).",
             ("observed_unverified", "Simulated outcome: completeness for the affected units rose in the following weeks. Not yet verified by a reviewer.")),
            (f"A-{c.id}-verify_contact", 24 * 11, "All five units confirmed their reports were prepared on time (simulated).",
             ("not_yet_verified", "Units confirmed by phone; outcome not yet verified against later reporting.")),
        ):
            asg = _assignment(session, aid)
            iv.update_assignment(session, resu, asg, "in_progress", "Work started (simulated).", None, None, at=_h(t, 24 * 10))
            iv.update_assignment(session, resu, asg, "completed", None, ev, None, at=_h(t, done_h))
            iv.record_outcome(session, resu, asg, outcome[0], outcome[1], at=_h(t, done_h + 24 * 14), source="simulated")
        cs.attach_evidence(session, c, resu, "Hub upload log", "The hub's upload service log shows the queued reports re-sent after the repair (simulated).", at=_h(t, 24 * 26 - 2))
        _resolve(session, c, resu, "Hub connection restored and backlog received. Simulated outcome; see Recovery Analytics for before/after reporting.", at=_h(t, 24 * 26))

    if c := story("S06-SHARED-KALINAW"):
        p, t = _actor("U-PROV-MLY"), c.created_at
        cs.mark_for_review(session, c, p, at=_h(t, 2))
        cs.confirm(session, c, p, "Both Kalinaw RHUs confirmed their shared internet connection has been down (simulated).", at=_h(t, 26))
        cs.assign(session, c, p, p.user_id, None, at=_h(t, 26))
        _plan(session, p, "Kalinaw shared connection", [f"A-{c.id}-restore_connection", f"A-{c.id}-verify_contact"], _h(t, 27), _h(t, 30), resu)
        asg = _assignment(session, f"A-{c.id}-verify_contact")
        iv.update_assignment(session, p, asg, "in_progress", "Called both units (simulated).", None, None, at=_h(t, 32))
        iv.update_assignment(session, p, asg, "completed", None, "Both units confirmed paper reports are ready to encode (simulated).", None, at=_h(t, 48))
        iv.record_outcome(session, p, asg, "not_yet_verified", "Reports not yet received; outcome not yet verified.", at=_h(t, 50), source="simulated")
        asg = _assignment(session, f"A-{c.id}-restore_connection")
        iv.update_assignment(session, resu, asg, "in_progress", "Service provider ticket opened (simulated).", None, None, at=_h(t, 36))
        asg.due_date = today() - timedelta(days=3)
        asg.follow_up_date = today() + timedelta(days=4)

    if c := story("S07-DROP-TALA"):
        p, t = _actor("U-PROV-MSG"), c.created_at
        cs.mark_for_review(session, c, p, at=_h(t, 4))
        cs.request_clarification(session, c, p, "Reported dengue, leptospirosis and diarrhea counts dropped to near zero. Please compare these weeks with your case registers.",
                                 today() + timedelta(days=2), at=_h(t, 6))
        _plan_reject(session, c, p, resu, t)

    if c := story("S08-ISO-HIRAYA"):
        p, t = _actor("U-PROV-MSG"), c.created_at
        cs.mark_for_review(session, c, p, at=_h(t, 3))
        cs.request_clarification(session, c, p, "Weekly reports for the latest weeks have not been received. Were they prepared? Is there a problem with encoding or connectivity?",
                                 today() + timedelta(days=1), at=_h(t, 5))

    if c := story("S09-INCOMPLETE-HOSPMLY"):
        p = _actor("U-PROV-MLY")
        iv.sync_actions(session)
        iv.save_plan(session, p, "Draft — Malaya District Hospital forms", "manual", 10, [f"A-{c.id}-validation_review"], None,
                     notes="Waiting for the hospital's records officer before submitting for approval.", at=_h(c.created_at, 20))

    story("S10-ISO-SILANGAN")  # left new

    if c := story("S11-ZERO-TALA2"):
        # Mirrors a verification in progress: receipt and identity checked, the zero count not yet verified.
        p, t = _actor("U-PROV-MSG"), c.created_at
        cs.mark_for_review(session, c, resu, at=_h(t, 0.25))
        cs.assign(session, c, resu, resu2.user_id, None, note="Zero-case run during the dengue season; verify before drawing any conclusion.", at=_h(t, 0.5))
        steps = checklist.items(session, c.id)
        checklist.update(session, c, resu, steps[0].id, True, "All three weekly reports were received on time.", at=_h(t, 0.75))
        checklist.update(session, c, resu2, steps[1].id, True, "Unit ID matches the registry.", at=_h(t, 1))
        cs.add_note(session, c, p, "The RHU nurse will check the dengue register this afternoon.", at=_h(t, 1.5))

    # Background flags (no injected disruption)
    for c in created:
        if c.id in handled:
            continue
        p, t = _prov_actor(c), c.created_at
        if c.week_end_index <= 18:
            cs.mark_for_review(session, c, p, at=_h(t, 6))
            if c.concern_type in ("missing_submission", "late_report"):
                cs.confirm(session, c, p, "The unit confirmed the reports were delayed by a one-off problem.", at=_h(t, 20))
                cs.attach_evidence(session, c, p, "Late reports received", "The delayed reports arrived after the review date (see the records for these weeks).", at=_h(t, 28))
                _resolve(session, c, p, "Reports were received after the review date; the unit explained a one-off delay. No recurring problem.", at=_h(t, 30))
            else:
                cs.dismiss(session, c, p, "Checked with the unit: values are correct and the pattern is explained. No reporting problem.", at=_h(t, 30))
        elif c.week_end_index <= 22:
            cs.mark_for_review(session, c, p, at=_h(t, 6))


def _resolve(session: Session, c: ReportingConcern, actor: Actor, summary: str, at: datetime) -> None:
    """Tick the remaining checks, then resolve (which records the finding step)."""
    for i, step in enumerate(checklist.items(session, c.id)):
        if step.kind == "check" and not step.done:
            checklist.update(session, c, actor, step.id, True, None, at=at - timedelta(minutes=30 - i))
    cs.resolve(session, c, actor, summary, at=at)


def _plan_reject(session: Session, c: ReportingConcern, p: Actor, approver: Actor, t: datetime) -> None:
    iv.sync_actions(session)
    aid = f"A-{c.id}-verify_contact"
    aid2 = f"A-{c.id}-validation_review"
    plan = iv.save_plan(session, p, "Tala RHU I count review", "manual", 20, [aid, aid2], None, at=_h(t, 8))
    iv.decide_plan(session, approver, plan, "reject", "Wait for the unit's clarification before committing analyst time to a validation review.", at=_h(t, 30))


def reset(scenario_ids: list[str] | None = None, run_experiment: bool = True) -> dict:
    datasets.bump()
    drop_all()
    create_all()
    with SessionLocal() as session:
        return build(session, scenario_ids, run_experiment=run_experiment)


def ensure_seeded() -> None:
    create_all()
    with SessionLocal() as session:
        if session.get(Dataset, config.DEMO_DATASET_ID) is None:
            build(session)
