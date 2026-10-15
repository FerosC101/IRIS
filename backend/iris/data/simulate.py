"""Deterministic simulation of weekly reporting with injected disruptions.

The simulator produces three things:

* ``records`` – submissions that were *received* (one row per unit, category
  and period). Submissions that never arrived are absent, exactly as in a real
  reporting system.
* ``expectations`` – the explicit reporting schedule (who should report what,
  how often).
* ``labels`` – simulation ground truth per unit-week, used only for evaluation
  and for the clearly labelled "simulation answer key" in the demo.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from iris import config
from iris.data.world import World

DISRUPTION_KINDS = ("hub_outage", "shared_resource", "isolated", "incomplete", "count_drop")
CONTEXT_KINDS = ("holiday", "outbreak")
SEVERITY_INTENSITY = {"high": 1.0, "medium": 0.65, "low": 0.4}

SCENARIO_KIND_LABELS = {
    "hub_outage": "Shared hub disruption",
    "shared_resource": "Shared connectivity / staff problem",
    "isolated": "Isolated unit problem",
    "incomplete": "Incomplete records",
    "count_drop": "Unexplained drop in reported counts",
    "holiday": "Holiday-week delay (not a reporting failure)",
    "outbreak": "Genuine case increase (not a reporting failure)",
}

# (on_time, late, missing, late_delay_days_range)
_TARGETS = {
    "hub_outage": (0.08, 0.32, 0.60, (4.0, 14.0)),
    "hub_outage_partial": (0.45, 0.45, 0.10, (1.5, 6.0)),
    "shared_resource": (0.08, 0.22, 0.70, (3.0, 12.0)),
    "isolated": (0.12, 0.38, 0.50, (2.0, 12.0)),
    "holiday": (0.30, 0.70, 0.00, (0.3, 2.5)),
}
_NORMAL_DELAY = (0.2, 4.0)
DEFAULT_DROP_CATEGORIES = ("DENGUE", "LEPTO", "AWD", "ILI")


@dataclass(frozen=True)
class Scenario:
    id: str
    kind: str
    units: tuple[str, ...]
    start_week: int
    end_week: int  # inclusive
    severity: str = "high"
    via: str | None = None
    partial_units: tuple[str, ...] = ()
    categories: tuple[str, ...] = ()
    description: str = ""

    @property
    def is_disruption(self) -> bool:
        return self.kind in DISRUPTION_KINDS

    @property
    def intensity(self) -> float:
        return SEVERITY_INTENSITY[self.severity]

    def active(self, unit_id: str, week: int) -> bool:
        return unit_id in self.units and self.start_week <= week <= self.end_week

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "kind_label": SCENARIO_KIND_LABELS[self.kind],
            "units": list(self.units),
            "start_week": self.start_week,
            "end_week": self.end_week,
            "severity": self.severity,
            "via": self.via,
            "partial_units": list(self.partial_units),
            "categories": list(self.categories),
            "description": self.description,
            "is_disruption": self.is_disruption,
        }


@dataclass
class SimulationResult:
    records: pd.DataFrame
    expectations: pd.DataFrame
    labels: pd.DataFrame
    scenarios: list[Scenario] = field(default_factory=list)


def _seasonal(code: str, week: int) -> float:
    if code == "DENGUE":
        return 1.0 + 1.6 * math.exp(-(((week - 17) / 5.0) ** 2))
    if code == "LEPTO":
        return 1.0 + 1.2 * math.exp(-(((week - 15) / 3.0) ** 2))
    if code == "ILI":
        return 1.0 + 0.4 * math.sin(week / 4.0)
    return 1.0


def _submission_probs(reliability: float, active: list[Scenario], unit_id: str) -> tuple[float, float, float, float, tuple[float, float]]:
    """Return (p_on_time, p_late, p_missing, disrupted_share, disrupted_delay_range)."""
    p = np.array([reliability, (1 - reliability) * 0.75, (1 - reliability) * 0.25])
    delay = _NORMAL_DELAY
    strength = 0.0
    for sc in active:
        key = sc.kind
        if sc.kind == "hub_outage" and unit_id in sc.partial_units:
            key = "hub_outage_partial"
        if key not in _TARGETS:
            continue
        target = np.array(_TARGETS[key][:3])
        i = sc.intensity
        if i > strength:
            p = p + i * (target - p)
            delay = _TARGETS[key][3]
            strength = i
    p = np.clip(p, 0, None)
    p = p / p.sum()
    return float(p[0]), float(p[1]), float(p[2]), strength, delay


def _draw_received_at(rng: np.random.Generator, due: datetime, p_on: float, p_late: float, strength: float, delay: tuple[float, float]) -> datetime | None:
    u = rng.random()
    if u < p_on:
        return (due - timedelta(hours=float(rng.uniform(0.5, 60)))).replace(microsecond=0)
    if u < p_on + p_late:
        rng_range = delay if rng.random() < strength else _NORMAL_DELAY
        return (due + timedelta(days=float(rng.uniform(*rng_range)))).replace(microsecond=0)
    return None


def _month_starts(n_weeks: int) -> list[date]:
    first = config.week_start(0)
    last = config.week_end(n_weeks - 1)
    out = []
    d = date(first.year, first.month, 1)
    if d < first:
        d = date(d.year + (d.month // 12), d.month % 12 + 1, 1)
    while True:
        nxt = date(d.year + (d.month // 12), d.month % 12 + 1, 1)
        if nxt - timedelta(days=1) > last:
            break
        out.append(d)
        d = nxt
    return out


def simulate(
    world: World,
    scenarios: list[Scenario],
    seed: int,
    n_weeks: int = config.N_WEEKS,
    as_of: datetime | None = config.AS_OF,
) -> SimulationResult:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    expectations: list[dict] = []
    label_rows: list[dict] = []
    period_first = config.week_start(0)
    period_last = config.week_end(n_weeks - 1)

    for unit in world.reporting_units:
        cats = world.expected_categories(unit)
        for c in cats:
            expectations.append({
                "reporting_unit_id": unit.id,
                "category_code": c.code,
                "frequency": c.frequency,
                "start_date": period_first,
                "end_date": period_last,
            })
        weekly = [c for c in cats if c.frequency == "weekly"]
        for t in range(n_weeks):
            active = [s for s in scenarios if s.active(unit.id, t)]
            disruption = [s for s in active if s.is_disruption]
            context = [s for s in active if not s.is_disruption]
            label_rows.append({
                "unit_id": unit.id,
                "week": t,
                "is_disruption": bool(disruption),
                "scenario_id": disruption[0].id if disruption else None,
                "kind": disruption[0].kind if disruption else None,
                "severity": disruption[0].severity if disruption else None,
                "context_kind": context[0].kind if context else None,
                "context_id": context[0].id if context else None,
            })
            if not weekly:
                continue
            due = config.weekly_due(t)
            p_on, p_late, _p_miss, strength, delay = _submission_probs(unit.reliability, active, unit.id)
            bundle_received = _draw_received_at(rng, due, p_on, p_late, strength, delay)
            incomplete = next((s for s in active if s.kind == "incomplete"), None)
            drop = next((s for s in active if s.kind == "count_drop"), None)
            outbreak = next((s for s in active if s.kind == "outbreak"), None)
            fields_complete = 1.0
            if incomplete:
                fields_complete = round(1 - incomplete.intensity * float(rng.uniform(0.3, 0.65)), 2)
            for c in weekly:
                lam = c.base_rate * unit.volume * _seasonal(c.code, t)
                if drop and c.code in (drop.categories or DEFAULT_DROP_CATEGORIES):
                    lam *= 1 - 0.95 * drop.intensity
                if outbreak and c.code in (outbreak.categories or ("DENGUE",)):
                    lam *= 1 + 2.5 * outbreak.intensity
                value = int(rng.poisson(lam))
                omitted = rng.random() < 0.015
                blank_p = 0.6 * incomplete.intensity if incomplete else 0.01
                blank = rng.random() < blank_p
                if bundle_received is None or omitted:
                    continue
                received = bundle_received + timedelta(minutes=int(rng.integers(0, 40)))
                if as_of is not None and received > as_of:
                    continue
                rows.append({
                    "reporting_unit_id": unit.id,
                    "category_code": c.code,
                    "frequency": "weekly",
                    "period_start": config.week_start(t),
                    "period_end": config.week_end(t),
                    "week": t,
                    "value": None if blank else float(value),
                    "value_status": "blank" if blank else ("zero" if value == 0 else "reported"),
                    "due_at": due,
                    "received_at": received,
                    "fields_complete": fields_complete if incomplete else 1.0,
                })
        for c in [c for c in cats if c.frequency == "monthly"]:
            for m in _month_starts(n_weeks):
                m_end = date(m.year + (m.month // 12), m.month % 12 + 1, 1) - timedelta(days=1)
                due_d = date(m_end.year + (m_end.month // 12), m_end.month % 12 + 1, config.MONTHLY_DUE_DAY)
                due = datetime(due_d.year, due_d.month, due_d.day, config.DUE_HOUR)
                t_due = min(config.week_index(due_d), n_weeks - 1)
                active = [s for s in scenarios if s.active(unit.id, t_due)]
                p_on, p_late, _p, strength, delay = _submission_probs(unit.reliability, active, unit.id)
                received = _draw_received_at(rng, due, p_on, p_late, strength, delay)
                value = int(rng.poisson(c.base_rate * unit.volume))
                if received is None or (as_of is not None and received > as_of):
                    continue
                rows.append({
                    "reporting_unit_id": unit.id,
                    "category_code": c.code,
                    "frequency": "monthly",
                    "period_start": m,
                    "period_end": m_end,
                    "week": None,
                    "value": float(value),
                    "value_status": "zero" if value == 0 else "reported",
                    "due_at": due,
                    "received_at": received,
                    "fields_complete": 1.0,
                })

    return SimulationResult(
        records=pd.DataFrame(rows),
        expectations=pd.DataFrame(expectations),
        labels=pd.DataFrame(label_rows),
        scenarios=list(scenarios),
    )


def demo_scenarios(world: World) -> list[Scenario]:
    """The fixed storyline injected into the demo dataset."""
    tahimik = tuple(world.hub_members("HUB-THM"))
    masagana = tuple(world.hub_members("HUB-MSG"))
    return [
        Scenario("S01-HOLIDAY-MSG", "holiday", masagana, 3, 3, "high", via="HUB-MSG",
                 description="Simulated public-holiday week: many Masagana units submitted one to two days late. Not a reporting failure."),
        Scenario("S02-ISO-LUNTIAN", "isolated", ("RHU-LUNTIAN",), 8, 10, "high",
                 description="Simulated staffing gap at Luntian RHU: reports missing or very late for three weeks."),
        Scenario("S03-OUTBREAK-HABAGAT", "outbreak", ("RHU-HABAGAT",), 11, 13, "high", categories=("DENGUE",),
                 description="Simulated genuine dengue increase at Habagat RHU. Counts return to normal afterwards."),
        Scenario("S04-INCOMPLETE-SAMPAGUITA", "incomplete", ("RHU-SAMPAGUITA",), 13, 15, "high",
                 description="Simulated form problem: Sampaguita RHU submitted on time but left many fields blank."),
        Scenario("S05-HUB-THM", "hub_outage", tahimik, 17, 19, "high", via="HUB-THM",
                 partial_units=("RHU-MAPAYAPA", "HOSP-THM"),
                 description="Simulated outage of the Tahimik Provincial Reporting Hub. Units reporting through it were late or missing."),
        Scenario("S06-SHARED-KALINAW", "shared_resource", ("RHU-KALINAW-1", "RHU-KALINAW-2"), 21, 23, "high",
                 via="shared_resource:RHU-KALINAW-1|RHU-KALINAW-2",
                 description="Simulated loss of the shared internet connection used by both Kalinaw RHUs."),
        Scenario("S07-DROP-TALA", "count_drop", ("RHU-TALA-1",), 21, 25, "high",
                 description="Simulated under-reporting: Tala RHU I submitted on time but reported near-zero case counts during the dengue season."),
        Scenario("S08-ISO-HIRAYA", "isolated", ("RHU-HIRAYA",), 23, 25, "high",
                 description="Simulated recurring delay at Hiraya RHU (e.g., encoder workload)."),
        Scenario("S09-INCOMPLETE-HOSPMLY", "incomplete", ("HOSP-MLY",), 24, 25, "medium",
                 description="Simulated incomplete forms from Malaya District Hospital."),
        Scenario("S10-ISO-SILANGAN", "isolated", ("RHU-SILANGAN",), 25, 25, "high",
                 description="Simulated missing latest report from Silangan RHU."),
    ]


def random_scenarios(world: World, rng: np.random.Generator, n_weeks: int = config.N_WEEKS) -> list[Scenario]:
    """Random scenario placement used by the evaluation experiments."""
    severities = ("high", "medium", "low")
    out: list[Scenario] = []
    used: dict[str, list[tuple[int, int]]] = {}

    def window(min_len: int, max_len: int) -> tuple[int, int]:
        length = int(rng.integers(min_len, max_len + 1))
        start = int(rng.integers(8, n_weeks - length + 1))
        return start, start + length - 1

    def free(unit: str, s: int, e: int) -> bool:
        return all(e < a - 1 or s > b + 1 for a, b in used.get(unit, []))

    def claim(units: tuple[str, ...], s: int, e: int) -> None:
        for u in units:
            used.setdefault(u, []).append((s, e))

    hubs = ["HUB-MSG", "HUB-MLY", "HUB-THM"]
    hub = hubs[int(rng.integers(len(hubs)))]
    members = world.hub_members(hub)
    s, e = window(2, 4)
    partial = tuple(m for m in members if rng.random() < 0.35)
    affected = tuple(m for m in members if rng.random() < 0.9 or m in partial)
    out.append(Scenario(f"R-HUB-{hub}", "hub_outage", affected, s, e, str(rng.choice(severities)), via=hub, partial_units=partial))
    claim(affected, s, e)

    pairs = [("RHU-TALA-1", "RHU-TALA-2"), ("RHU-KALINAW-1", "RHU-KALINAW-2"), ("RHU-MARIKIT", "RHU-BITUIN")]
    for _ in range(20):
        pair = pairs[int(rng.integers(len(pairs)))]
        s, e = window(2, 3)
        if all(free(u, s, e) for u in pair):
            out.append(Scenario(f"R-SHARED-{pair[0]}", "shared_resource", pair, s, e, str(rng.choice(severities)),
                                via="shared_resource:" + "|".join(sorted(pair))))
            claim(pair, s, e)
            break

    candidates = [u.id for u in world.reporting_units]
    rhus = [u.id for u in world.reporting_units if u.unit_type == "rhu"]

    def place(kind: str, pool: list[str], min_len: int, max_len: int, count: int, **kw) -> None:
        placed = 0
        for _ in range(60):
            if placed >= count:
                return
            unit = pool[int(rng.integers(len(pool)))]
            s, e = window(min_len, max_len)
            if free(unit, s, e):
                out.append(Scenario(f"R-{kind.upper()}-{unit}-{s}", kind, (unit,), s, e, str(rng.choice(severities)), **kw))
                claim((unit,), s, e)
                placed += 1

    place("isolated", candidates, 1, 3, 2)
    place("incomplete", candidates, 1, 3, 1)
    place("count_drop", rhus, 2, 4, 1)
    place("outbreak", rhus, 2, 3, 1, categories=("DENGUE",))

    prov_hub = hubs[int(rng.integers(len(hubs)))]
    hw = int(rng.integers(8, n_weeks))
    hol_units = tuple(m for m in world.hub_members(prov_hub) if free(m, hw, hw))
    if hol_units:
        out.append(Scenario(f"R-HOLIDAY-{prov_hub}-{hw}", "holiday", hol_units, hw, hw, "high", via=prov_hub))
    return out
