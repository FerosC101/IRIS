# Measles cleaning plan

**Status:** run 20 Oct 2026 with `scripts/clean_measles.py` (one command, safe to re-run). It produces the clean files described in [README.md](README.md) section 5. Raw files are in `data/raw/measles/`. `plan/FINAL_CLEANING_PLAN.md` section 4 overrides this plan where they differ (Mendeley and NBL weekly files not used; monthly file for context only).

**Run the dengue cleaning first:** its steps 1 and 4 build the shared calendar and `data/shared/edcs_national_weekly.csv`, which this plan reads.

## 1. Goal

Give Model A a clean weekly measles series, plus rubella, **without hiding the gaps and fake zeros it has to catch.** The yearly and monthly WHO data are added for context and checks, each at its own time unit.

## 2. Ground rules (same as dengue)

1. **Raw files are read-only.** Every change happens in code.
2. **Missing stays missing.** Blank means `missing`, never 0.
3. **Label, don't overwrite.** Reasons go in `qa_flag`; reported numbers stay as they are.
4. **No filling in, no smoothing, no peeking ahead.**
5. **Each source stays at its own time unit.** Never split yearly or monthly totals into weeks.
6. **No simulated data in these files.**
7. **Every rule has a check with an expected number** (step 7).

## 3. Inputs

| File | Where | Expect |
|---|---|---|
| `data/shared/edcs_national_weekly.csv` | made by dengue cleaning, step 4 | 18 diseases × 261 weeks, including the added 2020 week 53 |
| `who_gho_measles_phl.json` | `data/measles/raw/` (source B) | 52 records, 1974–2025; 1996 has no value |
| `404-table-web-epi-curve-data.xlsx` (optional) | `data/measles/raw/` (source C) | audit on first load (step 5) |
| Mendeley weekly file (optional) | `data/measles/raw/` (source D) | audit on first load |

## 4. Codes

`report_status` and `qa_label` use the same values as dengue (dengue CLEANING_PLAN section 4). The `qa_flag` codes for measles:

| Code | Meaning | Sets `qa_label` to |
|---|---|---|
| `system_gap` | week blank for every disease, or all but one | none (the row is `missing`) |
| `disease_gap` | week blank for this disease while other diseases reported | none (the row is `missing`) |
| `group_zero` | 0 reported during an epidemic, in a week when several diseases read 0 together | `suspect` |
| `possible_catch_up` | very high week right after a zero or a gap; probably includes late reports | no change |
| `review` | odd, but the evidence is weak | no change |
| `latest_months` | last two months of the WHO monthly file (reporting lag) | `incomplete` |

## 5. Steps

### Step 1. Weekly measles and rubella → `data/measles/clean/measles_national_weekly.csv`

1. Read `data/shared/edcs_national_weekly.csv` and keep the `Measles` and `Rubella` rows, named `measles` and `rubella`.
2. Keep `cases` exactly as reported. Blank stays blank with `report_status = missing`.
3. Set `cases_fixed = cases`; measles needs no corrections.

### Step 2. Gap flags

1. **`system_gap`:** a week blank for at least 17 of the 18 diseases.
   - Measles: 37 weeks plus the added 2020 week 53.
   - Rubella: 36 weeks plus 2020 week 53.
2. **`disease_gap`:** any other blank week.
   - Measles: 2019 W1–3 and W10.
   - Rubella: 2017 W46–47 and 2019 W1–3.

### Step 3. Real fake zero and catch-up weeks

1. **2019 week 8**, measles and rubella → `qa_label = suspect`, `qa_flag = group_zero`.
   - Write the 6 other diseases that read 0 that week into a note column, for the cross-disease story: acute flaccid paralysis, neonatal and non-neonatal tetanus, chikungunya, acute bloody diarrhea, rotavirus.
2. **2019 weeks 9 and 11** (measles 1,227 and 3,710) → `possible_catch_up`.
3. **2018 week 20** (measles 0 right after 10 blank weeks) → `review`.

