"""Clean the TB data for IRIS (Team Nex, PJDSC 2026).

Follows data/tb/CLEANING_PLAN.md step by step, with the decisions in
plan/FINAL_CLEANING_PLAN.md section 5 where they differ. One command, safe to re-run:

    python scripts/clean_tb.py

Reads WHO's live files from 19 Oct 2026 (data/raw/TB/) and WHO's 30 Jul 2025
snapshot backups (data/raw/TB/snapshot_2025-07-30/), and writes to data/tb/clean/:
    tb_national_annual.csv, tb_national_monthly.csv, checks.csv, check_report.md, figures/*.png

Estimates stay estimates (bounds kept everywhere), annual and monthly never mix,
labels come from dates and DOH's remarks (never from counts), and a blank stays
blank. Each check is PASS, FAIL or WHO revision (the live value differs from the
30 Jul 2025 snapshot the plan was written from, for a documented reason).
Exits with code 1 if any check FAILs.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "TB"
RAW_A = RAW / "WHO TB incidence.csv"  # C288D13_ALL_LATEST.csv, renamed
RAW_B = RAW / "TB_burden_countries_2026-10-19.csv"
RAW_C = RAW / "TB_notifications_2026-10-19.csv"
RAW_D = RAW / "TB_provisional_notifications_2026-10-19.csv"
RAW_E = RAW / "TB_ppm_2026-10-19.csv"
RAW_F = RAW / "TB_data_dictionary_2026-10-19.csv"
SNAP = RAW / "snapshot_2025-07-30"  # WHO's 30 Jul 2025 snapshot (gtbreport2025 repository)
SNAP_ANNUAL = SNAP / "annual_notifs.csv"
SNAP_MONTHLY = SNAP / "sub_annual_notifs.csv"

CLEAN = ROOT / "data" / "tb" / "clean"
FIGURES = CLEAN / "figures"

# ----------------------------------------------------------------------- constants
LIVE_DOWNLOADED = "2026-10-19"  # date stamped in the live file names
WHO_REPORT = 2025  # estimate round in B: ends 2024 and matches Global TB Report 2025 values
YEARS = range(2000, 2025)
COVERAGE_CODES = {34: "all_units", 35: "some_units"}

# Plan section 4: labels from dates and DOH's remarks only.
M = pd.Timestamp
LABEL_MONTHS = {
    "covid_disruption": [M("2020-04-01"), M("2020-05-01")],
    "source_partial": [M(f"{y}-{m:02d}-01") for y in (2021, 2022) for m in (10, 11, 12)],
    "q4_not_final": [M(f"2024-{m:02d}-01") for m in (10, 11, 12)],
}
FLAG_ORDER = ["covid_disruption", "source_partial", "latest_months", "q4_not_final"]

# ------------------------------------------------------------------------- checks
CHECKS: list[dict] = []
REVISIONS: list[dict] = []
NOTES: list[str] = []


def check(step: str, name: str, expected, actual, added: bool = False, revision: str | None = None,
          ok: bool | None = None) -> str:
    """PASS if equal (or if `ok`, for tolerance checks). If not, 'WHO revision' only when `revision`
    gives the documented reason; else FAIL."""
    if (expected == actual) if ok is None else ok:
        result = "PASS"
    elif revision:
        result = "WHO revision"
        REVISIONS.append({"what": f"{step}: {name}", "old": str(expected), "new": str(actual), "reason": revision})
    else:
        result = "FAIL"
    CHECKS.append({"origin": "added" if added else "plan", "step": step, "check": name, "expected": str(expected),
                   "actual": str(actual), "result": result, "note": revision or ""})
    return result


def sig3_half_unit(x: float) -> float:
    """Half a unit in the 3rd significant figure: the rounding error of WHO's public estimate files."""
    return 0.5 * 10 ** (math.floor(math.log10(abs(x))) - 2) if x else 0.5


def about(expected: float, actual: float, actual_err: float, expected_err: float = 500) -> bool:
    """'About X' (rounded to the nearest 1,000) is consistent with the live value given both rounding errors."""
    return abs(expected - actual) <= expected_err + actual_err


