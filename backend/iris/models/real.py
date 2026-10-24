from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from iris.db import Base


class LeadReview(Base):
    """A human decision about one real-data model lead (append-only; the latest row is the current status).

    Reviews are kept when the simulated demo is reset: they concern real reports, not demo data. The reviewer is
    stored by id and name (no foreign key) for the same reason.
    """

    __tablename__ = "lead_reviews"
    __table_args__ = (Index("ix_lead_reviews_lead", "lead_type", "lead_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    #: model_a_alert | zero_report | plan_action
    lead_type: Mapped[str] = mapped_column(String(30))
    lead_id: Mapped[str] = mapped_column(String(200))
    #: in_review | confirmed | not_a_problem
    status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text, default="")
    #: What the reviewer checked (call log, register page, link). Required to close a lead.
    evidence: Mapped[str] = mapped_column(Text, default="")
    model_run_id: Mapped[str] = mapped_column(String(80))
    reviewer_user_id: Mapped[str] = mapped_column(String(40))
    reviewer_name: Mapped[str] = mapped_column(String(120))
    reviewer_role: Mapped[str] = mapped_column(String(40))
    at: Mapped[datetime] = mapped_column(DateTime)
