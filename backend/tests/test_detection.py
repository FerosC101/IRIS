import pandas as pd

from iris.detection.methods import DetectionParams, detect, own_evidence, peer_groups_from_edges


def _features(rows):
    base = {"n_expected": 4, "n_on_time": 4, "n_late": 0, "n_not_received": 0, "n_incomplete": 0, "n_case_reports": 4,
            "total_cases": 10.0, "received_share": 1.0, "deficit": 0.0, "incomplete_share": 0.0}
    return pd.DataFrame([{**base, **r} for r in rows])


def _missing(unit, week):
    return {"unit_id": unit, "week": week, "n_on_time": 0, "n_not_received": 4, "n_case_reports": 0, "total_cases": 0.0, "received_share": 0.0, "deficit": 1.0}


def _late(unit, week, n_late=2):
    return {"unit_id": unit, "week": week, "n_on_time": 4 - n_late, "n_late": n_late, "deficit": 0.5 * n_late / 4}


def test_full_missing_week_is_flagged_by_all_methods():
    rows = [{"unit_id": "A", "week": t} for t in range(10)] + [{"unit_id": "B", "week": t} for t in range(11)]
    rows.append(_missing("A", 10))
    f = _features(rows)
    groups = peer_groups_from_edges([("A", "HUB", "reports_through"), ("B", "HUB", "reports_through")], {"A", "B"})
    for m in ("threshold", "ewma", "network"):
        d = detect(f, m, peer_groups=groups)
        assert bool(d[(d.unit_id == "A") & (d.week == 10)]["flagged"].iloc[0]), m


def test_insufficient_history_is_reported():
    f = _features([{"unit_id": "A", "week": t} for t in range(3)])
    ev = own_evidence(f, DetectionParams())
    assert ev["insufficient_history"].all()


def test_network_requires_own_evidence():
    # B is normal while its peers are disrupted: connections alone must not flag it.
    rows = []
    for u in "ABC":
        rows += [{"unit_id": u, "week": t} for t in range(10)]
    rows += [_missing("A", 10), _missing("C", 10), {"unit_id": "B", "week": 10}]
    f = _features(rows)
    groups = peer_groups_from_edges([(u, "HUB", "reports_through") for u in "ABC"], set("ABC"))
    d = detect(f, "network", peer_groups=groups)
    assert not bool(d[(d.unit_id == "B") & (d.week == 10)]["flagged"].iloc[0])


def test_network_support_raises_sensitivity_for_partial_delays():
    rows = []
    for u in "ABCD":
        rows += [{"unit_id": u, "week": t} for t in range(10)]
    rows += [_missing("A", 10), _missing("C", 10), _missing("D", 10), _late("B", 10, n_late=3)]  # B: deficit 0.375
    f = _features(rows)
    groups = peer_groups_from_edges([(u, "HUB", "reports_through") for u in "ABCD"], set("ABCD"))
    thr = detect(f, "threshold")
    net = detect(f, "network", peer_groups=groups)
    b_thr = thr[(thr.unit_id == "B") & (thr.week == 10)].iloc[0]
    b_net = net[(net.unit_id == "B") & (net.week == 10)].iloc[0]
    assert b_net["peer_support"] == 1.0
    assert b_net["score"] > b_thr["score"]
    assert bool(b_net["flagged"])


def test_peer_groups_use_only_defined_edges():
    groups = peer_groups_from_edges([("A", "H1", "reports_through"), ("B", "H2", "reports_through"), ("A", "LAB", "specimen_referral")], {"A", "B"})
    assert groups["A"] == {"H1": []}
    assert "LAB" not in groups["A"]


def test_count_drop_not_assessed_when_reports_missing():
    rows = [{"unit_id": "A", "week": t} for t in range(10)]
    rows.append(_missing("A", 10))
    ev = own_evidence(_features(rows), DetectionParams())
    last = ev[ev.week == 10].iloc[0]
    assert not bool(last["count_flag"]) and pd.isna(last["count_p"])


def test_count_drop_flagged_when_reported_on_time():
    rows = [{"unit_id": "A", "week": t, "total_cases": 12.0} for t in range(10)]
    rows.append({"unit_id": "A", "week": 10, "total_cases": 0.0})
    ev = own_evidence(_features(rows), DetectionParams())
    assert bool(ev[ev.week == 10]["count_flag"].iloc[0])


def _slots(unit, code, values, start_week=0):
    """Weekly slots for one unit and category. ``values``: number, "zero", "blank" or None (not received)."""
    from datetime import datetime, timedelta
    rows = []
    for i, v in enumerate(values):
        t = start_week + i
        due = datetime(2026, 4, 14, 17) + timedelta(weeks=t)
        received = None if v is None else due - timedelta(hours=2)
        value = None if v in (None, "blank") else (0.0 if v == "zero" else float(v))
        status = None if v is None else ("blank" if v == "blank" else ("zero" if value == 0 else "reported"))
        rows.append({"unit_id": unit, "category_code": code, "frequency": "weekly", "week": t, "due_at": due, "received_at": received,
                     "value": value, "value_status": status, "fields_complete": 1.0,
                     "status": "not_received" if v is None else "on_time"})
    return pd.DataFrame(rows)


def _zero_flags(slots, cats=("DENGUE", "MEASLES")):
    from iris.detection.features import unit_week_features
    ev = own_evidence(unit_week_features(slots, set(cats), as_of=None), DetectionParams())
    return ev.set_index("week")["zero_run_flag"].to_dict()


def test_zero_case_run_is_flagged_on_its_third_week():
    flags = _zero_flags(_slots("A", "DENGUE", [4, 3, 5, 4, 3, 4, "zero", "zero", "zero"]))
    assert [w for w, f in flags.items() if f] == [8]


def test_blank_or_missing_reports_break_a_zero_run():
    # Blank is not zero, and a report not received is not a report.
    assert not any(_zero_flags(_slots("A", "DENGUE", [4, 3, 5, 4, 3, 4, "zero", "blank", "zero"])).values())
    assert not any(_zero_flags(_slots("A", "DENGUE", [4, 3, 5, 4, 3, 4, "zero", None, "zero"])).values())


def test_zero_run_ignores_categories_where_zeros_are_usual():
    # A unit that rarely reports measles cases can submit zeros for weeks without being flagged.
    assert not any(_zero_flags(_slots("A", "MEASLES", [1, 0, 0, 1, 0, 0] + ["zero"] * 10)).values())


def test_zero_run_needs_enough_history():
    assert not any(_zero_flags(_slots("A", "DENGUE", [5, 6, "zero", "zero", "zero", "zero"])).values())
