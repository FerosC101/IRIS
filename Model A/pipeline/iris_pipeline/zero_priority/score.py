"""Transparent priority score for zero-case reports, plus explanations (Model B · zero-report prioritizer).

score = 100 x sum_k(w_k c_k) / sum_k(w_k), where each component c_k is in [0, 1] (0 when it can't be computed).
Weights, the history window, the minimum history and the streak criterion are tuned on 2019 (tune.py); the
anchors that map indicators to components are fixed in config.ZERO_PRIORITY.

The score ranks reports for verification. It is not the probability that a report is wrong; p_priority is the
calibrated estimate (see calibrate below), and every alert is a lead to verify, never a confirmed failure.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from .. import config

CFG = config.ZERO_PRIORITY
COMPONENTS = ["unexpected", "missing_cases", "rare_zero", "streak", "recent_activity", "on_off", "regional"]
LABELS = {
    "unexpected": "Model A finds this zero unlikely",
    "missing_cases": "Cases that may be missing",
    "rare_zero": "Zeros are unusual for this place",
    "streak": "Zeros in a row",
    "recent_activity": "Cases in recent weeks",
    "on_off": "Switching between zero and non-zero",
    "regional": "Other places in the region also zero",
}


def components(F: pd.DataFrame, min_hist: int, streak_saturation: int) -> pd.DataFrame:
    sat = CFG
    with np.errstate(divide="ignore", invalid="ignore"):
        c = pd.DataFrame(index=F.index)
        c["unexpected"] = np.clip(-np.log10(np.clip(F.p_low.to_numpy(float), 1e-300, 1)) / sat["P_LOW_SATURATION"], 0, 1)
        c["missing_cases"] = np.clip(np.log1p(F.expected.to_numpy(float)) / np.log1p(sat["EXPECTED_SATURATION"]), 0, 1)
        rare = 1 - F.hist_zero_share.to_numpy(float)
        c["rare_zero"] = np.where(F.n_hist.to_numpy() >= min_hist, rare, np.nan)
        c["streak"] = np.clip((F.zero_streak.to_numpy(float) - 1) / max(streak_saturation - 1, 1), 0, 1)
        c["recent_activity"] = np.clip(np.log1p(F.recent_median.to_numpy(float)) / np.log1p(sat["RECENT_SATURATION"]), 0, 1)
        c["on_off"] = np.clip(F.on_off_flips.to_numpy(float) / sat["ON_OFF_SATURATION"], 0, 1)
        c["regional"] = F.region_other_zero_share.to_numpy(float)
    return c[COMPONENTS]


def weighted(c: pd.DataFrame, w: np.ndarray) -> np.ndarray:
    w = np.asarray(w, float)
    return 100 * (np.nan_to_num(c.to_numpy(float), nan=0.0) @ w) / max(w.sum(), 1e-12)


@dataclass
class ZeroPriorityModel:
    hist_weeks: int
    min_hist: int
    streak_saturation: int
    weights: dict
    bands: dict = field(default_factory=dict)            # {"High": score cut, "Medium": score cut}
    calibration: dict = field(default_factory=dict)      # isotonic breakpoints + prior shift + bootstrap curves
    meta: dict = field(default_factory=dict)

    # ---- scoring -----------------------------------------------------------------------------------------
    def w(self) -> np.ndarray:
        return np.array([self.weights[k] for k in COMPONENTS], float)

    def components(self, F: pd.DataFrame) -> pd.DataFrame:
        return components(F, self.min_hist, self.streak_saturation)

    def score(self, F: pd.DataFrame) -> np.ndarray:
        return weighted(self.components(F), self.w())

    def band(self, score: np.ndarray) -> np.ndarray:
        s = np.asarray(score, float)
        # Same convention as the pipeline's methods: a report is in a band when its score is above the cut.
        return np.where(s > self.bands["High"], "High", np.where(s > self.bands["Medium"], "Medium", "Low"))

    def probability(self, score: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Calibrated share of comparable reports expected to be real errors, with a bootstrap interval."""
        cal = self.calibration
        s = np.asarray(score, float)

        cap = CFG["PROB_CAP"]

        def curve(x, y):
            q = np.clip(np.interp(s, x, y), cap, 1 - cap)
            odds = q / (1 - q) * cal["prior_shift"]
            return odds / (1 + odds)
        mid = curve(cal["x"], cal["y"])
        boots = np.array([curve(b["x"], b["y"]) for b in cal["bootstrap"]]) if cal.get("bootstrap") else mid[None, :]
        a = (1 - CFG["PROB_INTERVAL"]) / 2
        return mid, np.quantile(boots, a, axis=0), np.quantile(boots, 1 - a, axis=0)

    # ---- persistence (plain JSON, never pickles) ---------------------------------------------------------
    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, default=float)

    @classmethod
    def from_json(cls, text: str) -> "ZeroPriorityModel":
        return cls(**json.loads(text))


