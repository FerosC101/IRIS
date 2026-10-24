# Final cleaning plan: dengue, measles, TB

**Status:** decisions made 20 Oct 2026. This file answers every open item from the cleaning reports. It overrides the three disease plans wherever they differ. Do everything below in one pass, in order.

## 1. Global decisions

### 1.1 `data/surveillance.csv`: approved

One row per disease, place and period. Columns, in this order:

| Column | Notes |
|---|---|
| `disease` | `dengue`, `measles`, `rubella`, `tb` |
| `source` | e.g. `hdx_doh_epi`, `doh_edcs`, `opendengue`, `who_provisional` |
| `level` | `province_city` or `national` |
| `location_id`, `location` | national rows: `PH`, `PHILIPPINES` |
| `region_id`, `region` | blank for national rows |
| `period_start`, `period_end` | rename `week_start`/`week_end`; TB uses the first and last day of the month |
| `resolution` | `week` or `month` |
| `mw_year`, `mw` | blank for monthly rows |
| `cases` | as reported; blank when missing |
| `report_status` | `reported`, `missing`, `not_in_source` |
| `qa_label`, `qa_flag` | answer key |
| `cases_fixed` | equals `cases` where nothing was corrected |

What goes in:

| Disease | Rows | Count |
|---|---|---|
| Dengue | province file + national file | 33,012 + 830 = 33,842 |
| Measles | weekly measles and rubella file | 522 |
| TB | monthly file only | one row per month from Jan 2020 to the last month in the live file |

What stays out:
- yearly tables (WHO measles yearly, TB annual);
- the measles monthly file;
- source-specific columns (`deaths`, `deaths_fixed`, `source_detail`, `source_coverage`, `source_remarks`, notes).

Build it with a small `scripts/build_surveillance.py` that reads the clean files and stacks them. Re-running it must give the same file.

### 1.2 "Downloaded by"

Fill in **John Vincent M. Doria (Team Nex)** in every README, with the dates the files were downloaded (19–20 Oct 2026). Change the name if someone else downloaded a file.

### 1.3 Licenses: still open, but not a blocker

- Write **"Unconfirmed (checked: not yet)"** in every README license field, plus the page to check:
  - HDX dataset page;
  - OpenDengue on Figshare;
  - WHO data policy;
  - the GitHub repository (no license file).
- Until they're confirmed, add `data/**/raw/` and `data/**/clean/` to `.gitignore`. The public repository gets the scripts, the docs and the download links; anyone can rebuild the data.

## 2. Housekeeping (do first)

1. **Move the docs to where their own links expect them:**

   | From | To |
   |---|---|
   | `plan/dengue_README.md` | `data/dengue/README.md` |
   | `plan/dengue_CLEANING_PLAN.md` | `data/dengue/CLEANING_PLAN.md` |
   | `plan/measles_README (1).md` | `data/measles/README.md` |
   | `plan/measles_CLEANING_PLAN.md` | `data/measles/CLEANING_PLAN.md` |
   | `plan/tb_README (1).md` | `data/tb/README.md` |
   | `plan/TB_CLEANING_PLAN.md` | `data/tb/CLEANING_PLAN.md` |

   Keep this file in `plan/`.

2. **Fix the misfiled raw files:**
   - `data/raw/measles/measles_Temporal_extract_WPRO_V1_3.csv` → `data/raw/dengue/Temporal_extract_WPRO_V1_3.csv`. It's dengue's OpenDengue file.
   - `data/raw/measles/[measles]` → `data/raw/measles/who_gho_measles_phl.json`. Use `-LiteralPath` because of the brackets.
   - `data/raw/dengue/Diseases Data (for NBL).xlsx` → `data/raw/unverified/`. It isn't used (section 4).

3. **Get the OpenDengue zip:** download https://github.com/OpenDengue/master-repo/raw/main/assets/Temporal_extract_WPRO_V1_3.zip into `data/raw/dengue/`.
   - Check that its SHA-256 is `c25ad7cec851ef3344663440ee2131ca350b940683c13d5cdd18d48f34e9c70b`.
   - If the download fails, keep the CSV, as long as its SHA-256 is `972af7ac995d0a1cf6ec353608b9727120da5989e598177e20f9db1f74582588`, the same file we audited.
   - Read from the zip if you have it, otherwise from the CSV.

4. **Update the raw paths** at the top of each script. Raw files stay in `data/raw/<disease>/`; outputs stay in `data/<disease>/clean/` and `data/shared/`.

