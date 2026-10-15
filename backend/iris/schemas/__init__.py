"""Pydantic request models (input validation)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=4000)


class ReasonIn(BaseModel):
    reason: str = Field(max_length=4000)


class MessageIn(BaseModel):
    message: str = Field(max_length=4000)
    due: date | None = None


class AssignIn(BaseModel):
    user_id: str
    due: date | None = None
    note: str | None = Field(default=None, max_length=4000)


class BodyIn(BaseModel):
    body: str = Field(max_length=4000)


class SummaryIn(BaseModel):
    summary: str = Field(max_length=4000)


class DetectionRunIn(BaseModel):
    method: Literal["threshold", "ewma", "network"] = "network"
    dataset_id: str | None = None


class ReportIn(BaseModel):
    unit_id: str
    category_code: str
    period_start: date
    value: float | None = None
    blank: bool = False
    note: str | None = Field(default=None, max_length=2000)


class UnitPatch(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=200)
    active: bool | None = None
    is_sentinel: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ImportValidateIn(BaseModel):
    token: str
    mapping: dict[str, str]
    date_format: str = "YYYY-MM-DD"
    keep_last_duplicate: bool = False


class ImportMeta(BaseModel):
    name: str = Field(max_length=200)
    description: str | None = Field(default="", max_length=2000)
    source: str = Field(max_length=1000)
    designation: Literal["real", "synthetic", "unknown"] | None = None
    geographic_level: Literal["facility", "municipality", "province", "region"] | None = None
    known_limitations: str | None = Field(default="", max_length=4000)


class ImportCommitIn(ImportValidateIn):
    metadata: ImportMeta


class ActionTypeAssumption(BaseModel):
    base_hours: float | None = Field(default=None, ge=0, le=500)
    hours_per_unit: float | None = Field(default=None, ge=0, le=500)
    success_probability: float | None = Field(default=None, ge=0, le=1)
    time_days: float | None = Field(default=None, ge=0, le=365)


class AssumptionsIn(BaseModel):
    horizon_weeks: int | None = Field(default=None, ge=1, le=26)
    action_types: dict[str, ActionTypeAssumption] | None = None

    def as_overrides(self) -> dict:
        return {
            "horizon_weeks": self.horizon_weeks,
            "action_types": {k: v.model_dump(exclude_none=True) for k, v in (self.action_types or {}).items()},
        }


class CompareIn(BaseModel):
    budget_hours: float = Field(ge=0, le=2000)
    action_ids: list[str] | None = None
    assumptions: AssumptionsIn | None = None


class PlanIn(BaseModel):
    name: str = Field(max_length=200)
    method: Literal["optimized", "baseline", "manual"]
    budget_hours: float = Field(ge=0, le=2000)
    action_ids: list[str]
    assumptions: AssumptionsIn | None = None
    notes: str | None = Field(default="", max_length=2000)


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default="", max_length=2000)


class AssignmentPatch(BaseModel):
    status: Literal["approved", "in_progress", "completed", "closed", "cancelled"] | None = None
    note: str | None = Field(default=None, max_length=4000)
    evidence: str | None = Field(default=None, max_length=4000)
    follow_up_date: date | None = None


class OutcomeIn(BaseModel):
    outcome_status: Literal["not_yet_verified", "observed_unverified", "verified"]
    summary: str = Field(max_length=4000)


class ExperimentIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    replications: int = Field(default=20, ge=3, le=60)
    base_seed: int = Field(default=7100, ge=0, le=10_000_000)


class ResetIn(BaseModel):
    scenario_ids: list[str] | None = None
