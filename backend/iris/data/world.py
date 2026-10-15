"""Simulated reporting network topology.

Every unit, area name and relationship here is fictional. The province and
municipality names are invented and do not describe real Philippine local
government units or facilities.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import cached_property

import networkx as nx

UNIT_TYPES = ("rhu", "hospital", "laboratory", "hub")

RELATIONSHIP_TYPES = {
    "reports_through": "Submits its weekly reports through this hub (simulated reporting pathway).",
    "specimen_referral": "Sends specimens to this laboratory for confirmation (simulated).",
    "shared_resource": "Shares an encoder and internet connection with this unit (simulated).",
}


@dataclass(frozen=True)
class SimUnit:
    id: str
    name: str
    unit_type: str
    province: str
    municipality: str | None
    is_sentinel: bool = False
    #: Probability a weekly report is submitted on time under normal conditions.
    reliability: float = 0.92
    #: Relative case volume (scales simulated counts).
    volume: float = 1.0
    x: float = 0.0
    y: float = 0.0


@dataclass(frozen=True)
class SimEdge:
    id: str
    source: str
    target: str
    relationship_type: str
    description: str


@dataclass(frozen=True)
class SimCategory:
    code: str
    name: str
    description: str
    frequency: str  # weekly | monthly
    unit_types: tuple[str, ...]
    sentinel_only: bool = False
    #: Base weekly mean count per unit of volume.
    base_rate: float = 1.0
    #: Whether the category counts disease cases (used by the count-drop check).
    is_case_count: bool = True


CATEGORIES: tuple[SimCategory, ...] = (
    SimCategory("DENGUE", "Dengue", "Suspected and confirmed dengue cases reported in the week.", "weekly", ("rhu", "hospital"), base_rate=2.2),
    SimCategory("MEASLES", "Measles", "Suspected measles cases reported in the week. Zero reports are common.", "weekly", ("rhu", "hospital"), base_rate=0.25),
    SimCategory("LEPTO", "Leptospirosis", "Suspected leptospirosis cases reported in the week.", "weekly", ("rhu", "hospital"), base_rate=0.6),
    SimCategory("AWD", "Acute watery diarrhea", "Acute watery diarrhea cases reported in the week.", "weekly", ("rhu",), base_rate=3.0),
    SimCategory("ILI", "Influenza-like illness (sentinel)", "ILI consultations reported by sentinel sites only.", "weekly", ("rhu", "hospital"), sentinel_only=True, base_rate=5.0),
    SimCategory("LABCONF", "Laboratory confirmations", "Laboratory-confirmed results released in the week.", "weekly", ("laboratory",), base_rate=8.0),
    SimCategory("MCS", "Monthly consultation summary", "Total outpatient consultations reported once per month.", "monthly", ("rhu",), base_rate=320.0, is_case_count=False),
)
CATEGORY_BY_CODE = {c.code: c for c in CATEGORIES}

PROVINCES = {
    "Masagana": ("Hiraya", "Tala", "Amihan", "Liwayway"),
    "Malaya": ("Habagat", "Kalinaw", "Silangan", "Luntian"),
    "Tahimik": ("Marikit", "Bituin", "Mapayapa", "Sampaguita"),
}
PROVINCE_HUB = {"Masagana": "HUB-MSG", "Malaya": "HUB-MLY", "Tahimik": "HUB-THM"}
REGIONAL_HUB = "HUB-REG"


def _units() -> list[SimUnit]:
    u: list[SimUnit] = [
        # Masagana
        SimUnit("RHU-HIRAYA", "Hiraya RHU", "rhu", "Masagana", "Hiraya", True, 0.93, 1.4),
        SimUnit("RHU-TALA-1", "Tala RHU I", "rhu", "Masagana", "Tala", False, 0.92, 1.3),
        SimUnit("RHU-TALA-2", "Tala RHU II", "rhu", "Masagana", "Tala", False, 0.90, 0.8),
        SimUnit("RHU-AMIHAN", "Amihan RHU", "rhu", "Masagana", "Amihan", False, 0.94, 1.0),
        SimUnit("RHU-LIWAYWAY", "Liwayway RHU", "rhu", "Masagana", "Liwayway", False, 0.89, 0.7),
        SimUnit("HOSP-MSG", "Masagana Provincial Hospital", "hospital", "Masagana", "Hiraya", True, 0.95, 2.2),
        # Malaya
        SimUnit("RHU-HABAGAT", "Habagat RHU", "rhu", "Malaya", "Habagat", False, 0.93, 1.2),
        SimUnit("RHU-KALINAW-1", "Kalinaw RHU I", "rhu", "Malaya", "Kalinaw", False, 0.91, 1.1),
        SimUnit("RHU-KALINAW-2", "Kalinaw RHU II", "rhu", "Malaya", "Kalinaw", False, 0.90, 0.7),
        SimUnit("RHU-SILANGAN", "Silangan RHU", "rhu", "Malaya", "Silangan", True, 0.94, 1.0),
        SimUnit("RHU-LUNTIAN", "Luntian RHU", "rhu", "Malaya", "Luntian", False, 0.90, 0.9),
        SimUnit("HOSP-MLY", "Malaya District Hospital", "hospital", "Malaya", "Silangan", True, 0.94, 1.8),
        SimUnit("LAB-MLY", "Malaya Provincial Laboratory", "laboratory", "Malaya", "Silangan", False, 0.96, 0.8),
        # Tahimik
        SimUnit("RHU-MARIKIT", "Marikit RHU", "rhu", "Tahimik", "Marikit", False, 0.92, 1.1),
        SimUnit("RHU-BITUIN", "Bituin RHU", "rhu", "Tahimik", "Bituin", True, 0.93, 1.0),
        SimUnit("RHU-MAPAYAPA", "Mapayapa RHU", "rhu", "Tahimik", "Mapayapa", False, 0.91, 0.9),
        SimUnit("RHU-SAMPAGUITA", "Sampaguita RHU", "rhu", "Tahimik", "Sampaguita", False, 0.92, 1.0),
        SimUnit("HOSP-THM", "Tahimik Provincial Hospital", "hospital", "Tahimik", "Marikit", True, 0.95, 2.0),
        # Regional
        SimUnit("HOSP-REG", "Regional Medical Center", "hospital", "Masagana", "Amihan", True, 0.96, 2.6),
        SimUnit("LAB-REG", "Regional Reference Laboratory", "laboratory", "Masagana", "Amihan", False, 0.96, 1.4),
        # Hubs (pass-through; they do not submit category reports)
        SimUnit("HUB-MSG", "Masagana Provincial Reporting Hub", "hub", "Masagana", None),
        SimUnit("HUB-MLY", "Malaya Provincial Reporting Hub", "hub", "Malaya", None),
        SimUnit("HUB-THM", "Tahimik Provincial Reporting Hub", "hub", "Tahimik", None),
        SimUnit("HUB-REG", "Regional Reporting Hub", "hub", "Masagana", None),
    ]
    return u


def _edges(units: list[SimUnit]) -> list[SimEdge]:
    edges: list[SimEdge] = []

    def add(src: str, dst: str, kind: str, desc: str | None = None) -> None:
        edges.append(SimEdge(f"E-{kind[:3].upper()}-{src}-{dst}", src, dst, kind, desc or RELATIONSHIP_TYPES[kind]))

    for unit in units:
        if unit.unit_type in ("rhu",) or unit.id in ("HOSP-MSG", "HOSP-MLY", "HOSP-THM"):
            add(unit.id, PROVINCE_HUB[unit.province], "reports_through")
    for hub in PROVINCE_HUB.values():
        add(hub, REGIONAL_HUB, "reports_through", "Provincial hub forwards consolidated reports to the regional hub (simulated).")
    for direct in ("HOSP-REG", "LAB-REG", "LAB-MLY"):
        add(direct, REGIONAL_HUB, "reports_through")

    for hosp in ("HOSP-MSG", "HOSP-THM", "HOSP-REG"):
        add(hosp, "LAB-REG", "specimen_referral")
    for src in ("RHU-HIRAYA", "RHU-BITUIN"):
        add(src, "LAB-REG", "specimen_referral")
    for src in ("HOSP-MLY", "RHU-SILANGAN", "RHU-HABAGAT", "RHU-KALINAW-1", "RHU-LUNTIAN"):
        add(src, "LAB-MLY", "specimen_referral")
    add("LAB-MLY", "LAB-REG", "specimen_referral", "Forwards specimens for confirmatory testing (simulated).")

    for a, b in (("RHU-TALA-1", "RHU-TALA-2"), ("RHU-KALINAW-1", "RHU-KALINAW-2"), ("RHU-MARIKIT", "RHU-BITUIN")):
        add(a, b, "shared_resource")
    return edges


def _layout(units: list[SimUnit], edges: list[SimEdge]) -> list[SimUnit]:
    """Deterministic radial layout: regional hub at centre, provinces around it."""
    angles = {"Masagana": -90.0, "Malaya": 30.0, "Tahimik": 150.0}
    positions: dict[str, tuple[float, float]] = {REGIONAL_HUB: (0.0, 0.0)}
    for prov, hub in PROVINCE_HUB.items():
        a = math.radians(angles[prov])
        hx, hy = 300 * math.cos(a), 300 * math.sin(a)
        positions[hub] = (hx, hy)
        members = [u for u in units if u.province == prov and any(e.source == u.id and e.target == hub for e in edges)]
        n = len(members)
        for i, m in enumerate(members):
            offset = math.radians(-75 + (150 * i / max(n - 1, 1)))
            positions[m.id] = (hx + 190 * math.cos(a + offset), hy + 190 * math.sin(a + offset))
    positions["HOSP-REG"] = (-150.0, 40.0)
    positions["LAB-REG"] = (150.0, 40.0)
    mx, my = positions["HUB-MLY"]
    positions["LAB-MLY"] = (mx * 0.45, my * 0.45 + 95)
    out = []
    for u in units:
        x, y = positions.get(u.id, (0.0, 0.0))
        out.append(SimUnit(**{**u.__dict__, "x": round(x, 1), "y": round(y, 1)}))
    return out


@dataclass
class World:
    units: list[SimUnit]
    edges: list[SimEdge]
    categories: tuple[SimCategory, ...] = CATEGORIES
    unit_by_id: dict[str, SimUnit] = field(init=False)

    def __post_init__(self) -> None:
        self.unit_by_id = {u.id: u for u in self.units}

    @property
    def reporting_units(self) -> list[SimUnit]:
        """Units that submit category reports (everything except hubs)."""
        return [u for u in self.units if u.unit_type != "hub"]

    def expected_categories(self, unit: SimUnit) -> list[SimCategory]:
        out = []
        for c in self.categories:
            if unit.unit_type not in c.unit_types:
                continue
            if c.sentinel_only and not unit.is_sentinel:
                continue
            out.append(c)
        return out

    @cached_property
    def graph(self) -> nx.Graph:
        g = nx.Graph()
        for u in self.units:
            g.add_node(u.id)
        for e in self.edges:
            g.add_edge(e.source, e.target, relationship_type=e.relationship_type)
        return g

    def upstream_hub(self, unit_id: str) -> str | None:
        for e in self.edges:
            if e.source == unit_id and e.relationship_type == "reports_through":
                return e.target
        return None

    def hub_members(self, hub_id: str) -> list[str]:
        return [e.source for e in self.edges if e.target == hub_id and e.relationship_type == "reports_through" and self.unit_by_id[e.source].unit_type != "hub"]

    def shared_resource_neighbors(self, unit_id: str) -> list[str]:
        out = []
        for e in self.edges:
            if e.relationship_type != "shared_resource":
                continue
            if e.source == unit_id:
                out.append(e.target)
            elif e.target == unit_id:
                out.append(e.source)
        return out

    def peer_groups(self, unit_id: str) -> dict[str, list[str]]:
        """Connected units whose reporting could share a cause with ``unit_id``.

        Only relationships defined in the simulated network are used.
        """
        groups: dict[str, list[str]] = {}
        hub = self.upstream_hub(unit_id)
        if hub:
            groups[hub] = [m for m in self.hub_members(hub) if m != unit_id]
        shared = self.shared_resource_neighbors(unit_id)
        if shared:
            groups["shared_resource:" + "|".join(sorted([unit_id, *shared]))] = shared
        return groups


def build_world() -> World:
    units = _units()
    edges = _edges(units)
    return World(units=_layout(units, edges), edges=edges)
