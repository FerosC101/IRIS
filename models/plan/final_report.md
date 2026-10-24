# Final cleaning report: dengue, measles, TB

IRIS, Team Nex (PJDSC 2026). 20 Oct 2026. Follows `plan/FINAL_CLEANING_PLAN.md`, section 6, in order.

## Result

| Disease | Checks | Pass | WHO revision | Fail | Full report |
|---|---|---|---|---|---|
| Dengue | 72 | 72 | 0 | 0 | `data/dengue/clean/check_report.md` |
| Measles | 37 | 37 | 0 | 0 | `data/measles/clean/check_report.md` |
| TB | 34 | 32 | 2 | 0 | `data/tb/clean/check_report.md` |
| `surveillance.csv` | 8 | 8 | 0 | 0 | `python scripts/build_surveillance.py` output |

Every check passes. TB's two WHO revisions are listed separately below. Running all four scripts a second time gave identical files (28 outputs).

## `data/surveillance.csv` row counts

| Disease | Source | Resolution | Rows | Reported | Missing | Not in source |
|---|---|---|---|---|---|---|
| dengue | doh_edcs | week | 261 | 222 | 39 | 0 |
| dengue | hdx_doh_epi | week | 33,012 | 32,701 | 259 | 52 |
| dengue | opendengue | week | 569 | 544 | 25 | 0 |
| measles | doh_edcs | week | 261 | 219 | 42 | 0 |
| rubella | doh_edcs | week | 261 | 219 | 42 | 0 |
| tb | who_provisional | month | 84 | 73 | 11 | 0 |
| **Total** | | | **34,448** | | | |

Dengue 33,842 (33,012 province + 830 national), measles and rubella 522, TB 84. TB includes the whole clean monthly file, Jan 2020 – Dec 2026: 73 reported months through Jan 2026, then 11 months the live file leaves blank (`missing`). Read "to the last month in the live file" as the last *reported* month and TB would be 73 rows; say if you want that instead.

## TB: WHO revisions (not failures)

| Check | Snapshot (30 Jul 2025) | Live (19 Oct 2026) | Reason |
|---|---|---|---|
| A rate (and range) = B after rounding: years that differ | [] | ['2020: A 535 (300-839) vs B 544 (304-863)', '2021: A 583 (321-940) vs B 579 (325-934)', '2022: A 627 (315-1050) vs B 627 (346-1010)', '2023: A 643 (296-1120) vs B 632 (348-1020)'] | older WHO estimate round: data.who.int lists this indicator's last update as 8 Jan 2024 (team decision, plan/FINAL_CLEANING_PLAN.md 5); A ends in 2023, one year behind B, and differs only in 2020-2023. B is used for every number; A is a reference only |
| reported months in the live file (Jan 2020 - latest) | 66 (Jan 2020 - Jun 2025) | 73 (Jan 2020 - Jan 2026) | 7 months reported after the 30 Jul 2025 snapshot |

Every value that changed between the snapshot and the live files is in `data/tb/README.md`, section 6.

## What this pass did

- **Housekeeping:** moved the six docs to `data/<disease>/`; renamed `[measles]` to `who_gho_measles_phl.json`; moved the OpenDengue CSV to `data/raw/dengue/`; parked the NBL workbook in `data/raw/unverified/`. Downloaded the OpenDengue zip: SHA-256 matches (`c25ad7…`), and its CSV is byte-identical to the audited one (`972af7…`). Dengue now reads the zip.
- **Dengue:** swap rule needs the listed dates **and** regions. Quirino 15 Oct 2017 moved to `deaths_check`: 581 swapped (527 + 54), 5 `deaths_check`, 31,994 `ok`, HDX fixed 2017 = 156,134. Batanes 69.2% accepted. OpenDengue repeated-value check fixed (1,196 / 1,196 / 1,197, within 0.1%; the only such run in the series).
- **Measles:** re-run on the rebuilt shared files. Data files unchanged; NBL marked not used.
- **TB:** A-vs-B difference recorded as a WHO revision with the team's reason; B used for every number.
- **`surveillance.csv`:** built by the new `scripts/build_surveillance.py` (columns as in section 1.1).
- **READMEs:** SHA-256s, download dates, "downloaded by" (John Vincent M. Doria, Team Nex), license status, the dengue comparison table, and every decision in a v0.2 change-log entry. Each CLEANING_PLAN's status line points to the final plan.

