# Measles data (IRIS)

**Status:** v0.2, 20 Oct 2026. Cleaning run with `scripts/clean_measles.py`: all 37 checks pass (27 plan, 10 added; `data/measles/clean/check_report.md`). The weekly measles and rubella rows are in `data/surveillance.csv`. Decisions in `plan/FINAL_CLEANING_PLAN.md` (section 4) override [CLEANING_PLAN.md](CLEANING_PLAN.md) where they differ. Only open item: licenses (section 3).

## 1. Purpose

Measles is IRIS's **sparse, bursty** test disease: most weeks are quiet, then an epidemic hits. If Model A works on measles as well as on dengue, that supports the claim that one shared detector can handle different kinds of disease.

What this data gives IRIS:

- **A different behavior for the shared detector:** few cases, many zero weeks, sudden epidemics. Dengue is high-volume and seasonal; TB is steady.
- **A real fake zero to test on:** a week of 0 cases in the middle of the 2019 epidemic, shared with 7 other diseases (section 6).
- **A disease pair:** measles and rubella are tracked together, and their blank weeks line up. A failure that hits both is a real check of IRIS's shared-disruption logic. Rubella is measles' **partner, not a fourth disease**: the "works across diseases" claim stays at three (dengue, measles, TB), and rubella supports the shared-disruption story (2019 weeks 1–3 and week 8).

## 2. Sources at a glance

| | Source | Place level | Time unit | Period | Role in IRIS |
|---|---|---|---|---|---|
| A | DOH weekly surveillance reports, `Health_Dataset.xlsx` (measles and rubella columns) | national | DOH morbidity week | 2017 week 1 – 2021 week 52 | **Main data:** train and test Model A on a sparse disease; cross-disease checks |
| B | WHO "Measles – number of reported cases" (Global Health Observatory) | national | year | 1974 – 2025 | Context: long-run level and epidemic years; sanity check |
| C | WHO provisional measles and rubella cases by month | national | month | 2012 – present | **Context and slides** (measles after 2021); not for training Model A |
| D | Mendeley "Philippine Epidemiological Data" | national | week | 1 Jan 2017 – 28 Oct 2023 | **Not used** |

The sources count differently (section 6). Never add them together or join them into one series.

## 3. Source details

### A. DOH weekly surveillance reports: `Health_Dataset.xlsx`

This is the same file as dengue source B, so don't download it twice. Dengue cleaning (step 4) writes all 18 diseases to `data/shared/edcs_national_weekly.csv`, and measles reads from there.

| | |
|---|---|
| File | https://github.com/samjohnparr/PH_Disease_Underreporting/raw/main/Health_Dataset.xlsx |
| Repository | https://github.com/samjohnparr/PH_Disease_Underreporting |
| Original data | DOH Epidemiology Bureau weekly EDCS/PIDSR surveillance reports, compiled by S. J. Parreño |
| Use | Sheet1, columns `Measles` and `Rubella`. Blank cell = no report that week |
| SHA-256 | `b453ab737b2832bdef4b71895172411b925756d3a194ceb6a68adf2c2b37b0de` (matches; `data/raw/dengue/Health_Dataset.xlsx`) |
| License | Unconfirmed (checked: not yet). The GitHub repository has no license file: https://github.com/samjohnparr/PH_Disease_Underreporting. Link to the file; don't re-upload it to our public repository without the author's permission |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

### B. WHO Global Health Observatory: measles, number of reported cases