def as_int(s: pd.Series, what: str) -> pd.Series:
    s = pd.to_numeric(s, errors="raise")
    frac = s.dropna() % 1
    if (frac != 0).any():
        raise ValueError(f"{what}: non-integer values {s.dropna()[frac != 0].tolist()[:5]}")
    return s.astype("Int64")


def write_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, lineterminator="\n", date_format="%Y-%m-%d")


def phl(df: pd.DataFrame) -> pd.DataFrame:
    return df[df.iso3 == "PHL"].copy()


# ------------------------------------------------------------------ step 1: annual
def build_annual() -> tuple[pd.DataFrame, pd.DataFrame]:
    b = phl(pd.read_csv(RAW_B))
    c = phl(pd.read_csv(RAW_C, low_memory=False))
    e = phl(pd.read_csv(RAW_E))
    for name, df in [("B", b), ("C", c), ("E", e)]:
        check("6 all files", f"{name}: duplicate PHL years", 0, int(df.year.duplicated().sum()))
    check("3 inputs", "B: Philippine years", (2000, 2024, 25), (int(b.year.min()), int(b.year.max()), len(b)))
    check("3 inputs", "C: Philippine years", (1980, 2024, 45), (int(c.year.min()), int(c.year.max()), len(c)))

    ann = pd.DataFrame({"year": list(YEARS)})
    ann = ann.merge(b[["year", "e_pop_num", "e_inc_100k", "e_inc_100k_lo", "e_inc_100k_hi",
                       "e_inc_num", "e_inc_num_lo", "e_inc_num_hi"]], on="year", how="left", validate="one_to_one")
    ann = ann.merge(c[["year", "c_newinc"]], on="year", how="left", validate="one_to_one")
    ann = ann.merge(e[["year", "priv_new_dx"]], on="year", how="left", validate="one_to_one")
    ann = ann.rename(columns={
        "e_pop_num": "population", "e_inc_100k": "inc_rate", "e_inc_100k_lo": "inc_rate_lo",
        "e_inc_100k_hi": "inc_rate_hi", "e_inc_num": "inc_est", "e_inc_num_lo": "inc_est_lo",
        "e_inc_num_hi": "inc_est_hi", "c_newinc": "notified", "priv_new_dx": "notified_private"})
    for col in ["population", "inc_est", "inc_est_lo", "inc_est_hi", "notified", "notified_private"]:
        ann[col] = as_int(ann[col], col)

    # Computed from estimates: bounds carried. Coverage is highest when the estimate is lowest.
    n, est, lo, hi = (ann[k].astype(float) for k in ["notified", "inc_est", "inc_est_lo", "inc_est_hi"])
    ann["coverage"], ann["coverage_lo"], ann["coverage_hi"] = (n / est).round(4), (n / hi).round(4), (n / lo).round(4)
    ann["gap_est"] = (ann.inc_est - ann.notified).astype("Int64")
    ann["gap_est_lo"] = (ann.inc_est_lo - ann.notified).astype("Int64")
    ann["gap_est_hi"] = (ann.inc_est_hi - ann.notified).astype("Int64")
    ann["who_report"] = WHO_REPORT
    ann["downloaded"] = LIVE_DOWNLOADED
    ann = ann[["year", "population", "inc_rate", "inc_rate_lo", "inc_rate_hi", "inc_est", "inc_est_lo", "inc_est_hi",
               "notified", "notified_private", "coverage", "coverage_lo", "coverage_hi",
               "gap_est", "gap_est_lo", "gap_est_hi", "who_report", "downloaded"]]

    # Source A against B (plan step 1.5 / 4.2)
    a = pd.read_csv(RAW_A)
    pa = a[a.DIM_GEO_CODE_M49 == 608].rename(columns={
        "DIM_TIME": "year", "RATE_PER_100000_N": "a_rate", "RATE_PER_100000_NL": "a_lo", "RATE_PER_100000_NU": "a_hi"})
    check("6 all files", "A: duplicate PHL years", 0, int(pa.year.duplicated().sum()))
    ab = (pa[["year", "a_rate", "a_lo", "a_hi"]].merge(ann[["year", "inc_rate", "inc_rate_lo", "inc_rate_hi"]], on="year")
          .sort_values("year", ignore_index=True))
    ab["match"] = ((ab.a_rate.round() == ab.inc_rate.round()) & (ab.a_lo.round() == ab.inc_rate_lo.round())
                   & (ab.a_hi.round() == ab.inc_rate_hi.round()))
    a_last = int(pa.year.max())
    NOTES.append(f"Source A covers {int(pa.year.min())}-{a_last}; B covers the newest year(s) "
                 f"({', '.join(str(y) for y in YEARS if y > a_last)}).")
    differ = ab[~ab.match]
    a_reason = (f"older WHO estimate round: data.who.int lists this indicator's last update as 8 Jan 2024 (team "
                f"decision, plan/FINAL_CLEANING_PLAN.md 5); A ends in {a_last}, one year behind B, and differs only in "
                f"{int(differ.year.min())}-{int(differ.year.max())}. B is used for every number; A is a reference only"
                ) if len(differ) else None
    check("4 cross-checks", "A rate (and range) = B after rounding: years that differ", [],
          [f"{r.year}: A {r.a_rate:.0f} ({r.a_lo:.0f}-{r.a_hi:.0f}) vs B {r.inc_rate:.0f} ({r.inc_rate_lo:.0f}-{r.inc_rate_hi:.0f})"
           for r in differ.itertuples()], revision=a_reason)
    return ann, ab


