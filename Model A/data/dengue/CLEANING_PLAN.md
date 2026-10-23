# Dengue cleaning plan

**Status:** run 20 Oct 2026 with `scripts/clean_dengue.py` (one command, safe to re-run). It produces the clean files described in [README.md](README.md) section 5. Raw files are in `data/raw/dengue/`. `plan/FINAL_CLEANING_PLAN.md` section 3 overrides this plan where they differ (swap rule needs dates **and** regions: 581 swapped, 5 `deaths_check`, 31,994 `ok`; Batanes 69.2%).

## 1. Goal

Turn the three raw files into clean, documented tables that Model A can trust, **without hiding the errors Model A has to catch.**

Cleaning here means three things: standardize names, dates and places; fill in the full weekly calendar; and label problems. It does not mean filling gaps, smoothing, or overwriting numbers.

This follows the proposal's methodology: standardize disease identifiers, reporting periods and geographic units; assess missing values, duplicates and completeness; preserve source metadata; and keep missing records distinct from confirmed zero-case reports.

## 2. Ground rules

1. **Raw files are read-only.** Every change happens in code.
2. **Missing stays missing.** No row, or a blank cell, means `cases` is blank and `report_status` is `missing`. Never 0.
3. **Label, don't overwrite.** Original values stay in `cases` and `deaths`. Corrections go in `cases_fixed` and `deaths_fixed`, and the reasons go in `qa_flag`.
4. **No filling in, no smoothing, no peeking ahead.** No rule may use later weeks to judge earlier ones, so time-based splits stay honest.
5. **Each source stays at its own level and time unit.** Never split national counts into provinces or join sources into one series.
6. **No simulated data in these files.** It goes in `data/synthetic/` only.
7. **Every rule has a check with an expected number** (step 7). If a check fails, stop and investigate. Don't adjust a rule just to make the number match.

## 3. Inputs

Put these in `data/dengue/raw/`, and record the download date and SHA-256 in README section 3.

| File | Expect |
|---|---|
| `doh-epi-dengue-data-2016-2021.csv` | 32,703 lines: header, HDX tag row, 32,701 data rows; 5 columns |
| `Health_Dataset.xlsx` | Sheet1: 260 rows × 20 columns |
| `Temporal_extract_WPRO_V1_3.zip` | one CSV with 17 columns; 544 weekly rows for the Philippines |
| `sourcedata_V1.3.csv` (optional) | OpenDengue's source list, to confirm `source_detail`: https://github.com/OpenDengue/master-repo/raw/main/data/raw_data/sourcedata_V1.3.csv |

Python packages: pandas, openpyxl, python-dateutil.

## 4. Codes

**`report_status`** (Model A can see this)

| Value | Meaning |
|---|---|
| `reported` | a number arrived (it may still be wrong) |
| `missing` | no row, or a blank cell |
| `not_in_source` | the place isn't listed yet (Davao Occidental before 2017) |

**`qa_label`** (answer key)

| Value | Meaning |
|---|---|
| `ok` | no problem found |
| `suspect` | the number is likely wrong |
| `incomplete` | the week was still being reported; leave it out of training and grading |

Rows that aren't `reported` have a blank `qa_label`.

**`qa_flag`** (answer key; one or more codes separated by `;`)

| Code | Meaning | Sets `qa_label` to |
|---|---|---|
| `swap_cases_deaths` | cases and deaths swapped (HDX pattern) | `suspect` |
| `national_gap` | week missing for every location | none (the row is `missing`) |
| `regional_gap` | week missing for a whole region | none (the row is `missing`) |
| `last_week` | final week of a file, still filling in | `incomplete` |
| `edge_week` | OpenDengue: last week before a gap or a source switch (likely a partial count) | `incomplete` |
| `dip_unverified` | OpenDengue, 18 Jun – 23 Jul 2023 | `suspect` |
| `below_official` | OpenDengue 2023, below DOH's announced totals | no change (2023 is test-only) |
| `deaths_check` | deaths above cases outside the swap pattern | no change |
| `repeated_value` | 3+ weeks in a row with the same count (50+) | no change (review) |

## 5. Steps

### Step 1. Shared calendar → `data/shared/calendar_weeks.csv`

One row per week from 30 Dec 2012 to 19 Nov 2023 (569 weeks), which covers all three sources. Build it once and reuse it for measles and TB.

| Column | Rule |
|---|---|
| `week_start`, `week_end` | Sunday to Saturday |
| `mw_year`, `mw` | DOH morbidity week. Week 1 is the first Sunday-to-Saturday week with at least 4 days in the new year, so the week's Wednesday decides its year |
| `holy_week` | the week starting on Palm Sunday (Easter minus 7 days; use `dateutil.easter`) |
| `christmas_newyear` | the week includes any day from 24 Dec to 1 Jan |
| `covid_period` | `week_start` on or after 15 Mar 2020; context only, because 2020 mixes real drops with reporting problems |

