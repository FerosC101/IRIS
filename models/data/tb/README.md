# Tuberculosis data (IRIS)

**Status:** v0.2, 20 Oct 2026. Cleaning run with `scripts/clean_tb.py` on WHO's live files of 19 Oct 2026: 32 checks pass, 2 are WHO revisions (listed in section 6), none fail (`data/tb/clean/check_report.md`). The numbers below come from WHO's snapshot of 30 Jul 2025; section 6 lists what changed in the live files. The monthly rows are in `data/surveillance.csv`. Decisions in `plan/FINAL_CLEANING_PLAN.md` (section 5) override [CLEANING_PLAN.md](CLEANING_PLAN.md) where they differ. Only open item: licenses (section 3).

## 1. Purpose

TB is IRIS's **steady, chronic** disease. It is reported through a different system from dengue and measles: the national TB program's information system, not the weekly disease reports. It plays two roles:

1. **The 2020 replay.** This is the clearest real example of IRIS's core idea, that low counts don't always mean fewer infections. WHO estimates that TB incidence barely changed in 2020 (554 → 544 per 100,000 people), yet notified cases fell 37.3% (409,167 → 256,541). The drop came mostly from one reporting channel: private providers' diagnoses fell 69%.
2. **A monthly transfer test.** WHO's provisional data gives monthly national notifications from January 2020, including months that DOH itself says were only partly reported. That lets us check whether Model A works on monthly data from a different reporting system.

These sources have no weekly or regional TB data, so TB is not used to train Model A. TB **counts as the third disease** in the "works across diseases" claim, as a monthly, national transfer test: report it as a demonstration, not an accuracy claim.

## 2. Sources at a glance