# ---- explanations, warnings and verification steps --------------------------------------------------------

def _fmt_p(p: float) -> str:
    return f"{p:.0e}" if p < 0.001 else f"{p:.3f}"


def reason(k: str, r: pd.Series) -> str:
    if k == "unexpected":
        return f"Model A: a count this low had probability {_fmt_p(r.p_low)} if reporting were normal"
    if k == "missing_cases":
        return f"about {r.expected:.0f} cases expected this week"
    if k == "rare_zero":
        return f"only {r.hist_zero_share:.0%} of this place's last {int(r.n_hist)} reports were zero"
    if k == "streak":
        return f"zero report #{int(r.zero_streak)} in a row"
    if k == "recent_activity":
        return f"recent reports had a median of {r.recent_median:.0f} cases"
    if k == "on_off":
        return f"reports switched between zero and non-zero {int(r.on_off_flips)} times in the last {CFG['ON_OFF_WINDOW']} reports"
    if k == "regional":
        return f"{r.region_other_zero_share:.0%} of other places in the region also reported zero this week"
    return k


def data_warnings(r: pd.Series, min_hist: int) -> list[str]:
    w = ["No testing, timeliness or submission records in this dataset: the cause of the zero cannot be determined."]
    if r.n_hist < min_hist:
        w.append(f"Short history: only {int(r.n_hist)} past reports, so 'zeros are unusual here' was not assessed.")
    if pd.isna(r.p_low):
        w.append("Model A could not score this week (too little history), so its evidence is not used.")
    if bool(r.covid_period):
        w.append("COVID-19 period: genuine drops in consultations and reporting interruptions both occurred.")
    if bool(r.holy_week) or bool(r.christmas_newyear):
        w.append("Holiday week: delayed or partial reporting is common.")
    if r.region_other_missing_share > 0:
        w.append(f"{r.region_other_missing_share:.0%} of other places in the region did not report this week.")
    return w


def verification_steps(top: list[str], r: pd.Series) -> list[str]:
    steps = [f"Confirm with the {r.location} surveillance officer that zero dengue cases were reported for MW {int(r.mw)} {int(r.mw_year)}, "
             "and that the zero is not a blank or late report."]
    if "unexpected" in top or "missing_cases" in top or "recent_activity" in top:
        steps.append("Compare with hospital admissions or laboratory results for the same week.")
    if "streak" in top:
        steps.append("Ask whether reporting staff, tools or the encoding process changed when the zeros began.")
    if "on_off" in top:
        steps.append("Check whether cases were batched into alternate weeks.")
    if "regional" in top:
        steps.append("Ask the RESU whether other provinces' submissions were also affected (possible shared reporting problem).")
    if bool(r.covid_period):
        steps.append("Check whether consultations genuinely fell (for example during lockdown) before treating this as a reporting problem.")
    return steps


def explain(model: ZeroPriorityModel, F: pd.DataFrame, c: pd.DataFrame, max_reasons: int = 3) -> pd.DataFrame:
    contrib = np.nan_to_num(c.to_numpy(float), nan=0.0) * model.w() / max(model.w().sum(), 1e-12) * 100
    rows = []
    for i, (_, r) in enumerate(F.iterrows()):
        order = [COMPONENTS[j] for j in np.argsort(-contrib[i]) if contrib[i, j] > 0.5][:max_reasons]
        rows.append({
            "top_indicators": "; ".join(LABELS[k] for k in order),
            "explanation": ("Prioritised because " + "; ".join(reason(k, r) for k in order) + ".") if order
            else "Little evidence beyond being a zero report.",
            "data_warnings": " | ".join(data_warnings(r, model.min_hist)),
            "verification_steps": " | ".join(verification_steps(order, r)),
        })
    return pd.DataFrame(rows, index=F.index)


def data_sufficiency(F: pd.DataFrame, min_hist: int) -> np.ndarray:
    """Adequate: Model A scored the week and the place has a year of past reports. Limited: scored, shorter history."""
    good = F.p_low.notna() & (F.n_reported_before >= 52)
    some = F.p_low.notna() & (F.n_reported_before >= min_hist)
    return np.where(good, "Adequate history", np.where(some, "Limited history", "Insufficient history"))