Checks:
- 2017 week 1 starts on 1 Jan 2017, and 2021 week 1 on 3 Jan 2021.
- 2019 week 38 runs 15–21 Sep 2019, matching published morbidity-week dates.
- 2020 has 53 weeks.
- Holy Week starts on 20 Mar 2016, 9 Apr 2017, 25 Mar 2018, 14 Apr 2019, 5 Apr 2020, 28 Mar 2021, 10 Apr 2022 and 2 Apr 2023.

### Step 2. Location lookup → `data/shared/locations.csv`

One row per HDX location (126). Columns: `location_raw`, `location`, `location_id`, `location_type`, `region_raw`, `region`, `region_id`, `first_week`, plus optional `psgc_code` for maps.

1. Trim spaces: " CAGAYAN DE ORO CITY", " NEGROS ORIENTAL".
2. Fix spellings: SISQUIJOR → SIQUIJOR, NUEVA VISCAYA → NUEVA VIZCAYA, BASILIG CITY → BISLIG CITY (Caraga), TACLOBAN → TACLOBAN CITY.
3. Fix the region label: "REGION VII-EASTERN VISAYAS" becomes Region VIII – Eastern Visayas. All 8 of its locations are Eastern Visayas places.
4. Standardize the 17 region names and give each a short ID: `R01`, `R02`, `R03`, `R4A`, `R4B`, `R05` to `R12`, `NCR`, `CAR`, `CARAGA`, `BARMM`.
5. Build `location_id` from the region ID and name, for example `R08-LEYTE`.
6. Set `location_type`: names ending in "CITY", plus Tacloban, are `city` (44); Pateros is `municipality` (1); the rest are `province` (81).
7. Keep each location in the region the source gives, for example Cotabato City under `R12`, and note this in the README.
8. Set `first_week` to the first week the location appears (Davao Occidental: 8 Jan 2017).

Checks: 126 locations; 17 regions; 8 locations in `R08`; no location under two regions.

### Step 3. HDX province file → `data/dengue/clean/dengue_province_weekly.csv`

1. Read the CSV, skipping row 2 (HDX tags). Parse `date` as month/day/year, trim names, and join the lookup.
2. Check that there are no duplicate location-weeks, every date is a Sunday, and no number is negative.
3. Build the full grid: 126 locations × 262 weeks (10 Jan 2016 – 10 Jan 2021) = 33,012 rows. Cells with no row get `report_status = missing` and a blank `cases`.
4. Weeks before a location's `first_week` become `not_in_source` (Davao Occidental: 52 weeks).
5. Add gap flags: `national_gap` on 6 Jan 2019; `regional_gap` on 13 Nov 2016, 12 Nov 2017 and 15 Nov 2020.
6. **Swap rule:** on the 15 dates listed in README section 6, rows where deaths are above cases get `qa_label = suspect`, `qa_flag = swap_cases_deaths`, `cases_fixed = deaths` and `deaths_fixed = cases`. Rows with 0 cases and 0 deaths on those dates read the same either way, so they stay `ok`.
7. The other rows where deaths are above cases (4) get `deaths_check`. Keep their cases, and leave `deaths_fixed` blank for Aurora on 15 Sep 2019.
8. The last week (10 Jan 2021) gets `incomplete` and `last_week`.
9. Runs of 3 or more weeks with the same count (50 or more) get `repeated_value` (expect 2).
10. Everywhere else, `cases_fixed` and `deaths_fixed` copy the reported values. Leave them blank where the row is missing.

### Step 4. DOH weekly reports → `data/dengue/clean/dengue_national_weekly.csv` (`source = doh_edcs`)

1. Read Sheet1, fill `Year` down, and map each (Year, Week) to its `week_start` using the calendar.
2. A blank `Dengue` cell becomes `missing` (38 weeks), never 0.
3. Add 2020 week 53 (27 Dec 2020 – 2 Jan 2021) as a `missing` row.
4. In the same pass, write all 18 diseases to `data/shared/edcs_national_weekly.csv` with the same codes. Measles and cross-disease pooling reuse this file.

Checks:
- 261 weeks after adding week 53.
- 39 dengue weeks `missing`: the 38 blanks plus week 53. Of the 38 blanks, 36 are blank for every disease, 2017 week 52 for all but rubella, and 2021 week 6 for dengue only.

### Step 5. OpenDengue → `data/dengue/clean/dengue_national_weekly.csv` (`source = opendengue`)

1. Unzip and read the CSV. Keep the rows where `adm_0_name` = PHILIPPINES, `S_res` = Admin0 and `T_res` = Week (544).
2. Fill `source_detail` from the dates, and confirm against the optional source list:

   | Original source | Weeks |
   |---|---|
   | WHO Western Pacific situation updates | 30 Dec 2012 – 16 Dec 2018, and 3 Jan 2021 – 4 Dec 2022 |
   | DOH statistics | 30 Dec 2018 – 27 Dec 2020 |
   | DOH weekly surveillance reports | 25 Dec 2022 – 19 Nov 2023 |