# ----------------------------------------------------------------- step 2-3: monthly
def build_monthly() -> pd.DataFrame:
    d = phl(pd.read_csv(RAW_D))
    snap = phl(pd.read_csv(SNAP_MONTHLY, encoding="utf-8"))
    check("2 monthly", "every PHL row report_frequency = 70 (monthly)", [70], sorted(d.report_frequency.unique().tolist()))
    check("6 all files", "D: duplicate PHL years", 0, int(d.year.duplicated().sum()))
    check("2 monthly", "report_coverage codes are 34/35 only", True, set(d.report_coverage.dropna()) <= set(COVERAGE_CODES),
          added=True)
    has_remarks = "remarks" in d.columns
    NOTES.append("The live provisional file has " + ("" if has_remarks else "no `remarks` or `gaps_na` columns; ")
                 + "`source_remarks` is taken from the 30 Jul 2025 snapshot (`sub_annual_notifs.csv`) for 2020-2025"
                 + (", and is blank for later years." if not has_remarks else "."))
    remarks = (d if has_remarks else snap).set_index("year").remarks.str.strip()

    long = d.melt(id_vars=["year", "report_coverage"], value_vars=[f"m_{m:02d}" for m in range(1, 13)],
                  var_name="m", value_name="cases")
    long["month"] = long.m.str[2:].astype(int)
    long["month_start"] = pd.to_datetime(dict(year=long.year, month=long.month, day=1))
    long["cases"] = as_int(long.cases, "D monthly")
    long = long.sort_values("month_start", ignore_index=True)
    reported = long.cases.notna()
    long["report_status"] = np.where(reported, "reported", "missing")
    long["is_december"] = long.month == 12
    long["source_coverage"] = long.report_coverage.map(COVERAGE_CODES)
    long["source_remarks"] = long.year.map(remarks)

    flags = {k: long.month_start.isin(v) for k, v in LABEL_MONTHS.items()}
    flags["latest_months"] = long.month_start.isin(long.month_start[reported].nlargest(2))
    flag_txt = pd.Series("", index=long.index, dtype=object)
    for code in FLAG_ORDER:
        m = flags[code] & reported
        flag_txt[m] = np.where(flag_txt[m] == "", code, flag_txt[m] + ";" + code)
    long["qa_flag"] = flag_txt.replace("", pd.NA)
    suspect = (flags["covid_disruption"] | flags["source_partial"]) & reported
    long["qa_label"] = pd.Series(np.select([flags["latest_months"], suspect], ["incomplete", "suspect"], "ok"),
                                 index=long.index).where(reported)
    long["disease"], long["source"], long["level"], long["location"] = "tb", "who_provisional", "national", "PHILIPPINES"
    out = long[["disease", "source", "level", "location", "month_start", "year", "month", "is_december", "cases",
                "report_status", "source_coverage", "source_remarks", "qa_label", "qa_flag"]]
    NOTES.append("Latest reported month in the live file: "
                 + f"{out.month_start[reported].max():%b %Y}; `latest_months` = "
                 + ", ".join(f"{d_:%b %Y}" for d_ in sorted(out.month_start[flags['latest_months']])))
    return out, snap


