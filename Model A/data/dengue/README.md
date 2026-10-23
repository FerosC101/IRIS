# Dengue data (IRIS)

**Status:** v0.2, 20 Oct 2026. Cleaning run with `scripts/clean_dengue.py`: all 72 checks pass (`data/dengue/clean/check_report.md`). Numbers below are confirmed by the cleaning; the decisions in `plan/FINAL_CLEANING_PLAN.md` (section 3) override [CLEANING_PLAN.md](CLEANING_PLAN.md) where they differ. Only open item: licenses (section 3).

## 1. Purpose

These files hold the weekly dengue counts that **Model A (zero-report anomaly detection)** learns from and is tested on. Model A asks one question: *given this place's history, is this week's zero (or very low count) believable, or does it look like a reporting failure?*

What this data gives IRIS:

- **History to learn from:** about five years of weekly counts for 126 provinces and cities.
- **Real errors to test on:** the province file contains errors we can verify (section 6), so Model A is graded on real failures, not only simulated ones.
- **Real hubs:** each province and city belongs to a region, the level where RESUs work. IRIS uses regions as the top-level hubs of its reporting network.

## 2. Sources at a glance

| | Source | Place level | Time unit | Period | Role in IRIS |
|---|---|---|---|---|---|
| A | HDX "DOH-Epi Dengue Data 2016-2021" | 126 provinces and cities in 17 regions | week | 10 Jan 2016 – 10 Jan 2021 | **Main data:** train and test Model A; region hubs |
| B | DOH weekly surveillance reports, `Health_Dataset.xlsx` | national | DOH morbidity week | 2017 week 1 – 2021 week 52 | Real missing-report weeks; same weeks as 17 other diseases, for cross-disease pooling |
| C | OpenDengue V1.3, highest-temporal-resolution extract | national | week | 30 Dec 2012 – 25 Nov 2023 | Longer history and context; 2023 for testing only |

The three sources count differently. Never add them together or join them into one series.

## 3. Source details

### A. HDX: "DOH-Epi Dengue Data 2016-2021"

