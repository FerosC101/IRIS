"""IRIS pipeline: clean data -> Model A (detect) -> Model B (decide) -> dashboard.

Implements the roadmap in IRIS_MODEL_REVIEW_AND_ROADMAP.md. Model A v1 lives unchanged in
MODEL A/notebooks/model_a.ipynb; this package ports it faithfully and adds v2.
"""

import os

# Thousands of tiny model fits run faster on one math-library thread (and give identical results).
# Set before numpy is imported, here and in every worker process.
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

__version__ = "0.2.0"