# -------------------------------------------------------------- live vs snapshot
def compare_snapshot(ann: pd.DataFrame, monthly: pd.DataFrame, snap_m: pd.DataFrame) -> list[dict]:
    rows = []
    sa = phl(pd.read_csv(SNAP_ANNUAL)).set_index("year")
    live = ann.set_index("year")
    for col_snap, col_live in [("c_newinc", "notified"), ("priv_new_dx", "notified_private"), ("e_pop_num", "population")]:
        for y in sa.index:
            o, n = sa.at[y, col_snap], live[col_live].get(y, pd.NA)
            if pd.isna(o) and pd.isna(n):
                continue
            if pd.isna(o) or pd.isna(n) or int(o) != int(n):
                reason = ("not in the live public-private mix file (it starts in 2010)"
                          if col_snap == "priv_new_dx" and pd.isna(n) and y < 2010 else "revised by WHO")
                rows.append({"table": "annual", "what": f"{col_live} {y}", "old": o, "new": n, "reason": reason})
    sm = snap_m.melt(id_vars="year", value_vars=[f"m_{m:02d}" for m in range(1, 13)], var_name="m", value_name="old")
    sm["month_start"] = pd.to_datetime(dict(year=sm.year, month=sm.m.str[2:].astype(int), day=1))
    cmp = monthly[["month_start", "cases"]].merge(sm[["month_start", "old"]], on="month_start", how="left")
    snap_last = sm.month_start[sm.old.notna()].max()
    for r in cmp.itertuples():
        o, n = r.old, r.cases
        if (pd.isna(o) and pd.isna(n)) or (pd.notna(o) and pd.notna(n) and int(o) == int(n)):
            continue
        if pd.isna(o) and pd.notna(n):
            reason = "new month, reported after the snapshot"
        elif pd.notna(o) and pd.notna(n):
            reason = ("late reports added (the snapshot's 2025 data was as of 8 Jul 2025)"
                      if n > o else "revised down by WHO/DOH")
        else:
            reason = "dropped from the live file"
        rows.append({"table": "monthly", "what": f"{r.month_start:%b %Y}", "old": o, "new": n, "reason": reason})
    NOTES.append(f"Snapshot's last reported month: {snap_last:%b %Y}.")
    return rows