| | |
|---|---|
| Indicator page | https://www.who.int/data/gho/data/indicators/indicator-details/GHO/measles---number-of-reported-cases |
| Direct download (Philippines, JSON) | https://ghoapi.azureedge.net/api/WHS3_62?$filter=SpatialDim%20eq%20%27PHL%27 |
| Spreadsheet alternative (all countries and diseases) | https://srhdpeuwpubsa-geecgzbpd5h0fueu.z01.azurefd.net/whdh/WIISE/export/reported-cases-data.xlsx |
| Indicator code | `WHS3_62` |
| Definition | Confirmed measles cases: confirmed by laboratory, by epidemiological link, or clinically. Cases discarded after lab testing are excluded |
| Fields we use | `TimeDim` (year), `NumericValue` (cases), `Date` (last updated) |
| Size | 52 yearly rows for the Philippines (1974–2025) |
| Last updated | 14 Jul 2025 for most years; 14 Jul 2026 for 2025 and 1996 (JSON `Date`). The CSV's `DateModified` reads 13 Jul 2025 and 13 Jul 2026 for the same rows |
| File used | `data/raw/measles/measles_number_of_reported_cases.csv`: GHO's CSV export of the same indicator, all countries (10,532 rows); we keep the 52 `PHL` rows. `Period` → `year`, `FactValueNumeric` → `cases`, `DateModified` → `who_last_updated` |
| SHA-256 (CSV) | `ed90551d2c4892602a8abd463c1c41fc48644a31e89a929ad4de89191ea01400` (1,689,743 bytes) |
| JSON copy (not read by the script) | `data/raw/measles/who_gho_measles_phl.json` (renamed from `[measles]`): the JSON from the direct-download link above. 52 `PHL` records, 1996 null, every value identical to the CSV. SHA-256 `56bdc7111d8eb3374aeed6d09910b8182db06172b8d9954bfa8dbdca201bb104` |
| License | Unconfirmed (checked: not yet). Check the WHO data policy: https://www.who.int/about/policies/publishing/data-policy |
| Downloaded | 20 Oct 2026 (both copies), by John Vincent M. Doria (Team Nex) |

### C. WHO provisional measles and rubella data, by month (optional)

| | |
|---|---|
| Portal | https://immunizationdata.who.int/global?topic=Provisional-measles-and-rubella-data&location= |
| File | https://immunizationdata.who.int/docs/librariesprovider21/measles-and-rubella/404-table-web-epi-curve-data.xlsx?sfvrsn=5922ebf7_21 |
| What it is | "Number of measles and rubella cases by country, year, month and final classification since 2012" |
| Related file | Suspected and confirmed cases, incidence and discard rates by country since 2012: https://immunizationdata.who.int/docs/librariesprovider21/measles-and-rubella/403-table-web-reporting-data.xlsx?sfvrsn=9409ffb9_10 |
| Caveats | Provisional; WHO notes a one-to-two-month reporting lag |
| File used | `data/raw/measles/measles_404-table-web-epi-curve-data.xlsx` (1,400,978 bytes) |
| SHA-256 | `9eca717c0f06739a28ba521904303643da6f7396d4c510a65fb650ee4e2352b1` |
| Sheets | `Read Me` (title, disclaimer, definitions, data date "2026-10") and `WEB` (25,111 rows × 15 columns, all countries, Jan 2012 – Oct 2026) |
| Columns (`WEB`) | `Region`, `Country`, `ISO3`, `Year`, `Month`, `Measles suspect`, `Measles clinical`, `Measles epi-linked`, `Measles lab-confirmed`, `Measles total`, `Rubella clinical`, `Rubella epi-linked`, `Rubella lab-confirmed`, `Rubella Total`, `Discarded` (headers contain line breaks) |
| Philippine rows | 177 months, Jan 2012 – Sep 2026, no month absent, no duplicates. Audit in section 6.C |
| Use | Context and slides only (measles after 2021); not in `data/surveillance.csv` and not for training Model A |
| License | Unconfirmed (checked: not yet). Check the WHO data policy: https://www.who.int/about/policies/publishing/data-policy |
| Downloaded | 20 Oct 2026, by John Vincent M. Doria (Team Nex) |

The `sfvrsn` part of the link changes when WHO updates the file. If the link fails, open the portal page and download "Distribution of measles and rubella cases by country, year, month and final classification".

### D. Mendeley: Philippine Epidemiological Data (not used)

| | |
|---|---|
| Page | https://data.mendeley.com/datasets/v98325dpxv |
| What it is | Weekly new cases of 19 diseases, 1 Jan 2017 – 28 Oct 2023, from the same DOH weekly reports. Weeks without a report were left out |
| Status | **Not used** (team decision, 20 Oct 2026). Not downloaded or audited |
| License | Unconfirmed (checked: not yet). Check the Mendeley page above |

