"""One configuration for the whole pipeline.

V1 holds Model A v1's settings exactly as in MODEL A/outputs/model_a/config.json, so the port reproduces it.
V2_CANDIDATES are the Model A v2 variants compared on 2016-2019 only (roadmap step 2).
"""

from __future__ import annotations

import copy

SEED = 2026

# Shared split (roadmap step 1). Scores are rolling-origin, so "train" means "history available to the model".
SPLIT = {"train": (2016, 2018), "tune": 2019, "test": 2020}

V1 = {
    "SEED": SEED,
    "ALERT_BUDGET": 0.01,
    "MODEL_VERSION": "model_a_v1",
    "REFIT_EVERY": 4,
    "TRAIN_WINDOW": 156,
    "MIN_FULL": 45,
    "MIN_TREND": 20,
    "MIN_ANY": 8,
    "ROBUST_DROP_P": 0.01,
    "MAX_PRED_FACTOR": 10,
    "PI_LEVEL": 0.90,
    "PERIODS_PER_YEAR": {"week": 52.1775, "month": 12},
    "ALPHA_BOUNDS": [1e-4, 50.0],
    "BASELINE_WINDOW": 8,
    "BASELINE_MIN_OBS": 4,
    "EWMA_LAMBDA": 0.3,
    "CUSUM_K": 0.5,
    "TB_COUNT_MODEL_START": "2021-01-01",
    "TB_EXCLUDED_BASE_YEARS": [2020],
}

# Options a count model run can switch on. All off = Model A v1.
MODEL_OPTIONS_OFF = {
    "recent_lag": None,        # endemic-epidemic term: log1p(median of the last RECENT_WINDOW usable reports up to t - lag)
    "recent_window": 4,
    "recent_exclude_p": 0.01,  # a week whose own (past-only) p_low is below this is not used in the recent level
    "covid_flag": False,       # add calendar covid_period as a covariate (only estimable once 2020 weeks are in training)
    "param_uncertainty": False,  # widen the predictive distribution by the coefficient uncertainty
    "year_variance": False,    # ... and by year-to-year variation in epidemic size
    "min_year_weeks": 26,      # a training year needs this many reported weeks to enter the year-variance estimate
}

V2_CANDIDATES = {
    "v1": {},
    "v1+uncertainty": {"param_uncertainty": True, "year_variance": True},
    "recent1": {"recent_lag": 1},
    "recent1+uncertainty": {"recent_lag": 1, "param_uncertainty": True, "year_variance": True},
    "recent2+uncertainty": {"recent_lag": 2, "param_uncertainty": True, "year_variance": True},
    # Added after the first 2016-2019 pass showed multi-week swap episodes leaking into the recent level:
    # a stricter exclusion keeps weeks that already look low out of it. Still chosen on 2016-2019 only.
    "recent1x+uncertainty": {"recent_lag": 1, "recent_exclude_p": 0.10, "param_uncertainty": True, "year_variance": True},
    "recent2x+uncertainty": {"recent_lag": 2, "recent_exclude_p": 0.10, "param_uncertainty": True, "year_variance": True},
    # covid_period is 0 before 2020, so 2016-2019 can't tell this variant apart from v1+uncertainty:
    # it is reported on 2020 as a sensitivity analysis only, never selected.
    "covid+uncertainty": {"covid_flag": True, "param_uncertainty": True, "year_variance": True},
}
SELECTABLE = [k for k in V2_CANDIDATES if k != "covid+uncertainty"]

# Pre-registered selection rule (decided before any 2020 score is looked at).
SELECTION = {
    "coverage_years": [2017, 2018, 2019],
    "coverage_band": [0.85, 0.95],
    "recall_year": 2019,
}

V2 = {
    **V1,
    "MODEL_VERSION": "model_a_v2",
    "STOUFFER_RHO_YEARS": [2016, 2017, 2018],
    "CALIBRATION_PRIOR_YEARS": [2016, 2017, 2018],
}


MODEL_A_VARIANT = "recent1+uncertainty"  # chosen in session 1 (outputs/model_a_v2/selection.json)

