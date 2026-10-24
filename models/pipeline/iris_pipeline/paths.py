"""Filesystem locations. Inputs are read from models/data; pipeline outputs go to models/pipeline/outputs."""

from __future__ import annotations

import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
PJDS_DIR = PIPELINE_DIR.parent


def _model_a_dir() -> Path:
    """IRIS repo layout: models/pipeline inside models/. Older PJDS layout: PJDS/MODEL A next to PJDS/pipeline."""
    if "IRIS_MODEL_A_DIR" in os.environ:
        return Path(os.environ["IRIS_MODEL_A_DIR"])
    if (PIPELINE_DIR.parent / "data" / "shared").is_dir():
        return PIPELINE_DIR.parent
    return PJDS_DIR / "MODEL A"


MODEL_A_DIR = _model_a_dir()
DATA_DIR = MODEL_A_DIR / "data"
SYN_DIR = DATA_DIR / "synthetic"
V1_OUT_DIR = MODEL_A_DIR / "outputs" / "model_a"
OUT_DIR = Path(os.environ.get("IRIS_OUT_DIR", PIPELINE_DIR / "outputs"))
MODEL_A_V2_DIR = OUT_DIR / "model_a_v2"


def ensure(*dirs: Path) -> None:
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
