"""The data contract between Model A, Model B and the dashboard (roadmap step 1).

Each schema lists column -> (dtype kind, nullable, description). validate() raises on any breach, so a
downstream system can trust a file that passed. CONTRACT.md is generated from these definitions.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

ANSWER_KEY = {"qa_label", "qa_flag", "cases_fixed", "deaths", "deaths_fixed", "source_coverage", "source_remarks", "note"}


def assert_no_answer_key(df: pd.DataFrame, where: str = "") -> None:
    """The wall between the model and the answer key: call before every model or baseline run."""
    leaked = ANSWER_KEY & set(df.columns)
    if leaked:
        raise RuntimeError(f"Answer-key columns passed to the model{(' in ' + where) if where else ''}: {sorted(leaked)}")


REPORT_STATUS = {"reported", "missing", "not_in_source"}
RESOLUTIONS = {"week", "month"}

# kind: "str" | "date" | "int" | "float" | "prob" (float in [0, 1]) | "flag" (0/1)
SCORES_V2 = {
    "disease": ("str", False, "Disease code, e.g. dengue, measles, tb."),
    "location_id": ("str", False, "Location ID from shared/locations.csv; PH for national series."),
    "region_id": ("str", True, "Region ID from shared/locations.csv; empty for national series."),
    "hub_id": ("str", True, "Reporting hub the location reports through. Real data has no hub table, so this is the "
                           "region's RESU (hub_id = 'RESU-' + region_id); empty for national series."),
    "period_start": ("date", False, "First day of the week (Sunday, DOH morbidity week) or month."),
    "resolution": ("str", False, "week or month."),
    "cases": ("int", True, "Reported count; empty when the period was not reported."),
    "report_status": ("str", False, "reported, missing (expected but not received) or not_in_source."),
    "expected": ("float", True, "Model's expected count from past periods only; empty when the series has too little history."),
    "pi_low": ("float", True, "Lower end of the 90% prediction range."),
    "pi_high": ("float", True, "Upper end of the 90% prediction range."),
    "p_low": ("prob", True, "Mid-p probability of a count this low or lower if reporting were normal. Small = suspicious."),
    "p_fail": ("prob", True, "Calibrated probability that the report is a real reporting failure (isotonic on 2019, "
                             "prior-corrected to the 2016-2018 real failure rate). Calibrated on dengue province-weeks."),
    "flag": ("flag", True, "1 if p_low < tau (frozen threshold, see config.json), 0 if not, empty if unscored."),
    "shortfall": ("float", True, "Cases likely missing: max(expected - cases, 0); expected when the period is missing."),
    "pooled_region_p": ("prob", True, "Fisher-pooled p over the region's locations that week (v1 method, assumes independence)."),
    "hub_p": ("prob", True, "Correlation-adjusted Stouffer p over the hub's locations that week (v2 shared-source evidence)."),
    "pooled_disease_p": ("prob", True, "Fisher-pooled p over the 18 EDCS diseases that week (national series only)."),
    "model_version": ("str", False, "model_a_v2:<fit level>, e.g. model_a_v2:nb_full."),
    "run_id": ("str", False, "Identifies the run; matches config.json run_id."),
}

PLAN_REAL = {
    "week_start": ("date", False, "Week the plan is for (the week whose reports triggered it)."),
    "action": ("str", False, "call_location (verify a province/city's report) or call_resu (check the region's reporting pathway)."),
    "target": ("str", False, "location_id or RESU-<region_id>."),
    "region_id": ("str", False, "Region of the target."),
    "hours": ("float", False, "Staff hours the action takes (IRIS planner assumptions)."),
    "expected_cases_recovered": ("float", False, "success probability x P(cause is here) x cases likely missing."),
    "locations": ("str", False, "Locations the action covers, ';'-separated."),
    "missing_reports": ("int", False, "Covered locations whose report was due but never arrived (a certain reporting gap)."),
    "reported_cases": ("int", False, "Cases reported that week by the covered locations."),
    "expected_cases": ("float", False, "Model A v2 expected cases for the covered locations."),
    "shortfall": ("float", False, "Cases likely missing for the covered locations."),
    "p_fail_max": ("prob", True, "Highest p_fail among the covered locations."),
    "hub_p": ("prob", True, "The region's correlation-adjusted Stouffer p that week."),
    "P_region": ("prob", False, "Probability that the region-week holds a real reporting failure (isotonic on 2016-2018 labels)."),
    "status": ("str", False, "Always 'lead to verify': a plan item is not a confirmed failure."),
    "run_id": ("str", False, "The Model A v2 run the plan was built from."),
}

SCHEMAS = {"scores_v2": SCORES_V2, "plan_real_2020": PLAN_REAL}
PRIMARY_KEYS = {"scores_v2": ["disease", "location_id", "period_start", "model_version"],
                "plan_real_2020": ["week_start", "action", "target"]}


class ContractError(ValueError):
    pass


def _check_kind(s: pd.Series, kind: str) -> str | None:
    v = s.dropna()
    if kind == "str":
        return None if v.map(lambda x: isinstance(x, str)).all() else "non-string values"
    if kind == "date":
        d = pd.to_datetime(v, errors="coerce")
        return None if d.notna().all() else "unparseable dates"
    x = pd.to_numeric(v, errors="coerce")
    if x.isna().any():
        return "non-numeric values"
    if not np.isfinite(x.to_numpy(dtype=float)).all():
        return "non-finite values"
    if kind == "int" and not (x == np.round(x)).all():
        return "non-integer values"
    if kind == "prob" and not x.between(0, 1).all():
        return "values outside [0, 1]"
    if kind == "flag" and not x.isin([0, 1]).all():
        return "values other than 0/1"
    return None


def validate(df: pd.DataFrame, schema: str = "scores_v2") -> None:
    spec = SCHEMAS[schema]
    errors = []
    missing = [c for c in spec if c not in df.columns]
    extra = [c for c in df.columns if c not in spec]
    if missing:
        errors.append(f"missing columns {missing}")
    if extra:
        errors.append(f"unexpected columns {extra}")
    for col, (kind, nullable, _) in spec.items():
        if col not in df:
            continue
        if not nullable and df[col].isna().any():
            errors.append(f"{col}: {int(df[col].isna().sum())} empty values in a required column")
        msg = _check_kind(df[col], kind)
        if msg:
            errors.append(f"{col}: {msg}")
    if schema == "scores_v2" and not missing:
        if not df.report_status.isin(REPORT_STATUS).all():
            errors.append("report_status: unknown values")
        if not df.resolution.isin(RESOLUTIONS).all():
            errors.append("resolution: unknown values")
        rep = df.report_status.eq("reported")
        if df.loc[rep, "cases"].isna().any():
            errors.append("cases: empty on a reported row")
        if df.loc[~rep, "cases"].notna().any():
            errors.append("cases: filled on a row that was not reported")
        sc = df.p_low.notna()
        if (df.loc[sc, "flag"].isna()).any() or df.loc[~sc, "flag"].notna().any():
            errors.append("flag: must be set exactly where p_low is set")
        has = df.expected.notna()
        if (df.loc[has, "pi_low"] > df.loc[has, "pi_high"]).any():
            errors.append("pi_low > pi_high")
        if (df.shortfall.dropna() < 0).any():
            errors.append("shortfall: negative values")
    if not missing:
        dup = df.duplicated(PRIMARY_KEYS[schema]).sum()
        if dup:
            errors.append(f"{dup} duplicate primary keys {PRIMARY_KEYS[schema]}")
        if df.run_id.nunique() > 1:
            errors.append("more than one run_id in a file")
    if schema == "plan_real_2020" and not missing:
        if not df.action.isin(["call_location", "call_resu"]).all():
            errors.append("action: unknown values")
        if not df.status.eq("lead to verify").all():
            errors.append("status: every plan item must be 'lead to verify'")
        if (df.hours <= 0).any() or (df.expected_cases_recovered < 0).any():
            errors.append("hours must be > 0 and expected_cases_recovered >= 0")
    if errors:
        raise ContractError(f"{schema} breaks the contract:\n- " + "\n- ".join(errors))


def contract_markdown() -> str:
    lines = ["# IRIS data contract", "",
             "Generated from `iris_pipeline/contract.py`; `validate()` enforces every rule below.", ""]
    for name, spec in SCHEMAS.items():
        lines += [f"## `{name}.csv`", "", f"Primary key: {', '.join(PRIMARY_KEYS[name])}.", "",
                  "| column | type | required | meaning |", "|---|---|---|---|"]
        lines += [f"| `{c}` | {k} | {'no' if n else 'yes'} | {d} |" for c, (k, n, d) in spec.items()]
        lines.append("")
    lines += [
        "## Rules checked by `validate()`", "",
        "- Exactly these columns; required columns never empty; types and ranges as listed.",
        "- `cases` is set if and only if `report_status = reported`.",
        "- `flag` is set if and only if `p_low` is set.",
        "- `pi_low <= pi_high`; `shortfall >= 0`; one `run_id` per file; no duplicate primary keys.",
        "",
        "## Inputs both models may read", "",
        "- `MODEL A/data/shared/locations.csv`: location and region IDs (126 locations, 17 regions).",
        "- `MODEL A/data/shared/calendar_weeks.csv`: the week grid. A week that was due but not received stays a row "
        "with `report_status = missing`; it is never dropped or shifted.",
        "- The clean disease files under `MODEL A/data/*/clean/`. Never the raw files.",
        "",
        "## Shared split", "",
        "Train 2016-2018 (history only), tune 2019 (every threshold and model choice), test 2020 (scored once).",
        "",
    ]
    return "\n".join(lines)
