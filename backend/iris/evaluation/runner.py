"""Synthetic evaluation of the detection methods.

Every method sees *identical* simulated data in every replication. Metrics are
computed from the executed run only; nothing is hard-coded.

Unit of analysis: one unit-week. A unit-week is positive when the simulation
injected a reporting disruption for that unit in that week. Holiday delays and
genuine case increases are *not* disruptions; flags during them are false
alarms.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix

from iris.data.simulate import DISRUPTION_KINDS, SCENARIO_KIND_LABELS, random_scenarios, simulate
from iris.data.world import CATEGORIES, build_world
from iris.detection.features import unit_week_features
from iris.detection.methods import METHOD_LABELS, METHODS, DetectionParams, detect, own_evidence, peer_groups_from_edges
from iris.services.slots import build_slots

SHARED_KINDS = ("hub_outage", "shared_resource")


@dataclass(frozen=True)
class EvaluationConfig:
    replications: int = 20
    base_seed: int = 7100
    n_weeks: int = 26

    def as_dict(self) -> dict:
        return {"replications": self.replications, "base_seed": self.base_seed, "n_weeks": self.n_weeks}


def _ratio(num: float, den: float) -> float | None:
    return None if den == 0 else float(num) / float(den)


def _binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[False, True]).ravel()
    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    f1 = None if not precision or not recall else 2 * precision * recall / (precision + recall)
    return {
        "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
        "precision": precision, "recall": recall, "false_alarm_rate": _ratio(fp, fp + tn), "f1": f1,
    }


def _fp_context(row, scen_by_rep: dict[int, list]) -> str:
    for sc in scen_by_rep[row.replication]:
        if row.unit_id not in sc.units:
            continue
        if sc.kind == "holiday" and sc.start_week <= row.week <= sc.end_week:
            return "holiday"
        if sc.kind == "outbreak" and sc.start_week <= row.week <= sc.end_week + 3:
            return "outbreak"
        if sc.is_disruption and sc.end_week < row.week <= sc.end_week + 2:
            return "after_disruption"
    return "background"


def run_evaluation(cfg: EvaluationConfig | None = None, params: DetectionParams | None = None) -> dict:
    cfg = cfg or EvaluationConfig()
    params = params or DetectionParams()
    started = time.perf_counter()
    world = build_world()
    peer_groups = peer_groups_from_edges([(e.source, e.target, e.relationship_type) for e in world.edges], {u.id for u in world.reporting_units})
    case_cats = {c.code for c in CATEGORIES if c.is_case_count}

    frames: dict[str, list[pd.DataFrame]] = {m: [] for m in METHODS}
    scen_by_rep: dict[int, list] = {}
    for r in range(cfg.replications):
        rng = np.random.default_rng(cfg.base_seed + r)
        scenarios = random_scenarios(world, rng, cfg.n_weeks)
        scen_by_rep[r] = scenarios
        sim = simulate(world, scenarios, seed=cfg.base_seed * 31 + r, n_weeks=cfg.n_weeks, as_of=None)
        slots = build_slots(sim.expectations, sim.records, as_of=None)
        feats = unit_week_features(slots, case_cats, as_of=None)
        ev = own_evidence(feats, params)
        labels = sim.labels
        for m in METHODS:
            d = detect(feats, m, params, peer_groups=peer_groups, evidence=ev)
            d = d.merge(labels, on=["unit_id", "week"], how="left")
            d["replication"] = r
            frames[m].append(d[["replication", "unit_id", "week", "flagged", "delay_flag", "count_flag", "incomplete_flag",
                                "score", "peer_support", "is_disruption", "scenario_id", "kind", "severity", "context_kind"]])

    methods_out: dict[str, dict] = {}
    for m in METHODS:
        df = pd.concat(frames[m], ignore_index=True)
        df["is_disruption"] = df["is_disruption"].fillna(False).astype(bool)
        overall = _binary_metrics(df["is_disruption"].to_numpy(), df["flagged"].to_numpy())

        events = df[df["is_disruption"]].groupby(["replication", "scenario_id", "unit_id"])
        ev_rows = []
        for (rep, sid, uid), g in events:
            g = g.sort_values("week")
            hit = g[g["flagged"]]
            ev_rows.append({
                "kind": g["kind"].iloc[0], "severity": g["severity"].iloc[0],
                "detected": not hit.empty,
                "delay": int(hit["week"].iloc[0] - g["week"].iloc[0]) if not hit.empty else None,
            })
        ev_df = pd.DataFrame(ev_rows)
        detected = ev_df[ev_df["detected"]] if not ev_df.empty else ev_df

        by_kind = []
        for kind in DISRUPTION_KINDS:
            sub = df[df["kind"] == kind]
            evk = ev_df[ev_df["kind"] == kind] if not ev_df.empty else ev_df
            dk = evk[evk["detected"]] if not evk.empty else evk
            by_kind.append({
                "kind": kind, "label": SCENARIO_KIND_LABELS[kind],
                "unit_weeks": int(len(sub)),
                "recall": _ratio(int(sub["flagged"].sum()), len(sub)),
                "events": int(len(evk)),
                "event_detection_rate": _ratio(int(evk["detected"].sum()) if len(evk) else 0, len(evk)),
                "median_delay_weeks": float(dk["delay"].median()) if len(dk) else None,
            })
        by_sev = []
        for sev in ("high", "medium", "low"):
            sub = df[df["severity"] == sev]
            by_sev.append({"severity": sev, "unit_weeks": int(len(sub)), "recall": _ratio(int(sub["flagged"].sum()), len(sub))})

        fps = df[df["flagged"] & ~df["is_disruption"]]
        ctx = fps.apply(lambda row: _fp_context(row, scen_by_rep), axis=1) if not fps.empty else pd.Series(dtype=str)
        fp_attr = {k: int((ctx == k).sum()) for k in ("background", "holiday", "outbreak", "after_disruption")}
        channel = {
            "reporting_delay": int((fps["delay_flag"]).sum()),
            "count_drop_only": int((fps["count_flag"] & ~fps["delay_flag"]).sum()),
            "incomplete_only": int((fps["incomplete_flag"] & ~fps["delay_flag"] & ~fps["count_flag"]).sum()),
        }

        shared_id = None
        if m == "network":
            tp_shared = df[df["flagged"] & df["kind"].isin(SHARED_KINDS) & df["delay_flag"]]
            tp_iso = df[df["flagged"] & (df["kind"] == "isolated") & df["delay_flag"]]
            shared_id = {
                "shared_detections": int(len(tp_shared)),
                "shared_labelled_shared": _ratio(int((tp_shared["peer_support"] >= 0.5).sum()), len(tp_shared)),
                "isolated_detections": int(len(tp_iso)),
                "isolated_labelled_shared": _ratio(int((tp_iso["peer_support"] >= 0.5).sum()), len(tp_iso)),
            }

        methods_out[m] = {
            "method": m,
            "label": METHOD_LABELS[m],
            "overall": overall,
            "events": int(len(ev_df)),
            "event_detection_rate": _ratio(int(ev_df["detected"].sum()) if len(ev_df) else 0, len(ev_df)),
            "median_delay_weeks": float(detected["delay"].median()) if len(detected) else None,
            "mean_delay_weeks": float(detected["delay"].mean()) if len(detected) else None,
            "by_kind": by_kind,
            "by_severity": by_sev,
            "false_alarm_context": fp_attr,
            "false_alarm_channel": channel,
            "shared_identification": shared_id,
        }

    def diff(a: float | None, b: float | None) -> float | None:
        return None if a is None or b is None else a - b

    net, thr = methods_out["network"], methods_out["threshold"]
    network_effect = {
        "compared": ["network", "threshold"],
        "precision_change": diff(net["overall"]["precision"], thr["overall"]["precision"]),
        "recall_change": diff(net["overall"]["recall"], thr["overall"]["recall"]),
        "false_alarm_rate_change": diff(net["overall"]["false_alarm_rate"], thr["overall"]["false_alarm_rate"]),
        "by_kind": [
            {"kind": a["kind"], "label": a["label"], "recall_change": diff(a["recall"], b["recall"])}
            for a, b in zip(net["by_kind"], thr["by_kind"])
        ],
    }

    n_units = len(world.reporting_units)
    return {
        "config": cfg.as_dict(),
        "params": params.as_dict(),
        "unit_weeks_per_method": cfg.replications * n_units * cfg.n_weeks,
        "positives": int(pd.concat(frames["threshold"])["is_disruption"].fillna(False).sum()),
        "methods": methods_out,
        "network_effect": network_effect,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
        "scenario_mix": "Each replication injects one shared-hub disruption, one shared-resource disruption, two isolated-unit problems, one incomplete-record episode, one count drop, one holiday-week delay and one genuine case increase, with random timing, units and severity.",
    }
