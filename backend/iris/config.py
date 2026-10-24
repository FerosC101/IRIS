"""Static configuration for the IRIS prototype.

All dates describe the *simulated* reporting timeline. They are fixed so the
synthetic demo data is fully reproducible.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("IRIS_DB_PATH", BASE_DIR / "iris.db"))

#: Fixed random seed for the demo dataset.
DEMO_SEED = 20260412

#: Number of weekly reporting periods in the demo dataset.
N_WEEKS = 26

#: Monday of the first simulated reporting week.
FIRST_WEEK_START = date(2026, 4, 6)

#: Weekly reports are due this many days after the week ends (Sunday -> Tuesday).
WEEKLY_DUE_OFFSET_DAYS = 2
#: Monthly summaries are due on this day of the following month.
MONTHLY_DUE_DAY = 5
#: Reports are due at 17:00 local time (simulated, PHT/UTC+8).
DUE_HOUR = 17

#: A week is reviewed this many days after its due date. Reports received later
#: than this count as "not received" for detection purposes.
REVIEW_GRACE_DAYS = 7

#: "As of" date of the simulated dataset snapshot.
AS_OF = datetime(2026, 10, 8, 9, 0)

DEMO_DATASET_ID = "DS-DEMO-FACILITY"
DEMO_AGGREGATE_DATASET_ID = "DS-DEMO-PROVINCIAL"

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def week_start(index: int) -> date:
    return FIRST_WEEK_START + timedelta(days=7 * index)


def week_end(index: int) -> date:
    return week_start(index) + timedelta(days=6)


def weekly_due(index: int) -> datetime:
    d = week_end(index) + timedelta(days=WEEKLY_DUE_OFFSET_DAYS)
    return datetime(d.year, d.month, d.day, DUE_HOUR)


def week_index(d: date) -> int:
    return (d - FIRST_WEEK_START).days // 7

# ---- Real-data models (Model A v2, Model B zero-report prioritizer, Model B v2 planner) ---------------------------
# The pipeline in "models/pipeline" writes validated JSON contract files; the app reads them read-only.
REPO_ROOT = BASE_DIR.parent
MODEL_CONTRACT_DIR = Path(os.environ.get("IRIS_MODEL_CONTRACT_DIR", REPO_ROOT / "models" / "pipeline" / "outputs" / "contract"))
MODEL_LOCATIONS_FILE = Path(os.environ.get("IRIS_MODEL_LOCATIONS_FILE", REPO_ROOT / "models" / "data" / "shared" / "locations.csv"))
