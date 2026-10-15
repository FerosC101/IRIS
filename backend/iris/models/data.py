from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from iris.db import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(Text)
    #: synthetic | real | unknown — never inferred, always declared.
    designation: Mapped[str] = mapped_column(String(20))
    #: facility | municipality | province | region
    geographic_level: Mapped[str] = mapped_column(String(20))
    imported_at: Mapped[datetime] = mapped_column(DateTime)
    imported_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    coverage_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    coverage_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    #: valid | valid_with_warnings | invalid
    validation_status: Mapped[str] = mapped_column(String(30), default="valid")
    known_limitations: Mapped[list] = mapped_column(JSON, default=list)
    has_expectations: Mapped[bool] = mapped_column(Boolean, default=False)
    has_timestamps: Mapped[bool] = mapped_column(Boolean, default=False)
    has_units: Mapped[bool] = mapped_column(Boolean, default=False)
    data_dictionary: Mapped[list] = mapped_column(JSON, default=list)
    column_mapping: Mapped[dict] = mapped_column(JSON, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class ReportingExpectation(Base):
    """An explicitly defined reporting schedule for one unit and category."""

    __tablename__ = "reporting_expectations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"))
    reporting_unit_id: Mapped[str] = mapped_column(ForeignKey("reporting_units.id"))
    category_code: Mapped[str] = mapped_column(ForeignKey("reporting_categories.code"))
    frequency: Mapped[str] = mapped_column(String(20))  # weekly | monthly
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)


class DataRecord(Base):
    __tablename__ = "data_records"
    __table_args__ = (Index("ix_records_dataset_period", "dataset_id", "period_start"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"))
    reporting_unit_id: Mapped[str | None] = mapped_column(ForeignKey("reporting_units.id"), nullable=True)
    area: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: reported (>0) | zero (explicit zero report) | blank (field left empty)
    value_status: Mapped[str] = mapped_column(String(20))
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: Share of required form fields completed (0-1), when known.
    fields_complete: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    note: Mapped[str] = mapped_column(Text, default="")


class ImportRecord(Base):
    __tablename__ = "import_records"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    dataset_id: Mapped[str | None] = mapped_column(ForeignKey("datasets.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    at: Mapped[datetime] = mapped_column(DateTime)
    by_user_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    #: accepted | rejected | cancelled
    status: Mapped[str] = mapped_column(String(20))
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