| | Source | Place level | Time unit | Period | Role in IRIS |
|---|---|---|---|---|---|
| A | WHO TB incidence per 100,000 (data.who.int) | national | year | 2000–2024 (check the file's last year) | Reference level, as a rate |
| B | WHO TB burden estimates | national | year | 2000–2024 | Estimated cases with a range: the "expected" line |
| C | WHO TB case notifications | national | year | 1980–2024 | Notified cases: the "observed" line |
| D | WHO provisional TB notifications | national | month | Jan 2020 – latest | Monthly transfer test; real partial-report labels |
| E | WHO public–private mix data (optional) | national | year | — | Private providers' share, for the 2020 channel story |
| F | WHO TB data dictionary | — | — | — | Variable definitions |

Estimates (A, B) are model outputs, not reports. Never run anomaly detection on them, and never add them to notified counts.

## 3. Source details

### A. WHO TB incidence (per 100,000 population)

| | |
|---|---|
| Page | https://data.who.int/indicators/i/13B4226/C288D13?m49=608 |
| File (all countries) | https://srhdpeuwpubsa.blob.core.windows.net/whdh/DATADOT/INDICATOR/C288D13_ALL_LATEST.csv |
| Rows we use | `DIM_GEO_CODE_M49` = 608 (Philippines) |
| Columns | `DIM_TIME` (year), `GEO_NAME_SHORT`, `RATE_PER_100000_N` (value), `RATE_PER_100000_NL` (low), `RATE_PER_100000_NU` (high), plus ID columns |
| What it is | WHO's **estimate** of new and relapse TB cases per year per 100,000 people, rounded. In the live file 2020 is 535 (range 300–839); B gives 544 (304–863) |
| Cross-check (live API) | https://ghoapi.azureedge.net/api/MDG_0000000020?$filter=SpatialDim%20eq%20%27PHL%27 |
| File used | `data/raw/TB/WHO TB incidence.csv` (= `C288D13_ALL_LATEST.csv`, renamed), 4,993 rows; 24 Philippine rows |
| Last year covered | **2023**. B covers 2024 |
| Against B | Identical for 2000–2019. **2020–2023 differ** (A / B: 535 / 544, 583 / 579, 627 / 627 with a different range, 643 / 632). Accepted as a WHO revision: data.who.int lists this indicator's last update as 8 Jan 2024, so A carries an older estimate round. **B is used for every number** in the clean files and slides; A is kept only as a documented reference |
| SHA-256 | `7b8c9ba5ec0e21af6ca2b0d323d24de57f0a6308481124977bbc19679eaeb240` |
| License | Unconfirmed (checked: not yet). Check the WHO data policy: https://www.who.int/about/policies/publishing/data-policy. The same applies to every WHO file below (B–F) |
| Downloaded | 19 Oct 2026 (with the other live files), by John Vincent M. Doria (Team Nex) |

### B. WHO TB burden estimates

| | |
|---|---|
| File | https://extranet.who.int/tme/generateCSV.asp?ds=estimates |
| Rows we use | `iso3` = PHL |
| Columns we use | `year`, `e_pop_num`, `e_inc_100k`, `e_inc_100k_lo`, `e_inc_100k_hi`, `e_inc_num`, `e_inc_num_lo`, `e_inc_num_hi` |
| Note | WHO re-estimates every past year with each report, so record the download date |
| File used | `data/raw/TB/TB_burden_countries_2026-10-19.csv`: 5,347 rows; 25 Philippine rows (2000–2024). Same values as the 2025 report round (`who_report` = 2025) |
| Precision | Case estimates are rounded to 3 significant figures (2024: 724,000; range 399,000 – 1,180,000) |
| SHA-256 | `6849d50d91579eaefa5833aa46d19d34e68dd6408a3768875991013f05586c30` |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

### C. WHO TB case notifications

| | |
|---|---|
| File | https://extranet.who.int/tme/generateCSV.asp?ds=notifications |
| Columns we use | `year`, `c_newinc`: "total of new and relapse cases and cases with unknown previous TB treatment history" |
| Backup (audited snapshot, small CSV) | https://github.com/GTB-TME/gtbreport2025/raw/main/data/gtb/snapshot_2025-07-30/annual_notifs.csv (columns `iso3`, `year`, `c_newinc`, `e_pop_num`, `priv_new_dx`; covers 2000–2024) |
| Backup SHA-256 | `09244e91753ba78bebcf099f22fbc974960528cd8c35ba9065fc6f2f48a970be` (matches; saved as `data/raw/TB/snapshot_2025-07-30/annual_notifs.csv`, downloaded 20 Oct 2026) |
| Cross-check (live API) | https://ghoapi.azureedge.net/api/TB_c_newinc?$filter=SpatialDim%20eq%20%27PHL%27 |
| File used | `data/raw/TB/TB_notifications_2026-10-19.csv`: 9,567 rows × 216 columns; 45 Philippine rows (1980–2024). `c_newinc` identical to the snapshot for every year |
| SHA-256 | `edd2e53898d078e1ada0b0552031035318439013840ac47273aa8afd3965e1a5` |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

### D. WHO provisional TB notifications

| | |
|---|---|
| File | https://extranet.who.int/tme/generateCSV.asp?ds=provisional_notifications |
| Columns | `country`, `iso2`, `iso3`, `year`, `report_frequency` (70 = monthly, 71 = quarterly), `report_coverage` (34 = all units, 35 = some units), `m_01` … `m_12`, `q_1` … `q_4`, `gaps_na`, `remarks` |
| Philippines | Reports monthly; one row per year from 2020 |
| Backup (audited snapshot) | https://github.com/GTB-TME/gtbreport2025/raw/main/data/gtb/snapshot_2025-07-30/sub_annual_notifs.csv (879 rows; some remarks span several lines) |
| Backup SHA-256 | `39c113671d41e8d4e9d7bd0da96472efbde32b7e9a64bd2294d64ba75f789311` (matches; saved as `data/raw/TB/snapshot_2025-07-30/sub_annual_notifs.csv`, downloaded 20 Oct 2026) |
| Note | WHO: these "numbers are not final and are subject to change" |
| File used | `data/raw/TB/TB_provisional_notifications_2026-10-19.csv`: 647 rows × 24 columns; 7 Philippine rows (2020–2026), all monthly |
| Live file differs | **No `gaps_na` or `remarks` columns.** DOH's remarks (`source_remarks`) come from the snapshot backup, for 2020–2025 |
| Latest month (live) | **January 2026** (23,723 cases). February – December 2026 are `missing` |
| SHA-256 | `a4be40a0d977a47e7684aa8630d29e4c52afb35e6735a8b312032d4fb8cd684b` |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

### E. WHO public–private mix (optional)

| | |
|---|---|
| File | https://extranet.who.int/tme/generateCSV.asp?ds=ppm |
| Column we use | `priv_new_dx`: new TB cases diagnosed by private providers (also in the backup file under C) |
| File used | `data/raw/TB/TB_ppm_2026-10-19.csv`: 462 rows; 15 Philippine rows (**2010**–2024). Identical to the snapshot for 2010–2024; the snapshot also has 2006, 2008 and 2009, which the live file leaves out |
| SHA-256 | `b17bf919b6252dfbf38e3487db98e307012659e0487c38684be59bf806ea4076` |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

### F. WHO TB data dictionary

| | |
|---|---|
| File | https://extranet.who.int/tme/generateCSV.asp?ds=dictionary |
| File used | `data/raw/TB/TB_data_dictionary_2026-10-19.csv` (698 variables). Defines `c_newinc`, `priv_new_dx`, `e_inc_num`, `e_inc_100k`, `report_coverage`; not `m_01`…`m_12` or `gaps_na` |
| SHA-256 | `2b0aecd442bffabf2f313d2eaa478ffaea48d09fe78670a136a1956c042011bf` |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

WHO's TB data page lists all of these files: https://www.who.int/teams/global-tuberculosis-programme/data

## 4. Folder layout

```
data/
└── tb/
    ├── README.md            ← this file
    ├── CLEANING_PLAN.md     ← how the clean files are made
    ├── raw/                 ← WHO downloads, untouched (read-only)
    └── clean/               ← made by scripts/clean_tb.py; never edit by hand
```

In this workspace the raw files sit in `data/raw/TB/`, with the two snapshot backups in `data/raw/TB/snapshot_2025-07-30/`; the script reads them there.

## 5. Clean files

| File | One row per | Made from |
|---|---|---|
| `data/tb/clean/tb_national_annual.csv` | year (2000–2024); notifications from 1980–1999 are not kept, because the estimates start in 2000 | B, C, E (A as a reference only) |
| `data/tb/clean/tb_national_monthly.csv` | month: 84 rows, Jan 2020 – Dec 2026 (73 reported through Jan 2026; Feb – Dec 2026 `missing`). All 84 are in `data/surveillance.csv` (resolution `month`); the annual table stays out | D |

**Annual columns**

| Column | Meaning |
|---|---|
| `year` | year |
| `population` | `e_pop_num` |
| `inc_rate`, `inc_rate_lo`, `inc_rate_hi` | estimated incidence per 100,000 (B; matches A after rounding) |
| `inc_est`, `inc_est_lo`, `inc_est_hi` | estimated number of cases (B) |
| `notified` | `c_newinc` (C) |
| `notified_private` | `priv_new_dx` (E), new cases only |
| `coverage`, `coverage_lo`, `coverage_hi` | `notified ÷ inc_est`, which WHO calls treatment coverage; the bounds use `inc_est_hi` and `inc_est_lo` |
| `gap_est`, `gap_est_lo`, `gap_est_hi` | estimated cases not notified: **an estimate, not a count**. `gap_est_lo` is below 0 in 2016, 2018, 2019 and 2022–2024, where notified cases exceed WHO's low estimate (`coverage_hi` above 100%); kept as computed |
| `who_report` | the WHO report the estimates come from, e.g. 2025 |
| `downloaded` | date of the live files (2026-10-19) |

**Monthly columns**

| Column | Meaning | Model A may read it? |
|---|---|---|
| `disease`, `source`, `level`, `location` | `tb`, `who_provisional`, `national`, `PHILIPPINES` | yes |
| `month_start`, `year`, `month` | first day of the month | yes |
| `is_december` | holiday month | yes |
| `cases` | new and relapse cases notified that month, as reported; blank when absent | yes |
| `report_status` | `reported` or `missing` | yes |
| `source_coverage` | `all_units` or `some_units`, from the source | **no** (answer key) |
| `source_remarks` | DOH's remark for that year | **no** (answer key) |
| `qa_label`, `qa_flag` | our audit result and reasons | **no** (answer key) |

## 6. Known issues

### Estimates (A, B)

- **Model outputs with a wide range.** For 2024 the estimate is 723,902 cases, with a range of 398,854 to 1,175,835.
- **2016–2019 share one rate** (554 per 100,000). That reflects WHO's method, not four identical measurements.
- **Re-estimated every year,** so past values change between downloads.

### Notifications (C, E)

**The 2020 drop:**

| Year | Estimated rate per 100,000 | Notified | Coverage (notified ÷ estimated) | Private providers (new cases) |
|---|---|---|---|---|
| 2019 | 554 | 409,167 | 66.6% | 189,574 |
| 2020 | 544 | 256,541 (−37.3%) | 42.1% | 58,866 (−69%) |
| 2023 | 632 | 575,770 | 79.3% | 108,413 |
| 2024 | 625 | 544,948 | 75.3% | 109,938 |

- Notifications outside private providers fell only about 10% (about 219,600 → 197,700). The collapse was concentrated in one channel, which makes it a real shared-source disruption at national scale.
- WHO's estimates imply about 353,000 TB cases were not notified in 2020, with a range of about 85,000 to 710,000. That is an estimate, not a count of missed patients.

### Provisional monthly (D)

1. **Coverage is coded "some units"** for 2020–2024 and "all units" for 2025.
2. **DOH's own remarks flag partial months:**
   - 2021: "Jan to Sep are all units. Oct to Dec are just some units."
   - 2022: "Reports are due quarterly. Jan to Sept. are all units." (so October–December are likely partial)
   - 2024: possible duplicates; fourth-quarter data still being finalized
   - 2025: data as of 8 Jul 2025 (in the snapshot)
3. **April 2020: 10,489 cases,** against 40,104 in January (−74%). May has 13,726, and the rest of 2020 stays near half the January level.
4. **The partial months are subtle.** October–December 2021 run at 78–97% of the year's earlier median, and October–December 2022 at 80–98%. Without the remarks you wouldn't know, which makes them a good test of whether Model A catches small shortfalls.
5. **Monthly sums match the final yearly totals within 8%:**

   | Year | Monthly sum ÷ final total |
   |---|---|
   | 2020 | 101.1% |
   | 2021 | 92.6% |
   | 2022 | 95.2% |
   | 2023 | 95.9% |
   | 2024 | 100.7% |

6. **December is low:** 57% (2023) and 66% (2024) of the year's median month, because of holidays and fourth-quarter data that isn't final.
7. **The latest month is incomplete.** In the snapshot, June 2025 had 24,187 cases, against about 38,000–49,000 in the months before (reporting lag). By the live file it had risen to 42,923. In the live file the latest month is **January 2026 (23,723)**; it and December 2025 are marked `incomplete`.
8. **`gaps_na` isn't defined in the dictionary.** It is 1 for 2021 and 2025, the two years with known gaps (snapshot; the live file no longer has this column).

### General

- **National only;** these sources have no regional TB data.
- **WHO's live files get revised.** Compare 2020–2024 against the snapshot values in CLEANING_PLAN step 6.

### Live files (19 Oct 2026) against the snapshot (30 Jul 2025)

All 2020–2024 values match: notified, private, population and every monthly count. What changed:

| What | Snapshot | Live | Likely reason |
|---|---|---|---|
| Monthly Jan / Feb / Mar 2025 | 45,653 / 47,285 / 48,801 | 45,795 / 47,467 / 49,051 | late reports added (snapshot data as of 8 Jul 2025) |
| Monthly Apr / May / Jun 2025 | 38,174 / 37,667 / 24,187 | 42,378 / 45,091 / 42,923 | late reports added |
| Monthly Jul 2025 – Jan 2026 | – | 47,222 · 43,278 · 48,067 · 48,707 · 40,395 · 34,689 · 23,723 | new months (73 reported months instead of 66) |
| Private (`priv_new_dx`) 2006 / 2008 / 2009 | 8 / 6,914 / 4,866 | blank | live public–private mix file starts in 2010 |
| Monthly remarks and `gaps_na` | present | column absent | live export format; remarks taken from the snapshot |
| Source A rate 2020–2023 | (README: 544 for 2020) | 535, 583, 627, 643 | A comes from a different estimate round than B (see 3.A) |
| Estimated cases 2024 | 723,902 (398,854 – 1,175,835) | 724,000 (399,000 – 1,180,000) | rounding to 3 significant figures in the public file, not a revision |

## 7. How IRIS uses this data

| IRIS need | Data | Rule |
|---|---|---|
| The 2020 replay (slides, dashboard) | Annual: notified against estimated, with the range | Always show the range; call the gap an estimate |
| Shared-source story at national scale | Annual: private against all other notifications | Private counts are new cases only, so say "about" |
| Model A transfer test (monthly data, different system) | Monthly provisional | See CLEANING_PLAN section 6; report it as a demonstration, not as accuracy |
| Real labels for partial reporting | DOH remarks: October–December 2021 and 2022; latest months | Hidden from Model A; used only for grading |
| Leave-one-disease-out test | Monthly | Tune the shared detector without TB, then test on TB |

## 8. Rules for anyone using these files

- **Estimates are not counts.** Never feed them to Model A as observations, and always show their range.
- **Don't present the gap as confirmed missed patients.** IRIS does not certify underreporting or present estimated totals as fact.
- **Keep annual and monthly separate.** Never split yearly totals into months.
- Blank means **no report**. It is never 0.
- Present flags as leads for verification by surveillance staff, not as confirmed errors.

## 9. Citations (APA 7)

- World Health Organization. (2025). *Global tuberculosis report 2025*. https://www.who.int/teams/global-programme-on-tuberculosis-and-lung-health/tb-reports/global-tuberculosis-report-2025/
- World Health Organization. (n.d.-b). *Tuberculosis data* [Data sets]. https://www.who.int/teams/global-tuberculosis-programme/data
- World Health Organization. (n.d.). *Tuberculosis incidence (per 100 000 population)* [Data set]. https://data.who.int/indicators/i/13B4226/C288D13?m49=608
- WHO Global Tuberculosis Programme. (2025). *gtbreport2025* [Source code and data]. GitHub. https://github.com/GTB-TME/gtbreport2025

## 10. Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 19 Oct 2026 | First draft, from the audit of WHO's 2025 snapshot and live API |
| 0.2 | 20 Oct 2026 | Cleaning run (`scripts/clean_tb.py`) on the live files of 19 Oct 2026: 32 checks pass, 2 WHO revisions, none fail. Added SHA-256s, download dates, "downloaded by", license status and file details; the latest live month (Jan 2026); the live-vs-snapshot differences (section 6); coverage bounds. Monthly rows added to `data/surveillance.csv` (84). Decisions (`plan/FINAL_CLEANING_PLAN.md`): A's 2020–2023 difference from B accepted as a WHO revision (A last updated 8 Jan 2024), B used for every number; TB is the third disease, as a monthly transfer demonstration; 1980–1999 notifications not kept. Docs moved to `data/tb/` |

Maintainer: TODO (Team Nex)
