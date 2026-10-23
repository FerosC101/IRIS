"""Display identifiers shown in the interface.

Reports are data records (``RPT-0001``); a missing submission has no record and
therefore no report ID. Investigations keep the ``INV-`` identifier created when
a concern is assigned (``INV-0010`` investigates ``C-0010``).
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from iris.models import Investigation

_REPORT = re.compile(r"^RPT-(\d+)$", re.IGNORECASE)


def report_id(record_id: int | None) -> str | None:
    return None if record_id is None else f"RPT-{int(record_id):04d}"


def parse_report_id(value: str) -> int | None:
    """``RPT-1048`` or ``1048`` -> 1048; anything else -> None."""
    value = value.strip()
    if value.isdigit():
        return int(value)
    m = _REPORT.match(value)
    return int(m.group(1)) if m else None


def investigation_ids(session: Session) -> dict[str, str]:
    """concern id -> investigation id, for every concern that has an investigation."""
    return {i.concern_id: i.id for i in session.execute(select(Investigation)).scalars()}


def resolve_concern_id(session: Session, value: str) -> str:
    """Accept a concern id (``C-0010``) or its investigation id (``INV-0010``)."""
    if value.upper().startswith("INV-"):
        inv = session.get(Investigation, value.upper())
        if inv is not None:
            return inv.concern_id
    return value