# ---- Step 3: synthetic reporting network (all fictional; built over the real 126 locations) ------------------
NETWORK = {
    "WORLD_SEED": 2026,
    "FACILITIES_MIN": 2, "FACILITIES_MAX": 6,      # per location, more for higher dengue volume
    "HUB_SIZE": [1, 3],                             # locations served by one provincial reporting hub
    "LABS_PER_REGION": [(4, 1), (10, 2), (999, 3)],  # (max locations in region, labs)
    "FACILITY_SHARE_CONCENTRATION": 2.0,            # Dirichlet concentration for facility shares of a location
}

SIM = {
    # The synthetic world inherits its base year's real dengue dynamics. 5-seed trials showed that a change of year
    # dominates false alarms (tune 2019 -> test 2020: facility false-alert rate 5.9%; tune 2018 -> test 2019: 7.4%,
    # vs a 1% budget), because the facility models are not refitted during the simulated year. That is Model A's
    # year-shift problem (measured on real data in session 1), and it would confound the network and planning
    # questions. So tuning and test replicates share base year 2018, each seed drawing its own failures AND its own
    # facility-level noise (a fresh multinomial split of the location totals). 2019 and 2020 are stress tests.
    "TUNE_YEAR": 2018, "TEST_YEAR": 2018, "STRESS_YEARS": [2019, 2020],
    "TUNE_SEEDS": [101, 102, 103, 104, 105],
    "TEST_SEEDS": list(range(201, 221)),            # 20 replicates
    "EVENTS": {"isolated": 40, "hub": 6, "lab": 3},  # failure events per simulated year
    "MEAN_WEEKS": {"isolated": 4.0, "hub": 5.0, "lab": 5.0},  # geometric durations (memoryless) if not repaired
    "MAX_WEEKS": 12,
    "START_WEEKS": [2, 44],                         # events start within these weeks of the year
    "SPACING_WEEKS": 2,                             # min gap between events on one facility
    "ISOLATED_ZERO_SHARE": 0.5, "ISOLATED_PARTIAL": [0.1, 0.5],
    "HUB_ZERO_SHARE": 0.7, "HUB_PARTIAL": [0.0, 0.3],
    "LAB_PARTIAL": [0.3, 0.7],                      # a failing lab loses part of the confirmed counts
    "FIT_WINDOW": 104,                              # facility model: fit on the 2 years before the simulated year
}

# ---- Step 4: actions (hours, success, days to effect copied from IRIS backend planner DEFAULT_ASSUMPTIONS) ----
# action -> IRIS action type it borrows its numbers from; cost_php is an added assumption (travel, materials).
ACTIONS = {
    "call_facility":  {"iris_type": "verify_contact",     "base_hours": 1.5,  "hours_per_unit": 0.5, "success": 0.55, "days": 1, "cost_php": 0},
    "visit_facility": {"iris_type": "technical_support",  "base_hours": 4.0,  "hours_per_unit": 2.0, "success": 0.70, "days": 3, "cost_php": 1500},
    "fix_hub":        {"iris_type": "restore_connection", "base_hours": 10.0, "hours_per_unit": 1.0, "success": 0.80, "days": 5, "cost_php": 3000},
    "fix_lab":        {"iris_type": "validation_review",  "base_hours": 2.0,  "hours_per_unit": 1.0, "success": 0.65, "days": 2, "cost_php": 2000},
    "call_resu":      {"iris_type": "verify_contact",     "base_hours": 1.5,  "hours_per_unit": 0.5, "success": 0.55, "days": 1, "cost_php": 0},
}

PLAN = {
    "STAFF_HOURS_PER_WEEK": 24.0,                   # about 3 staff-days of follow-up per week
    "HOURS_SENSITIVITY": [12.0, 24.0, 48.0],
    "COST_PHP_PER_WEEK": 10000.0,
    "MIN_PROB": 0.02,                               # candidates need at least this probability of a real failure
    "MAX_FACILITY_CANDIDATES": 80,
    "MILP_TIME_LIMIT_S": 10.0,
}


def options(name: str) -> dict:
    o = copy.deepcopy(MODEL_OPTIONS_OFF)
    o.update(V2_CANDIDATES[name])
    return o
