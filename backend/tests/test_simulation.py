import numpy as np

from iris import config
from iris.data.simulate import demo_scenarios, random_scenarios, simulate
from iris.data.world import build_world


def test_simulation_is_deterministic():
    w = build_world()
    a = simulate(w, demo_scenarios(w), 123)
    b = simulate(w, demo_scenarios(w), 123)
    assert a.records.equals(b.records)
    c = simulate(w, demo_scenarios(w), 124)
    assert not a.records.equals(c.records)


def test_labels_mark_only_disruptions():
    w = build_world()
    sim = simulate(w, demo_scenarios(w), config.DEMO_SEED)
    lab = sim.labels.set_index(["unit_id", "week"])
    assert bool(lab.loc[("RHU-LUNTIAN", 9), "is_disruption"])
    # Holiday week is context, not a disruption
    assert not bool(lab.loc[("RHU-AMIHAN", 3), "is_disruption"])
    assert lab.loc[("RHU-AMIHAN", 3), "context_kind"] == "holiday"


def test_records_after_snapshot_are_not_received():
    w = build_world()
    sim = simulate(w, demo_scenarios(w), config.DEMO_SEED)
    assert (sim.records["received_at"] <= config.AS_OF).all()


def test_blank_is_distinct_from_zero():
    w = build_world()
    sim = simulate(w, demo_scenarios(w), config.DEMO_SEED)
    blank = sim.records[sim.records["value_status"] == "blank"]
    zero = sim.records[sim.records["value_status"] == "zero"]
    assert blank["value"].isna().all() and len(blank) > 0
    assert (zero["value"] == 0).all() and len(zero) > 0


def test_random_scenarios_respect_topology():
    w = build_world()
    sc = random_scenarios(w, np.random.default_rng(1))
    hub = next(s for s in sc if s.kind == "hub_outage")
    assert set(hub.units) <= set(w.hub_members(hub.via))
    for s in sc:
        assert 8 <= s.start_week <= s.end_week < config.N_WEEKS