# ------------------------------------------------------------------ step 6: checks
def run_checks(ann: pd.DataFrame, ab: pd.DataFrame, monthly: pd.DataFrame, snap_m: pd.DataFrame, diffs: list[dict]) -> None:
    s = "6 checks"
    a = ann.set_index("year")
    check(s, "annual rows (2000-2024)", 25, len(ann))
    check(s, "estimated rate 2019 / 2020 / 2024", (554, 544, 625), tuple(int(a.at[y, "inc_rate"]) for y in (2019, 2020, 2024)))
    e24 = [int(a.at[2024, k]) for k in ("inc_est", "inc_est_lo", "inc_est_hi")]
    ok = all(about(x, v, sig3_half_unit(v)) for x, v in zip((724000, 399000, 1176000), e24))
    check(s, "estimated cases 2024, about (live file rounds to 3 significant figures)",
          "about 724,000 (399,000 - 1,176,000)", f"{e24[0]:,} ({e24[1]:,} - {e24[2]:,})", ok=ok)
    NOTES.append(f"Estimated cases 2024 in the live file: {e24[0]:,} ({e24[1]:,} - {e24[2]:,}). The live file rounds "
                 "estimates to 3 significant figures; README's 723,902 (398,854 - 1,175,835) rounds to the same values.")
    check(s, "notified 2019 / 2020 / 2024", (409167, 256541, 544948),
          tuple(int(a.at[y, "notified"]) for y in (2019, 2020, 2024)))
    check(s, "change in notified 2019 -> 2020 (%)", -37.3,
          round((a.at[2020, "notified"] - a.at[2019, "notified"]) / a.at[2019, "notified"] * 100, 1))
    check(s, "coverage 2019 / 2020 (%)", (66.6, 42.1),
          tuple(round(float(a.at[y, "notified"]) / float(a.at[y, "inc_est"]) * 100, 1) for y in (2019, 2020)))
    g = [int(a.at[2020, k]) for k in ("gap_est", "gap_est_lo", "gap_est_hi")]
    errs = [sig3_half_unit(float(a.at[2020, k])) for k in ("inc_est", "inc_est_lo", "inc_est_hi")]
    ok = all(about(x, v, err) for x, v, err in zip((353000, 85000, 710000), g, errs))
    check(s, "estimated gap 2020, about (rounding of the live estimate carried through)",
          "about 353,000 (85,000 - 710,000)", f"{g[0]:,} ({g[1]:,} - {g[2]:,})", ok=ok)
    NOTES.append(f"Estimated gap 2020 from the live file: {g[0]:,} ({g[1]:,} - {g[2]:,}); each bound carries the "
                 "+/-500 rounding of the live estimate it comes from.")
    neg = ann[ann.gap_est_lo < 0]
    NOTES.append(f"`gap_est_lo` is below 0 in {len(neg)} years ({', '.join(str(y) for y in neg.year)}): notified cases "
                 "exceed WHO's low estimate, so `coverage_hi` is above 100%. Kept as computed (plan formula), not clipped.")
    check(s, "private 2019 -> 2020", (189574, 58866), tuple(int(a.at[y, "notified_private"]) for y in (2019, 2020)))
    mo = monthly.set_index("month_start")
    check(s, "monthly January / April 2020", (40104, 10489),
          (int(mo.at[M("2020-01-01"), "cases"]), int(mo.at[M("2020-04-01"), "cases"])))
    check(s, "monthly sum 2020", 259458, int(monthly.loc[monthly.year == 2020, "cases"].sum()))

    rep = monthly[monthly.report_status == "reported"]
    snap_n = int(snap_m[[f"m_{m:02d}" for m in range(1, 13)]].notna().sum().sum())
    check(s, "reported months in the snapshot backup", 66, snap_n)
    new_months = [d_ for d_ in diffs if d_["table"] == "monthly" and d_["reason"].startswith("new month")]
    check(s, "reported months in the live file (Jan 2020 - latest)", "66 (Jan 2020 - Jun 2025)",
          f"{len(rep)} ({rep.month_start.min():%b %Y} - {rep.month_start.max():%b %Y})",
          revision=f"{len(new_months)} months reported after the 30 Jul 2025 snapshot" if len(rep) == 66 + len(new_months) else None)
    sus = monthly[monthly.qa_label == "suspect"]
    check(s, "suspect months (2 COVID + 6 partial)", 8, len(sus))
    for name, df, key in [("annual", ann, "year"), ("monthly", monthly, "month_start")]:
        counts = [c for c in ["population", "inc_est", "inc_est_lo", "inc_est_hi", "notified", "notified_private", "cases"] if c in df]
        check(s, f"{name}: negative counts / duplicate {key}", (0, 0),
              (int((df[counts] < 0).fillna(False).any(axis=1).sum()), int(df[key].duplicated().sum())))

    # Plan step 4 cross-checks
    rat = []
    for y in range(2020, 2025):
        rat.append(round(monthly.loc[monthly.year == y, "cases"].sum() / a.at[y, "notified"] * 100, 1))
    check("4 cross-checks", "monthly sum / final yearly total, 2020-2024: all within 92-102%", True,
          all(92 <= r <= 102 for r in rat))
    check("4 cross-checks", "monthly sum / final total by year (README 6.D.5), %", [101.1, 92.6, 95.2, 95.9, 100.7], rat,
          added=True)
    snap_2020_24 = [d_ for d_ in diffs if (d_["table"] == "annual" and 2020 <= int(d_["what"][-4:]) <= 2024)
                    or (d_["table"] == "monthly" and d_["what"][-4:] in {"2020", "2021", "2022", "2023", "2024"})]
    check("4 cross-checks", "live vs snapshot, 2020-2024 values that differ", [],
          [f"{d_['what']}: {d_['old']} -> {d_['new']}" for d_ in snap_2020_24])

    # Our own checks
    check("labels", "months per label (from dates only)",
          {"covid_disruption": 2, "source_partial": 6, "q4_not_final": 3, "latest_months": 2},
          {k: int(monthly.qa_flag.fillna("").str.contains(k).sum()) for k in
           ["covid_disruption", "source_partial", "q4_not_final", "latest_months"]}, added=True)
    check("labels", "suspect months", ["Apr 2020", "May 2020", "Oct 2021", "Nov 2021", "Dec 2021", "Oct 2022", "Nov 2022", "Dec 2022"],
          [f"{d_:%b %Y}" for d_ in sus.month_start], added=True)
    check("monthly", "`missing` months with a number / blank-then-reported months inside the series", (0, 0),
          (int((monthly.cases.notna() & (monthly.report_status != "reported")).sum()),
           int(((monthly.report_status == "missing") & (monthly.month_start < rep.month_start.max())).sum())), added=True)
    check("monthly", "source_coverage 2020-2024 some_units, 2025 all_units (README 6.D.1)",
          {2020: "some_units", 2021: "some_units", 2022: "some_units", 2023: "some_units", 2024: "some_units", 2025: "all_units"},
          {int(y): v for y, v in monthly[monthly.year <= 2025].groupby("year").source_coverage.first().items()}, added=True)
    check("annual", "every estimate column has its low and high bound filled", 0,
          int(ann[["inc_est", "inc_est_lo", "inc_est_hi", "gap_est", "gap_est_lo", "gap_est_hi", "coverage", "coverage_lo",
                   "coverage_hi"]].isna().any(axis=1).sum()), added=True)
    check("annual", "A matches B for 2000-2019", True, bool(ab[ab.year <= 2019].match.all()), added=True)
    d = pd.read_csv(RAW_F)
    found = [v for v in ["c_newinc", "priv_new_dx", "e_inc_num", "e_inc_100k", "m_01", "report_coverage", "gaps_na"]
             if v in set(d.variable_name)]
    NOTES.append("Data dictionary (F): defines " + ", ".join(f"`{v}`" for v in found) + "; missing: "
                 + (", ".join(f"`{v}`" for v in ["c_newinc", "priv_new_dx", "e_inc_num", "e_inc_100k", "m_01",
                                                 "report_coverage", "gaps_na"] if v not in found) or "none"))