## 3. Dengue decisions

| Item | Decision |
|---|---|
| Quirino, 15 Oct 2017 (1 case, 2 deaths) | **Move to `deaths_check`.** The swap hit whole regions, and Quirino is the only odd row in Cagayan Valley that week (Cagayan 84 cases, Isabela 68). Change the swap rule to: swap dates **and** the regions listed for that year |
| New expected numbers | 581 swapped (527 with 0 cases, 54 with 1–3); 5 `deaths_check` (Aurora, Batanes, Davao del Sur, Pateros, Quirino); 31,994 `ok`; HDX fixed 2017 (morbidity year) 156,134 |
| Batanes zero share | **Accept 69.2%** (180 of 260 `ok` weeks). The 69.1% came from an early dry run that still labeled the deaths-above-cases rows `suspect` |
| OpenDengue repeated-value check | **Fix it** to expect 1,196 / 1,196 / 1,197. The rule is "same count within 0.1%, 50+" |
| Final-week flag | HDX only. The other files' final weeks look complete (DOH 2021 week 52: 1,664; OpenDengue 19 Nov 2023: 2,607) |
| Quezon City, 7 May 2017, blank deaths | Keep it blank; note it in the README |
| HDX `date` | Treat it as the week start (an assumption, noted in the README) |
| PSGC codes | Later, when the dashboard needs maps |
| OpenDengue 2013–2015 | Not used by Model A; context only |

## 4. Measles decisions

| Item | Decision |
|---|---|
| NBL file | **Not used.** We don't know where it came from. Its 2019 week 10 value (16,020) is more than four times the epidemic's highest week (3,710), so it's likely a cumulative or typing error. Its three zeros where source A is blank can't be told apart from blanks turned into 0. Keep the audit note in the README; the file stays in `data/raw/unverified/` |
| "Last two months" in the WHO monthly file | **Confirmed:** the last two months of the Philippine series (Aug and Sep 2026). Each country's reporting lags differently |
| Mendeley weekly (source D) | Skip it. Mark it "not used" in the README |
| Monthly file (source C) | Use it for **context and slides** (measles after 2021), not for training Model A. The weekly DOH series stays the main measles data |
| Rubella | Measles' **partner**, not a fourth disease. The claim stays at three diseases; rubella supports the shared-disruption story (2019 weeks 1–3 and week 8) |

## 5. TB decisions

| Item | Decision |
|---|---|
| Source A differs from B for 2020–2023 | **Accept as a WHO revision, not a failure.** data.who.int lists this indicator's last update as 8 Jan 2024, so A carries an older estimate round. Use **B** for every number in the clean files and slides; keep A only as a documented reference. Note the differences in the README |
| TB as the third disease | **Yes,** as a monthly, national transfer test. Report it as a demonstration, not an accuracy claim |
| Notifications 1980–1999 | **Don't keep them.** The annual table starts in 2000, when the estimates start |

## 6. Run order (one pass)

1. Housekeeping (section 2).
2. **Dengue:** apply section 3, re-run `scripts/clean_dengue.py`, and check that every step 7 check passes with the new numbers.
3. **Measles:** re-run `scripts/clean_measles.py`, because the dengue shared files were rebuilt. Its numbers shouldn't change.
4. **TB:** re-run `scripts/clean_tb.py` with the section 5 decisions.
5. Build `data/surveillance.csv` (section 1.1) and check its row count.
6. Update all three READMEs:
   - SHA-256s, download dates and "downloaded by";
   - the license status;
   - the dengue comparison table;
   - each decision above, in a v0.2 change-log entry.
7. Write one short final report, `plan/final_report.md`:
   - every check, pass/fail;
   - the `surveillance.csv` row counts by disease;
   - anything still open (licenses only, if all goes well).

## 7. Done when

- [ ] All dengue, measles and TB checks pass (WHO revisions listed separately for TB).
- [ ] `data/surveillance.csv` exists with 33,842 dengue + 522 measles/rubella + all TB monthly rows.
- [ ] Every README has hashes, dates, "downloaded by", license status and a v0.2 change log.
- [ ] The docs live in `data/<disease>/`; no misfiled raw files remain.
- [ ] Re-running every script gives identical files.
- [ ] The only open item is the license check.

Then Model A can start on `data/dengue/clean/dengue_province_weekly.csv`.
