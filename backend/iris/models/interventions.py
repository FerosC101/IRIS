from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from iris.db import Base


class InterventionAction(Base):
    """A candidate corrective action derived from an open concern."""

    __tablename__ = "intervention_actions"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    concern_id: Mapped[str] = mapped_column(ForeignKey("reporting_concerns.id"))
    #: verify_contact | technical_support | validation_review | restore_connection | support_visit
    action_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    unit_ids: Mapped[list] = mapped_column(JSON, default=list)
    expected_reports_per_week: Mapped[float] = mapped_column(Float)
    priority: Mapped[int] = mapped_column(Integer)  # 1 = highest
    depends_on: Mapped[list] = mapped_column(JSON, default=list)
    rationale: Mapped[str] = mapped_column(Text)
    #: candidate | approved | completed | not_applicable
    status: Mapped[str] = mapped_column(String(20), default="candidate")
    created_at: Mapped[datetime] = mapped_column(DateTime)


class InterventionPlan(Base):
    __tablename__ = "intervention_plans"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    method: Mapped[str] = mapped_column(String(20))  # optimized | baseline | manual
    budget_hours: Mapped[float] = mapped_column(Float)
    action_ids: Mapped[list] = mapped_column(JSON, default=list)
    total_cost_hours: Mapped[float] = mapped_column(Float)
    total_expected_benefit: Mapped[float] = mapped_column(Float)
    assumptions: Mapped[dict] = mapped_column(JSON, default=dict)
    #: draft | approved | rejected
    status: Mapped[str] = mapped_column(String(20), default="draft")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    decided_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class InterventionAssignment(Base):
    __tablename__ = "intervention_assignments"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("intervention_plans.id"))
    action_id: Mapped[str] = mapped_column(ForeignKey("intervention_actions.id"))
    title: Mapped[str] = mapped_column(String(255))
    responsible_role: Mapped[str] = mapped_column(String(40))
    assignee_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    target_unit_ids: Mapped[list] = mapped_column(JSON, default=list)
    due_date: Mapped[date] = mapped_column(Date)
    follow_up_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    #: approved | in_progress | completed | closed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="approved")
    follow_up_notes: Mapped[list] = mapped_column(JSON, default=list)
    evidence_of_completion: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class InterventionOutcome(Base):
    __tablename__ = "intervention_outcomes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("intervention_assignments.id"))
    #: not_yet_verified | observed_unverified | verified
    outcome_status: Mapped[str] = mapped_column(String(30))
    #: simulated | observed_in_data | reviewer
    source: Mapped[str] = mapped_column(String(30))
    summary: Mapped[str] = mapped_column(Text)
    recorded_by: Mapped[str] = mapped_column(String(40))
    recorded_at: Mapped[datetime] = mapped_column(DateTime)


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    created_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20))  # completed | failed
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