# ------------------------------------------------------------------------ step 5
def make_plots(ann: pd.DataFrame, monthly: pd.DataFrame) -> list[Path]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    import matplotlib.ticker

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

    # 1. estimated (with range) vs notified, 2000-2024
    a = ann.astype({c: float for c in ["inc_est", "inc_est_lo", "inc_est_hi", "notified"]})
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.fill_between(a.year, a.inc_est_lo, a.inc_est_hi, color=BLUE, alpha=0.15, lw=0, label="estimate range (WHO)")
    ax.plot(a.year, a.inc_est, color=BLUE, lw=2, label="estimated TB cases (WHO estimate)")
    ax.plot(a.year, a.notified, color=ORANGE, lw=2, marker="o", ms=4, label="notified cases (new and relapse)")
    r = a[a.year == 2020].iloc[0]
    ax.annotate("", xy=(2020, r.notified), xytext=(2020, r.inc_est),
                arrowprops={"arrowstyle": "<->", "color": INK2, "lw": 1.2})
    ax.annotate(f"2020: estimated gap {int(r.inc_est - r.notified):,}\n(range {int(r.inc_est_lo - r.notified):,} - "
                f"{int(r.inc_est_hi - r.notified):,}); an estimate,\nnot a count of missed patients",
                (2020, (r.notified + r.inc_est) / 2), xytext=(-12, 0), textcoords="offset points", ha="right",
                va="center", fontsize=9, color=INK2)
    ax.yaxis.set_major_formatter(thousands)
    ax.set_ylabel("cases per year")
    ax.set_title("TB, Philippines: WHO's estimated cases (with range) against notified cases, 2000-2024")
    ax.legend(loc="upper left")
    ax.set_xticks(range(2000, 2025, 2))
    fig.tight_layout()
    p = FIGURES / "1_estimated_vs_notified.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)

    # 2. private vs all other notifications, 2015-2024
    s = ann[ann.year.between(2015, 2024)].astype({"notified": float, "notified_private": float})
    other = s.notified - s.notified_private
    fig, ax = plt.subplots(figsize=(11, 4.8))
    ax.plot(s.year, s.notified_private, color=ORANGE, lw=2, marker="o", ms=6, label="private providers (new cases)")
    ax.plot(s.year, other, color=BLUE, lw=2, marker="o", ms=6, label="all other notifications (about: total minus private)")
    for y in (2019, 2020):
        rr = s[s.year == y].iloc[0]
        ax.annotate(f"{int(rr.notified_private):,}", (y, rr.notified_private), xytext=(0, 9), textcoords="offset points",
                    ha="center", fontsize=9, color=INK2)
    ax.yaxis.set_major_formatter(thousands)
    ax.set_ylabel("cases per year")
    ax.set_title("TB notifications by channel, 2015-2024: private providers collapse in 2020 (-69%)")
    ax.legend(loc="upper left")
    ax.set_xticks(range(2015, 2025))
    fig.tight_layout()
    p = FIGURES / "2_private_vs_other.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)

    # 3. monthly provisional, labels marked
    m = monthly.set_index("month_start")
    fig, ax = plt.subplots(figsize=(13, 5))
    for i, d_ in enumerate(m.index[m.report_status == "missing"]):
        ax.axvspan(d_, d_ + pd.offsets.MonthBegin(1), color=GAP, alpha=0.55, lw=0, label="no number yet (missing)" if i == 0 else None)
    ax.plot(m.index, m.cases.astype(float), color=BLUE, lw=1.8, marker="o", ms=3.5, label="notified per month (provisional)")
    f = m.qa_flag.fillna("")
    for code, style, label in [
        ("covid_disruption", dict(ms=9, color=RED, mec=SURF, mew=1.5), "suspect: COVID quarantine (Apr-May 2020)"),
        ("source_partial", dict(ms=9, marker="s", color=RED, mec=SURF, mew=1.5), "suspect: DOH says partial (Oct-Dec 2021, 2022)"),
        ("q4_not_final", dict(ms=9, marker="^", color=GAP, mec=INK2, mew=1.2), "Q4 2024 not final (no label change)"),
        ("latest_months", dict(ms=10, mfc=SURF, mec=INK2, mew=1.8), "incomplete: latest two months"),
    ]:
        sel = m[f.str.contains(code)]
        ax.plot(sel.index, sel.cases.astype(float), ls="", **{"marker": "o", **style}, label=label)
    ax.yaxis.set_major_formatter(thousands)
    ax.set_ylabel("cases per month")
    ax.set_title("TB, Philippines: WHO provisional monthly notifications, Jan 2020 onward")
    ax.legend(loc="upper left", ncols=2, fontsize=9)
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.set_ylim(0, float(m.cases.max()) * 1.35)
    fig.text(0.01, 0.01, "Labels come from dates and DOH's own remarks, not from the counts.", fontsize=8.5, color=INK2)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    p = FIGURES / "3_monthly_provisional.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)
    return paths


