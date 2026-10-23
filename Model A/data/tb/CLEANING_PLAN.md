# TB cleaning plan

**Status:** run 20 Oct 2026 with `scripts/clean_tb.py` (one command, safe to re-run). It produces the clean files described in [README.md](README.md) section 5. Raw files are in `data/raw/TB/`. `plan/FINAL_CLEANING_PLAN.md` section 5 overrides this plan where they differ (source A is a reference only; B is used for every number).

## 1. Goal

Build two small, honest tables:

1. **Annual:** estimated against notified TB, with ranges, for the 2020 replay.
2. **Monthly:** provisional notifications, with DOH's own partial-month notes kept as labels, for a transfer test of Model A.

## 2. Ground rules

The dengue rules apply: raw files are read-only; missing stays missing; label, don't overwrite; no filling in, smoothing or peeking ahead; no simulated data; and every rule has a check. Three more for TB:

1. **Estimates stay estimates.** Keep the low and high bounds next to every estimated number, and carry them into anything computed from it.
2. **Keep WHO's version.** Record which report and download date each file comes from, because WHO revises past years.
3. **Annual and monthly never mix.** No splitting yearly totals into months, and no adding estimates to notifications.

## 3. Inputs

Put these in `data/tb/raw/` and record the download date and SHA-256 in README section 3.

| File | Expect |
|---|---|
| `C288D13_ALL_LATEST.csv` (source A) | rows for every country and year; filter `DIM_GEO_CODE_M49` = 608 |
| Burden estimates CSV (B) | one row per country and year; Philippines 2000–2024 |
| Case notifications CSV (C) | Philippines 1980–2024 |
| Provisional notifications CSV (D) | Philippines one row per year from 2020; all monthly (`report_frequency` = 70) |
| Public–private mix CSV (E, optional) | `priv_new_dx` for the Philippines |
| Data dictionary CSV (F) | definitions, for the README |

## 4. Codes

**`report_status`:** `reported` (a number arrived) or `missing` (no number for that month yet).

**`qa_label`** (answer key)

| Value | Meaning for TB |
|---|---|
| `ok` | no problem found |
| `suspect` | the count is far below what was really happening: partial reporting or disrupted detection |
| `incomplete` | the month is still being reported; leave it out of training and grading |

Months that aren't `reported` have a blank `qa_label`.

**`qa_flag`** (answer key)

| Code | Months | Sets `qa_label` to |
|---|---|---|
| `covid_disruption` | April and May 2020, the first two full months of community quarantine | `suspect` |
| `source_partial` | October–December 2021 (DOH says "just some units") and October–December 2022 (implied by "Jan to Sept. are all units") | `suspect` |
| `latest_months` | the last two reported months in the file (reporting lag) | `incomplete` |
| `q4_not_final` | October–December 2024 (DOH says the fourth quarter is still being finalized) | no change |

These labels are based on dates and on DOH's own remarks, not on the counts, so Model A's results on them are a fair test.

## 5. Steps

### Step 1. Annual table → `data/tb/clean/tb_national_annual.csv`

1. Read B, keep `iso3` = PHL, and keep the estimate columns (README section 3B).
2. Read C, keep PHL, and keep `year` and `c_newinc`. Join on `year` (2000–2024).
3. Optionally read E and add `priv_new_dx` as `notified_private`.
4. Compute:
   - `coverage = notified ÷ inc_est`
   - `gap_est = inc_est − notified`, with `gap_est_lo = inc_est_lo − notified` and `gap_est_hi = inc_est_hi − notified`
5. Read A, keep `DIM_GEO_CODE_M49` = 608, and check that each rate matches B's `e_inc_100k` after rounding. Note the last year A covers. If it ends before 2024, B covers the newest years.
6. Add `who_report` (e.g. 2025) and the download date.

### Step 2. Monthly table → `data/tb/clean/tb_national_monthly.csv`

1. Read D and keep `iso3` = PHL. Check that every row has `report_frequency` = 70 (monthly).
2. Reshape `m_01` … `m_12` into one row per month, with `month_start` set to the first day of the month.
3. Empty months become `missing`; in the snapshot that is July–December 2025.
4. Copy `report_coverage` (34 → `all_units`, 35 → `some_units`) and `remarks` into `source_coverage` and `source_remarks`.
5. Add `is_december`.

### Step 3. Labels

Apply the `qa_flag` table in section 4. In the live file, `latest_months` moves with the newest data.

### Step 4. Cross-checks (not for modeling)

1. Monthly sum ÷ final yearly total for each full year. Expect 0.92–1.02 (README section 6).
2. A against B: rates should match after rounding.
3. Live files against the snapshot backups: values for 2020–2024 should match, or differ only by small revisions. Note any differences in the README.

### Step 5. Plots to check by eye

Save these to `data/tb/clean/figures/`.

1. Estimated cases (line with shaded range) and notified cases, 2000–2024. The 2020 gap should be obvious.
2. Private against all other notifications, 2015–2024. The 2020 private collapse should stand out.
3. Monthly provisional cases, 2020 onward, marking April–May 2020, the partial months and the latest months.

### Step 6. Checks (expected numbers, from WHO's 30 Jul 2025 snapshot)

| Check | Expected |
|---|---|
| Annual rows | 25 (2000–2024) |
| Estimated rate 2019 / 2020 / 2024 | 554 / 544 / 625 per 100,000 |
| Estimated cases 2024 | about 724,000 (about 399,000 – 1,176,000) |
| Notified 2019 / 2020 / 2024 | 409,167 / 256,541 / 544,948 |
| Change in notified, 2019 → 2020 | −37.3% |
| Coverage 2019 / 2020 | 66.6% / 42.1% |
| Estimated gap 2020 | about 353,000 (about 85,000 – 710,000) |
| Private, 2019 → 2020 | 189,574 → 58,866 |
| Monthly, January / April 2020 | 40,104 / 10,489 |
| Monthly sum 2020 | 259,458 |
| Reported months in the snapshot | 66 (Jan 2020 – Jun 2025) |
| `suspect` months | 8 (2 COVID plus 6 partial) |
| All files | no negative counts; no duplicate year or month |

### Step 7. Stack and document

1. Append the monthly rows to `data/surveillance.csv` (resolution `month`). The annual table stays separate: estimates are not counts.
2. Update README.md: fill in the TODOs, record the live-file differences, and add a change-log entry.

## 6. Hand-off to Model A

- **Reads:** `tb_national_monthly.csv`, using the "yes" columns only. It never reads `source_coverage`, `source_remarks`, `qa_label` or `qa_flag`, and never reads the annual estimates.
- **Short history:** the series starts in January 2020, right at the disruption, so there's little normal history. Two ways to set the expected monthly count:
  1. The previous normal year's notified total ÷ 12. For 2020 that is 2019's 409,167 ÷ 12 ≈ 34,100 a month, which puts April 2020 at about 31% of expected.
  2. A count model fitted on 2021 onward, scored month by month using only earlier months.
- **Grade on:** the 8 `suspect` months; leave out `incomplete` months.
- **Leave-one-disease-out:** tune the shared detector on dengue and measles, then test on TB monthly without retuning. Report it as a transfer demonstration (one series, few labels), not as an accuracy claim.

## 7. Open questions for the team

1. Should TB count as the third disease in the "works across diseases" claim, given it's monthly and national only?
2. Licenses: confirm WHO's terms of use for republishing these files in our repository.
3. Should we keep notifications from 1980–1999 (no estimates) for a longer history?

**Done when:** every check in step 6 passes, the plots look right, and README.md is updated.
