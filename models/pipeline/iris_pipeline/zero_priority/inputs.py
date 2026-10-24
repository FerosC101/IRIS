"""Dengue-only inputs for the zero-report prioritizer.

The full pipeline loader (data.load) needs every disease's clean files. This model only needs the dengue
province-weekly table, the calendar, the location list and the synthetic injections. It reads the clean dengue
file when present and otherwise the province rows of data/surveillance.csv, which hold the same clean table
(checked below with the cleaning plan's expected counts). The answer-key wall is the same as in data.load:
model inputs (X_dengue) never carry qa_label / qa_flag.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..contract import assert_no_answer_key
from ..data import KEYS, fl, read
from ..paths import DATA_DIR

CLEAN_FILE = "dengue/clean/dengue_province_weekly.csv"
SURVEILLANCE_FILE = "surveillance.csv"


@dataclass
class DengueInputs:
    cal: pd.DataFrame
    locs: pd.DataFrame
    X_dengue: pd.DataFrame
    Y_dengue: pd.DataFrame
    injected: pd.DataFrame
    source: dict = field(default_factory=dict)


def _sha(rel: str) -> str:
    return hashlib.sha256((DATA_DIR / rel).read_bytes()).hexdigest()


def load_dengue(check: bool = True) -> DengueInputs:
    cal = read("shared/calendar_weeks.csv", ["week_start", "week_end"])
    for c in ("holy_week", "christmas_newyear", "covid_period"):
        cal[c] = cal[c].astype(str).str.lower().eq("true")
    locs = read("shared/locations.csv", ["first_week"])
    inj = read("synthetic/model_a_injected_failures.csv", ["week_start"])
    if (DATA_DIR / CLEAN_FILE).exists():
        prov, rel = read(CLEAN_FILE, ["week_start", "week_end"]), CLEAN_FILE
    else:
        s = read(SURVEILLANCE_FILE, ["period_start", "period_end"])
        prov = (s[(s.disease == "dengue") & (s.level == "province_city")]
                .rename(columns={"period_start": "week_start", "period_end": "week_end"})
                .sort_values(["location_id", "week_start"]).reset_index(drop=True))
        rel = SURVEILLANCE_FILE
    inp = DengueInputs(
        cal=cal, locs=locs,
        X_dengue=prov[KEYS + ["cases", "report_status"]].copy(),
        Y_dengue=prov[["location_id", "week_start", "qa_label", "qa_flag"]].copy(),
        injected=inj,
        source={"dengue_table": rel, "sha256": {rel: _sha(rel), "shared/calendar_weeks.csv": _sha("shared/calendar_weeks.csv"),
                "shared/locations.csv": _sha("shared/locations.csv"),
                "synthetic/model_a_injected_failures.csv": _sha("synthetic/model_a_injected_failures.csv")}},
    )
    assert_no_answer_key(inp.X_dengue, "X_dengue")
    if check:
        run_checks(inp, prov)
    return inp


def run_checks(inp: DengueInputs, prov: pd.DataFrame) -> pd.DataFrame:
    """The dengue rows of data.run_checks: the same expected counts as the cleaning plan."""
    Yd, st = inp.Y_dengue, prov.report_status.value_counts()
    gap = prov[fl(Yd, "regional_gap")]
    swap = fl(Yd, "swap_cases_deaths")
    checks = [
        ("calendar weeks", 569, len(inp.cal)),
        ("locations / regions", (126, 17), (len(inp.locs), inp.locs.region_id.nunique())),
        ("dengue province rows", 33012, len(prov)),
        ("dengue reported / missing / not_in_source", (32701, 259, 52),
         (int(st.get("reported", 0)), int(st.get("missing", 0)), int(st.get("not_in_source", 0)))),
        ("dengue swapped rows (0 cases / 1-3 cases)", (581, 527, 54),
         (int(swap.sum()), int((swap & (prov.cases == 0)).sum()), int((swap & prov.cases.between(1, 3)).sum()))),
        ("dengue regional-gap rows by week", {"2016-11-13": 46, "2017-11-12": 41, "2020-11-15": 46},
         {f"{k:%Y-%m-%d}": int(v) for k, v in gap.groupby("week_start").size().items()}),
        ("dengue duplicate location-weeks", 0, int(prov.duplicated(["location_id", "week_start"]).sum())),
        ("injected failure rows present", True, len(inp.injected) > 0),
    ]
    df = pd.DataFrame(checks, columns=["check", "expected", "actual"])
    df["result"] = np.where([e == a for e, a in zip(df.expected, df.actual)], "PASS", "FAIL")
    if (df.result == "FAIL").any():
        raise ValueError("Dengue input checks failed:\n" + df[df.result == "FAIL"].to_string(index=False))
    return df