### E. `Diseases Data (for NBL).xlsx` (not used)

A weekly workbook of unknown origin, now parked in `data/raw/unverified/`. **Not used** (team decision, 20 Oct 2026): we don't know where it came from, its 2019 week 10 measles value (16,020) is more than four times the epidemic's highest week (3,710), so likely a cumulative or typing error, and its three zeros where source A is blank can't be told apart from blanks turned into 0. Full audit note: `data/measles/clean/nbl_audit.md`.

| | |
|---|---|
| SHA-256 | `b417abd50a01ef459c778bae45852d09b00a95f39017f6372be2337745628a75` (36,319 bytes; file date 20 Oct 2026) |
| What it is | One sheet, 52 rows × 101 columns: `Week` (1–52) plus `<Disease> - <Year>` for 20 diseases (source A's 18, plus Acute Viral Hepatitis and AMES), 2019–2023. No 2020 week 53. No source or author inside the file |
| Against source A, 2019–2021 | 2,804 of 2,808 disease-weeks identical. Rubella: all 156 identical. Measles: 155 of 156. In the other 4, A is blank and this file has a number: measles 2019 W10 = **16,020**, and 0 for dengue 2021 W6 and ILI 2019 W9 and W33 |
| 2022–2023 | Measles and rubella reported every week of 2022 and 2023 W1–43; W44–52 of 2023 are blank for every disease (end of data). Not used |
| License | Unknown (origin unknown) |
| Found | 20 Oct 2026 in the workspace (file date); who added it is unknown |

## 4. Folder layout

```
data/
├── measles/
│   ├── README.md            ← this file
│   ├── CLEANING_PLAN.md     ← how the clean files are made
│   ├── raw/                 ← WHO downloads, untouched (read-only)
│   └── clean/               ← made by scripts/clean_measles.py; never edit by hand
└── shared/
    └── edcs_national_weekly.csv   ← all 18 weekly diseases (made by the dengue cleaning)
```

In this workspace the raw files sit in `data/raw/measles/` (and the NBL workbook in `data/raw/unverified/`); the script reads them there. `data/**/raw/` and `data/**/clean/` are in `.gitignore` until the licenses are confirmed.

## 5. Clean files

| File | One row per | Made from |
|---|---|---|
| `data/measles/clean/measles_national_weekly.csv` | disease (measles, rubella) and week: 2 × 261 = 522 rows | A |
| `data/measles/clean/measles_national_yearly.csv` | source and year: 52 `who_gho` + 5 `doh_edcs_weekly_sum` (2017–2021, with `weeks_with_data`) | B, with yearly sums of A for comparison |
| `data/measles/clean/measles_national_monthly.csv` | month: 177 rows, Jan 2012 – Sep 2026 | C |

The weekly file uses the same columns as dengue (dengue README section 5), with `level = national` and `location = PHILIPPINES`, plus a `note` column for the hand labels (Model A never reads it). There are no corrections for measles, so `cases_fixed` equals `cases`.

The monthly file keeps every count column as its own column (`measles_suspect`, `measles_clinical`, `measles_epi_linked`, `measles_lab_confirmed`, `measles_total`, the four rubella columns, `discarded`), with separate `measles_report_status` and `rubella_report_status`.

**Answer-key rule (same as dengue):** Model A reads only `cases`, `report_status`, the keys and calendar flags. `qa_label`, `qa_flag` and `cases_fixed` are the answers we grade it against.

## 6. Known issues

### A. DOH weekly reports

**1. 41 blank weeks for measles, and 41 for rubella.**

| Kind of gap | Measles | Rubella |
|---|---|---|
| Whole report blank (every disease, or all but one) | 37 weeks: 2017 W52; 2018 W10–19 and W26–27; 2020 W11–26, W35–38, W43–45 and W52 | 36 weeks (the same, except 2017 W52, which has a rubella number) |
| Only this disease blank (other diseases reported) | 4 weeks: 2019 W1–3 (together with rubella) and 2019 W10 | 5 weeks: 2017 W46–47 and 2019 W1–3 |

The measles-only blanks fall during the 2019 epidemic.

2. **A zero in the middle of the 2019 epidemic.** 2019 week 8 reports 0 measles and 0 rubella, between 325 (week 7) and 1,227 (week 9) measles cases. Six more diseases also read 0 that week: acute flaccid paralysis, neonatal and non-neonatal tetanus, chikungunya, acute bloody diarrhea and rotavirus. Dengue, typhoid and influenza-like illness look normal. That points to a failure in a part of the reporting system shared by these 8 diseases. It is the strongest real fake zero for measles, but we found it by inspecting the numbers, so it is a weaker label than dengue's column swap.
3. **Likely catch-up weeks.** Week 9 (1,227) follows the zero, and week 11 (3,710, the highest week in the file) follows the blank week 10. Both probably include late reports.
4. **A zero right after a long gap.** 2018 week 20 reports 0 measles after 10 blank weeks; the next week has 162. It may be a partial report, so it's flagged for review only.
5. **Zeros are common in quiet years.** 18.7% of reported measles weeks are 0 (20 weeks in 2017, 15 in 2021); for rubella it's 38.8%. Most of these are real, which is why Model A needs a count model rather than a "zero means alarm" rule.
6. **The weekly counts run far below WHO's yearly totals.**

   | Year | WHO yearly (B) | Sum of weekly reports (A) | Weeks with data |
   |---|---|---|---|
   | 2017 | 2,428 | 271 | 51 |
   | 2018 | 20,827 | 4,087 | 40 |
   | 2019 | 48,525 | 33,699 | 48 |
   | 2020 | 3,832 | 2,970 | 28 |
   | 2021 | 206 | 281 | 52 |

   Missing weeks explain part of the difference. The rest probably comes from counting differently: WHO counts every confirmed case (lab, epidemiological link or clinical), while the weekly file doesn't say what it counts. Compare trends, not levels.
7. **Week 53 of 2020 is absent** (as for dengue). Cleaning adds it as `missing`.

### B. WHO yearly

- **1996 is blank.** It becomes `missing`, never 0.
- **Epidemic years:** 2014 (58,848) and 2019 (48,525). Cases then fell to 206 in 2021 and rose again to 5,042 in 2025.
- **Values get revised.** Record the download date and each row's `Date` field.
- **One number per year** (52 rows), so this can't train a weekly detector.

### C. WHO monthly (first audit, 20 Oct 2026)

- **Provisional, with a one-to-two-month lag,** so the latest months are incomplete. Cleaning marks the last two Philippine months (Aug and Sep 2026) `incomplete`, `latest_months` (confirmed by the team: each country's reporting lags differently). The file's latest month overall is Oct 2026 (other countries).
- **How gaps show:** no Philippine month is absent, and measles total is never blank and never 0. Rubella is **blank** (all four rubella columns) in 31 months: all of 2012–2013, Dec 2015, Dec 2018, Nov 2020, Mar 2021, Dec 2021, Nov 2025 and Dec 2025. Those months are `missing` for rubella, never 0.
- **Totals add up:** measles total = clinical + epi-linked + lab-confirmed in all 177 months; rubella total = its three classes in all 146 months with a number. Suspected and discarded cases are kept but not part of the total.
- **Yearly sums against WHO yearly (B):**

  | Year | Monthly sum (C) | WHO yearly (B) | Difference |
  |---|---|---|---|
  | 2012 | 1,509 | 1,536 | −27 |
  | 2013 | 4,855 | 2,920 | +1,935 (166%) |
  | 2014 | 53,906 | 58,848 | −4,942 (92%) |
  | 2015 | 2,021 | 619 | +1,402 (327%) |
  | 2016 | 647 | 716 | −69 |
  | 2017 | 2,407 | 2,428 | −21 |
  | 2018 | 22,796 | 20,827 | +1,969 (110%) |
  | 2019 | 48,375 | 48,525 | −150 |
  | 2020 | 3,677 | 3,832 | −155 |
  | 2021 | 218 | 206 | +12 |
  | 2022 | 586 | 589 | −3 |
  | 2023 | 2,880 | 2,892 | −12 |
  | 2024 | 4,003 | 3,844 | +159 |
  | 2025 | 5,039 | 5,042 | −3 |
  | 2026 (Jan–Sep) | 2,804 | – | – |

  Most years agree within a few percent. 2013, 2015 and 2018 are well above WHO's yearly figure and 2014 below it; the monthly file is provisional and the yearly figure is the official one, so the yearly totals were likely revised later. The monthly file is far closer to WHO's yearly totals than the weekly reports (A) are (2019: 48,375 vs. 33,699).

## 7. How IRIS uses this data

| IRIS need | Data | Rule |
|---|---|---|
| Model A on a sparse, bursty disease | A: weekly measles, plus rubella | Count model that handles many zeros (negative binomial, or zero-inflated if needed); robust fit |
| Real failures to test on | A: the 2019 week 8 zero; blank weeks filled with 0 on purpose to mimic a careless system | Score each week using only earlier weeks |
| Shared disruption across diseases | A: 2019 week 8 (8 diseases) and 2019 weeks 1–3 (measles and rubella) | Compare with the other diseases in `data/shared/edcs_national_weekly.csv` |
| Leave-one-disease-out test | A | Tune the shared detector without measles, then test on measles |
| Long-run context | B (and C) | Yearly or monthly only; never split into weeks |

## 8. Rules for anyone using these files

- Blank means **no report**. It is never 0.
- Don't compare weekly levels with WHO's yearly totals; they count differently.
- Model A reads only the columns marked "yes" in the dengue README section 5.
- When you present the 2019 week 8 zero, say it was found by inspection.
- Present flags as leads for verification by surveillance staff, not as confirmed errors.
- Keep simulated data in `data/synthetic/` only.

## 9. Citations (APA 7)

- World Health Organization. (n.d.-a). *Measles—number of reported cases* [Data set]. Global Health Observatory. https://www.who.int/data/gho/data/indicators/indicator-details/GHO/measles---number-of-reported-cases
- World Health Organization. (n.d.). *Provisional measles and rubella data* [Data set]. WHO Immunization Data portal. https://immunizationdata.who.int/global?topic=Provisional-measles-and-rubella-data&location=
- Parreño, S. J. (n.d.). *PH_Disease_Underreporting* [Data set and source code]. GitHub. Retrieved October 19, 2026, from https://github.com/samjohnparr/PH_Disease_Underreporting
- Parreño, S. J. (2024). *Philippine disease cases data (2017-2021)* (Version 1) [Data set]. Mendeley Data. https://doi.org/10.17632/pgwmcfcppk.1
- Parreño, S. J. (2023). *Philippine epidemiological data* (Version 1) [Data set]. Mendeley Data. https://doi.org/10.17632/v98325dpxv.1

## 10. Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 19 Oct 2026 | First draft, from the audit of the weekly file and WHO's yearly data |
| 0.2 | 20 Oct 2026 | Cleaning run (`scripts/clean_measles.py`); every number in section 6.A and 6.B confirmed, all 37 checks pass (27 plan, 10 added), unchanged after the dengue shared files were rebuilt. Source B read from GHO's CSV export (identical to the JSON, now `who_gho_measles_phl.json`). Added SHA-256s, download dates, "downloaded by", license status, the first audit of source C (section 6.C) and the NBL audit (section 3.E). Measles and rubella weekly rows added to `data/surveillance.csv` (522). Decisions (`plan/FINAL_CLEANING_PLAN.md`): NBL file not used (moved to `data/raw/unverified/`); "last two months" = last two Philippine months (Aug, Sep 2026); Mendeley (D) not used; monthly file (C) for context and slides only; rubella is measles' partner, not a fourth disease. Docs moved to `data/measles/` |

Maintainer: TODO (Team Nex)
