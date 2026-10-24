"""Clean the dengue data for IRIS (Team Nex, PJDSC 2026).

Follows data/dengue/CLEANING_PLAN.md step by step, with the decisions in
plan/FINAL_CLEANING_PLAN.md section 3 where they differ. One command, safe to re-run:

    python scripts/clean_dengue.py

Reads the raw files (never writes to them) and writes:
    data/shared/calendar_weeks.csv, locations.csv, edcs_national_weekly.csv
    data/dengue/clean/dengue_province_weekly.csv, dengue_national_weekly.csv,
        dengue_source_comparison.csv, checks.csv, check_report.md, figures/*.png

Cleaning = standardize, fill the calendar, label problems. Reported numbers are
never overwritten, gaps are never filled, rows are never dropped, and a blank
stays blank (never 0). Exits with code 1 if any check fails.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from dateutil.easter import easter

# --------------------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parents[1]
RAW_HDX = ROOT / "data" / "raw" / "dengue" / "doh-epi-dengue-data-2016-2021.csv"
RAW_DOH = ROOT / "data" / "raw" / "dengue" / "Health_Dataset.xlsx"
# OpenDengue V1.3 WPRO temporal extract: read from the zip (pandas reads its single CSV member).
RAW_OD = ROOT / "data" / "raw" / "dengue" / "Temporal_extract_WPRO_V1_3.zip"

SHARED = ROOT / "data" / "shared"
CLEAN = ROOT / "data" / "dengue" / "clean"
FIGURES = CLEAN / "figures"

# ----------------------------------------------------------------------- constants
D = pd.Timestamp
CAL_START, CAL_WEEKS = D("2012-12-30"), 569
HDX_FIRST, HDX_LAST = D("2016-01-10"), D("2021-01-10")

OUT_COLS = [
    "disease", "source", "level", "location", "location_id", "region", "region_id",
    "week_start", "week_end", "mw_year", "mw", "cases", "report_status", "source_detail",
    "deaths", "qa_label", "qa_flag", "cases_fixed", "deaths_fixed",
]
FLAG_ORDER = [
    "swap_cases_deaths", "national_gap", "regional_gap", "last_week", "edge_week",
    "dip_unverified", "below_official", "deaths_check", "repeated_value",
]

# Raw HDX region label -> (region_id, standard name). "REGION VII-EASTERN VISAYAS" is Region VIII.
REGIONS = {
    "Region I-ILOCOS REGION": ("R01", "Region I - Ilocos Region"),
    "Region II-CAGAYAN VALLEY": ("R02", "Region II - Cagayan Valley"),
    "REGION III-CENTRAL LUZON": ("R03", "Region III - Central Luzon"),
    "REGION IV-A-CALABARZON": ("R4A", "Region IV-A - CALABARZON"),
    "REGION IVB-MIMAROPA": ("R4B", "Region IV-B - MIMAROPA"),
    "REGION V-BICOL REGION": ("R05", "Region V - Bicol Region"),
    "REGION VI-WESTERN VISAYAS": ("R06", "Region VI - Western Visayas"),
    "REGION VII-CENTRAL VISAYAS": ("R07", "Region VII - Central Visayas"),
    "REGION VII-EASTERN VISAYAS": ("R08", "Region VIII - Eastern Visayas"),
    "REGION IX-ZAMBOANGA PENINSULA": ("R09", "Region IX - Zamboanga Peninsula"),
    "REGION X-NORTHERN MINDANAO": ("R10", "Region X - Northern Mindanao"),
    "REGION XI-DAVAO REGION": ("R11", "Region XI - Davao Region"),
    "REGION XII-SOCCSKSARGEN": ("R12", "Region XII - SOCCSKSARGEN"),
    "NATIONAL CAPITAL REGION": ("NCR", "National Capital Region"),
    "CAR": ("CAR", "Cordillera Administrative Region"),
    "CARAGA": ("CARAGA", "Region XIII - Caraga"),
    "BARMM": ("BARMM", "Bangsamoro Autonomous Region in Muslim Mindanao"),
}
NAME_FIXES = {
    "SISQUIJOR": "SIQUIJOR",
    "NUEVA VISCAYA": "NUEVA VIZCAYA",
    "BASILIG CITY": "BISLIG CITY",
    "TACLOBAN": "TACLOBAN CITY",
}

# README section 6, issue A.1: the 15 Sundays with cases and deaths swapped.
SWAP_DATES = [D(s) for s in [
    "2016-09-04", "2016-09-18", "2016-10-02", "2016-10-16", "2016-10-30",
    "2017-09-03", "2017-09-17", "2017-10-01", "2017-10-15", "2017-10-29",
    "2020-09-06", "2020-09-20", "2020-10-04", "2020-10-18", "2020-11-01",
]]
SWAP_REGIONS = {  # README section 6; the swap applies only in these regions (FINAL_CLEANING_PLAN 3)
    2016: {"NCR", "CAR", "CARAGA", "BARMM", "R12"},
    2017: {"R06", "R07", "R08", "R09", "R10", "R11"},
    2020: {"NCR", "CAR", "R12", "CARAGA", "BARMM"},
}
AURORA_BLANK_DEATHS = ("AURORA", D("2019-09-15"))  # deaths_check row whose deaths_fixed stays blank

# Health_Dataset.xlsx Sheet1 disease headers -> codes (the raw header is kept in disease_raw).
EDCS_DISEASES = {
    "Acute Flaccid Paralysis (AFP)": "afp",
    "Diphtheria": "diphtheria",
    "Measles": "measles",
    "Rubella": "rubella",
    "Neonatal Tetanus": "neonatal_tetanus",
    "Non-neonatal Tetanus": "non_neonatal_tetanus",
    "Pertussis": "pertussis",
    "Chikungunya": "chikungunya",
    "Dengue": "dengue",
    "Leptospirosis": "leptospirosis",
    "Rabies": "rabies",
    "Acute Bloody Diarrhea": "acute_bloody_diarrhea",
    "Hepatitis A": "hepatitis_a",
    "Cholera": "cholera",
    "Rotavirus": "rotavirus",
    "Typhoid Fever": "typhoid_fever",
    "Influenza-Like Illness (ILI)": "ili",
    "Meningoccocal Disease": "meningococcal_disease",
}

OD_SOURCES = [  # (first week_start, last week_start, source_detail)
    (D("2012-12-30"), D("2018-12-16"), "WHO Western Pacific situation updates"),
    (D("2018-12-30"), D("2020-12-27"), "DOH statistics"),
    (D("2021-01-03"), D("2022-12-04"), "WHO Western Pacific situation updates"),
    (D("2022-12-25"), D("2023-11-19"), "DOH weekly surveillance reports"),
]
OD_UUID_SOURCE = [  # UUID pattern -> source_detail, to confirm the date ranges
    (r"^WHOWPRO-", "WHO Western Pacific situation updates"),
    (r"^MOH-PHL-\d{4}-Y", "DOH statistics"),
    (r"^MOH-PHL-\d{4}-W", "DOH weekly surveillance reports"),
]
OD_DIP = (D("2023-06-18"), D("2023-07-23"))
OD_REPEATED = [D("2023-04-09"), D("2023-04-16"), D("2023-04-23")]

# ------------------------------------------------------------------------- checks
CHECKS: list[dict] = []
NOTES: list[str] = []


def check(step: str, name: str, expected, actual) -> bool:
    ok = bool(expected == actual)
    CHECKS.append({"step": step, "check": name, "expected": str(expected),
                   "actual": str(actual), "result": "PASS" if ok else "FAIL"})
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


def equal_runs(values: pd.Series, min_len: int = 3, min_val: int = 50) -> list[tuple]:
    """Runs of min_len+ consecutive equal values >= min_val. A blank breaks a run.
    Returns (first index label, last index label, value, length)."""
    runs, start, prev, n = [], None, None, 0
    labels = list(values.index) + [None]
    vals = list(values) + [pd.NA]
    for lab, v in zip(labels, vals):
        if pd.notna(v) and pd.notna(prev) and v == prev:
            n += 1
        else:
            if n >= min_len and prev >= min_val:
                runs.append((start, last, prev, n))
            start, n = lab, (1 if pd.notna(v) else 0)
        prev, last = v, lab
    return runs


def near_equal_runs(values: pd.Series, min_len: int = 3, min_val: int = 50, tol: float = 0.001) -> list[tuple]:
    """Runs of min_len+ consecutive values >= min_val whose spread is within tol of the run's minimum.
    A blank breaks a run. Returns (first index label, last index label, first value, length)."""
    runs, labels, vals, i = [], list(values.index), list(values), 0
    while i < len(vals):
        j = i
        while (j + 1 < len(vals) and pd.notna(vals[j + 1]) and pd.notna(vals[i]) and vals[i] >= min_val
               and max(vals[i:j + 2]) - min(vals[i:j + 2]) <= tol * min(vals[i:j + 2])):
            j += 1
        if j - i + 1 >= min_len:
            runs.append((labels[i], labels[j], int(vals[i]), j - i + 1))
            i = j + 1
        else:
            i += 1
    return runs


def write_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, lineterminator="\n", date_format="%Y-%m-%d")


def fmt(d) -> str:
    return pd.Timestamp(d).strftime("%Y-%m-%d")


# ---------------------------------------------------------------- step 1: calendar
def build_calendar() -> pd.DataFrame:
    ws = pd.Series(pd.date_range(CAL_START, periods=CAL_WEEKS, freq="7D"))
    wed = ws + pd.Timedelta(days=3)
    cal = pd.DataFrame({
        "week_start": ws,
        "week_end": ws + pd.Timedelta(days=6),
        "mw_year": wed.dt.year,
        "mw": (wed.dt.dayofyear - 1) // 7 + 1,  # week 1 holds the year's first Wednesday
    })
    palm = {y: D(easter(y)) - pd.Timedelta(days=7) for y in range(2012, 2025)}
    cal["holy_week"] = ws.map(lambda d: d == palm[d.year])
    days = [ws + pd.Timedelta(days=k) for k in range(7)]
    cal["christmas_newyear"] = np.logical_or.reduce(
        [((d.dt.month == 12) & (d.dt.day >= 24)) | ((d.dt.month == 1) & (d.dt.day == 1)) for d in days])
    cal["covid_period"] = ws >= D("2020-03-15")

    s = "1 calendar"
    check(s, "weeks / last week_start", (569, "2023-11-19"), (len(cal), fmt(ws.iloc[-1])))
    wk = cal.set_index(["mw_year", "mw"]).week_start
    check(s, "2017 week 1 starts", "2017-01-01", fmt(wk[(2017, 1)]))
    check(s, "2021 week 1 starts", "2021-01-03", fmt(wk[(2021, 1)]))
    w38 = cal[(cal.mw_year == 2019) & (cal.mw == 38)].iloc[0]
    check(s, "2019 week 38 runs", "2019-09-15 to 2019-09-21", f"{fmt(w38.week_start)} to {fmt(w38.week_end)}")
    check(s, "2020 morbidity weeks", 53, int((cal.mw_year == 2020).sum()))
    holy = cal[cal.holy_week & cal.week_start.dt.year.between(2016, 2023)].week_start.map(fmt).tolist()
    check(s, "Holy Week starts 2016-2023",
          ["2016-03-20", "2017-04-09", "2018-03-25", "2019-04-14",
           "2020-04-05", "2021-03-28", "2022-04-10", "2023-04-02"], holy)
    return cal


# --------------------------------------------------------------- step 2: locations
def read_hdx() -> pd.DataFrame:
    raw = pd.read_csv(RAW_HDX, skiprows=[1], dtype={"loc": str, "date": str, "Region": str},
                      keep_default_na=False, na_values=[""])
    raw["week_start"] = pd.to_datetime(raw["date"], format="%m/%d/%Y")
    raw["cases"] = as_int(raw["cases"], "HDX cases")
    raw["deaths"] = as_int(raw["deaths"], "HDX deaths")
    return raw


def build_locations(raw: pd.DataFrame) -> pd.DataFrame:
    unknown = set(raw.Region) - set(REGIONS)
    if unknown:
        raise KeyError(f"Region labels with no mapping: {unknown}")
    loc = (raw.groupby(["loc", "Region"], as_index=False).week_start.min()
           .rename(columns={"loc": "location_raw", "Region": "region_raw", "week_start": "first_week"}))
    loc["location"] = loc.location_raw.str.strip().replace(NAME_FIXES)
    loc["region_id"] = loc.region_raw.map(lambda r: REGIONS[r][0])
    loc["region"] = loc.region_raw.map(lambda r: REGIONS[r][1])
    loc["location_id"] = loc.region_id + "-" + loc.location.str.replace(r"[^A-Z0-9]+", "_", regex=True)
    loc["location_type"] = np.select(
        [loc.location == "PATEROS", loc.location.str.endswith("CITY")], ["municipality", "city"], "province")
    loc = loc[["location_raw", "location", "location_id", "location_type",
               "region_raw", "region", "region_id", "first_week"]].sort_values("location_id", ignore_index=True)

    s = "2 locations"
    check(s, "locations", 126, len(loc))
    check(s, "unique location_raw / location_id", (126, 126), (loc.location_raw.nunique(), loc.location_id.nunique()))
    check(s, "regions", 17, loc.region_id.nunique())
    check(s, "locations in R08", 8, int((loc.region_id == "R08").sum()))
    check(s, "locations under two regions", 0, int((loc.groupby("location").region_id.nunique() > 1).sum()))
    check(s, "location_type city / municipality / province", (44, 1, 81),
          tuple(int((loc.location_type == t).sum()) for t in ["city", "municipality", "province"]))
    check(s, "Davao Occidental first_week", "2017-01-08",
          fmt(loc.loc[loc.location == "DAVAO OCCIDENTAL", "first_week"].iloc[0]))
    check(s, "locations with names still untrimmed or misspelled", 0,
          int((loc.location != loc.location.str.strip()).sum() + loc.location.isin(NAME_FIXES).sum()))
    return loc


# ------------------------------------------------------------- step 3: HDX province
def clean_hdx(raw: pd.DataFrame, loc: pd.DataFrame, cal: pd.DataFrame) -> pd.DataFrame:
    s = "3 HDX"
    check(s, "HDX data rows", 32701, len(raw))
    check(s, "raw duplicate location-weeks", 0, int(raw.duplicated(["loc", "week_start"]).sum()))
    check(s, "raw dates not a Sunday", 0, int((raw.week_start.dt.dayofweek != 6).sum()))
    check(s, "raw negative cases or deaths", 0, int(((raw.cases < 0) | (raw.deaths < 0)).fillna(False).sum()))
    check(s, "raw date range", ("2016-01-10", "2021-01-10"), (fmt(raw.week_start.min()), fmt(raw.week_start.max())))
    check(s, "raw blank cases", 0, int(raw.cases.isna().sum()))
    blank_d = raw[raw.deaths.isna()]
    NOTES.append("HDX raw rows with a blank `deaths` cell (kept blank, `deaths_fixed` blank too): "
                 + "; ".join(f"{r.loc} {fmt(r.week_start)} (cases {r.cases})" for r in blank_d.itertuples()))

    weeks = cal[cal.week_start.between(HDX_FIRST, HDX_LAST)]
    grid = loc.merge(weeks, how="cross")
    check(s, "grid rows (126 x 262)", 33012, len(grid))
    grid = grid.merge(raw[["loc", "week_start", "cases", "deaths"]].rename(columns={"loc": "location_raw"}),
                      on=["location_raw", "week_start"], how="left", validate="one_to_one")

    reported = grid.cases.notna()
    before_first = grid.week_start < grid.first_week
    grid["report_status"] = np.select([reported, before_first], ["reported", "not_in_source"], "missing")
    missing = grid.report_status == "missing"

    # Gaps: a week where every listed location is missing (national), or every listed location of one region.
    in_src = grid.report_status != "not_in_source"
    wk = grid[in_src].groupby("week_start").agg(n=("report_status", "size"), m=("report_status", lambda x: (x == "missing").sum()))
    nat_weeks = set(wk.index[wk.n == wk.m])
    rg = grid[in_src].groupby(["region_id", "week_start"]).agg(
        n=("report_status", "size"), m=("report_status", lambda x: (x == "missing").sum()))
    reg_keys = {k for k in rg.index[rg.n == rg.m] if k[1] not in nat_weeks}
    grid_key = grid.region_id + "|" + grid.week_start.map(fmt)
    flags = {
        "national_gap": missing & grid.week_start.isin(nat_weeks),
        "regional_gap": missing & grid_key.isin({f"{r}|{fmt(w)}" for r, w in reg_keys}),
    }

    swap_region = pd.Series([r in SWAP_REGIONS.get(d.year, set()) for r, d in zip(grid.region_id, grid.week_start)],
                            index=grid.index)
    on_swap = reported & grid.week_start.isin(SWAP_DATES) & swap_region
    deaths_gt = (grid.deaths > grid.cases).fillna(False).astype(bool)
    swap = on_swap & deaths_gt
    flags["swap_cases_deaths"] = swap
    flags["deaths_check"] = reported & ~on_swap & deaths_gt
    last = reported & (grid.week_start == HDX_LAST)
    flags["last_week"] = last

    rep_flag = pd.Series(False, index=grid.index)
    runs = []
    for lid, g in grid.sort_values("week_start").groupby("location_id", sort=True):
        for a, b, v, n in equal_runs(g.cases):
            idx = g.index[g.index.get_loc(a):g.index.get_loc(b) + 1]
            rep_flag[idx] = True
            runs.append((g.at[a, "location"], fmt(g.at[a, "week_start"]), fmt(g.at[b, "week_start"]), int(v), n))
    flags["repeated_value"] = rep_flag
    NOTES.append("HDX `repeated_value` runs: " + "; ".join(f"{l} {a} to {b}: {v} x {n} weeks" for l, a, b, v, n in runs))

    grid["qa_flag"] = join_flags(grid.index, flags)
    grid["qa_label"] = pd.Series(np.select([last, swap], ["incomplete", "suspect"], "ok"), index=grid.index).where(reported)

    grid["cases_fixed"] = grid.cases.where(~swap, grid.deaths)
    grid["deaths_fixed"] = grid.deaths.where(~swap, grid.cases)
    aurora = (grid.location == AURORA_BLANK_DEATHS[0]) & (grid.week_start == AURORA_BLANK_DEATHS[1]) & flags["deaths_check"]
    grid.loc[aurora, "deaths_fixed"] = pd.NA

    grid["disease"], grid["source"], grid["level"] = "dengue", "hdx_doh_epi", "province_city"
    grid["source_detail"] = pd.NA
    out = grid[OUT_COLS].sort_values(["location_id", "week_start"], ignore_index=True)

    # --- step 7 checks for this file
    s7 = "7 HDX"
    st = out.report_status.value_counts()
    check(s7, "report_status reported / missing / not_in_source", (32701, 259, 52),
          (int(st.get("reported", 0)), int(st.get("missing", 0)), int(st.get("not_in_source", 0))))
    check(s7, "not_in_source rows are all Davao Occidental", ["DAVAO OCCIDENTAL"],
          sorted(out.loc[out.report_status == "not_in_source", "location"].unique().tolist()))
    miss = out[out.report_status == "missing"].groupby("week_start").size()
    check(s7, "missing by week", {"2016-11-13": 46, "2017-11-12": 41, "2019-01-06": 126, "2020-11-15": 46},
          {fmt(k): int(v) for k, v in miss.items()})
    check(s7, "national_gap weeks", ["2019-01-06"], sorted(fmt(w) for w in nat_weeks))
    check(s7, "regional_gap weeks", ["2016-11-13", "2017-11-12", "2020-11-15"], sorted({fmt(k[1]) for k in reg_keys}))
    sw = out[out.qa_flag.fillna("").str.contains("swap_cases_deaths")]
    check(s7, "swapped rows (0 cases, 1-3 cases)", (581, 527, 54),
          (len(sw), int((sw.cases == 0).sum()), int(sw.cases.between(1, 3).sum())))
    check(s7, "regions of swapped rows by year (README 6.A.1)",
          {y: sorted(r) for y, r in SWAP_REGIONS.items()},
          {int(y): sorted(g.region_id.unique()) for y, g in sw.groupby(sw.week_start.dt.year)})
    dc = out[out.qa_flag.fillna("").str.contains("deaths_check")]
    check(s7, "deaths_check rows", (5, ["AURORA", "BATANES", "DAVAO DEL SUR", "PATEROS", "QUIRINO"]),
          (len(dc), sorted(dc.location)))
    NOTES.append("HDX `deaths_check` rows: " + "; ".join(
        f"{r.location} {fmt(r.week_start)} cases {r.cases} deaths {r.deaths} deaths_fixed "
        f"{'blank' if pd.isna(r.deaths_fixed) else r.deaths_fixed}" for r in dc.itertuples()))
    check(s7, "Aurora 2019-09-15 deaths_fixed blank", (1, True), (int(aurora.sum()), bool(out.loc[
        (out.location == "AURORA") & (out.week_start == D("2019-09-15")), "deaths_fixed"].isna().all())))
    inc = out[out.qa_label == "incomplete"]
    check(s7, "incomplete rows (all on 2021-01-10)", (126, ["2021-01-10"]), (len(inc), sorted({fmt(w) for w in inc.week_start})))
    check(s7, "ok rows", 31994, int((out.qa_label == "ok").sum()))
    swap_dates_zero = int((out.week_start.isin(SWAP_DATES) & (out.cases == 0) & (out.deaths == 0) & (out.qa_label == "ok")).sum())
    NOTES.append(f"HDX rows with 0 cases and 0 deaths on swap dates, left `ok` (plan step 3.6): {swap_dates_zero}")
    y16 = out[out.week_start.dt.year == 2016]
    check(s7, "2016 deaths raw -> fixed", (8127, 1064), (int(y16.deaths.sum()), int(y16.deaths_fixed.sum())))
    ok = out[out.qa_label == "ok"]
    share = (ok.cases == 0).mean() * 100
    per_loc = ok.groupby("location").cases.apply(lambda c: (c == 0).mean() * 100)
    check(s7, "zero-case share in ok rows, % (overall, median location, Batanes; 1 decimal)",
          (8.0, 4.6, 69.2), (round(float(share), 1), round(float(per_loc.median()), 1), round(float(per_loc["BATANES"]), 1)))
    check(s7, "HDX repeated_value runs", 2, len(runs))
    check(s7, "missing rows with a number in cases / cases_fixed / deaths_fixed", 0,
          int(out.loc[out.report_status != "reported", ["cases", "cases_fixed", "deaths", "deaths_fixed"]].notna().any(axis=1).sum()))
    check(s7, "rows with qa_label but not reported", 0, int((out.qa_label.notna() & (out.report_status != "reported")).sum()))
    check(s7, "reported cases unchanged vs raw (sum, rows)", (int(raw.cases.sum()), 32701),
          (int(out.cases.sum()), int(out.cases.notna().sum())))
    return out


# ----------------------------------------------------------------- step 4: DOH EDCS
def clean_doh(cal: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    s = "4 DOH"
    raw = pd.read_excel(RAW_DOH, sheet_name="Sheet1")
    check(s, "Sheet1 rows x columns", (260, 20), raw.shape)
    diseases = list(raw.columns[2:])
    check(s, "disease columns match the code list", sorted(EDCS_DISEASES), sorted(diseases))
    raw["Year"] = raw["Year"].ffill().astype(int)
    raw["Week"] = raw["Week"].astype(int)
    for c in diseases:
        raw[c] = as_int(raw[c], f"DOH {c}")

    blank = raw[raw.Dengue.isna()]
    others = [c for c in diseases if c != "Dengue"]
    all_blank = blank[others].isna().all(axis=1)
    only_rub = blank[[c for c in others if c != "Rubella"]].isna().all(axis=1) & blank.Rubella.notna()
    only_dengue = blank[others].notna().all(axis=1)
    check(s, "dengue blanks: total / blank for all diseases", (38, 36), (len(blank), int(all_blank.sum())))
    check(s, "dengue blank for all but rubella", ["2017-W52"], [f"{r.Year}-W{r.Week}" for r in blank[only_rub].itertuples()])
    check(s, "dengue blank for dengue only", ["2021-W6"], [f"{r.Year}-W{r.Week}" for r in blank[only_dengue].itertuples()])

    raw = pd.concat([raw, pd.DataFrame({"Year": [2020], "Week": [53]})], ignore_index=True)  # absent week 53
    for c in diseases:
        raw[c] = raw[c].astype("Int64")
    wide = raw.merge(cal[["week_start", "week_end", "mw_year", "mw"]], left_on=["Year", "Week"],
                     right_on=["mw_year", "mw"], how="left", validate="one_to_one")
    check(s, "(Year, Week) pairs with no calendar week", 0, int(wide.week_start.isna().sum()))

    long = wide.melt(id_vars=["week_start", "week_end", "mw_year", "mw"], value_vars=diseases,
                     var_name="disease_raw", value_name="cases")
    long["cases"] = long.cases.astype("Int64")
    long["disease"] = long.disease_raw.map(EDCS_DISEASES)
    long["source"], long["level"] = "doh_edcs", "national"
    long["report_status"] = np.where(long.cases.notna(), "reported", "missing")
    edcs = long[["disease", "disease_raw", "source", "level", "week_start", "week_end", "mw_year", "mw",
                 "cases", "report_status"]].sort_values(["disease", "week_start"], ignore_index=True)

    dg = edcs[edcs.disease == "dengue"].copy()
    dg["location"], dg["location_id"] = "PHILIPPINES", "PH"
    dg["region"] = dg["region_id"] = dg["source_detail"] = pd.NA
    dg["deaths"] = dg["deaths_fixed"] = pd.Series(pd.NA, index=dg.index, dtype="Int64")
    dg["qa_label"] = pd.Series("ok", index=dg.index).where(dg.report_status == "reported")
    dg["qa_flag"] = pd.NA
    dg["cases_fixed"] = dg.cases
    dg = dg[OUT_COLS]

    s7 = "7 DOH"
    check(s7, "DOH weekly rows / dengue missing", (261, 39), (len(dg), int((dg.report_status == "missing").sum())))
    check(s7, "2020 week 53 row: week / status / cases blank", ("2020-12-27", "missing", True),
          tuple((lambda r: (fmt(r.week_start), r.report_status, bool(pd.isna(r.cases))))(
              dg[(dg.mw_year == 2020) & (dg.mw == 53)].iloc[0])))
    check(s7, "edcs_national_weekly rows (18 x 261)", 4698, len(edcs))
    return dg, edcs


# --------------------------------------------------------------- step 5: OpenDengue
def clean_opendengue(cal: pd.DataFrame) -> pd.DataFrame:
    s = "5 OpenDengue"
    od = pd.read_csv(RAW_OD, low_memory=False)
    check(s, "extract columns", 17, od.shape[1])
    ph = od[(od.adm_0_name == "PHILIPPINES") & (od.S_res == "Admin0") & (od.T_res == "Week")].copy()
    check(s, "Philippines Admin0 weekly rows", 544, len(ph))
    ph["week_start"] = pd.to_datetime(ph.calendar_start_date)
    ph["cal_end"] = pd.to_datetime(ph.calendar_end_date)
    check(s, "rows not Sunday-Saturday", 0,
          int(((ph.week_start.dt.dayofweek != 6) | (ph.cal_end - ph.week_start != pd.Timedelta(days=6))).sum()))
    check(s, "duplicate weeks", 0, int(ph.week_start.duplicated().sum()))
    ph["cases"] = as_int(ph.dengue_total, "OpenDengue dengue_total")

    sd = pd.Series(pd.NA, index=ph.index, dtype=object)
    for a, b, name in OD_SOURCES:
        sd[ph.week_start.between(a, b)] = name
    ph["source_detail"] = sd
    by_uuid = pd.Series(pd.NA, index=ph.index, dtype=object)
    for pat, name in OD_UUID_SOURCE:
        by_uuid[ph.UUID.str.contains(pat, regex=True)] = name
    check(s, "rows outside the source date ranges", 0, int(ph.source_detail.isna().sum()))
    check(s, "source_detail disagrees with UUID", 0, int((ph.source_detail != by_uuid).sum()))
    NOTES.append("OpenDengue `source_detail` row counts: " + "; ".join(
        f"{k}: {v}" for k, v in ph.source_detail.value_counts().sort_index().items()))

    df = cal[["week_start", "week_end", "mw_year", "mw"]].merge(
        ph[["week_start", "cases", "source_detail"]], on="week_start", how="left", validate="one_to_one")
    reported = df.cases.notna()
    df["report_status"] = np.where(reported, "reported", "missing")

    expected_missing = (["2014-12-28"] + [fmt(d) for d in pd.date_range("2015-11-22", "2015-12-27", freq="7D")]
                        + [fmt(d) for d in pd.date_range("2016-11-06", "2016-12-25", freq="7D")]
                        + [fmt(d) for d in pd.date_range("2017-12-03", "2017-12-24", freq="7D")]
                        + ["2018-12-23"] + [fmt(d) for d in pd.date_range("2021-12-12", "2021-12-26", freq="7D")]
                        + ["2022-12-11", "2022-12-18"])
    actual_missing = [fmt(d) for d in df.week_start[~reported]]

    # edge_week: last reported week before a missing week or a change of source_detail (position only).
    nxt_rep = reported.shift(-1)
    nxt_src = df.source_detail.shift(-1)
    edge = reported & nxt_rep.notna() & ((nxt_rep == False) | (nxt_src != df.source_detail))  # noqa: E712
    edge = edge.fillna(False).astype(bool)

    y23 = reported & (df.week_start.dt.year == 2023)
    dip = reported & df.week_start.between(*OD_DIP)
    rep = reported & df.week_start.isin(OD_REPEATED)
    flags = {"edge_week": edge, "below_official": y23, "dip_unverified": dip, "repeated_value": rep}
    df["qa_flag"] = join_flags(df.index, flags)
    df["qa_label"] = pd.Series(np.select([edge, dip], ["incomplete", "suspect"], "ok"), index=df.index).where(reported)
    df["cases_fixed"] = df.cases
    df["deaths"] = df["deaths_fixed"] = pd.Series(pd.NA, index=df.index, dtype="Int64")
    df["disease"], df["source"], df["level"] = "dengue", "opendengue", "national"
    df["location"], df["location_id"] = "PHILIPPINES", "PH"
    df["region"] = df["region_id"] = pd.NA
    out = df[OUT_COLS]

    gen = near_equal_runs(out.set_index("week_start").cases)
    NOTES.append("OpenDengue runs found by the repeated-value rule (3+ weeks within 0.1%, 50+; information only, "
                 "flags use the plan's dates): " + ("; ".join(f"{fmt(a)} to {fmt(b)}: {v} x {n}" for a, b, v, n in gen) or "none"))
    edge_rows = out[edge]
    prev = out.cases.shift(1)
    NOTES.append("OpenDengue edge weeks (cases vs. week before): " + "; ".join(
        f"{fmt(r.week_start)} {r.cases} vs {prev[i]}" for i, r in edge_rows.iterrows()))
    d23 = out[(out.week_start >= D("2023-01-01")) & (out.week_start <= D("2023-03-18"))]
    NOTES.append(f"OpenDengue 1 Jan - 18 Mar 2023 total: {int(d23.cases.sum()):,} over {int(d23.cases.notna().sum())} weeks "
                 "(README: 7,962 against DOH's announced 27,670)")

    s7 = "7 OpenDengue"
    check(s7, "OpenDengue weeks / missing / edge_week", (569, 25, 8),
          (len(out), int((out.report_status == "missing").sum()), int(edge.sum())))
    check(s7, "missing weeks match plan step 5.3", expected_missing, actual_missing)
    check(s7, "edge weeks match plan step 5.4",
          ["2014-12-21", "2015-11-15", "2016-10-30", "2017-11-26", "2018-12-16", "2020-12-27", "2021-12-05", "2022-12-04"],
          [fmt(d) for d in out.week_start[edge]])
    check(s7, "2023 below_official / dip_unverified / repeated_value rows", (47, 6, 3),
          (int(y23.sum()), int(dip.sum()), int(rep.sum())))
    rv = [int(v) for v in out.cases[rep]]
    check(s7, "OpenDengue repeated_value counts (9-23 Apr 2023)", [1196, 1196, 1197], rv)
    check(s7, "repeated_value rule: same count within 0.1%, 50+", True,
          bool(min(rv) >= 50 and (max(rv) - min(rv)) <= 0.001 * min(rv)))
    return out


# --------------------------------------------------------------- step 6: comparison
def source_comparison(hdx: pd.DataFrame, nat: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for y in range(2016, 2021):
        h = hdx[(hdx.mw_year == y) & (hdx.report_status == "reported")]
        d = nat[(nat.source == "doh_edcs") & (nat.mw_year == y) & (nat.report_status == "reported")]
        o = nat[(nat.source == "opendengue") & (nat.mw_year == y) & (nat.report_status == "reported")]
        rows.append({
            "mw_year": y,
            "hdx_raw_cases": int(h.cases.sum()),
            "hdx_fixed_cases": int(h.cases_fixed.sum()), "hdx_weeks": h.week_start.nunique(),
            "doh_edcs_cases": int(d.cases.sum()) if len(d) else pd.NA, "doh_edcs_weeks": len(d),
            "opendengue_cases": int(o.cases.sum()), "opendengue_weeks": len(o),
        })
    comp = pd.DataFrame(rows).astype({"doh_edcs_cases": "Int64"})
    plan = {  # plan step 6 table
        2016: (209544, 216607, 51, None, 0, 175316, 44),
        2017: (152415, 156134, 52, 105976, 51, 132934, 48),  # FINAL_CLEANING_PLAN 3: Quirino no longer swapped
        2018: (247059, 247059, 52, 186992, 40, 212905, 51),
        2019: (443846, 443846, 51, 430282, 52, 437777, 52),
        2020: (94561, 95376, 53, 61359, 28, 84584, 53),
    }
    for r in comp.itertuples():
        got = (r.hdx_raw_cases, r.hdx_fixed_cases, r.hdx_weeks,
               None if pd.isna(r.doh_edcs_cases) else int(r.doh_edcs_cases), r.doh_edcs_weeks,
               r.opendengue_cases, r.opendengue_weeks)
        check("6 comparison (reference)", f"{r.mw_year}: HDX raw, fixed, weeks, DOH, weeks, OpenDengue, weeks",
              plan[r.mw_year], got)
    return comp


# ------------------------------------------------------------ file-wide checks
def file_checks(name: str, df: pd.DataFrame, key: list[str]) -> None:
    s = "7 all files"
    counts = [c for c in ["cases", "deaths", "cases_fixed", "deaths_fixed"] if c in df]
    neg = int((df[counts] < 0).fillna(False).any(axis=1).sum()) if counts else 0
    check(s, f"{name}: negative counts / duplicate keys / week_start not Sunday", (0, 0, 0),
          (neg, int(df.duplicated(key).sum()), int((pd.to_datetime(df.week_start).dt.dayofweek != 6).sum())))
    if "report_status" in df:
        check(s, f"{name}: non-reported rows with a case count", 0,
              int((df.cases.notna() & (df.report_status != "reported")).sum()))


# ------------------------------------------------------------------------ step 8
def make_plots(hdx: pd.DataFrame, nat: pd.DataFrame, loc: pd.DataFrame) -> list[Path]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    import matplotlib.ticker
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D

    BLUE, ORANGE, RED = "#2a78d6", "#eb6834", "#e34948"
    INK, INK2, GRID, GAP = "#0b0b0b", "#52514e", "#e6e5e0", "#c3c2b7"
    plt.rcParams.update({
        "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb", "savefig.facecolor": "#fcfcfb",
        "axes.edgecolor": GAP, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
        "text.color": INK, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
        "axes.spines.top": False, "axes.spines.right": False, "font.size": 10, "axes.titlesize": 11,
        "axes.titleweight": "bold", "axes.titlelocation": "left", "legend.frameon": False,
    })
    FIGURES.mkdir(parents=True, exist_ok=True)
    meta = {"Software": None}
    paths = []

    def shade(ax, weeks, label=None):
        for i, w in enumerate(sorted(pd.Timestamp(x) for x in weeks)):
            ax.axvspan(w, w + pd.Timedelta(days=7), color=GAP, alpha=0.55, lw=0, label=label if i == 0 else None)

    def thousands(ax):
        ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))

    # 1. national HDX cases vs cases_fixed
    rep = hdx[hdx.report_status == "reported"]
    nat_raw = rep.groupby("week_start").cases.sum()
    nat_fix = rep.groupby("week_start").cases_fixed.sum()
    weeks = pd.Index(sorted(hdx.week_start.unique()))
    nat_raw, nat_fix = nat_raw.reindex(weeks).astype(float), nat_fix.reindex(weeks).astype(float)
    fig, ax = plt.subplots(figsize=(12, 4.6))
    gap_weeks = hdx.loc[hdx.report_status == "missing", "week_start"].unique()
    shade(ax, gap_weeks, "week with missing locations")
    ax.plot(weeks, nat_fix, color=BLUE, lw=2, label="cases_fixed (swap reversed)")
    ax.plot(weeks, nat_raw, color=ORANGE, lw=2, label="cases as reported")
    thousands(ax)
    ax.set_ylabel("cases per week (sum of 126 locations)")
    ax.set_title("HDX province file, national sum: the swap shows as a sawtooth in Sep-Nov 2016, 2017 and 2020")
    ax.legend(loc="upper left", ncols=3)
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    fig.tight_layout()
    p = FIGURES / "1_hdx_national_cases_vs_fixed.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)

    # 2. one panel per region
    regions = loc.drop_duplicates("region_id").sort_values("region_id")[["region_id", "region"]]
    fig, axes = plt.subplots(6, 3, figsize=(15, 17), sharex=True)
    for ax, r in zip(axes.flat, regions.itertuples()):
        g = hdx[hdx.region_id == r.region_id]
        tot = g[g.report_status == "reported"].groupby("week_start").cases.sum().reindex(weeks).astype(float)
        shade(ax, g.loc[g.report_status == "missing", "week_start"].unique())
        ax.plot(weeks, tot, color=BLUE, lw=1.4)
        sus = g.loc[g.qa_label == "suspect", "week_start"].unique()
        ax.plot(sus, tot.reindex(sus), "o", ms=5, color=RED, mec="#fcfcfb", mew=1.2)
        thousands(ax)
        ax.set_title(f"{r.region_id}  {r.region}", fontsize=9.5)
        ax.xaxis.set_major_locator(mdates.YearLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%y"))
    for ax in list(axes.flat)[len(regions):]:
        ax.axis("off")
    axes.flat[-1].legend(handles=[
        Line2D([], [], color=BLUE, lw=1.4, label="cases as reported (region sum)"),
        Line2D([], [], marker="o", ls="", color=RED, ms=6, label="week with suspect (swapped) rows"),
        Patch(color=GAP, alpha=0.55, label="week with missing locations")], loc="center")
    fig.suptitle("HDX by region: swapped weeks and the missing week after each episode hit the same regions",
                 x=0.01, ha="left", fontweight="bold", fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, 0.98))
    p = FIGURES / "2_hdx_regions_suspect_missing.png"
    fig.savefig(p, dpi=130, metadata=meta)
    plt.close(fig)
    paths.append(p)

    # 3. DOH weekly and OpenDengue national lines
    fig, axes = plt.subplots(2, 1, figsize=(13, 7.5), sharex=True)
    for ax, src, color, title in [
        (axes[0], "opendengue", BLUE, "OpenDengue V1.3, national weekly (2013-2023)"),
        (axes[1], "doh_edcs", ORANGE, "DOH weekly surveillance reports (Health_Dataset.xlsx), national (2017-2021)"),
    ]:
        g = nat[nat.source == src].set_index("week_start")
        shade(ax, g.index[g.report_status == "missing"], "missing week")
        ax.plot(g.index, g.cases.astype(float), color=color, lw=1.6, label="cases as reported")
        inc = g[g.qa_label == "incomplete"]
        if len(inc):
            ax.plot(inc.index, inc.cases.astype(float), "o", ms=6, mfc="#fcfcfb", mec=INK2, mew=1.4,
                    label="incomplete (edge week)")
        sus = g[g.qa_label == "suspect"]
        if len(sus):
            ax.plot(sus.index, sus.cases.astype(float), "o", ms=5, color=RED, mec="#fcfcfb", mew=1.2,
                    label="suspect (2023 dip)")
        thousands(ax)
        ax.set_title(title)
        ax.set_ylabel("cases per week")
        ax.legend(loc="upper left", ncols=4)
    axes[1].xaxis.set_major_locator(mdates.YearLocator())
    axes[1].xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    fig.tight_layout()
    p = FIGURES / "3_national_doh_opendengue.png"
    fig.savefig(p, dpi=150, metadata=meta)
    plt.close(fig)
    paths.append(p)
    return paths


# ------------------------------------------------------------------------ report
def write_report(comp: pd.DataFrame, figs: list[Path]) -> int:
    chk = pd.DataFrame(CHECKS)
    write_csv(chk, CLEAN / "checks.csv")
    n_fail = int((chk.result == "FAIL").sum())
    lines = [
        "# Dengue cleaning: check report",
        "",
        "Generated by `scripts/clean_dengue.py`. Do not edit by hand.",
        "",
        f"**{len(chk) - n_fail} of {len(chk)} checks pass; {n_fail} fail.**",
        "",
        "Tolerances: counts must match exactly. The zero-case shares are compared after rounding to one "
        "decimal place (the plan says \"about 8.0%\"). Step 6 rows compare against the plan's reference "
        "table and are not step 7 checks.",
        "",
        "| Step | Check | Expected | Actual | Result |",
        "|---|---|---|---|---|",
    ]
    for r in chk.itertuples():
        e, a = (str(x).replace("|", "\\|") for x in (r.expected, r.actual))
        lines.append(f"| {r.step} | {r.check} | {e} | {a} | **{r.result}** |")
    lines += ["", "## Source comparison by DOH morbidity year (step 6)", "",
              "Assumes HDX `date` is the week start (open question 1). Not for modeling.", "",
              "| Morbidity year | HDX raw | HDX fixed (weeks) | DOH weekly (weeks with data) | OpenDengue (weeks) |",
              "|---|---|---|---|---|"]
    for r in comp.itertuples():
        doh = "-" if pd.isna(r.doh_edcs_cases) else f"{int(r.doh_edcs_cases):,} ({r.doh_edcs_weeks})"
        lines.append(f"| {r.mw_year} | {r.hdx_raw_cases:,} | {r.hdx_fixed_cases:,} ({r.hdx_weeks}) | {doh} | "
                     f"{r.opendengue_cases:,} ({r.opendengue_weeks}) |")
    lines += ["", "## Notes (information, not checks)", ""] + [f"- {n}" for n in NOTES]
    lines += ["", "## Figures", ""] + [f"- `{p.relative_to(ROOT).as_posix()}`" for p in figs] + [""]
    (CLEAN / "check_report.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    return n_fail


# -------------------------------------------------------------------------- main
def main() -> int:
    cal = build_calendar()
    raw = read_hdx()
    loc = build_locations(raw)
    hdx = clean_hdx(raw, loc, cal)
    doh, edcs = clean_doh(cal)
    od = clean_opendengue(cal)
    nat = pd.concat([doh, od], ignore_index=True).sort_values(["source", "week_start"], ignore_index=True)
    comp = source_comparison(hdx, nat)

    for name, df, key in [("calendar_weeks", cal, ["week_start"]),
                          ("dengue_province_weekly", hdx, ["location_id", "week_start"]),
                          ("dengue_national_weekly", nat, ["source", "week_start"]),
                          ("edcs_national_weekly", edcs, ["disease", "week_start"])]:
        file_checks(name, df, key)
    check("7 all files", "locations: duplicate location_id", 0, int(loc.location_id.duplicated().sum()))

    write_csv(cal, SHARED / "calendar_weeks.csv")
    write_csv(loc, SHARED / "locations.csv")
    write_csv(edcs, SHARED / "edcs_national_weekly.csv")
    write_csv(hdx, CLEAN / "dengue_province_weekly.csv")
    write_csv(nat, CLEAN / "dengue_national_weekly.csv")
    write_csv(comp, CLEAN / "dengue_source_comparison.csv")
    figs = make_plots(hdx, nat, loc)

    n_fail = write_report(comp, figs)
    print(f"{len(CHECKS) - n_fail}/{len(CHECKS)} checks pass. Report: {(CLEAN / 'check_report.md').relative_to(ROOT)}")
    for c in CHECKS:
        if c["result"] == "FAIL":
            print(f"FAIL [{c['step']}] {c['check']}: expected {c['expected']}, got {c['actual']}")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
