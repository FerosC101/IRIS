"""Model A count model: rolling-origin negative binomial per series.

With every option off this is a line-for-line port of MODEL A/notebooks/model_a.ipynb cell 10 (Model A v1);
tests/test_v1_reproduces.py checks it against the published scores.csv. Model A v2 adds, as options:

- recent level (endemic-epidemic term): log1p(median of the last few usable reports up to t - lag). A week whose
  own past-only p_low is tiny is not "usable", so an outage can't pull the expected level down and hide itself.
- covid_period covariate.
- honest uncertainty: the predictive negative binomial is widened by the coefficient uncertainty (GLM covariance)
  and by year-to-year variation in epidemic size, via alpha_eff = (1 + alpha) * exp(s2) - 1, which is the exact
  variance of an NB whose mean is scaled by a mean-one lognormal with log-variance s2.

Every score uses only periods before it: fits use earlier periods, and the recent level for week t uses weeks
up to t - lag (tests/test_no_leakage.py).
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

LEVEL_COLS = {"nb_full": None, "nb_trend": ["const", "trend"], "nb_intercept": ["const"]}
LEVELS = ["nb_full", "nb_trend", "nb_intercept"]


def nb_dist(mu, alpha):
    r = 1.0 / np.asarray(alpha, dtype=float)
    return stats.nbinom(r, r / (r + np.asarray(mu, dtype=float)))


def mid_p_low(y, mu, alpha):
    d = nb_dist(mu, alpha)
    y = np.asarray(y, dtype=float)
    return d.cdf(y - 1) + 0.5 * d.pmf(y)


def design(n, periods_per_year, holidays):
    """Covariates for a series of n periods. holidays: DataFrame (n rows) of 0/1 flags."""
    t = np.arange(n) / periods_per_year
    X = pd.DataFrame({"const": 1.0, "trend": t, "sin": np.sin(2 * np.pi * t), "cos": np.cos(2 * np.pi * t)})
    for c in holidays.columns:
        X[c] = holidays[c].to_numpy(dtype=float)
    return X


class CountModel:
    """Holds the settings; methods mirror the v1 notebook functions."""

    def __init__(self, cfg: dict, opts: dict):
        self.cfg = cfg
        self.opts = opts
        self.a_lo, self.a_hi = cfg["ALPHA_BOUNDS"]
        self.uncertain = bool(opts.get("param_uncertainty") or opts.get("year_variance"))

    # ---- v1 functions -------------------------------------------------------------------------------------
    def fit_level(self, y, X, cols):
        """Returns (beta over cols, alpha, cov over cols). Constant non-intercept columns are dropped from the fit
        (coefficient 0, variance 0)."""
        if cols == ["const"]:
            m = y.mean()
            if m <= 0:
                raise ValueError("all-zero history")
            a = np.clip((y.var(ddof=1) - m) / m ** 2 if len(y) > 1 else self.a_lo, self.a_lo, self.a_hi)
            var_log_mean = (1.0 / m + float(a)) / len(y)  # delta method: Var(log ybar) = (mu + a mu^2) / (n mu^2)
            return (pd.Series({"const": math.log(m)}), float(a),
                    pd.DataFrame([[var_log_mean]], index=["const"], columns=["const"]))
        keep = [c for c in cols if c == "const" or X[c].std() > 0]
        Xk = X[keep].to_numpy()
        pois = sm.GLM(y, Xk, family=sm.families.Poisson()).fit()
        mu = pois.fittedvalues
        a = float(np.clip(np.sum((y - mu) ** 2 - y) / np.sum(mu ** 2), self.a_lo, self.a_hi))
        nb = sm.GLM(y, Xk, family=sm.families.NegativeBinomial(alpha=a)).fit()
        beta = pd.Series(nb.params, index=keep).reindex(cols, fill_value=0.0)
        if not np.all(np.isfinite(beta)):
            raise ValueError("non-finite coefficients")
        cov = None
        if self.opts.get("param_uncertainty"):
            c = np.asarray(nb.cov_params())
            if not np.all(np.isfinite(c)):
                raise ValueError("non-finite covariance")
            cov = pd.DataFrame(c, index=keep, columns=keep).reindex(index=cols, columns=cols, fill_value=0.0)
        return beta, a, cov

    def level_for(self, n):
        if n >= self.cfg["MIN_FULL"]:
            return "nb_full"
        if n >= self.cfg["MIN_TREND"]:
            return "nb_trend"
        if n >= self.cfg["MIN_ANY"]:
            return "nb_intercept"
        return None

    def robust_fit(self, y, X, X_pred=None, start_level=None):
        """Fit at the level the history allows (or lower), robustly; step down a level if a fit fails or its forecast
        for X_pred is implausible. The mean is refitted without extreme lows; the dispersion comes from the full fit,
        so dropping lows doesn't make the range artificially narrow.
        Returns (level, cols, beta, alpha, cov, n_dropped, reason)."""
        cfg = self.cfg
        n = len(y)
        level = self.level_for(n)
        if level is None:
            return None, None, None, None, None, 0, f"insufficient history ({n} < {cfg['MIN_ANY']})"
        if y.sum() == 0:
            return ("zero_history", ["const"], pd.Series({"const": math.log(0.5 / (n + 1))}), self.a_lo, None, 0,
                    "all-zero history")
        if start_level and LEVELS.index(start_level) > LEVELS.index(level):
            level = start_level
        reason = "" if level == "nb_full" else f"short history ({n} points)"
        cap = cfg["MAX_PRED_FACTOR"] * y.max() + 10
        for lv in LEVELS[LEVELS.index(level):]:
            cols = LEVEL_COLS[lv] or list(X.columns)
            try:
                beta, a, cov = self.fit_level(y, X, cols)
                mu = np.exp(np.clip(X[cols].to_numpy() @ beta.to_numpy(), -20, 20))
                keep = mid_p_low(y, mu, a) >= cfg["ROBUST_DROP_P"]
                n_drop = int((~keep).sum())
                if n_drop and self.level_for(int(keep.sum())) is not None and y[keep].sum() > 0:
                    beta, _, cov_k = self.fit_level(y[keep], X[keep], cols)
                    cov = cov_k if cov_k is not None else cov
                if X_pred is not None and np.any(np.exp(np.clip(X_pred[cols].to_numpy() @ beta.to_numpy(), -20, 20)) > cap):
                    reason = f"{lv} forecast implausible (> {cfg['MAX_PRED_FACTOR']} x training max)"
                    continue
                return lv, cols, beta, a, cov, n_drop, reason
            except Exception as exc:  # noqa: BLE001 - any numerical failure steps down a level
                reason = f"{lv} fit failed ({type(exc).__name__})"
        return None, None, None, None, None, 0, reason + "; no level could be fitted"

    # ---- v2 additions -------------------------------------------------------------------------------------
    def _year_var(self, y_tr, mu_tr, alpha, years_tr):
        """Variance of log(observed / fitted) annual totals across training years, minus the NB sampling noise."""
        if not self.opts.get("year_variance") or years_tr is None:
            return 0.0
        d = pd.DataFrame({"y": y_tr, "mu": mu_tr, "yr": years_tr})
        g = d.groupby("yr").agg(y=("y", "sum"), mu=("mu", "sum"), mu2=("mu", lambda m: float(np.sum(m ** 2))),
                                n=("y", "size"))
        g = g[(g.n >= self.opts["min_year_weeks"]) & (g.y > 0) & (g.mu > 0)]
        if len(g) < 2:
            return 0.0
        r = np.log(g.y / g.mu)
        noise = (g.mu + alpha * g.mu2) / g.mu ** 2
        return float(max(0.0, r.var(ddof=1) - noise.mean()))

    def _se2(self, Xp, cols, cov):
        if cov is None or not self.opts.get("param_uncertainty"):
            return np.zeros(len(Xp))
        A = Xp[cols].to_numpy()
        return np.einsum("ij,jk,ik->i", A, cov.loc[cols, cols].to_numpy(), A)

    def _alpha_eff(self, alpha, s2):
        if not self.uncertain:
            return np.full(np.shape(s2), alpha, dtype=float)
        return np.clip((1.0 + alpha) * np.exp(np.minimum(s2, 5.0)) - 1.0, alpha, self.a_hi)

    # ---- scoring ------------------------------------------------------------------------------------------
    def score_series(self, y, X, series_id, log, years=None):
        """Rolling-origin scoring. y: float array (NaN = not reported); X: design (same length); years: calendar
        year per period (for year_variance). Returns DataFrame with expected, alpha, level, pi_low, pi_high, p_low."""
        cfg, opts = self.cfg, self.opts
        n = len(y)
        R, W = cfg["REFIT_EVERY"], cfg["TRAIN_WINDOW"]
        lag = opts.get("recent_lag")
        mu = np.full(n, np.nan)
        alpha = np.full(n, np.nan)
        alpha_eff = np.full(n, np.nan)
        level = np.array(["no_history"] * n, dtype=object)
        if lag:
            X = X.copy()
            X["recent"] = np.nan
            rec = np.full(n, np.nan)
            usable = np.zeros(n, dtype=bool)  # reported and not flagged at its own (past-only) scoring time
        for r in range(0, n, R):
            tr = np.arange(max(0, r - W), r)
            tr = tr[~np.isnan(y[tr])]
            pred = np.arange(r, min(n, r + R))
            if lag:
                tr = tr[~np.isnan(rec[tr])]
                Xp = X.iloc[pred].copy()
                Xp["recent"] = self._recent_value(y, usable, r, lag)
            else:
                Xp = X.iloc[pred]
            lv, cols, beta, a, cov, n_drop, reason = self.robust_fit(y[tr], X.iloc[tr].reset_index(drop=True), Xp)
            if lv != "nb_full":
                log.append({"series": series_id, "refit_period": r, "n_train": len(tr), "level": lv or "no_score",
                            "reason": reason})
            if lv is None:
                if lag:
                    for t in pred:
                        rec[t] = self._recent_value(y, usable, t, lag)
                        X.iat[t, X.columns.get_loc("recent")] = rec[t]
                        usable[t] = not np.isnan(y[t])
                continue
            s_year = 0.0
            if self.opts.get("year_variance") and lv not in ("zero_history",):
                mu_tr = np.exp(np.clip(X.iloc[tr][cols].to_numpy() @ beta.to_numpy(), -20, 20))
                s_year = self._year_var(y[tr], mu_tr, a, None if years is None else years[tr])
            if not lag:
                eta = np.clip(X.iloc[pred][cols].to_numpy() @ beta.to_numpy(), -20, 20)
                mu[pred] = np.exp(eta)
                alpha[pred] = a
                se2 = self._se2(X.iloc[pred], cols, cov) if lv != "zero_history" else np.zeros(len(pred))
                alpha_eff[pred] = self._alpha_eff(a, se2 + s_year)
                level[pred] = lv
                continue
            # recent level: week by week, so week t's covariate can use weeks r..t-lag of this block
            ci = X.columns.get_loc("recent")
            for t in pred:
                rec[t] = self._recent_value(y, usable, t, lag)
                X.iat[t, ci] = rec[t]
                if "recent" in cols and np.isnan(rec[t]):
                    usable[t] = not np.isnan(y[t])
                    continue
                xt = X.iloc[[t]]
                mu[t] = float(np.exp(np.clip(xt[cols].to_numpy() @ beta.to_numpy(), -20, 20))[0])
                alpha[t] = a
                se2 = self._se2(xt, cols, cov)[0] if lv != "zero_history" else 0.0
                alpha_eff[t] = float(self._alpha_eff(a, np.array([se2 + s_year]))[0])
                level[t] = lv
                if np.isnan(y[t]):
                    usable[t] = False
                else:
                    usable[t] = mid_p_low(y[t], mu[t], alpha_eff[t]) >= opts["recent_exclude_p"]
        out = pd.DataFrame({"expected": mu, "alpha": alpha_eff, "level": level})
        if self.uncertain:
            out["alpha_fit"] = alpha
        has = ~np.isnan(mu)
        lo, hi = (1 - cfg["PI_LEVEL"]) / 2, 1 - (1 - cfg["PI_LEVEL"]) / 2
        out["pi_low"] = np.nan
        out["pi_high"] = np.nan
        out.loc[has, "pi_low"] = nb_dist(mu[has], alpha_eff[has]).ppf(lo)
        out.loc[has, "pi_high"] = nb_dist(mu[has], alpha_eff[has]).ppf(hi)
        sc = has & ~np.isnan(y)
        out["p_low"] = np.nan
        out.loc[sc, "p_low"] = mid_p_low(y[sc], mu[sc], alpha_eff[sc])
        if lag:
            out["recent"] = rec
        return out

    def _recent_value(self, y, usable, t, lag):
        """log1p(median of the last recent_window usable reports among periods <= t - lag); NaN if none."""
        end = t - lag + 1
        if end <= 0:
            return np.nan
        idx = np.flatnonzero(usable[:end])
        if not len(idx):
            return np.nan
        return float(np.log1p(np.median(y[idx[-self.opts["recent_window"]:]])))
