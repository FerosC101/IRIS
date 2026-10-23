"""Failure and recovery simulator on the synthetic network (roadmap step 3).

Three kinds of failure, all with known ground truth:
- isolated: one facility reports zero or part of its cases;
- hub: every facility behind a reporting hub reports zero or a small part (a shared outage);
- lab: every facility referring to a lab loses part of its confirmed cases.
Durations are geometric (memoryless), so "expected weeks left" is the same at any point of an event. A correct,
successful action ends the event from the next week. Action outcomes use common random numbers (the draw depends
only on seed, week, action and target), so policies are compared on identical luck.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..config import SIM
from .build import World


@dataclass
class Event:
    event_id: str
    kind: str                # isolated | hub | lab
    source: str              # facility_id, hub_id or lab_id
    members: np.ndarray      # facility row indices affected
    start: int               # week index within the simulated year
    end_spont: int           # first normal week if never repaired (exclusive end)
    mult: float              # observed = floor(true * mult) while active
    end: int = field(init=False)

    def __post_init__(self):
        self.end = self.end_spont


def year_columns(world: World, year: int) -> np.ndarray:
    return np.flatnonzero(world.weeks.year == year)


def draw_events(world: World, year: int, seed: int, cfg: dict = SIM) -> list[Event]:
    rng = np.random.default_rng([seed, year])
    n_weeks = len(year_columns(world, year))
    busy: dict[int, list[tuple[int, int]]] = {}
    sp = cfg["SPACING_WEEKS"]

    def free(members, a, b):
        return all(not (a - sp < e and s < b + sp) for m in members for s, e in busy.get(int(m), []))

    def reserve(members, a, b):
        for m in members:
            busy.setdefault(int(m), []).append((a, b))

    events: list[Event] = []
    fac = world.facilities
    pools = {"hub": fac.hub_id.unique(), "lab": fac.lab_id.unique()}
    for kind in ("hub", "lab", "isolated"):  # shared events first so they find free facilities
        target, done, tries = cfg["EVENTS"][kind], 0, 0
        while done < target and tries < 5000:
            tries += 1
            if kind == "isolated":
                i = int(rng.integers(world.n_fac))
                source, members = fac.facility_id.iat[i], np.array([i])
            else:
                source = str(pools[kind][int(rng.integers(len(pools[kind])))])
                members = world.members(source)
            start = int(rng.integers(cfg["START_WEEKS"][0], cfg["START_WEEKS"][1] + 1))
            dur = int(min(rng.geometric(1.0 / cfg["MEAN_WEEKS"][kind]), cfg["MAX_WEEKS"]))
            end = min(start + dur, n_weeks)
            if not free(members, start, end):
                continue
            if kind == "isolated":
                mult = 0.0 if rng.random() < cfg["ISOLATED_ZERO_SHARE"] else float(rng.uniform(*cfg["ISOLATED_PARTIAL"]))
            elif kind == "hub":
                mult = 0.0 if rng.random() < cfg["HUB_ZERO_SHARE"] else float(rng.uniform(*cfg["HUB_PARTIAL"]))
            else:
                mult = float(rng.uniform(*cfg["LAB_PARTIAL"]))
            reserve(members, start, end)
            done += 1
            events.append(Event(f"{year}-{seed}-{kind[:3]}-{done:02d}", kind, source, members, start, end, mult))
    return events


def events_frame(events: list[Event], world: World) -> pd.DataFrame:
    return pd.DataFrame([{
        "event_id": e.event_id, "kind": e.kind, "source": e.source, "n_facilities": len(e.members),
        "start_week": e.start, "end_week_if_unrepaired": e.end_spont, "end_week": e.end, "mult": round(e.mult, 3),
        "facilities": ";".join(world.facilities.facility_id.to_numpy()[e.members]),
    } for e in events])


class Simulation:
    """One simulated year. Call observed(t) for week t's reports, then repair(...) for the actions taken."""

    def __init__(self, world: World, year: int, events: list[Event], seed: int):
        self.world, self.year, self.seed = world, year, seed
        self.cols = year_columns(world, year)
        self.events = events
        self.n_weeks = len(self.cols)
        self.state = np.full((world.n_fac, self.n_weeks), -1, dtype=int)  # event index active, -1 = normal
        self._refresh()

    def _refresh(self):
        self.state[:] = -1
        for k, e in enumerate(self.events):
            self.state[np.ix_(e.members, np.arange(e.start, e.end))] = k

    def true(self, t: int) -> np.ndarray:
        return self.world.true[:, self.cols[t]]

    def observed(self, t: int) -> np.ndarray:
        y = self.true(t).copy()
        k = self.state[:, t]
        on = k >= 0
        if on.any():
            mult = np.array([self.events[i].mult for i in k[on]])
            y[on] = np.floor(y[on] * mult)
        return y

    def failing(self, t: int) -> np.ndarray:
        return self.state[:, t] >= 0

    def active(self, t: int) -> list[Event]:
        return [e for e in self.events if e.start <= t < e.end]

    def success(self, action: str, target: str, t: int, p: float) -> bool:
        u = np.random.default_rng([self.seed, t, zlib.crc32(f"{action}|{target}".encode())]).random()
        return bool(u < p)

    def repair(self, kind: str, source_ids: set[str], t: int) -> list[str]:
        """End active events of this kind whose source is in source_ids, from week t+1. Returns ended event ids."""
        ended = []
        for e in self.events:
            if e.kind == kind and e.source in source_ids and e.start <= t < e.end:
                e.end = t + 1
                ended.append(e.event_id)
        if ended:
            self._refresh()
        return ended