| | |
|---|---|
| Dataset page | https://data.humdata.org/dataset/philippine-dengue-cases-and-deaths |
| File | https://data.humdata.org/dataset/philippine-dengue-cases-and-deaths/resource/9e839677-3ff0-44b3-992c-1a99e68df515 |
| Backup copy (same file) | https://github.com/thiyangt/denguedatahub/raw/main/data-raw/philippine/doh-epi-dengue-data-2016-2021.csv |
| Original data | DOH Epidemiology Bureau (from the file name; confirm on the HDX page) |
| Raw columns | `loc`, `cases`, `deaths`, `date` (month/day/year, always a Sunday), `Region`. Row 2 holds HDX tags (`#adm2+name` …), not data |
| `date` | **Treated as the week start** (an assumption: the source doesn't say; see issue 9) |
| Size | 32,701 data rows; 1,597,948 bytes |
| File | `data/raw/dengue/doh-epi-dengue-data-2016-2021.csv` |
| SHA-256 | `4e993553f10081b4e6b35a0d4b3c9bd0cc271765645a123fcb2e0c5d7084633c` (our copy; same as the audited copy) |
| License | Unconfirmed (checked: not yet). Check the HDX dataset page: https://data.humdata.org/dataset/philippine-dengue-cases-and-deaths |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

If your HDX download has a different SHA-256, compare row counts instead; line endings can differ between copies.

### B. DOH weekly surveillance reports: `Health_Dataset.xlsx`

| | |
|---|---|
| File | https://github.com/samjohnparr/PH_Disease_Underreporting/raw/main/Health_Dataset.xlsx |
| Repository | https://github.com/samjohnparr/PH_Disease_Underreporting |
| Original data | DOH Epidemiology Bureau weekly EDCS/PIDSR surveillance reports, compiled by S. J. Parreño |
| Use | **Sheet1** only: `Year` (filled on the first row of each year only), `Week` (1–52), and one column per disease (18), including `Dengue`. Sheet2 holds the same numbers in a wide layout (checked: no differences for dengue) |
| Do not use | The repository's per-disease CSVs: their missing weeks were filled in by imputation |
| Size | 260 rows; 76,497 bytes |
| File | `data/raw/dengue/Health_Dataset.xlsx` |
| SHA-256 | `b453ab737b2832bdef4b71895172411b925756d3a194ceb6a68adf2c2b37b0de` (matches) |
| License | Unconfirmed (checked: not yet). The GitHub repository has no license file: https://github.com/samjohnparr/PH_Disease_Underreporting. Link to the file; don't re-upload it to our public repository without the author's permission |
| Downloaded | 19 Oct 2026, by John Vincent M. Doria (Team Nex) |

### C. OpenDengue V1.3: highest-temporal-resolution extract, Western Pacific

| | |
|---|---|
| File | https://github.com/OpenDengue/master-repo/raw/main/assets/Temporal_extract_WPRO_V1_3.zip |
| Project and versions | https://opendengue.org · https://doi.org/10.6084/m9.figshare.24259573 |
| Rows we use | `adm_0_name` = PHILIPPINES, `S_res` = Admin0, `T_res` = Week: 544 weeks |
| Main columns | `calendar_start_date`, `calendar_end_date` (Sunday to Saturday), `dengue_total`, `UUID` (links each row to its original source) |
| Original sources | WHO Western Pacific dengue situation updates (2013–2018, 2021–2022), DOH statistics (2019–2020), DOH weekly disease surveillance reports (Dec 2022–2023) |
| Size | 595,851 bytes (zip) |
| File | `data/raw/dengue/Temporal_extract_WPRO_V1_3.zip` (the script reads this). Its one member, `Temporal_extract_WPRO_V1_3.csv` (13,064,475 bytes), is also kept unzipped in `data/raw/dengue/` |
| SHA-256 | zip `c25ad7cec851ef3344663440ee2131ca350b940683c13d5cdd18d48f34e9c70b` (matches); CSV `972af7ac995d0a1cf6ec353608b9727120da5989e598177e20f9db1f74582588` (identical to the zip's member) |
| License | Unconfirmed (checked: not yet). Check OpenDengue on Figshare: https://doi.org/10.6084/m9.figshare.24259573; cite as the project asks (section 9) |
| Downloaded | CSV 19 Oct 2026; zip 20 Oct 2026; by John Vincent M. Doria (Team Nex) |
| Use | Context only. The 2013–2015 weeks are not used by Model A |

Why this extract: the "National" extract keeps yearly totals for most years, leaving only 149 weekly rows for the Philippines.

## 4. Folder layout

```
data/
├── dengue/
│   ├── README.md            ← this file
│   ├── CLEANING_PLAN.md     ← how the clean files are made
│   ├── raw/                 ← untouched downloads (read-only)
│   └── clean/               ← made by scripts/clean_dengue.py; never edit by hand
├── measles/, tb/            ← same layout
├── shared/                  ← calendar_weeks.csv, locations.csv, edcs_national_weekly.csv
├── synthetic/               ← simulated facilities and failures; never mixed with real data
└── surveillance.csv         ← all diseases stacked in one shared format
scripts/
└── clean_dengue.py          ← one command rebuilds data/dengue/clean/
```

In this workspace the raw files sit in `data/raw/dengue/` (not `data/dengue/raw/`), and a file of unknown origin is parked in `data/raw/unverified/` (see the measles README, section 3.E). `scripts/build_surveillance.py` builds `data/surveillance.csv` from the clean files. `data/**/raw/` and `data/**/clean/` are in `.gitignore` until the licenses are confirmed.

## 5. Clean files

| File | One row per | Made from |
|---|---|---|
| `data/dengue/clean/dengue_province_weekly.csv` | location and week: full grid, 126 × 262 = 33,012 rows | A |
| `data/dengue/clean/dengue_national_weekly.csv` | source and week | B, C |
| `data/shared/locations.csv` | location (126), with its region hub | A |
| `data/shared/calendar_weeks.csv` | week, with DOH morbidity week and holiday flags | computed |
| `data/shared/edcs_national_weekly.csv` | disease and week: 18 × 261 = 4,698 rows | B |
| `data/dengue/clean/dengue_source_comparison.csv` | morbidity year (2016–2020); not for modeling | A, B, C |

`dengue_national_weekly.csv` has 830 rows: 261 `doh_edcs` and 569 `opendengue`. `locations.csv` has no PSGC codes yet; they will be added when the dashboard needs maps.

Columns in the two dengue files:

| Column | Meaning | Model A may read it? |
|---|---|---|
| `disease` | always `dengue` | yes |
| `source` | `hdx_doh_epi`, `doh_edcs` or `opendengue` | yes |
| `level` | `province_city` or `national` | yes |
| `location`, `location_id` | cleaned name and stable ID from `locations.csv` | yes |
| `region`, `region_id` | the location's region (its hub) | yes |
| `week_start`, `week_end` | Sunday and Saturday of the week | yes |
| `mw_year`, `mw` | DOH morbidity year and week | yes |
| `cases` | cases **as reported**; blank when no report | yes |
| `report_status` | `reported`, `missing` (no report) or `not_in_source` (place not yet listed) | yes |
| `source_detail` | original source behind an OpenDengue row | yes |
| `deaths` | deaths as reported | **no** (wrong on swapped rows) |
| `qa_label` | our audit result: `ok`, `suspect` or `incomplete` | **no** (answer key) |
| `qa_flag` | reason codes (CLEANING_PLAN section 4) | **no** (answer key) |
| `cases_fixed`, `deaths_fixed` | proposed correction for swapped rows; otherwise the same as reported | **no** (answer key) |

**Answer-key rule:** Model A sees only what an analyst would see in real time: the numbers as reported and whether a report arrived. The audit columns are the answers we grade it against; if Model A reads them, the test means nothing. Evaluation code may read them. Model code may not.

## 6. Known issues

### A. HDX province file

**1. Cases and deaths swapped for whole regions, on alternate weeks.** On 15 Sundays in September–November, the two columns are swapped for every location in certain regions:

| Year | Weeks (Sundays) | Regions |
|---|---|---|
| 2016 | 4 and 18 Sep; 2, 16 and 30 Oct | NCR, CAR, Caraga, BARMM, Soccsksargen |
| 2017 | 3 and 17 Sep; 1, 15 and 29 Oct | Western, Central and Eastern Visayas; Zamboanga Peninsula; Northern Mindanao; Davao |
| 2020 | 6 and 20 Sep; 4 and 18 Oct; 1 Nov | NCR, CAR, Soccsksargen, Caraga, BARMM |

- 581 rows: 527 show **0 cases** and 54 show 1–3 cases. The rule swaps a row only on these dates **and** in that year's listed regions, where deaths are above cases. (Quirino on 15 Oct 2017, 1 case and 2 deaths, matched the dates but not the regions; the rest of Cagayan Valley looked normal that week, so it is under issue 10 instead.)
- Their "deaths" value matches the cases in the weeks around them (median ratio about 0.9). Raw 2016 deaths add up to 8,127, against 1,064 after swapping back.
- These are **real fake zeros**, the main real-world test for Model A.

2. **A missing week in the same regions, right after each episode:** 13 Nov 2016 (46 locations), 12 Nov 2017 (41) and 15 Nov 2020 (46), exactly that year's swapped regions. With item 1, this is a real example of a **shared disruption**. Where it started (a RESU, DOH's central office, or whoever compiled this file) is unknown. For 15 Nov 2020, national counts in sources B and C look normal, which hints at a processing error in this file rather than a reporting failure. For 2016 and 2017 the other sources can't tell us: they have no data for that 2016 week, and their 2017 counts swing too much.
3. **One week missing everywhere:** 6 Jan 2019 (all 126 locations). Sources B and C have this week, so it is likely a gap in this file rather than a reporting failure.
4. **Last week incomplete:** 10 Jan 2021 has 784 cases, against about 1,300–1,600 in the weeks before.
5. **Davao Occidental** first appears on 8 Jan 2017; its 52 earlier weeks are `not_in_source`.
6. **Region label error:** the 8 Eastern Visayas locations (Leyte, Samar, Tacloban and others) are labeled "REGION VII-EASTERN VISAYAS". It should be Region VIII; the file has no Region VIII label at all.
7. **Name problems:** leading spaces, three misspellings (Siquijor, Nueva Vizcaya, Bislig City) and inconsistent region spellings. The exact fixes are in CLEANING_PLAN step 2.
8. **Region membership follows the source.** For example, Cotabato City stays under Soccsksargen, although it voted to join BARMM in 2019.
9. **The meaning of `date` isn't documented.** Every date is a Sunday. We **treat it as the week start** (an assumption). The same counts line up best with OpenDengue when HDX dates are moved 2 weeks earlier, so check before comparing across sources.
10. **Five other rows with deaths above cases** (`deaths_check`). One is clearly wrong: Aurora on 15 Sep 2019 has 56 cases and 99 deaths (its `deaths_fixed` stays blank). Pateros, Batanes and Davao del Sur have 0 cases and 1 death, which is possible. Quirino on 15 Oct 2017 has 1 case and 2 deaths, on a swap date but outside the swapped regions. Cases are kept; deaths are flagged.
11. **Two runs of identical values** (3 weeks or more, at 50+ cases): Misamis Oriental, 24 Feb – 10 Mar 2019 (76), and Ilocos Sur, 20 Dec 2020 – 3 Jan 2021 (57). These may be stuck values; they are flagged for review only.
12. **Zeros are common in small places.** Among `ok` rows, 8.0% of weeks have zero cases (median location 4.6%; Batanes 69.2%, 180 of 260 weeks). Most of these zeros are real, which is why Model A needs a count model rather than a "zero means alarm" rule.
13. **One blank deaths cell:** Quezon City, 7 May 2017 (48 cases). It stays blank, and so does its `deaths_fixed`.
14. **The final-week flag (`last_week`) applies to this file only.** The other files' final weeks look complete (DOH 2021 week 52: 1,664; OpenDengue 19 Nov 2023: 2,607).

### B. DOH weekly reports

- **38 blank dengue weeks:**
  - 2017: week 52
  - 2018: weeks 10–19 and 26–27
  - 2020: weeks 11–26, 35–38, 43–45 and 52
  - 2021: week 6

  36 of these are blank for every disease, 2017 week 52 is blank for all but rubella, and 2021 week 6 is blank for dengue only.
- **Possible late batches.** Some weeks are far too low and are followed by a far too high one. For example, 2017 weeks 44–48 have 232, 6,672, 1,507, 864 and 220 cases. That looks like reports arriving late and being counted in a later week, a real example of the "delayed report" scenario. These weeks are noted here, not flagged or fixed.
- **Week 53 of 2020 is absent.** 2020 had 53 morbidity weeks (OpenDengue's DOH-sourced data includes the week of 27 Dec 2020), but the file stops at week 52. Cleaning adds week 53 as `missing`.
- **Counts differ from HDX.** For morbidity year 2017, this source has 105,976 cases over 51 reported weeks, against 156,134 in HDX after the fix, and its counts jump more from week to week. It probably counts cases by the week the report arrived, and HDX by week of illness, but neither source says so.

### C. OpenDengue

- **National only** after 2010, so it adds years, not detail.
- **25 weeks absent,** mostly in November–December (list in CLEANING_PLAN step 5).
- **Three sources joined** (WHO updates, DOH statistics, DOH weekly reports; see section 3), so the level can shift at each switch.
- **Edge weeks are far too low.** The last week before a gap or a source switch is usually 8–20% of the weeks before it; for example, 30 Oct 2016 has 286 cases against about 3,500. These are likely partial counts, so cleaning marks all 8 edge weeks `incomplete`.
- **2023 looks undercounted:**
  - 1 Jan – 18 Mar 2023 adds up to 7,962 cases, while DOH announced 27,670 for the same period (GMA News, 2023).
  - The weeks starting 18 Jun to 23 Jul drop to 132–271 cases.
  - The Holy Week week (2 Apr) has 141 cases, and 9–23 Apr reads 1,196, 1,196 and 1,197 (`repeated_value`: the same count within 0.1%, at 50+; the only such run in the series).
  - Use 2023 for testing only.

### D. The sources compared (`dengue_source_comparison.csv`)

Yearly totals by DOH morbidity year. These totals assume HDX's `date` is the week start. Not for modeling; never add the sources together.

| Morbidity year | HDX raw | HDX fixed (weeks) | DOH weekly (weeks with data) | OpenDengue (weeks) |
|---|---|---|---|---|
| 2016 | 209,544 | 216,607 (51) | — | 175,316 (44) |
| 2017 | 152,415 | 156,134 (52) | 105,976 (51) | 132,934 (48) |
| 2018 | 247,059 | 247,059 (52) | 186,992 (40) | 212,905 (51) |
| 2019 | 443,846 | 443,846 (51) | 430,282 (52) | 437,777 (52) |
| 2020 | 94,561 | 95,376 (53) | 61,359 (28) | 84,584 (53) |

## 7. How IRIS uses this data

| IRIS need | Data | Rule |
|---|---|---|
| Learn normal patterns (Model A training) | A: `cases`, `report_status` | Fit robustly; never read audit columns |
| Test on real failures | A: the 581 swapped rows as they are. A's 3 regional missing weeks and B's blank weeks, filled with 0 on purpose to mimic a careless system | Grade the 2017 and 2020 episodes; 2016 has no earlier history |
| Test on simulated failures | Inject delayed reports, missing submissions, reduced testing and true zero periods into `ok` weeks | Store in `data/synthetic/`; never overwrite real rows |
| Hubs for the network and shared-disruption checks | `data/shared/locations.csv` (location → region) | Regions are administrative groupings, **not** verified reporting links |
| Cross-disease pooling | B: dengue and 17 other diseases, same weeks | Pool by week |
| Long-run context | C | National only; 2023 for testing only |
| Labels for Model B (risk prioritization) | Real: swapped rows and missing weeks. Simulated: injected scenarios | Real labels show data errors, not causes such as "testing stopped" |

Use time-based splits only, for example training on 2016–2018, validating on 2019 and testing on 2020, so later weeks never leak into training.

## 8. Rules for anyone using these files

- Blank means **no report**. It is never 0.
- Don't add the sources together or join them into one series.
- Model A reads only the columns marked "yes" in section 5.
- For charts and the dashboard, use `cases_fixed`, skip `incomplete` rows, and highlight `suspect` rows.
- `cases_fixed` moves the source's own number back to its correct column. It is a proposed correction, not a confirmed DOH figure and not an estimate of true cases.
- Present flags as leads for verification by surveillance staff, not as confirmed errors.
- Keep simulated data in `data/synthetic/` only.
- Report model results alongside baselines (rolling thresholds, EWMA/CUSUM) and with their uncertainty.

## 9. Citations (APA 7)

- TODO: Contributor. (Year). *Philippine dengue cases and deaths* [Data set]. Humanitarian Data Exchange. https://data.humdata.org/dataset/philippine-dengue-cases-and-deaths (copy the contributor and year from the HDX page)
- Parreño, S. J. (n.d.). *PH_Disease_Underreporting* [Data set and source code]. GitHub. Retrieved October 19, 2026, from https://github.com/samjohnparr/PH_Disease_Underreporting
- Parreño, S. J. (2024). *Philippine disease cases data (2017-2021)* (Version 1) [Data set]. Mendeley Data. https://doi.org/10.17632/pgwmcfcppk.1
- Clarke, J., Lim, A., Gupte, P., Pigott, D. M., van Panhuis, W. G., & Brady, O. J. (2024). A global dataset of publicly available dengue case count data. *Scientific Data, 11*, Article 296. https://doi.org/10.1038/s41597-024-03120-7
- Clarke, J., Lim, A., Gupte, P., Pigott, D. M., van Panhuis, W. G., & Brady, O. J. (2025). *OpenDengue: Data from the OpenDengue database* (Version 1.3) [Data set]. Figshare. https://doi.org/10.6084/m9.figshare.24259573
- GMA News. (2023). *Dengue cases up by 94% in first quarter of 2023 vs. same period in 2022*. https://www.gmanetwork.com/news/topstories/nation/866649/dengue-cases-up-by-94-in-first-quarter-of-2023-vs-same-period-in-2022/story/

## 10. Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 19 Oct 2026 | First draft, from the audit of the raw files |
| 0.2 | 20 Oct 2026 | Cleaning run; all 72 checks pass. Decisions (`plan/FINAL_CLEANING_PLAN.md`): swap rule needs the listed dates **and** regions, so Quirino 15 Oct 2017 moves to `deaths_check` (581 swapped: 527 + 54; 5 `deaths_check`; 31,994 `ok`; HDX fixed 2017 = 156,134); Batanes zero share 69.2% accepted; OpenDengue repeated-value check expects 1,196 / 1,196 / 1,197 (within 0.1%); final-week flag for HDX only; Quezon City blank deaths kept blank; HDX `date` treated as week start; PSGC codes later; OpenDengue 2013–2015 context only. Added SHA-256s, download dates, "downloaded by", license status, the source comparison table (6.D); OpenDengue now read from the verified zip; docs moved to `data/dengue/` |

Maintainer: TODO (Team Nex)
