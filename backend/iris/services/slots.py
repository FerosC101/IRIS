"""Expected-versus-received reporting slots.

A *slot* is one expected submission (unit x category x period) defined by an
explicit :class:`ReportingExpectation`. Completeness, timeliness and the
detection features are all computed from slots, so every page uses the same
definitions:

* Completeness = received expected submissions / total expected submissions
* Timeliness   = submissions received by the due date / total expected submissions
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pandas as pd

from iris import config

SLOT_COLUMNS = [
    "unit_id", "category_code", "frequency", "period_start", "period_end", "week",
    "due_at", "received_at", "value", "value_status", "fields_complete", "record_id",
    "status", "days_late",
]


def _months(start: date, end: date) -> list[tuple[date, date]]:
    out = []
    d = date(start.year, start.month, 1)
    if d < start:
        d = date(d.year + d.month // 12, d.month % 12 + 1, 1)
    while True:
        nxt = date(d.year + d.month // 12, d.month % 12 + 1, 1)
        m_end = nxt - timedelta(days=1)
        if m_end > end:
            break
        out.append((d, m_end))
        d = nxt
    return out


def expected_slots(expectations: pd.DataFrame, as_of: datetime | None) -> pd.DataFrame:
    """Expand reporting schedules into one row per expected submission that is already due."""
    rows: list[dict] = []
    for exp in expectations.itertuples(index=False):
        start, end = exp.start_date, exp.end_date
        if exp.frequency == "weekly":
            first = max(0, config.week_index(start))
            t = first
            while config.week_end(t) <= end:
                due = config.weekly_due(t)
                if as_of is None or due <= as_of:
                    rows.append({
                        "unit_id": exp.reporting_unit_id, "category_code": exp.category_code, "frequency": "weekly",
                        "period_start": config.week_start(t), "period_end": config.week_end(t), "week": t, "due_at": due,
                    })
                t += 1
        elif exp.frequency == "monthly":
            for m_start, m_end in _months(start, end):
                due_d = date(m_end.year + m_end.month // 12, m_end.month % 12 + 1, config.MONTHLY_DUE_DAY)
                due = datetime(due_d.year, due_d.month, due_d.day, config.DUE_HOUR)
                if as_of is None or due <= as_of:
                    rows.append({
                        "unit_id": exp.reporting_unit_id, "category_code": exp.category_code, "frequency": "monthly",
                        "period_start": m_start, "period_end": m_end, "week": -1, "due_at": due,
                    })
    return pd.DataFrame(rows, columns=["unit_id", "category_code", "frequency", "period_start", "period_end", "week", "due_at"])


_UNSET = object()


def build_slots(expectations: pd.DataFrame, records: pd.DataFrame, as_of: datetime | None = config.AS_OF, record_cutoff=_UNSET) -> pd.DataFrame:
    """Left-join expected submissions with received records.

    ``as_of`` limits expected submissions to those already due. Records
    received after ``record_cutoff`` (defaults to ``as_of``) are ignored; pass
    ``None`` to keep every stored record, e.g. reports submitted in the app.

    ``records`` must have columns ``reporting_unit_id, category_code,
    period_start, value, value_status, received_at, fields_complete`` and
    optionally ``id``.
    """
    cutoff = as_of if record_cutoff is _UNSET else record_cutoff
    slots = expected_slots(expectations, as_of)
    if slots.empty:
        return pd.DataFrame(columns=SLOT_COLUMNS)
    rec = records.rename(columns={"reporting_unit_id": "unit_id", "id": "record_id"}).copy()
    if "record_id" not in rec.columns:
        rec["record_id"] = None
    keep = ["unit_id", "category_code", "period_start", "value", "value_status", "received_at", "fields_complete", "record_id"]
    rec = rec[[c for c in keep if c in rec.columns]]
    if cutoff is not None and not rec.empty:
        rec = rec[pd.to_datetime(rec["received_at"]) <= cutoff]
    rec = rec.drop_duplicates(subset=["unit_id", "category_code", "period_start"], keep="last")
    out = slots.merge(rec, how="left", on=["unit_id", "category_code", "period_start"])
    received = pd.to_datetime(out["received_at"])
    due = pd.to_datetime(out["due_at"])
    out["status"] = "not_received"
    out.loc[received.notna() & (received <= due), "status"] = "on_time"
    out.loc[received.notna() & (received > due), "status"] = "late"
    late_days = (received - due).dt.total_seconds() / 86400.0
    out["days_late"] = late_days.where(out["status"] == "late").round(1)
    out["week"] = out["week"].astype(int)
    return out[SLOT_COLUMNS]


def summarize(slots: pd.DataFrame) -> dict:
    """Completeness and timeliness for a set of slots, or ``None`` when not calculable."""
    n = int(len(slots))
    if n == 0:
        return {"expected": 0, "received": 0, "on_time": 0, "late": 0, "not_received": 0, "completeness": None, "timeliness": None}
    received = int((slots["status"] != "not_received").sum())
    on_time = int((slots["status"] == "on_time").sum())
    return {
        "expected": n,
        "received": received,
        "on_time": on_time,
        "late": received - on_time,
        "not_received": n - received,
        "completeness": received / n,
        "timeliness": on_time / n,
    }