3. Fill in the full calendar (569 weeks). The 25 absent weeks become `missing`:
   - 28 Dec 2014
   - 22 Nov – 27 Dec 2015 (6 weeks)
   - 6 Nov – 25 Dec 2016 (8)
   - 3 – 24 Dec 2017 (4)
   - 23 Dec 2018
   - 12 – 26 Dec 2021 (3)
   - 11 and 18 Dec 2022
4. Mark the last week before each gap or source switch `incomplete` with `edge_week` (8 weeks): 21 Dec 2014, 15 Nov 2015, 30 Oct 2016, 26 Nov 2017, 16 Dec 2018, 27 Dec 2020, 5 Dec 2021 and 4 Dec 2022. The rule depends on position only, not on the count, and all but 5 Dec 2021 are far below the weeks before them.
5. In 2023:
   - all rows get `below_official`;
   - 18 Jun – 23 Jul get `suspect` and `dip_unverified`;
   - 9 – 23 Apr get `repeated_value`.

### Step 6. Cross-check table → `data/dengue/clean/dengue_source_comparison.csv` (not for modeling)

Yearly totals per source by DOH morbidity year. Copy this into the README so readers can see how much the sources differ.

| Morbidity year | HDX raw | HDX fixed (weeks) | DOH weekly (weeks with data) | OpenDengue (weeks) |
|---|---|---|---|---|
| 2016 | 209,544 | 216,607 (51) | — | 175,316 (44) |
| 2017 | 152,415 | 156,135 (52) | 105,976 (51) | 132,934 (48) |
| 2018 | 247,059 | 247,059 (52) | 186,992 (40) | 212,905 (51) |
| 2019 | 443,846 | 443,846 (51) | 430,282 (52) | 437,777 (52) |
| 2020 | 94,561 | 95,376 (53) | 61,359 (28) | 84,584 (53) |

These totals assume HDX's `date` is the week start (open question 1).

### Step 7. Checks (expected numbers)

| Check | Expected |
|---|---|
| HDX data rows | 32,701 |
| Locations / regions | 126 / 17 |
| Grid rows | 33,012 |
| `report_status`: reported / missing / not_in_source | 32,701 / 259 / 52 |
| Missing by week | 6 Jan 2019: 126 · 13 Nov 2016: 46 · 12 Nov 2017: 41 · 15 Nov 2020: 46 |
| Swapped rows | 582 (527 with 0 cases, 55 with 1–3 cases) |
| `deaths_check` rows | 4 |
| `incomplete` rows (10 Jan 2021) | 126 |
| `ok` rows | 31,993 |
| 2016 deaths, raw → fixed | 8,127 → 1,064 |
| Zero-case share in `ok` rows | about 8.0% (median location 4.6%; Batanes 69.1%) |
| HDX `repeated_value` runs | 2 |
| DOH weekly rows / dengue `missing` | 261 / 39 |
| OpenDengue weeks / `missing` / `edge_week` | 569 / 25 / 8 |
| All files | no negative counts, no duplicate keys, every `week_start` a Sunday |

### Step 8. Plots to check by eye

Save these to `data/dengue/clean/figures/`; they can go straight into the slides.

1. The national sum of HDX `cases` against `cases_fixed`. The swap shows up as a sawtooth in autumn 2016, 2017 and 2020.
2. One small panel per region, marking `suspect` and `missing` weeks. The hub pattern should be visible.
3. DOH weekly and OpenDengue national lines, with missing weeks shaded.

### Step 9. Stack and document

1. Append the dengue rows to `data/surveillance.csv`, the shared format for all diseases.
2. Update README.md: fill in the TODOs, confirm the numbers, and add a change-log entry.

## 6. Hand-off to Model A

- **Reads:** `data/dengue/clean/dengue_province_weekly.csv`, using the columns marked "yes" in README section 5, plus the calendar flags joined on `week_start`.
- **Never reads:** `qa_label`, `qa_flag`, `cases_fixed`, `deaths_fixed` or `deaths`.
- **Fit robustly.** The training years contain the 2016 and 2017 swaps, so fit, drop the most extreme low values, then refit.
- **Suggested time splits:** train on 2016–2018; validate on 2019 with injected failures; test on 2020 (the real swapped rows, the regional missing week, and injected failures). Also score the 2017 episode using 2016 as its only history.
- **Grading leaves out `incomplete` rows.**

## 7. Open questions for the team

1. Does HDX's `date` mark the start of the week? It matters for cross-source checks and holiday flags, not for province-level Model A.
2. Licenses: what are the HDX and OpenDengue terms, and can we get permission to reuse the GitHub Excel file?
3. Should we add official PSGC codes now (they're needed for maps) or later?
4. Should OpenDengue's 2013–2015 data serve as extra national history for Model A?

**Done when:** every check in step 7 passes, the plots look right, and README.md is updated.
