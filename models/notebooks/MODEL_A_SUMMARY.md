# Model A: summary

**Project:** IRIS (Team Nex, PJDSC 2026)
**Notebook:** `notebooks/model_a.ipynb`
**Date:** 20 Oct 2026

## 1. What Model A does

Health offices send weekly case counts. Sometimes a count is wrong: a **zero that should have been 50**, or a report that **only half arrived**.

For every place and week, Model A asks:

> "Given this place's past, is this week's number believable, or is it suspiciously low?"

If the number is too low, it raises an **alert**. An alert means **"please double-check this report"**. It is not proof that the report is wrong.

## 2. Data used

| Disease | Data | Role |
|---|---|---|
| **Dengue** | Weekly counts for 126 provinces and cities, 2016–2021 | Main data: build, tune and test |
| **Measles** | Weekly national counts, 2017–2021 | Transfer test (no changes to the model) |
| **TB** | Monthly national counts, 2020–2026 | Transfer test (a demonstration only) |

The real errors we test on are already marked in the clean data, for example dengue weeks where cases and deaths were swapped (581 rows). The model **never sees these labels**. Only the scoring step uses them.

## 3. How it works

For each place, the model predicts how many cases a week should have, using:

- **Trend:** the slow rise or fall over the years.
- **Season:** dengue's yearly cycle.
- **Holidays:** Holy Week and Christmas–New Year, when fewer reports arrive.

It then compares the real count with the prediction and gives a score:

- **`expected`:** the predicted count.
- **90% range:** the normal range of counts.
- **`p_low`:** how unlikely a count this low is. **Smaller = more suspicious.**

Rules it follows:

- It only learns from **past weeks**, never future ones, and it is re-trained every 4 weeks.
- Old errors in the history are removed before training, so they don't teach the model wrong patterns.
- Places with little history get a simpler model, and every such case is logged.

It is compared with **three simple methods** that only look at the last few weeks: rolling median, EWMA (a smoothed average) and CUSUM (adds up repeated shortfalls).

## 4. What was tuned

**Only one setting was tuned: the alert threshold.**

- It was tuned on **dengue 2019** so that at most **1 in 100 normal weeks** gets a false alert.
- After that it was **frozen**. Dengue 2020, measles and TB all use the same threshold.
- Every other setting was fixed in advance and is the same for every place and disease (see `outputs/model_a/config.json`).

## 5. How it was tested

| Test | What it is |
|---|---|
| **Real errors** | The 581 dengue weeks with swapped cases and deaths, and 3 weeks where whole regions sent nothing (filled with 0, as a careless system would) |
| **Simulated errors** | Fake failures added to normal weeks: a zero, a half report, a 2–4 week outage, a whole region going silent. Saved in `data/synthetic/`; the clean data is never changed |
| **Test year** | Dengue **2020**. The model was trained on earlier years and never tuned on 2020 |

## 6. How we measure it

We don't use "accuracy". About 99% of weeks are normal, so a model that never alerts would score 99% and be useless.

| Measure | Meaning | Want |
|---|---|---|
| **Recall** | Share of real problems caught | High |
| **False-alert rate** | Share of normal weeks wrongly flagged (target: 1%) | Low |
| **Precision** | Share of alerts that were real problems | High |
| **F1** | Balance of precision and recall | High |
| **AUC** | Ranks problems above normal weeks? (0.5 = coin flip, 1.0 = perfect) | High |

## 7. Results

### Dengue, 2020 test year

| | Model A | Best simple method |
|---|---|---|
| Real swapped weeks caught | **49%** | 4% |
| Simulated failures caught | **35%** | 13% |
| False-alert rate (target 1%) | **8–12%** ❌ | 0.3–4% |
| Alerts that were real problems (simulated failures) | 22% | **76%** |
| F1 (simulated failures) | **0.27** | 0.22 |
| AUC, real swaps | **0.84** | 0.80 |
| AUC, simulated failures | 0.77 | **0.89** |

### Other tests

| Test | Result |
|---|---|
| Dengue 2017 errors, using only 2016 as history | Caught **47%**, with 4% false alerts (simple methods: 8% or less) |
| Measles, early-2019 suspicious zero (week 8) | **Caught** (simple methods missed it) |
| Measles, simulated failures in quiet years | Caught **0%** (no method caught any) |
| TB, 2020 lockdown months | **2 of 8** problem months caught (April–May 2020), no false alerts |
| TB, months DOH reported only partly | Not caught: the drops are too small |

## 8. What this means

**Good**
- Model A **catches far more real problems** than the simple methods.
- It works with **little history** (one year was enough for 2017).
- It **transfers to measles** without any changes.
- It can see when a **whole region** goes wrong at once (clear in 2017).

**Not good yet**
- **Too many false alerts in 2020** (8–12 per 100 normal weeks, against a target of 1).
- **Why:** COVID made dengue cases **really drop** in 2020. The model expected the usual season, saw low numbers, and treated a real drop as broken reports.
- Its normal range is **a bit too narrow**, so it gets alarmed too easily.
- It can't help much on **very quiet series** (measles in quiet years), where a fake zero looks normal.

**In one line:** Model A is a **sensitive alarm**. It finds problems others miss, but in unusual years like 2020 it raises too many false alarms.

## 9. Next steps

1. Let the model follow the **last few weeks**, not just the usual season, so a real drop like COVID doesn't confuse it.
2. Make the normal range **wider and more honest**.
3. Re-test on 2020 **once** after these changes. Don't tune on 2020.

## 10. Files

| File | What's inside |
|---|---|
| `notebooks/model_a.ipynb` | The full model; runs top to bottom |
| `outputs/model_a/scores.csv` | Every score: expected count, range, `p_low`, alert |
| `outputs/model_a/eval_report.md` | All results in detail |
| `outputs/model_a/config.json` | Every setting used |
| `outputs/model_a/figures/` | 6 charts (calibration, Valenzuela City 2020, model vs. baselines, regions, measles, TB) |
| `outputs/model_a/fallback_log.csv` | Places that used a simpler model, and why |
| `data/synthetic/model_a_injected_failures.csv` | The simulated failures used for testing |

## 11. How to run

- **Jupyter:** open `notebooks/model_a.ipynb` from inside the project folder and choose **Run All**.
- **Google Colab:** upload the notebook. In the first cell, set `COLAB_DATA` to `"drive"` (data in Google Drive) or `"upload"` (upload a zip of the `data/` folder).
- **Time:** about 4–10 minutes on a laptop.
- **Same results every time:** running it again gives the same `scores.csv`.

> **Reminder:** alerts are **leads for surveillance staff to check**, not confirmed errors.
