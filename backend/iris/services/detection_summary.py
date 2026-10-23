"""What the detectors flag, week by week, and how they are configured.

IRIS has no trained models. Its detectors are statistical methods sharing the
same channels; this summary reports their actual output on a dataset, their
current parameters, and the latest *synthetic* evaluation. Nothing here is a
measure of clinical or real-world performance.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from iris import config
from iris.detection.methods import METHOD_LABELS, METHODS, DetectionParams
from iris.models import ExperimentRun, ReportingUnit
from iris.services import datasets

IN_USE = "network"  # the method that builds the review queue (seed and default detection run)
CHANNELS = {
    "delay": "Late or missing reports",
    "incomplete": "Incomplete records",
    "count": "Count drop",
    "zero_run": "Zero-case run",
}
PARAMETERS = [
    ("history_weeks", "Baseline window", "weeks", "delay"),
    ("min_history", "Minimum history before a unit's own baseline is used", "weeks", "delay"),
    ("threshold_z", "Threshold score", "z", "delay"),
    ("ewma_lambda", "EWMA smoothing", "λ", "delay"),
    ("peer_weight", "Weight of connected-unit evidence", "×", "delay"),
    ("network_score", "Network-aware score threshold", "score", "delay"),
    ("incomplete_share", "Share of incomplete reports that raises a flag", "share", "incomplete"),
    ("count_p", "Count-drop probability threshold", "p", "count"),
    ("zero_run_weeks", "Consecutive zero-case reports", "weeks", "zero_run"),
    ("zero_run_p", "Zero-run probability threshold", "p", "zero_run"),
    ("zero_run_min_mean", "Minimum usual weekly cases for a zero run", "cases", "zero_run"),
]
DISCLAIMER = "Demo evaluation only, not a measure of clinical performance. Experiments use synthetic scenarios with known answers."


def _channel_counts(df) -> dict:
    flagged = df[df["flagged"]]
    delay = flagged["delay_flag"]
    inc = flagged["incomplete_flag"] & ~delay
    count = flagged["count_flag"] & ~delay & ~flagged["incomplete_flag"]
    zero = flagged["zero_run_flag"] & ~delay & ~flagged["incomplete_flag"] & ~flagged["count_flag"]
    return {"total": int(len(flagged)), "delay": int(delay.sum()), "incomplete": int(inc.sum()), "count": int(count.sum()), "zero_run": int(zero.sum())}


def summary(session: Session, dataset_id: str, w_from: int | None, w_to: int | None, province: str | None) -> dict:
    ds = datasets.get_dataset(session, dataset_id)
    last = config.N_WEEKS - 1
    w_to = last if w_to is None else w_to
    w_from = max(0, w_to - 5) if w_from is None else w_from
    if not 0 <= w_from <= w_to <= last:
        raise HTTPException(status_code=422, detail=f"Choose a week range between 0 and {last}, start before end.")
    labels = {w["week"]: w for w in datasets.week_labels()}
    params = DetectionParams()
    base = {"dataset": {"id": ds.id, "name": ds.name, "designation": ds.designation}, "in_use": IN_USE,
            "channels": [{"key": k, "label": v} for k, v in CHANNELS.items()],
            "parameters": [{"key": k, "label": lab, "value": getattr(params, k), "unit": unit, "channel": ch} for k, lab, unit, ch in PARAMETERS],
            "parameter_note": "Read-only. Parameters are fixed in the backend; a change would need a reviewed code change and a new evaluation.",
            "human_verification_required": True,
            "human_verification_note": "Always on. Every flag needs a person to confirm it, with a reason, before it can become a finding or be resolved."}
    if datasets.slots(session, dataset_id) is None:
        return {**base, "available": False, "message": "Not calculable: this dataset defines no reporting schedule, so detection cannot run.", "methods": []}

    unit_prov = None
    if province:
        unit_prov = {u.id for u in session.execute(select(ReportingUnit).where(ReportingUnit.province == province)).scalars()}
    methods = []
    for m in METHODS:
        res = datasets.detection(session, dataset_id, m)
        if unit_prov is not None:
            res = res[res["unit_id"].isin(unit_prov)]
        weeks = []
        for t in range(w_from, w_to + 1):
            weeks.append({"week": t, "iso_week": labels[t]["iso_week"], "iso_label": labels[t]["iso_label"], **_channel_counts(res[res["week"] == t])})
        methods.append({"method": m, "label": METHOD_LABELS[m], "role": "in_use" if m == IN_USE else "comparison",
                        "role_label": f"{METHOD_LABELS[m]} (in use)" if m == IN_USE else "Comparison (evaluation only)",
                        "weeks": weeks, "latest": weeks[-1]})

    exp = session.execute(select(ExperimentRun).where(ExperimentRun.status == "completed").order_by(ExperimentRun.created_at.desc())).scalars().first()
    evaluation = None
    if exp is not None:
        ms = (exp.results or {}).get("methods", {})
        evaluation = {"experiment_id": exp.id, "name": exp.name, "created_at": exp.created_at, "replications": (exp.config or {}).get("replications"),
                      "base_seed": (exp.config or {}).get("base_seed"),
                      "by_method": {k: {"precision": v["overall"]["precision"], "recall": v["overall"]["recall"],
                                        "false_alarm_rate": v["overall"]["false_alarm_rate"], "f1": v["overall"]["f1"]} for k, v in ms.items()},
                      "note": DISCLAIMER}
    return {**base, "available": True, "window": {"from": w_from, "to": w_to}, "methods": methods, "evaluation": evaluation,
            "disclaimer": DISCLAIMER,
            "note": "Weekly counts are flagged unit-weeks from each method on this dataset. Each flag is a prompt for review, not a finding."}