These labels are listed by hand from inspection, not made by a general rule. Say so wherever they're used.

### Step 4. WHO yearly → `data/measles/clean/measles_national_yearly.csv`

1. Read the JSON and keep `TimeDim` → `year`, `NumericValue` → `cases`, `Date` → `who_last_updated`.
2. 1996 → `report_status = missing`.
3. Add the yearly sums of the weekly file, with the number of weeks that have data, as separate rows (`source = doh_edcs_weekly_sum`). Never mix them into the WHO rows.

### Step 5. WHO monthly (optional) → `data/measles/clean/measles_national_monthly.csv`

1. Open the Excel file and record the sheet names, columns, row count and SHA-256 in the README.
2. Keep the Philippines rows. Store measles total and any classification columns (lab-confirmed, epidemiologically linked, clinically compatible) separately; keep rubella too.
3. Months with no report → `missing`. First check whether the file shows them as blank or as 0.
4. The last two months in the file → `incomplete`, `latest_months`.
5. Check that each year's monthly sum is close to WHO's yearly value (source B), and write the differences in the README.

### Step 6. Mendeley weekly (optional)

1. Rebuild the full weekly calendar (2017–2023) so that left-out weeks show as `missing`.
2. Check that 2017–2021 matches source A week by week, then use 2022–2023 as extra history.

### Step 7. Checks (expected numbers)

| Check | Expected |
|---|---|
| Weekly rows | 522 (2 diseases × 261 weeks) |
| Measles: reported / missing | 219 / 42 (41 blanks plus 2020 week 53) |
| Rubella: reported / missing | 219 / 42 |
| Measles gaps: `system_gap` / `disease_gap` | 38 / 4 |
| Rubella gaps: `system_gap` / `disease_gap` | 37 / 5 |
| Measles zero weeks among reported | 41 (18.7%) |
| Rubella zero weeks among reported | 85 (38.8%) |
| Highest measles week | 3,710 (2019 week 11) |
| `suspect` rows | 2 (2019 week 8, measles and rubella) |
| WHO yearly rows / missing | 52 / 1 (1996) |
| WHO 2019 value | 48,525 |
| Weekly sums by year (measles) | 2017: 271 · 2018: 4,087 · 2019: 33,699 · 2020: 2,970 · 2021: 281 |
| All files | no negative counts, no duplicate keys, every `week_start` a Sunday |

### Step 8. Plots to check by eye

Save these to `data/measles/clean/figures/`.

1. Weekly measles and rubella with blank weeks shaded. Mark 2019 weeks 8, 9 and 11.
2. Heat strip of 2019 weeks 1–14 for all 18 diseases: the week 8 group zero should stand out.
3. WHO yearly bars, with the weekly sums as dots for 2017–2021.

### Step 9. Stack and document

1. Append the weekly measles and rubella rows to `data/surveillance.csv`.
2. Update README.md: fill in the TODOs, record the audit of source C if used, and add a change-log entry.

## 6. Hand-off to Model A

- **Reads:** `measles_national_weekly.csv`, using the "yes" columns only.
- **Never reads:** `qa_label`, `qa_flag`, `cases_fixed` or notes.
- **History is short** (5 years, many gaps), so refit every 4 weeks using only earlier weeks rather than relying on one fixed split.
- **Real labels:** 2019 week 8 (measles and rubella), plus the blank weeks filled with 0 on purpose. Add injected failures in the quiet years 2017 and 2021.
- **Leave-one-disease-out:** tune the shared detector on the other diseases, then test on measles without retuning.
- **Cross-disease pooling:** 2019 week 8 is the real example. Pooled evidence across the 8 diseases should be far stronger than measles alone.

## 7. Open questions for the team

1. Do we add source C (monthly, 2012 to present) to show measles beyond 2021?
2. Licenses: WHO terms, the Mendeley license, and permission for the GitHub Excel file.
3. Should rubella count as a fourth disease in the "works across diseases" claim, or stay as measles' partner only?

**Done when:** every check in step 7 passes, the plots look right, and README.md is updated.
