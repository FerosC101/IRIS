"""Clean the measles data for IRIS (Team Nex, PJDSC 2026).

Follows data/measles/CLEANING_PLAN.md step by step, with the decisions in
plan/FINAL_CLEANING_PLAN.md section 4 where they differ. One command, safe to re-run:

    python scripts/clean_measles.py

Run scripts/clean_dengue.py first: this reads its shared files
(data/shared/edcs_national_weekly.csv, calendar_weeks.csv).

Writes to data/measles/clean/:
    measles_national_weekly.csv, measles_national_yearly.csv, measles_national_monthly.csv,
    checks.csv, check_report.md, nbl_audit.md, figures/*.png

Cleaning = standardize, fill the calendar, label problems. Reported numbers are
never overwritten, gaps are never filled, rows are never dropped, and a blank
stays blank (never 0). Exits with code 1 if any check fails.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "data" / "shared"
EDCS = SHARED / "edcs_national_weekly.csv"
CALENDAR = SHARED / "calendar_weeks.csv"
RAW_WHO_YEARLY = ROOT / "data" / "raw" / "measles" / "measles_number_of_reported_cases.csv"  # source B (GHO WHS3_62)
RAW_WHO_MONTHLY = ROOT / "data" / "raw" / "measles" / "measles_404-table-web-epi-curve-data.xlsx"  # source C
RAW_NBL = ROOT / "data" / "raw" / "unverified" / "Diseases Data (for NBL).xlsx"  # not used; audit note only

CLEAN = ROOT / "data" / "measles" / "clean"
FIGURES = CLEAN / "figures"

# ----------------------------------------------------------------------- constants
OUT_COLS = [
    "disease", "source", "level", "location", "location_id", "region", "region_id",
    "week_start", "week_end", "mw_year", "mw", "cases", "report_status", "source_detail",
    "deaths", "qa_label", "qa_flag", "cases_fixed", "deaths_fixed", "note",
]
FLAG_ORDER = ["system_gap", "disease_gap", "group_zero", "possible_catch_up", "review", "latest_months"]
DISEASES = {"measles": "Measles", "rubella": "Rubella"}

# Plan step 3: listed by hand from inspection, not made by a general rule.
HAND = "hand label (found by inspection, not by a general rule)"
GROUP_ZERO = (2019, 8)  # measles and rubella
GROUP_ZERO_OTHERS = ["afp", "neonatal_tetanus", "non_neonatal_tetanus", "chikungunya",
                     "acute_bloody_diarrhea", "rotavirus"]
CATCH_UP = {(2019, 9): 1227, (2019, 11): 3710}  # measles only
REVIEW = (2018, 20)  # measles 0 right after 10 blank weeks

# README section 6.A.1, for the week-by-week gap checks
SYSTEM_GAP_WEEKS = (
    [(2017, 52)] + [(2018, w) for w in range(10, 20)] + [(2018, 26), (2018, 27)]
    + [(2020, w) for w in list(range(11, 27)) + list(range(35, 39)) + [43, 44, 45, 52, 53]]
)
DISEASE_GAP_WEEKS = {
    "measles": [(2019, 1), (2019, 2), (2019, 3), (2019, 10)],
    "rubella": [(2017, 46), (2017, 47), (2019, 1), (2019, 2), (2019, 3)],
}

MONTHLY_COLS = {  # raw header (newlines removed) -> clean column
    "Measles suspect": "measles_suspect", "Measles clinical": "measles_clinical",
    "Measles epi-linked": "measles_epi_linked", "Measles lab-confirmed": "measles_lab_confirmed",
    "Measles total": "measles_total", "Rubella clinical": "rubella_clinical",
    "Rubella epi-linked": "rubella_epi_linked", "Rubella lab-confirmed": "rubella_lab_confirmed",
    "Rubella Total": "rubella_total", "Discarded": "discarded",
}

# ------------------------------------------------------------------------- checks
CHECKS: list[dict] = []
NOTES: list[str] = []


def check(step: str, name: str, expected, actual, added: bool = False) -> bool:
    """added=True marks a check we added ourselves (not in the plan); reported in its own section."""
    ok = bool(expected == actual)
    CHECKS.append({"origin": "added" if added else "plan", "step": step, "check": name,
                   "expected": str(expected), "actual": str(actual), "result": "PASS" if ok else "FAIL"})
    return ok


def as_int(s: pd.Series, what: str) -> pd.Series:
    """Numeric -> nullable Int64. Blanks stay blank; refuses non-integers."""
    s = pd.to_numeric(s, errors="raise")
    frac = s.dropna() % 1
    if (frac != 0).any():
        raise ValueError(f"{what}: non-integer values {s.dropna()[frac != 0].tolist()[:5]}")
    return s.astype("Int64")


def join_flags(index: pd.Index, flags: dict[str, pd.Series]) -> pd.Series:
    out = pd.Series("", index=index, dtype=object)
    for code in FLAG_ORDER:
        if code in flags:
            m = flags[code].fillna(False).astype(bool)
            out[m] = np.where(out[m] == "", code, out[m] + ";" + code)
    return out.replace("", pd.NA)


def write_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, lineterminator="\n", date_format="%Y-%m-%d")


def wk(keys) -> list[str]:
    return [f"{y}-W{w}" for y, w in keys]


# ------------------------------------------------------ steps 1-3: weekly measles/rubella
def read_edcs() -> pd.DataFrame:
    e = pd.read_csv(EDCS, parse_dates=["week_start", "week_end"])
    e["cases"] = as_int(e["cases"], "EDCS cases")
    check("3 inputs", "edcs_national_weekly: diseases x weeks", (18, 261, 4698),
          (e.disease.nunique(), e.week_start.nunique(), len(e)))
    return e


def clean_weekly(e: pd.DataFrame) -> pd.DataFrame:
    blanks = e.groupby("week_start").cases.apply(lambda c: int(c.isna().sum()))
    w = e[e.disease.isin(DISEASES)].copy()
    check("1 weekly", "disease_raw kept as Measles / Rubella", sorted(DISEASES.values()),
          sorted(w.disease_raw.unique()))
    def at(*keys):
        return np.logical_or.reduce([(w.mw_year == y) & (w.mw == n) for y, n in keys])

    missing = w.report_status == "missing"
    n_blank = w.week_start.map(blanks)

    flags = {
        "system_gap": missing & (n_blank >= 17),
        "disease_gap": missing & (n_blank < 17),
    }
    gz = at(GROUP_ZERO) & ~missing
    cu = (w.disease == "measles") & at(*CATCH_UP) & ~missing
    rv = (w.disease == "measles") & at(REVIEW) & ~missing
    flags["group_zero"], flags["possible_catch_up"], flags["review"] = gz, cu, rv

    w["qa_flag"] = join_flags(w.index, flags)
    w["qa_label"] = pd.Series(np.where(gz, "suspect", "ok"), index=w.index).where(~missing)
    w["cases_fixed"] = w.cases

    # Note column for the hand labels (plan step 3); group zero lists the other diseases at 0.
    wk8 = e[(e.mw_year == GROUP_ZERO[0]) & (e.mw == GROUP_ZERO[1])]
    zero_others = wk8[(wk8.cases == 0) & ~wk8.disease.isin(DISEASES)]
    w["note"] = pd.NA
    w.loc[gz, "note"] = (f"{HAND}: 0 during the 2019 epidemic; also 0 that week: "
                         + ", ".join(zero_others.disease_raw))
    w.loc[cu, "note"] = f"{HAND}: very high week right after a zero or a blank week; probably includes late reports"
    w.loc[rv, "note"] = f"{HAND}: 0 right after 10 blank weeks; may be a partial report"

    w["location"], w["location_id"] = "PHILIPPINES", "PH"
    w["region"] = w["region_id"] = w["source_detail"] = pd.NA
    w["deaths"] = w["deaths_fixed"] = pd.Series(pd.NA, index=w.index, dtype="Int64")
    out = w[OUT_COLS].sort_values(["disease", "week_start"], ignore_index=True)

    # --- plan step 2 and 3 expectations
    for d in DISEASES:
        g = out[out.disease == d]
        sg = g[g.qa_flag.fillna("").str.contains("system_gap")]
        dg = g[g.qa_flag.fillna("").str.contains("disease_gap")]
        exp_sg = [k for k in SYSTEM_GAP_WEEKS if not (d == "rubella" and k == (2017, 52))]
        check("2 gaps", f"{d}: system_gap weeks", wk(exp_sg), wk(zip(sg.mw_year, sg.mw)))
        check("2 gaps", f"{d}: disease_gap weeks", wk(DISEASE_GAP_WEEKS[d]), wk(zip(dg.mw_year, dg.mw)))
    g8 = out[(out.mw_year == GROUP_ZERO[0]) & (out.mw == GROUP_ZERO[1])]
    check("3 hand labels", "2019 W8 measles / rubella cases", (0, 0),
          tuple(int(g8.loc[g8.disease == d, "cases"].iloc[0]) for d in DISEASES))
    check("3 hand labels", "2019 W8: other diseases reading 0", sorted(GROUP_ZERO_OTHERS),
          sorted(zero_others.disease.tolist()))
    m = out[out.disease == "measles"].set_index(["mw_year", "mw"])
    check("3 hand labels", "measles 2019 W9 / W11", tuple(CATCH_UP.values()),
          tuple(int(m.at[k, "cases"]) for k in CATCH_UP))
    prev10 = m.loc[[(2018, x) for x in range(10, 20)], "report_status"]
    check("3 hand labels", "measles 2018 W20 = 0 after 10 blank weeks (W10-19)", (0, 10),
          (int(m.at[REVIEW, "cases"]), int((prev10 == "missing").sum())))
    check("3 hand labels", "rows with possible_catch_up / review", (2, 1), (int(cu.sum()), int(rv.sum())))

    # --- plan step 7
    s7 = "7 weekly"
    check(s7, "weekly rows (2 diseases x 261 weeks)", 522, len(out))
    for d, exp_sg, exp_dg, exp_zero, exp_pct in [("measles", 38, 4, 41, 18.7), ("rubella", 37, 5, 85, 38.8)]:
        g = out[out.disease == d]
        rep = g[g.report_status == "reported"]
        check(s7, f"{d}: reported / missing", (219, 42), (len(rep), int((g.report_status == "missing").sum())))
        f = g.qa_flag.fillna("")
        check(s7, f"{d}: system_gap / disease_gap", (exp_sg, exp_dg),
              (int(f.str.contains("system_gap").sum()), int(f.str.contains("disease_gap").sum())))
        nz = int((rep.cases == 0).sum())
        check(s7, f"{d}: zero weeks among reported (% to 1 decimal)", (exp_zero, exp_pct),
              (nz, round(nz / len(rep) * 100, 1)))
    mz = out[(out.disease == "measles")]
    top = mz.loc[mz.cases.astype(float).idxmax()]
    check(s7, "highest measles week", (3710, "2019-W11"), (int(top.cases), f"{top.mw_year}-W{top.mw}"))
    sus = out[out.qa_label == "suspect"]
    check(s7, "suspect rows", ["measles 2019-W8", "rubella 2019-W8"],
          [f"{r.disease} {r.mw_year}-W{r.mw}" for r in sus.itertuples()])

    # --- our own checks
    zm = mz[mz.cases == 0].groupby("mw_year").size()
    check("README 6.A.5", "measles zero weeks in 2017 / 2021", (20, 15),
          (int(zm.get(2017, 0)), int(zm.get(2021, 0))), added=True)
    src = w.set_index(["disease", "week_start"]).cases.sort_index()
    dst = out.set_index(["disease", "week_start"]).cases.sort_index()
    check("weekly", "cases identical to edcs_national_weekly, blanks included", True, bool(src.equals(dst)),
          added=True)
    check("weekly", "every hand-labelled row carries the 'found by inspection' note", 0,
          int((out.qa_flag.fillna("").str.contains("group_zero|possible_catch_up|review")
               & ~out.note.fillna("").str.startswith(HAND)).sum()), added=True)
    return out


# ------------------------------------------------------------------ step 4: WHO yearly
def clean_yearly(weekly: pd.DataFrame) -> pd.DataFrame:
    raw = pd.read_csv(RAW_WHO_YEARLY)
    check("4 yearly", "indicator in file", ["WHS3_62"], sorted(raw.IndicatorCode.unique()), added=True)
    p = raw[raw.SpatialDimValueCode == "PHL"].copy()
    p["year"] = p.Period.astype(int)
    p["cases"] = as_int(p.FactValueNumeric, "WHO yearly")
    check("3 inputs", "WHO yearly: records / first-last year / blank years", (52, 1974, 2025, [1996]),
          (len(p), int(p.year.min()), int(p.year.max()), sorted(p.year[p.cases.isna()].tolist())))
    who = pd.DataFrame({
        "disease": "measles", "source": "who_gho", "level": "national", "location": "PHILIPPINES",
        "location_id": "PH", "year": p.year, "cases": p.cases,
        "report_status": np.where(p.cases.notna(), "reported", "missing"),
        "weeks_with_data": pd.Series(pd.NA, index=p.index, dtype="Int64"),
        "who_last_updated": pd.to_datetime(p.DateModified).dt.strftime("%Y-%m-%d"),
    })

    m = weekly[weekly.disease == "measles"]
    sums = m.groupby("mw_year").agg(cases=("cases", lambda c: c.sum(min_count=1)),
                                    weeks_with_data=("cases", lambda c: int(c.notna().sum()))).reset_index()
    wsum = pd.DataFrame({
        "disease": "measles", "source": "doh_edcs_weekly_sum", "level": "national", "location": "PHILIPPINES",
        "location_id": "PH", "year": sums.mw_year, "cases": sums.cases.astype("Int64"),
        "report_status": "reported", "weeks_with_data": sums.weeks_with_data.astype("Int64"),
        "who_last_updated": pd.NA,
    })
    out = pd.concat([who, wsum], ignore_index=True).sort_values(["source", "year"], ignore_index=True)

    s7 = "7 yearly"
    w = out[out.source == "who_gho"].set_index("year")
    check(s7, "WHO yearly rows / missing", (52, 1), (len(w), int((w.report_status == "missing").sum())))
    check(s7, "WHO 2019 value", 48525, int(w.at[2019, "cases"]))
    ws = out[out.source == "doh_edcs_weekly_sum"].set_index("year")
    check(s7, "weekly sums by year (measles) 2017-2021", [271, 4087, 33699, 2970, 281],
          [int(ws.at[y, "cases"]) for y in range(2017, 2022)])
    check("README 6.A.6", "weeks with data 2017-2021", [51, 40, 48, 28, 52],
          [int(ws.at[y, "weeks_with_data"]) for y in range(2017, 2022)], added=True)
    check("README 6.A.6 / 6.B", "WHO 2014, 2017-2021, 2025", [58848, 2428, 20827, 48525, 3832, 206, 5042],
          [int(w.at[y, "cases"]) for y in [2014, 2017, 2018, 2019, 2020, 2021, 2025]], added=True)
    NOTES.append("WHO yearly comes from the GHO CSV export (`measles_number_of_reported_cases.csv`), "
                 "not the plan's JSON; `who_last_updated` is the CSV's `DateModified` date: "
                 + ", ".join(f"{k}: {v} years" for k, v in w.who_last_updated.value_counts().sort_index().items()))
    return out


# ----------------------------------------------------------------- step 5: WHO monthly
def clean_monthly(yearly: pd.DataFrame) -> tuple[pd.DataFrame, list[str], pd.DataFrame]:
    audit: list[str] = []
    x = pd.ExcelFile(RAW_WHO_MONTHLY)
    audit.append(f"Sheets: {', '.join(x.sheet_names)}")
    readme = x.parse("Read Me", header=None)
    data_as_of = [str(v) for v in readme.iloc[:, 1].dropna() if str(v).strip()[:4].isdigit()]
    raw = x.parse("WEB", dtype={"Month": str})
    raw.columns = [" ".join(str(c).split()) for c in raw.columns]
    audit.append(f"`WEB` sheet: {len(raw):,} rows x {raw.shape[1]} columns: " + ", ".join(f"`{c}`" for c in raw.columns))
    audit.append(f"`Read Me` gives the data date as {', '.join(data_as_of) or 'not stated'}; "
                 f"years {raw.Year.min()}-{raw.Year.max()}, latest month in the file {raw.Year.max()}-"
                 f"{raw.loc[raw.Year == raw.Year.max(), 'Month'].max()}")
    unknown = set(MONTHLY_COLS) - set(raw.columns)
    if unknown:
        raise KeyError(f"monthly file: expected columns not found: {unknown}")

    p = raw[raw.ISO3 == "PHL"].copy()
    p["month_start"] = pd.to_datetime(p.Year.astype(str) + "-" + p.Month.str.zfill(2) + "-01")
    for c in MONTHLY_COLS:
        p[c] = as_int(p[c], f"monthly {c}")
    p = p.rename(columns=MONTHLY_COLS)
    audit.append(f"Philippine rows: {len(p)} ({p.month_start.min():%b %Y} - {p.month_start.max():%b %Y}), "
                 f"duplicate months: {int(p.month_start.duplicated().sum())}")

    # Full monthly calendar so months with no row show as missing.
    months = pd.DataFrame({"month_start": pd.date_range(p.month_start.min(), p.month_start.max(), freq="MS")})
    df = months.merge(p[["month_start"] + list(MONTHLY_COLS.values())], on="month_start", how="left",
                      validate="one_to_one")
    df["year"], df["month"] = df.month_start.dt.year, df.month_start.dt.month
    absent = df.month_start[df.measles_total.isna() & df.measles_suspect.isna()]
    audit.append(f"Months with no Philippine row: {len(absent)}"
                 + (f" ({', '.join(f'{d:%b %Y}' for d in absent)})" if len(absent) else ""))
    df["measles_report_status"] = np.where(df.measles_total.notna(), "reported", "missing")
    df["rubella_report_status"] = np.where(df.rubella_total.notna(), "reported", "missing")

    rub_blank = df.month_start[df.rubella_total.isna()]
    audit.append(f"How gaps show: measles total is blank in {int(df.measles_total.isna().sum())} months and 0 in "
                 f"{int((df.measles_total == 0).sum())}; rubella total is blank in {len(rub_blank)} months and 0 in "
                 f"{int((df.rubella_total == 0).sum())}. A rubella blank always comes with all three rubella "
                 f"classification columns blank: {bool(df.loc[df.rubella_total.isna(), ['rubella_clinical', 'rubella_epi_linked', 'rubella_lab_confirmed']].isna().all().all())}. "
                 "Blank months are `missing`; 0 is kept as 0.")
    audit.append("Rubella blank months: " + ", ".join(f"{d:%b %Y}" for d in rub_blank))
    parts = df[["measles_clinical", "measles_epi_linked", "measles_lab_confirmed"]].sum(axis=1, min_count=1)
    audit.append(f"Measles total = clinical + epi-linked + lab-confirmed in "
                 f"{int((parts == df.measles_total).sum())} of {int(df.measles_total.notna().sum())} months")
    rparts = df[["rubella_clinical", "rubella_epi_linked", "rubella_lab_confirmed"]].sum(axis=1, min_count=1)
    audit.append(f"Rubella total = sum of its three classes in {int((rparts == df.rubella_total).sum())} of "
                 f"{int(df.rubella_total.notna().sum())} months with a rubella number")

    last2 = df.month_start.isin(df.month_start.nlargest(2))
    df["qa_flag"] = join_flags(df.index, {"latest_months": last2})
    df["qa_label"] = np.where(last2, "incomplete", "ok")
    audit.append("`latest_months` (incomplete): " + ", ".join(f"{d:%b %Y}" for d in df.month_start[last2])
                 + " (the last two Philippine months; the file's latest month overall is later, see above)")

    df["disease"], df["source"], df["level"] = "measles_rubella", "who_monthly_provisional", "national"
    df["location"], df["location_id"] = "PHILIPPINES", "PH"
    cols = ["disease", "source", "level", "location", "location_id", "year", "month", "month_start",
            *MONTHLY_COLS.values(), "measles_report_status", "rubella_report_status", "qa_label", "qa_flag"]
    out = df[cols]

    # Yearly sums vs WHO yearly (no expected numbers yet: recorded, not checked).
    who = yearly[yearly.source == "who_gho"].set_index("year").cases
    ys = out.groupby("year").agg(months=("measles_total", lambda c: int(c.notna().sum())),
                                 monthly_sum=("measles_total", lambda c: c.sum(min_count=1)))
    ys["who_yearly"] = ys.index.map(who)
    ys["difference"] = ys.monthly_sum - ys.who_yearly
    ys["monthly_vs_who_pct"] = (ys.monthly_sum / ys.who_yearly * 100).round(1)
    return out, audit, ys.reset_index()


# ------------------------------------------------------------- step 6: NBL (audit only)
def audit_nbl(e: pd.DataFrame) -> list[str]:
    x = pd.ExcelFile(RAW_NBL)
    n = x.parse(x.sheet_names[0])
    long = n.melt(id_vars="Week", var_name="col", value_name="nbl")
    parts = long.col.str.extract(r"^(.*) - (\d{4})$")
    if parts.isna().any().any():
        raise ValueError(f"NBL: unexpected columns {long.col[parts[0].isna()].unique()}")
    long["disease_raw"], long["year"] = parts[0], parts[1].astype(int)
    long["nbl"] = as_int(long.nbl, "NBL")
    diseases = list(dict.fromkeys(long.disease_raw))
    shared = [d for d in diseases if d in set(e.disease_raw)]
    extra = [d for d in diseases if d not in set(e.disease_raw)]

    L = ["# NBL workbook audit (`data/raw/unverified/Diseases Data (for NBL).xlsx`)", "",
         "**Not used** (plan/FINAL_CLEANING_PLAN.md section 4): its origin is unknown. Nothing from this file is in "
         "the clean files. Generated by `scripts/clean_measles.py`.", "",
         "## What it contains", "",
         f"- Sheets: {', '.join(x.sheet_names)}. `{x.sheet_names[0]}` is {n.shape[0]} rows x {n.shape[1]} columns, "
         "in the wide layout of `Health_Dataset.xlsx` Sheet2: `Week` (1-52) plus one column per disease and year (`<Disease> - <Year>`).",
         f"- Years: {long.year.min()}-{long.year.max()}. Weeks 1-{int(n.Week.max())} only: no 2020 week 53.",
         f"- {len(diseases)} diseases: the {len(shared)} in source A, plus {', '.join(extra)}.",
         "- No source, author or date inside the file; who compiled it and from what is unknown "
         "(the name suggests it was prepared for NBL).",
         "- Every cell is a whole number or blank."]

    a = e[e.mw <= 52][["disease_raw", "mw_year", "mw", "cases"]].rename(columns={"mw_year": "year", "mw": "Week"})
    m = long[long.year.between(2019, 2021)].merge(a, on=["disease_raw", "year", "Week"], how="inner", validate="one_to_one")
    same = (m.nbl == m.cases).fillna(False) | (m.nbl.isna() & m.cases.isna())
    m["kind"] = np.select([same, m.nbl.isna(), m.cases.isna()],
                          ["same", "blank in NBL only", "number in NBL, blank in A"], "different number")
    L += ["", "## 2019-2021 against source A, week by week", "",
          f"Compared {len(m):,} disease-weeks (18 diseases x 52 weeks x 3 years). A blank in both counts as the same.", "",
          "| Result | Disease-weeks |", "|---|---|"]
    L += [f"| {k} | {v:,} |" for k, v in m.kind.value_counts().items()]
    for d in DISEASES.values():
        g = m[m.disease_raw == d]
        L.append(f"\n**{d}:** {int((g.kind == 'same').sum())} of {len(g)} weeks identical.")
    diff = m[m.kind != "same"].sort_values(["disease_raw", "year", "Week"])
    L += ["", "Weeks that differ:", "", "| Disease | Year-week | NBL | Source A |", "|---|---|---|---|"]
    L += [f"| {r.disease_raw} | {r.year}-W{r.Week} | {r.nbl if pd.notna(r.nbl) else 'blank'} | "
          f"{r.cases if pd.notna(r.cases) else 'blank'} |" for r in diff.itertuples()]
    a19 = int(e[(e.disease == "measles") & (e.mw_year == 2019)].cases.sum())
    L += ["", "Reading the differences (team decision, 20 Oct 2026: file not used):",
          f"- Measles 2019 W10: NBL has 16,020 where A is blank, 4.3 times A's highest week (3,710, W11); likely a "
          f"cumulative or typing error. (Added to A's 2019 sum of {a19:,} it would give {a19 + 16020:,}.)",
          "- The other three are 0 in NBL where A is blank. They can't be told apart from blanks turned into 0, "
          "so the file's zeros, including 2022-2023, can't be trusted as real zeros.",
          "- Every other blank week in A is also blank in NBL."]

    L += ["", "## 2022-2023 (not merged)", "",
          "| Disease | Year | Weeks with a number | Blank weeks | Zero weeks | Sum |", "|---|---|---|---|---|---|"]
    for d in DISEASES.values():
        for y in (2022, 2023):
            g = long[(long.disease_raw == d) & (long.year == y)].sort_values("Week")
            blank = g.Week[g.nbl.isna()].tolist()
            L.append(f"| {d} | {y} | {int(g.nbl.notna().sum())} | "
                     f"{('W' + str(blank[0]) + '-W' + str(blank[-1])) if blank else 'none'} | "
                     f"{int((g.nbl == 0).sum())} | {int(g.nbl.sum()):,} |")
    all_blank = long[long.year.isin([2022, 2023])].groupby(["year", "Week"]).nbl.apply(lambda c: int(c.isna().sum()))
    sys_blank = all_blank[all_blank >= len(diseases) - 1]
    L += ["", f"Weeks blank for every disease (or all but one) in 2022-2023: "
          + (", ".join(f"{y}-W{w}" for y, w in sys_blank.index) or "none")
          + ". The trailing 2023 blanks look like the end of the data, not missed reports.",
          "", "Plan step 6 would use 2022-2023 as extra history once 2019-2021 matches source A. It doesn't match exactly "
          "(table above), and the team decided not to use the file.", ""]
    return L


# ------------------------------------------------------------ file-wide checks
def file_checks(name: str, df: pd.DataFrame, key: list[str], counts: list[str], status: dict[str, str]) -> None:
    s = "7 all files"
    neg = int((df[counts] < 0).fillna(False).any(axis=1).sum())
    sunday = int((pd.to_datetime(df.week_start).dt.dayofweek != 6).sum()) if "week_start" in df else 0
    check(s, f"{name}: negative counts / duplicate keys / week_start not Sunday", (0, 0, 0),
          (neg, int(df.duplicated(key).sum()), sunday))
    for st_col, c in status.items():
        check("all files", f"{name}: `missing` rows with a number in {c}", 0,
              int((df[c].notna() & (df[st_col] != "reported")).sum()), added=True)


# ------------------------------------------------------------------------ step 8
def make_plots(weekly: pd.DataFrame, edcs: pd.DataFrame, yearly: pd.DataFrame) -> list[Path]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    import matplotlib.ticker
    from matplotlib.colors import LinearSegmentedColormap
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    BLUE, ORANGE, RED = "#2a78d6", "#eb6834", "#e34948"
    SURF, INK, INK2, GRID, GAP = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e0", "#c3c2b7"
    plt.rcParams.update({
        "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
        "axes.edgecolor": GAP, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
        "text.color": INK, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
        "axes.spines.top": False, "axes.spines.right": False, "font.size": 10, "axes.titlesize": 11,
        "axes.titleweight": "bold", "axes.titlelocation": "left", "legend.frameon": False,
    })
    FIGURES.mkdir(parents=True, exist_ok=True)
    meta = {"Software": None}
    thousands = matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}")
    paths = []

    # 1. weekly measles and rubella, blank weeks shaded, 2019 W8/9/11 marked
    fig, axes = plt.subplots(2, 1, figsize=(13, 7.5), sharex=True)
    for ax, d, color in [(axes[0], "measles", BLUE), (axes[1], "rubella", ORANGE)]:
        g = weekly[weekly.disease == d].set_index("week_start")
        for i, w in enumerate(g.index[g.report_status == "missing"]):
            ax.axvspan(w, w + pd.Timedelta(days=7), color=GAP, alpha=0.55, lw=0, label="blank week (missing)" if i == 0 else None)
        ax.plot(g.index, g.cases.astype(float), color=color, lw=1.6, label=f"{d} cases as reported")
        s = g[g.qa_label == "suspect"]
        ax.plot(s.index, s.cases.astype(float), "o", ms=8, color=RED, mec=SURF, mew=1.5, label="2019 W8: suspect zero (group_zero)")
        c = g[g.qa_flag.fillna("").str.contains("possible_catch_up")]
        if len(c):
            ax.plot(c.index, c.cases.astype(float), "o", ms=8, mfc=SURF, mec=INK2, mew=1.6, label="2019 W9, W11: possible catch-up")
            for wk_, r in c.iterrows():
                ax.annotate(f"{r.mw_year} W{r.mw}: {int(r.cases):,}", (wk_, float(r.cases)), xytext=(8, 0),
                            textcoords="offset points", va="center", fontsize=9, color=INK2)
        ax.yaxis.set_major_formatter(thousands)
        ax.set_ylabel("cases per week")
        ax.set_title(f"{d.capitalize()}, DOH weekly reports (national), 2017-2021")
        ax.legend(loc="upper right")
    axes[1].xaxis.set_major_locator(mdates.YearLocator())
    axes[1].xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    fig.text(0.01, 0.005, "Labels for 2019 W8, W9 and W11 were found by inspection, not by a general rule.",
             fontsize=8.5, color=INK2)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    p = FIGURES / "1_weekly_measles_rubella.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)

    # 2. heat strip, 2019 weeks 1-14, all 18 diseases (each row scaled to its own max)
    h = edcs[(edcs.mw_year == 2019) & edcs.mw.between(1, 14)]
    order = list(dict.fromkeys(edcs.sort_values("disease_raw").disease_raw))
    tab = h.pivot(index="disease_raw", columns="mw", values="cases").reindex(order).astype(float)
    scaled = tab.div(tab.max(axis=1).replace(0, np.nan), axis=0)
    cmap = LinearSegmentedColormap.from_list("seq", ["#eef4fc", "#1f5fae"])
    cmap.set_bad(GAP)
    fig, ax = plt.subplots(figsize=(13, 8.2))
    ax.imshow(np.ma.masked_invalid(scaled.values), cmap=cmap, vmin=0, vmax=1, aspect="auto")
    for i in range(tab.shape[0]):
        for j in range(tab.shape[1]):
            v = tab.iat[i, j]
            txt = "blank" if np.isnan(v) else f"{int(v):,}"
            dark = (not np.isnan(scaled.iat[i, j])) and scaled.iat[i, j] > 0.55
            ax.text(j, i, txt, ha="center", va="center", fontsize=7.5,
                    color=SURF if dark else (RED if v == 0 else INK2), fontweight="bold" if v == 0 else "normal")
    col8 = list(tab.columns).index(8)
    ax.add_patch(matplotlib.patches.Rectangle((col8 - 0.5, -0.5), 1, tab.shape[0], fill=False, ec=RED, lw=2.2))
    ax.set_xticks(range(tab.shape[1]), [f"W{c}" for c in tab.columns])
    ax.set_yticks(range(tab.shape[0]), tab.index)
    ax.grid(False)
    ax.set_title("2019 weeks 1-14, all 18 diseases: week 8 reads 0 for measles, rubella and 6 others (red = 0)")
    ax.legend(handles=[Patch(color=GAP, label="blank (no report)"),
                       Patch(color="#1f5fae", label="darker = closer to that disease's highest week in W1-14")],
              loc="upper left", bbox_to_anchor=(0, -0.05), ncols=2)
    fig.tight_layout()
    p = FIGURES / "2_heat_strip_2019_w1_14.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)

    # 3. WHO yearly bars, weekly sums as dots 2017-2021
    w = yearly[yearly.source == "who_gho"]
    s = yearly[yearly.source == "doh_edcs_weekly_sum"]
    fig, ax = plt.subplots(figsize=(13, 5))
    ax.bar(w.year, w.cases.astype(float), width=0.8, color=BLUE, label="WHO yearly reported cases (GHO)")
    for y in w.year[w.report_status == "missing"]:
        ax.annotate("no data", (y, 0), xytext=(0, 6), textcoords="offset points", ha="center", fontsize=8,
                    color=INK2, rotation=90)
    ax.plot(s.year, s.cases.astype(float), "o", ms=9, color=ORANGE, mec=SURF, mew=1.5,
            label="sum of DOH weekly reports (weeks with data)")
    who_by_year = w.set_index("year").cases
    box = "Weekly sum vs WHO (weeks with data)\n" + "\n".join(
        f"{r.year}:  {int(r.cases):>6,} vs {int(who_by_year[r.year]):>6,}  ({r.weeks_with_data} wk)"
        for r in s.itertuples())
    ax.text(0.99, 0.97, box, transform=ax.transAxes, ha="right", va="top", fontsize=9, family="monospace",
            color=INK2, bbox={"boxstyle": "round,pad=0.5", "fc": SURF, "ec": GAP})
    ax.yaxis.set_major_formatter(thousands)
    ax.set_ylabel("cases per year")
    ax.set_title("Measles, Philippines: WHO yearly totals, with the weekly-report sums for 2017-2021")
    ax.legend(loc="upper left")
    ax.set_xlim(1972.5, 2026.5)
    fig.tight_layout()
    p = FIGURES / "3_who_yearly_vs_weekly_sums.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)
    return paths


# ------------------------------------------------------------------------ report
def write_report(audit: list[str], ys: pd.DataFrame, figs: list[Path]) -> int:
    chk = pd.DataFrame(CHECKS)
    write_csv(chk, CLEAN / "checks.csv")
    n_fail = int((chk.result == "FAIL").sum())

    def table(rows: pd.DataFrame) -> list[str]:
        t = ["| Step | Check | Expected | Actual | Result |", "|---|---|---|---|---|"]
        for r in rows.itertuples():
            e, a = (str(x).replace("|", "\\|") for x in (r.expected, r.actual))
            t.append(f"| {r.step} | {r.check} | {e} | {a} | **{r.result}** |")
        return t

    plan, added = chk[chk.origin == "plan"], chk[chk.origin == "added"]
    L = ["# Measles cleaning: check report", "",
         "Generated by `scripts/clean_measles.py`. Do not edit by hand.", "",
         f"**Plan checks: {int((plan.result == 'PASS').sum())} of {len(plan)} pass. "
         f"Added checks: {int((added.result == 'PASS').sum())} of {len(added)} pass.**", "",
         "Counts must match exactly; percentages are compared at one decimal place.", "",
         "## Plan checks (step 7, plus the expectations in plan steps 1-4)", ""] + table(plan)
    L += ["", "## Checks we added (not in the plan)", "",
          "From README section 6 or our own consistency checks."] + [""] + table(added)
    L += ["", "## WHO monthly file (source C): first audit", "",
          "The plan has no expected numbers for this file yet, so this records what we found.", ""]
    L += [f"- {a}" for a in audit]
    L += ["", "Yearly sums of the monthly measles total against WHO's yearly value (source B):", "",
          "| Year | Months | Monthly sum | WHO yearly | Difference | Monthly as % of WHO |", "|---|---|---|---|---|---|"]
    for r in ys.itertuples():
        who = "-" if pd.isna(r.who_yearly) else f"{int(r.who_yearly):,}"
        dif = "-" if pd.isna(r.difference) else f"{int(r.difference):+,}"
        pct = "-" if pd.isna(r.monthly_vs_who_pct) else f"{r.monthly_vs_who_pct}%"
        L.append(f"| {r.year} | {r.months} | {int(r.monthly_sum):,} | {who} | {dif} | {pct} |")
    L += ["", "## Notes", ""] + [f"- {n}" for n in NOTES]
    L += ["", "## Figures", ""] + [f"- `{p.relative_to(ROOT).as_posix()}`" for p in figs] + [""]
    (CLEAN / "check_report.md").write_text("\n".join(L), encoding="utf-8", newline="\n")
    return n_fail


# -------------------------------------------------------------------------- main
def main() -> int:
    edcs = read_edcs()
    weekly = clean_weekly(edcs)
    yearly = clean_yearly(weekly)
    monthly, audit, ys = clean_monthly(yearly)
    nbl = audit_nbl(edcs)

    file_checks("measles_national_weekly", weekly, ["disease", "week_start"],
                ["cases", "cases_fixed"], {"report_status": "cases"})
    file_checks("measles_national_yearly", yearly, ["source", "year"], ["cases"], {"report_status": "cases"})
    file_checks("measles_national_monthly", monthly, ["month_start"], list(MONTHLY_COLS.values()),
                {"measles_report_status": "measles_total", "rubella_report_status": "rubella_total"})

    write_csv(weekly, CLEAN / "measles_national_weekly.csv")
    write_csv(yearly, CLEAN / "measles_national_yearly.csv")
    write_csv(monthly, CLEAN / "measles_national_monthly.csv")
    (CLEAN / "nbl_audit.md").write_text("\n".join(nbl), encoding="utf-8", newline="\n")
    figs = make_plots(weekly, edcs, yearly)

    n_fail = write_report(audit, ys, figs)
    print(f"{len(CHECKS) - n_fail}/{len(CHECKS)} checks pass. Report: {(CLEAN / 'check_report.md').relative_to(ROOT)}")
    for c in CHECKS:
        if c["result"] == "FAIL":
            print(f"FAIL [{c['origin']}: {c['step']}] {c['check']}: expected {c['expected']}, got {c['actual']}")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
