"""Stack the clean dengue, measles and TB files into data/surveillance.csv (IRIS, Team Nex).

Format: plan/FINAL_CLEANING_PLAN.md section 1.1. One row per disease, source, place and period.
Run after the three cleaning scripts. One command, safe to re-run:

    python scripts/build_surveillance.py

Yearly tables, the measles monthly file and source-specific columns stay out.
Exits with code 1 if a row count or key check fails.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INPUTS = {
    "dengue_province": ROOT / "data" / "dengue" / "clean" / "dengue_province_weekly.csv",
    "dengue_national": ROOT / "data" / "dengue" / "clean" / "dengue_national_weekly.csv",
    "measles": ROOT / "data" / "measles" / "clean" / "measles_national_weekly.csv",
    "tb": ROOT / "data" / "tb" / "clean" / "tb_national_monthly.csv",
}
OUT = ROOT / "data" / "surveillance.csv"

COLS = ["disease", "source", "level", "location_id", "location", "region_id", "region", "period_start", "period_end",
        "resolution", "mw_year", "mw", "cases", "report_status", "qa_label", "qa_flag", "cases_fixed"]
INTS = ["mw_year", "mw", "cases", "cases_fixed"]


def read(path: Path, dates: list[str]) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=dates, keep_default_na=False, na_values=[""])
    for c in INTS:
        if c in df:
            df[c] = pd.to_numeric(df[c]).astype("Int64")
    return df


def weekly(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={"week_start": "period_start", "week_end": "period_end"})
    df["resolution"] = "week"
    return df[COLS]


def monthly_tb(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={"month_start": "period_start"})
    df["period_end"] = df.period_start + pd.offsets.MonthEnd(0)
    df["resolution"] = "month"
    df["location_id"] = "PH"
    df["region_id"] = df["region"] = pd.NA
    df["mw_year"] = df["mw"] = pd.Series(pd.NA, index=df.index, dtype="Int64")
    df["cases_fixed"] = df.cases  # no corrections for TB
    return df[COLS]


def main() -> int:
    parts = [
        weekly(read(INPUTS["dengue_province"], ["week_start", "week_end"])),
        weekly(read(INPUTS["dengue_national"], ["week_start", "week_end"])),
        weekly(read(INPUTS["measles"], ["week_start", "week_end"])),
        monthly_tb(read(INPUTS["tb"], ["month_start"])),
    ]
    tb_src = read(INPUTS["tb"], ["month_start"])
    out = (pd.concat(parts, ignore_index=True)
           .sort_values(["disease", "source", "level", "location_id", "period_start"], ignore_index=True))

    checks = []

    def check(name, expected, actual):
        checks.append((name, expected, actual, expected == actual))

    n = out.disease.value_counts()
    check("dengue rows (33,012 province + 830 national)", 33842, int(n.get("dengue", 0)))
    check("measles + rubella rows", 522, int(n.get("measles", 0) + n.get("rubella", 0)))
    check("tb rows = clean monthly file (Jan 2020 to the file's last month)",
          (len(tb_src), "2020-01-01", f"{tb_src.month_start.max():%Y-%m-%d}"),
          (int(n.get("tb", 0)), f"{out[out.disease == 'tb'].period_start.min():%Y-%m-%d}",
           f"{out[out.disease == 'tb'].period_start.max():%Y-%m-%d}"))
    check("columns in order", COLS, list(out.columns))
    check("duplicate keys (disease, source, location_id, period_start)", 0,
          int(out.duplicated(["disease", "source", "location_id", "period_start"]).sum()))
    check("non-reported rows with a case count", 0, int((out.cases.notna() & (out.report_status != "reported")).sum()))
    check("weekly period_start not a Sunday", 0,
          int((out[out.resolution == "week"].period_start.dt.dayofweek != 6).sum()))
    check("negative counts", 0, int(((out.cases < 0) | (out.cases_fixed < 0)).fillna(False).sum()))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False, lineterminator="\n", date_format="%Y-%m-%d")

    by = out.groupby(["disease", "source", "resolution"]).size()
    print(f"{OUT.relative_to(ROOT)}: {len(out):,} rows")
    for (d, s, r), k in by.items():
        print(f"  {d:<8} {s:<12} {r:<6} {k:>6,}")
    fails = [c for c in checks if not c[3]]
    for name, e, a, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}: expected {e}, got {a}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