# ------------------------------------------------------------------------ report
def write_report(diffs: list[dict], figs: list[Path]) -> int:
    chk = pd.DataFrame(CHECKS)
    write_csv(chk, CLEAN / "checks.csv")
    n_fail = int((chk.result == "FAIL").sum())

    def table(rows: pd.DataFrame) -> list[str]:
        t = ["| Step | Check | Expected | Actual | Result |", "|---|---|---|---|---|"]
        for r in rows.itertuples():
            e, a = (str(x).replace("|", "\\|") for x in (r.expected, r.actual))
            t.append(f"| {r.step} | {r.check} | {e} | {a} | **{r.result}** |")
        return t

    def counts(df: pd.DataFrame) -> str:
        v = df.result.value_counts()
        return ", ".join(f"{int(v.get(k, 0))} {k}" for k in ["PASS", "WHO revision", "FAIL"])

    plan, added = chk[chk.origin == "plan"], chk[chk.origin == "added"]
    L = ["# TB cleaning: check report", "",
         "Generated by `scripts/clean_tb.py`. Do not edit by hand.", "",
         f"Live files: WHO, downloaded {LIVE_DOWNLOADED}. Expected numbers: WHO's 30 Jul 2025 snapshot (the plan).", "",
         f"**Plan checks: {counts(plan)}. Added checks: {counts(added)}.**", "",
         "`WHO revision` means the live value differs from the snapshot for the documented reason in the table below; "
         "`FAIL` means any other difference. \"About\" values pass when they agree within the rounding of both numbers "
         "(the expected figure to the nearest 1,000; the live estimates to 3 significant figures).", "",
         "## Plan checks (step 6, plus steps 2-4)", ""] + table(plan)
    L += ["", "## Checks we added (not in the plan)", ""] + table(added)
    L += ["", "## Differences from the 30 Jul 2025 snapshot", "",
          "Every value that differs between the live files and the snapshot backups "
          "(`annual_notifs.csv`, `sub_annual_notifs.csv`), plus checks marked WHO revision.", "",
          "| Table | What | Old (snapshot) | New (live) | Likely reason |", "|---|---|---|---|---|"]
    fmt = lambda v: "blank" if pd.isna(v) else f"{int(v):,}"  # noqa: E731
    L += [f"| {d['table']} | {d['what']} | {fmt(d['old'])} | {fmt(d['new'])} | {d['reason']} |" for d in diffs]
    L += [f"| check | {r['what']} | {r['old']} | {r['new']} | {r['reason']} |" for r in REVISIONS]
    L += ["", "## Notes", ""] + [f"- {n}" for n in NOTES]
    L += ["", "## Figures", ""] + [f"- `{p.relative_to(ROOT).as_posix()}`" for p in figs] + [""]
    (CLEAN / "check_report.md").write_text("\n".join(L), encoding="utf-8", newline="\n")
    return n_fail


# -------------------------------------------------------------------------- main
def main() -> int:
    ann, ab = build_annual()
    monthly, snap_m = build_monthly()
    diffs = compare_snapshot(ann, monthly, snap_m)
    run_checks(ann, ab, monthly, snap_m, diffs)
    write_csv(ann, CLEAN / "tb_national_annual.csv")
    write_csv(monthly, CLEAN / "tb_national_monthly.csv")
    figs = make_plots(ann, monthly)
    n_fail = write_report(diffs, figs)
    v = pd.Series([c["result"] for c in CHECKS]).value_counts()
    print(f"{len(CHECKS)} checks: " + ", ".join(f"{int(v.get(k, 0))} {k}" for k in ["PASS", "WHO revision", "FAIL"])
          + f". Report: {(CLEAN / 'check_report.md').relative_to(ROOT)}")
    for c in CHECKS:
        if c["result"] != "PASS":
            print(f"{c['result']} [{c['origin']}: {c['step']}] {c['check']}: expected {c['expected']}, got {c['actual']}")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
