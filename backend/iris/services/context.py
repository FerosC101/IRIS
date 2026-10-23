"""Demo actor resolution and role permissions.

The acting user is chosen with the visible demo role selector and sent in the
``X-IRIS-User`` header. This is a prototype convenience, NOT authentication:
any client can send any user id. Real deployments need server-side
authentication and authorization.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from iris.db import get_session
from iris.models import User

ROLE_LABELS = {
    "rhu_staff": "RHU reporting staff",
    "provincial_coordinator": "Provincial surveillance coordinator",
    "resu_analyst": "RESU analyst",
    "admin": "System administrator / data manager",
}

PERMISSIONS: dict[str, set[str]] = {
    "rhu_staff": {"concern.note", "concern.respond", "concern.evidence", "report.submit", "assignment.update"},
    "provincial_coordinator": {
        "concern.note", "concern.respond", "concern.evidence", "concern.review", "concern.confirm", "concern.dismiss", "concern.resolve",
        "concern.clarify", "concern.assign", "concern.reopen", "plan.create", "plan.decide", "assignment.update",
        "network.view", "recovery.view", "data.view",
    },
    "resu_analyst": {
        "concern.note", "concern.respond", "concern.evidence", "concern.review", "concern.confirm", "concern.dismiss", "concern.resolve",
        "concern.clarify", "concern.assign", "concern.reopen", "plan.create", "plan.decide", "assignment.update",
        "detection.run", "experiment.run", "dataset.import", "network.view", "recovery.view", "data.view",
        "evaluation.view", "audit.view",
    },
    "admin": {
        "report.submit", "detection.run", "experiment.run", "dataset.import", "units.manage", "audit.view",
        "network.view", "recovery.view", "data.view", "evaluation.view", "datasets.manage", "concern.note",
    },
}

DEFAULT_USER = "U-RESU-1"


@dataclass(frozen=True)
class Actor:
    user_id: str
    role: str
    display_name: str
    reporting_unit_id: str | None
    province: str | None

    def can(self, permission: str) -> bool:
        return permission in PERMISSIONS.get(self.role, set())

    def require(self, permission: str) -> None:
        if not self.can(permission):
            raise HTTPException(
                status_code=403,
                detail=f"The demo role '{ROLE_LABELS.get(self.role, self.role)}' cannot perform this action ({permission}). Switch role in the demo role selector.",
            )


def get_actor(x_iris_user: str | None = Header(default=None), session: Session = Depends(get_session)) -> Actor:
    """Resolve the demo user. No header means the default demo user; an unknown
    explicit user is an error, never silently replaced by another identity."""
    requested = (x_iris_user or "").strip()
    user = session.get(User, requested or DEFAULT_USER)
    if user is None and requested:
        raise HTTPException(status_code=400, detail={
            "code": "unknown_demo_user",
            "message": f"The demo user '{requested}' does not exist. Choose a demo role again.",
        })
    if user is None:
        raise HTTPException(status_code=503, detail="Demo users are not initialised. Reset the demo data.")
    return Actor(user.id, user.role_id, user.display_name, user.reporting_unit_id, user.province)
