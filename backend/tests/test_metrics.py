from datetime import date, datetime

import pandas as pd

from iris import config
from iris.services.slots import build_slots, summarize


def _exp(freq="weekly"):
    return pd.DataFrame([{"reporting_unit_id": "U1", "category_code": "X", "frequency": freq,
                          "start_date": config.week_start(0), "end_date": config.week_end(3)}])


def _rec(week, received):
    return {"reporting_unit_id": "U1", "category_code": "X", "period_start": config.week_start(week), "value": 1.0,
            "value_status": "reported", "received_at": received, "fields_complete": 1.0}


def test_completeness_and_timeliness_definitions():
    recs = pd.DataFrame([
        _rec(0, config.weekly_due(0) - pd.Timedelta(hours=2)),   # on time
        _rec(1, config.weekly_due(1) + pd.Timedelta(days=2)),    # late
        _rec(2, config.weekly_due(2)),                           # exactly at due = on time
    ])
    sl = build_slots(_exp(), recs, as_of=None)
    assert list(sl["status"]) == ["on_time", "late", "on_time", "not_received"]
    s = summarize(sl)
    assert s["expected"] == 4
    assert s["completeness"] == 3 / 4
    assert s["timeliness"] == 2 / 4


def test_slots_not_yet_due_are_excluded():
    as_of = config.weekly_due(1) + pd.Timedelta(hours=1)
    sl = build_slots(_exp(), pd.DataFrame(columns=["reporting_unit_id", "category_code", "period_start", "value", "value_status", "received_at", "fields_complete"]), as_of=as_of)
    assert len(sl) == 2


def test_monthly_due_on_fifth():
    exp = pd.DataFrame([{"reporting_unit_id": "U1", "category_code": "M", "frequency": "monthly",
                         "start_date": date(2026, 4, 6), "end_date": date(2026, 7, 31)}])
    sl = build_slots(exp, pd.DataFrame(columns=["reporting_unit_id", "category_code", "period_start", "value", "value_status", "received_at", "fields_complete"]), as_of=None)
    # April starts after the expectation start, so the first full month is May
    assert [d.isoformat() for d in sl["period_start"]] == ["2026-05-01", "2026-06-01", "2026-07-01"]
    assert sl["due_at"].iloc[0] == datetime(2026, 6, 5, config.DUE_HOUR)


def test_empty_is_not_calculable():
    s = summarize(pd.DataFrame(columns=["status"]))
    assert s["completeness"] is None and s["timeliness"] is None
