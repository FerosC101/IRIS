"""Wall-clock helpers. Times are naive local times (simulated PHT, UTC+8)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

PHT = timezone(timedelta(hours=8))


def now() -> datetime:
    return datetime.now(PHT).replace(tzinfo=None, microsecond=0)


def today() -> date:
    return now().date()
