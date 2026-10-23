"""Load the clean files (the only inputs either model may read) and check them.

Port of MODEL A/notebooks/model_a.ipynb cell 6. The answer-key wall is kept: model inputs (X_*) never carry
qa_label / qa_flag; labels (Y_*) are only joined in for evaluation.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .contract import assert_no_answer_key
from .paths import DATA_DIR

INPUT_FILES = [
    "dengue/clean/dengue_province_weekly.csv",
    "shared/edcs_national_weekly.csv",
    "measles/clean/measles_national_weekly.csv",
    "tb/clean/tb_national_monthly.csv",
    "tb/clean/tb_national_annual.csv",
    "shared/calendar_weeks.csv",
    "shared/locations.csv",
]

KEYS = ["location_id", "location", "region_id", "region", "week_start", "mw_year", "mw"]


def read(rel: str, dates: list[str]) -> pd.DataFrame:
    path = DATA_DIR / rel
    if not path.exists():
        raise FileNotFoundError(
            f"Missing input: {path}. The clean files are not in git (data licences); "
            "rebuild them with MODEL A/scripts/clean_*.py.")
    return pd.read_csv(path, parse_dates=dates, keep_default_na=False, na_values=[""], low_memory=False)


def input_hashes() -> dict[str, str]:
    return {rel: hashlib.sha256((DATA_DIR / rel).read_bytes()).hexdigest() for rel in INPUT_FILES}


def fl(Y: pd.DataFrame, code: str) -> pd.Series:
    return Y.qa_flag.fillna("").str.contains(code)


@dataclass
class Inputs:
    cal: pd.DataFrame
    locs: pd.DataFrame
    X_dengue: pd.DataFrame
    Y_dengue: pd.DataFrame
    X_edcs: pd.DataFrame
    X_measles: pd.DataFrame
    Y_measles: pd.DataFrame
    X_tb: pd.DataFrame
    Y_tb: pd.DataFrame
    X_tb_annual: pd.DataFrame
    injected: pd.DataFrame


def load(check: bool = True) -> Inputs:
    cal = read("shared/calendar_weeks.csv", ["week_start", "week_end"])
    locs = read("shared/locations.csv", ["first_week"])
    prov = read("dengue/clean/dengue_province_weekly.csv", ["week_start", "week_end"])
    edcs = read("shared/edcs_national_weekly.csv", ["week_start", "week_end"])
    mea = read("measles/clean/measles_national_weekly.csv", ["week_start", "week_end"])
    tbm = read("tb/clean/tb_national_monthly.csv", ["month_start"])
    tba = read("tb/clean/tb_national_annual.csv", [])
    inj = read("synthetic/model_a_injected_failures.csv", ["week_start"])
    for c in ("holy_week", "christmas_newyear", "covid_period"):
        cal[c] = cal[c].astype(str).str.lower().eq("true")
    tbm["is_december"] = tbm["is_december"].astype(str).str.lower().eq("true")

    inp = Inputs(
        cal=cal,
        locs=locs,
        X_dengue=prov[KEYS + ["cases", "report_status"]].copy(),
        Y_dengue=prov[["location_id", "week_start", "qa_label", "qa_flag"]].copy(),
        X_edcs=edcs[["disease", "disease_raw", "week_start", "mw_year", "mw", "cases", "report_status"]].copy(),
        X_measles=mea[["disease", "week_start", "mw_year", "mw", "cases", "report_status"]].copy(),
        Y_measles=mea[["disease", "week_start", "qa_label", "qa_flag"]].copy(),
        X_tb=tbm[["month_start", "year", "month", "is_december", "cases", "report_status"]].copy(),
        Y_tb=tbm[["month_start", "qa_label", "qa_flag"]].copy(),
        X_tb_annual=tba[["year", "notified"]].copy(),
        injected=inj,
    )
    for name in ("X_dengue", "X_edcs", "X_measles", "X_tb", "X_tb_annual"):
        assert_no_answer_key(getattr(inp, name), name)
    if check:
        run_checks(inp, prov, edcs, mea, tbm, tba)
    return inp


def run_checks(inp: Inputs, prov, edcs, mea, tbm, tba) -> pd.DataFrame:
    """Same expected counts as the v1 notebook: the clean files must match plan/final_report.md."""
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
        ("edcs rows / diseases / weeks", (4698, 18, 261), (len(edcs), edcs.disease.nunique(), edcs.week_start.nunique())),
        ("measles file rows", 522, len(mea)),
        ("TB monthly rows / reported", (84, 73), (len(tbm), int((tbm.report_status == "reported").sum()))),
        ("TB annual rows", 25, len(tba)),
        ("injected failure rows (v1 file)", True, len(inp.injected) > 0),
    ]
    df = pd.DataFrame(checks, columns=["check", "expected", "actual"])
    df["result"] = np.where([e == a for e, a in zip(df.expected, df.actual)], "PASS", "FAIL")
    if (df.result == "FAIL").any():
        raise ValueError("Input checks failed:\n" + df[df.result == "FAIL"].to_string(index=False))
    return df


def dengue_eval_frame(inp: Inputs) -> pd.DataFrame:
    """Evaluation copy of the dengue inputs (as in v1 cell 18): regional gaps filled with 0, then the v1 injected
    failures applied. The injections are read from the file v1 wrote, so both versions are graded on identical rows."""
    X = inp.X_dengue.copy()
    gap_rows = fl(inp.Y_dengue, "regional_gap").to_numpy()
    X.loc[gap_rows, ["cases", "report_status"]] = [0, "reported"]
    inj = dengue_injections(inp)
    X = X.merge(inj[["location_id", "week_start", "cases_injected"]], on=["location_id", "week_start"], how="left")
    X["cases"] = X.cases_injected.combine_first(X.cases)
    return X.drop(columns="cases_injected")


def dengue_injections(inp: Inputs) -> pd.DataFrame:
    inj = inp.injected[inp.injected.disease == "dengue"].rename(columns={"series_id": "location_id"})
    return inj[["disease", "event_id", "scenario", "location_id", "week_start", "cases_true", "cases_injected"]]


def measles_injections(inp: Inputs) -> pd.DataFrame:
    inj = inp.injected[inp.injected.disease == "measles"].drop(columns="series_id")
    return inj[["disease", "event_id", "scenario", "week_start", "cases_true", "cases_injected"]]
