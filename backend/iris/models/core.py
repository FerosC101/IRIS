from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from iris.db import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    level: Mapped[str] = mapped_column(String(20))  # regional | provincial | municipal
    province: Mapped[str | None] = mapped_column(String(80), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120))
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    reporting_unit_id: Mapped[str | None] = mapped_column(ForeignKey("reporting_units.id"), nullable=True)
    province: Mapped[str | None] = mapped_column(String(80), nullable=True)


class ReportingCategory(Base):
    __tablename__ = "reporting_categories"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    frequency: Mapped[str] = mapped_column(String(20), default="weekly")


class ReportingUnit(Base):
    __tablename__ = "reporting_units"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    unit_type: Mapped[str] = mapped_column(String(20))  # rhu | hospital | laboratory | hub
    province: Mapped[str] = mapped_column(String(80))
    municipality: Mapped[str | None] = mapped_column(String(80), nullable=True)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sentinel: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)
    #: Position on the schematic, fictional map (0-1000). Null when not defined.
    geo_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    geo_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ReportingRelationship(Base):
    __tablename__ = "reporting_relationships"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"))
    source_id: Mapped[str] = mapped_column(ForeignKey("reporting_units.id"))
    target_id: Mapped[str] = mapped_column(ForeignKey("reporting_units.id"))
    relationship_type: Mapped[str] = mapped_column(String(40))  # reports_through | specimen_referral | shared_resource
    description: Mapped[str] = mapped_column(Text, default="")
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime)
    actor_user_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(60))
    summary: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