## Still open

1. **Licenses** (the planned open item). Unconfirmed (checked: not yet) for HDX (https://data.humdata.org/dataset/philippine-dengue-cases-and-deaths), OpenDengue on Figshare (https://doi.org/10.6084/m9.figshare.24259573), WHO's data policy, the GitHub repository (https://github.com/samjohnparr/PH_Disease_Underreporting, no license file) and Mendeley (not used).

Small items outside the final plan:

2. **`.gitignore` gap.** It ignores `data/**/raw/` and `data/**/clean/` as planned, but `data/shared/` and `data/surveillance.csv` would still be published. Both are built from the same unconfirmed-license sources, including the GitHub Excel file the README says not to re-upload. Suggest adding both lines. (The folder isn't a git repository yet.)
3. **README TODOs:** "Maintainer" in all three READMEs, and the HDX citation's contributor and year (from the HDX page, during the license check).

Model A can start on `data/dengue/clean/dengue_province_weekly.csv`.

## Appendix: every check

Expected and actual values are in each `check_report.md`. "Added" marks checks we added beyond the plans.

### Dengue

| Step | Check | Result |
|---|---|---|
| 1 calendar | weeks / last week_start | PASS |
| 1 calendar | 2017 week 1 starts | PASS |
| 1 calendar | 2021 week 1 starts | PASS |
| 1 calendar | 2019 week 38 runs | PASS |
| 1 calendar | 2020 morbidity weeks | PASS |
| 1 calendar | Holy Week starts 2016-2023 | PASS |
| 2 locations | locations | PASS |
| 2 locations | unique location_raw / location_id | PASS |
| 2 locations | regions | PASS |
| 2 locations | locations in R08 | PASS |
| 2 locations | locations under two regions | PASS |
| 2 locations | location_type city / municipality / province | PASS |
| 2 locations | Davao Occidental first_week | PASS |
| 2 locations | locations with names still untrimmed or misspelled | PASS |
| 3 HDX | HDX data rows | PASS |
| 3 HDX | raw duplicate location-weeks | PASS |
| 3 HDX | raw dates not a Sunday | PASS |
| 3 HDX | raw negative cases or deaths | PASS |
| 3 HDX | raw date range | PASS |
| 3 HDX | raw blank cases | PASS |
| 3 HDX | grid rows (126 x 262) | PASS |
| 7 HDX | report_status reported / missing / not_in_source | PASS |
| 7 HDX | not_in_source rows are all Davao Occidental | PASS |
| 7 HDX | missing by week | PASS |
| 7 HDX | national_gap weeks | PASS |
| 7 HDX | regional_gap weeks | PASS |
| 7 HDX | swapped rows (0 cases, 1-3 cases) | PASS |
| 7 HDX | regions of swapped rows by year (README 6.A.1) | PASS |
| 7 HDX | deaths_check rows | PASS |
| 7 HDX | Aurora 2019-09-15 deaths_fixed blank | PASS |
| 7 HDX | incomplete rows (all on 2021-01-10) | PASS |
| 7 HDX | ok rows | PASS |
| 7 HDX | 2016 deaths raw -> fixed | PASS |
| 7 HDX | zero-case share in ok rows, % (overall, median location, Batanes; 1 decimal) | PASS |
| 7 HDX | HDX repeated_value runs | PASS |
| 7 HDX | missing rows with a number in cases / cases_fixed / deaths_fixed | PASS |
| 7 HDX | rows with qa_label but not reported | PASS |
| 7 HDX | reported cases unchanged vs raw (sum, rows) | PASS |
| 4 DOH | Sheet1 rows x columns | PASS |
| 4 DOH | disease columns match the code list | PASS |
| 4 DOH | dengue blanks: total / blank for all diseases | PASS |
| 4 DOH | dengue blank for all but rubella | PASS |
| 4 DOH | dengue blank for dengue only | PASS |
| 4 DOH | (Year, Week) pairs with no calendar week | PASS |
| 7 DOH | DOH weekly rows / dengue missing | PASS |
| 7 DOH | 2020 week 53 row: week / status / cases blank | PASS |
| 7 DOH | edcs_national_weekly rows (18 x 261) | PASS |
| 5 OpenDengue | extract columns | PASS |
| 5 OpenDengue | Philippines Admin0 weekly rows | PASS |
| 5 OpenDengue | rows not Sunday-Saturday | PASS |
| 5 OpenDengue | duplicate weeks | PASS |
| 5 OpenDengue | rows outside the source date ranges | PASS |
| 5 OpenDengue | source_detail disagrees with UUID | PASS |
| 7 OpenDengue | OpenDengue weeks / missing / edge_week | PASS |
| 7 OpenDengue | missing weeks match plan step 5.3 | PASS |
| 7 OpenDengue | edge weeks match plan step 5.4 | PASS |
| 7 OpenDengue | 2023 below_official / dip_unverified / repeated_value rows | PASS |
| 7 OpenDengue | OpenDengue repeated_value counts (9-23 Apr 2023) | PASS |
| 7 OpenDengue | repeated_value rule: same count within 0.1%, 50+ | PASS |
| 6 comparison (reference) | 2016: HDX raw, fixed, weeks, DOH, weeks, OpenDengue, weeks | PASS |
| 6 comparison (reference) | 2017: HDX raw, fixed, weeks, DOH, weeks, OpenDengue, weeks | PASS |
| 6 comparison (reference) | 2018: HDX raw, fixed, weeks, DOH, weeks, OpenDengue, weeks | PASS |
| 6 comparison (reference) | 2019: HDX raw, fixed, weeks, DOH, weeks, OpenDengue, weeks | PASS |
| 6 comparison (reference) | 2020: HDX raw, fixed, weeks, DOH, weeks, OpenDengue, weeks | PASS |
| 7 all files | calendar_weeks: negative counts / duplicate keys / week_start not Sunday | PASS |
| 7 all files | dengue_province_weekly: negative counts / duplicate keys / week_start not Sunday | PASS |
| 7 all files | dengue_province_weekly: non-reported rows with a case count | PASS |
| 7 all files | dengue_national_weekly: negative counts / duplicate keys / week_start not Sunday | PASS |
| 7 all files | dengue_national_weekly: non-reported rows with a case count | PASS |
| 7 all files | edcs_national_weekly: negative counts / duplicate keys / week_start not Sunday | PASS |
| 7 all files | edcs_national_weekly: non-reported rows with a case count | PASS |
| 7 all files | locations: duplicate location_id | PASS |

### Measles

| Step | Check | Result |
|---|---|---|
| 3 inputs | edcs_national_weekly: diseases x weeks | PASS |
| 1 weekly | disease_raw kept as Measles / Rubella | PASS |
| 2 gaps | measles: system_gap weeks | PASS |
| 2 gaps | measles: disease_gap weeks | PASS |
| 2 gaps | rubella: system_gap weeks | PASS |
| 2 gaps | rubella: disease_gap weeks | PASS |
| 3 hand labels | 2019 W8 measles / rubella cases | PASS |
| 3 hand labels | 2019 W8: other diseases reading 0 | PASS |
| 3 hand labels | measles 2019 W9 / W11 | PASS |
| 3 hand labels | measles 2018 W20 = 0 after 10 blank weeks (W10-19) | PASS |
| 3 hand labels | rows with possible_catch_up / review | PASS |
| 7 weekly | weekly rows (2 diseases x 261 weeks) | PASS |
| 7 weekly | measles: reported / missing | PASS |
| 7 weekly | measles: system_gap / disease_gap | PASS |
| 7 weekly | measles: zero weeks among reported (% to 1 decimal) | PASS |
| 7 weekly | rubella: reported / missing | PASS |
| 7 weekly | rubella: system_gap / disease_gap | PASS |
| 7 weekly | rubella: zero weeks among reported (% to 1 decimal) | PASS |
| 7 weekly | highest measles week | PASS |
| 7 weekly | suspect rows | PASS |
| README 6.A.5 (added) | measles zero weeks in 2017 / 2021 | PASS |
| weekly (added) | cases identical to edcs_national_weekly, blanks included | PASS |
| weekly (added) | every hand-labelled row carries the 'found by inspection' note | PASS |
| 4 yearly (added) | indicator in file | PASS |
| 3 inputs | WHO yearly: records / first-last year / blank years | PASS |
| 7 yearly | WHO yearly rows / missing | PASS |
| 7 yearly | WHO 2019 value | PASS |
| 7 yearly | weekly sums by year (measles) 2017-2021 | PASS |
| README 6.A.6 (added) | weeks with data 2017-2021 | PASS |
| README 6.A.6 / 6.B (added) | WHO 2014, 2017-2021, 2025 | PASS |
| 7 all files | measles_national_weekly: negative counts / duplicate keys / week_start not Sunday | PASS |
| all files (added) | measles_national_weekly: `missing` rows with a number in cases | PASS |
| 7 all files | measles_national_yearly: negative counts / duplicate keys / week_start not Sunday | PASS |
| all files (added) | measles_national_yearly: `missing` rows with a number in cases | PASS |
| 7 all files | measles_national_monthly: negative counts / duplicate keys / week_start not Sunday | PASS |
| all files (added) | measles_national_monthly: `missing` rows with a number in measles_total | PASS |
| all files (added) | measles_national_monthly: `missing` rows with a number in rubella_total | PASS |

### TB

| Step | Check | Result |
|---|---|---|
| 6 all files | B: duplicate PHL years | PASS |
| 6 all files | C: duplicate PHL years | PASS |
| 6 all files | E: duplicate PHL years | PASS |
| 3 inputs | B: Philippine years | PASS |
| 3 inputs | C: Philippine years | PASS |
| 6 all files | A: duplicate PHL years | PASS |
| 4 cross-checks | A rate (and range) = B after rounding: years that differ | WHO revision |
| 2 monthly | every PHL row report_frequency = 70 (monthly) | PASS |
| 6 all files | D: duplicate PHL years | PASS |
| 2 monthly (added) | report_coverage codes are 34/35 only | PASS |
| 6 checks | annual rows (2000-2024) | PASS |
| 6 checks | estimated rate 2019 / 2020 / 2024 | PASS |
| 6 checks | estimated cases 2024, about (live file rounds to 3 significant figures) | PASS |
| 6 checks | notified 2019 / 2020 / 2024 | PASS |
| 6 checks | change in notified 2019 -> 2020 (%) | PASS |
| 6 checks | coverage 2019 / 2020 (%) | PASS |
| 6 checks | estimated gap 2020, about (rounding of the live estimate carried through) | PASS |
| 6 checks | private 2019 -> 2020 | PASS |
| 6 checks | monthly January / April 2020 | PASS |
| 6 checks | monthly sum 2020 | PASS |
| 6 checks | reported months in the snapshot backup | PASS |
| 6 checks | reported months in the live file (Jan 2020 - latest) | WHO revision |
| 6 checks | suspect months (2 COVID + 6 partial) | PASS |
| 6 checks | annual: negative counts / duplicate year | PASS |
| 6 checks | monthly: negative counts / duplicate month_start | PASS |
| 4 cross-checks | monthly sum / final yearly total, 2020-2024: all within 92-102% | PASS |
| 4 cross-checks (added) | monthly sum / final total by year (README 6.D.5), % | PASS |
| 4 cross-checks | live vs snapshot, 2020-2024 values that differ | PASS |
| labels (added) | months per label (from dates only) | PASS |
| labels (added) | suspect months | PASS |
| monthly (added) | `missing` months with a number / blank-then-reported months inside the series | PASS |
| monthly (added) | source_coverage 2020-2024 some_units, 2025 all_units (README 6.D.1) | PASS |
| annual (added) | every estimate column has its low and high bound filled | PASS |
| annual (added) | A matches B for 2000-2019 | PASS |

### surveillance.csv

| Check | Result |
|---|---|
| dengue rows = 33,842 | PASS |
| measles + rubella rows = 522 | PASS |
| TB rows = clean monthly file (84) | PASS |
| columns in the section 1.1 order | PASS |
| no duplicate keys | PASS |
| no case count on non-reported rows | PASS |
| weekly periods start on a Sunday | PASS |
| no negative counts | PASS |
