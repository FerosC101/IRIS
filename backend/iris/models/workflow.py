from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from iris.db import Base

concern_units = Table(
    "concern_units",
    Base.metadata,
    Column("concern_id", ForeignKey("reporting_concerns.id"), primary_key=True),
    Column("unit_id", ForeignKey("reporting_units.id"), primary_key=True),
)


class ReportingConcern(Base):
    __tablename__ = "reporting_concerns"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"))
    #: missing_submission | late_report | incomplete_record | count_drop | shared_problem
    concern_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10))  # high | medium | low
    #: open | under_review | clarification_requested | in_investigation | resolved | dismissed
    status: Mapped[str] = mapped_column(String(30), default="open")
    #: unverified | confirmed | dismissed
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    category_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    week_start_index: Mapped[int] = mapped_column(Integer)
    week_end_index: Mapped[int] = mapped_column(Integer)
    primary_unit_id: Mapped[str | None] = mapped_column(ForeignKey("reporting_units.id"), nullable=True)
    province: Mapped[str | None] = mapped_column(String(80), nullable=True)
    shared_via: Mapped[str | None] = mapped_column(String(60), nullable=True)
    detection_method: Mapped[str] = mapped_column(String(40))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    uncertainty_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)
    assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_role: Mapped[str | None] = mapped_column(String(40), nullable=True)
    follow_up_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    confirmation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    dismissal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: Identifier of the injected simulation scenario, if any (demo answer key).
    scenario_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    #: Week-level evidence snapshot captured at detection time.
    detection_detail: Mapped[dict] = mapped_column(JSON, default=dict)

    units = relationship("ReportingUnit", secondary=concern_units, lazy="selectin")
    evidence = relationship("EvidenceItem", lazy="selectin", order_by="EvidenceItem.id", cascade="all, delete-orphan")


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    concern_id: Mapped[str] = mapped_column(ForeignKey("reporting_concerns.id"))
    #: observed | possible_explanation | requires_verification | confirmed_by_reviewer | attached | simulated_example
    #: ("attached" = evidence a person attached; created_by records who)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    created_by: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    concern_id: Mapped[str] = mapped_column(ForeignKey("reporting_concerns.id"), unique=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | closed
    opened_at: Mapped[datetime] = mapped_column(DateTime)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class InvestigationNote(Base):
    __tablename__ = "investigation_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    concern_id: Mapped[str] = mapped_column(ForeignKey("reporting_concerns.id"))
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    #: note | clarification_request | clarification_response | resolution | confirmation | dismissal
    note_type: Mapped[str] = mapped_column(String(40), default="note")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class InvestigationChecklistItem(Base):
    """One verification step for a concern. Who ticked it and when is recorded."""

    __tablename__ = "investigation_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    concern_id: Mapped[str] = mapped_column(ForeignKey("reporting_concerns.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    #: check (ticked by a person) | resolution (completed by resolving the concern)
    kind: Mapped[str] = mapped_column(String(20), default="check")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
