from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from iris.models import AuditEvent
from iris.services.clock import now


def record(session: Session, actor, entity_type: str, entity_id: str, action: str, summary: str,
           detail: dict | None = None, at: datetime | None = None) -> AuditEvent:
    ev = AuditEvent(
        at=at or now(),
        actor_user_id=getattr(actor, "user_id", None) if actor is not None and not isinstance(actor, str) else actor,
        actor_role=getattr(actor, "role", None) if actor is not None and not isinstance(actor, str) else None,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        summary=summary,
        detail=detail or {},
    )
    session.add(ev)
    return ev
