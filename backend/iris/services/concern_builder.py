"""Turn unit-week detection flags into reviewable concerns with evidence.

Evidence items are explicitly typed so the interface can separate what was
*observed in the dataset* from *possible explanations* and items that
*require verification*.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from iris import config
from iris.data.world import CATEGORY_BY_CODE
from iris.detection.methods import METHOD_LABELS, DetectionParams


@dataclass
class Segment:
    unit_id: str
    channel: str  # delay | incomplete | count | zero_run
    w0: int
    w1: int
    rows: pd.DataFrame


@dataclass
class ConcernSpec:
    concern_type: str
    unit_ids: list[str]
    w0: int
    w1: int
    severity: str
    title: str
    summary: str
    score: float
    province: str | None
    primary_unit_id: str | None
    shared_via: str | None
    detection_method: str
    uncertainty_note: str
    categories: list[str]
    detail: dict
    evidence: list[dict] = field(default_factory=list)
    #: Week the flag was first raised, when it differs from the start of the period
    #: it describes (a zero-case run is detected on its last week but covers the run).
    detected_w: int | None = None

    @property
    def detection_week(self) -> int:
        return self.w0 if self.detected_w is None else self.detected_w


def period_text(w0: int, w1: int) -> str:
    s, e = config.week_start(w0), config.week_end(w1)
    weeks = f"week {s.isocalendar().week}" if w0 == w1 else f"weeks {s.isocalendar().week}–{config.week_start(w1).isocalendar().week}"
    return f"{weeks} ({s.strftime('%b')} {s.day} – {e.strftime('%b')} {e.day}, {e.year})"


def _channel(row) -> str:
    if row.delay_flag:
        return "delay"
    if row.incomplete_flag:
        return "incomplete"
    if row.count_flag:
        return "count"
    return "zero_run"


def segments(results: pd.DataFrame) -> list[Segment]:
    out: list[Segment] = []
    flagged = results[results["flagged"]].sort_values(["unit_id", "week"])
    for unit_id, g in flagged.groupby("unit_id", sort=True):
        cur: list = []
        for row in g.itertuples(index=False):
            ch = _channel(row)
            if cur and (row.week != cur[-1].week + 1 or ch != _channel(cur[-1])):
                out.append(Segment(unit_id, _channel(cur[0]), cur[0].week, cur[-1].week, pd.DataFrame(cur)))
                cur = []
            cur.append(row)
        if cur:
            out.append(Segment(unit_id, _channel(cur[0]), cur[0].week, cur[-1].week, pd.DataFrame(cur)))
    return out


class _UF:
    def __init__(self, n: int) -> None:
        self.p = list(range(n))

    def find(self, i: int) -> int:
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def union(self, a: int, b: int) -> None:
        self.p[self.find(a)] = self.find(b)


def _overlap(a: Segment, b: Segment) -> bool:
    return a.w0 <= b.w1 and b.w0 <= a.w1


def group_shared(segs: list[Segment], peer_groups: dict[str, dict[str, list[str]]]) -> list[tuple[list[Segment], str | None]]:
    """Group overlapping delay segments of connected units into possible shared problems."""
    delay = [s for s in segs if s.channel == "delay"]
    other = [s for s in segs if s.channel != "delay"]
    uf = _UF(len(delay))
    shared_via: dict[int, str] = {}
    cluster_of: dict[str, str] = {}
    for u, groups in peer_groups.items():
        for gid in groups:
            if gid.startswith("shared_resource:"):
                cluster_of[u] = gid
    # Shared-resource pairs
    for i, a in enumerate(delay):
        for j in range(i + 1, len(delay)):
            b = delay[j]
            if a.unit_id == b.unit_id or not _overlap(a, b):
                continue
            gid = cluster_of.get(a.unit_id)
            if gid and gid == cluster_of.get(b.unit_id):
                uf.union(i, j)
                shared_via[i] = shared_via[j] = gid
    # Hub groups: at least half of the hub's units must be affected. Units that
    # share a resource count as one independent signal, so a shared-connection
    # problem is not mistaken for a hub problem.
    hubs: dict[str, set[str]] = {}
    for u, groups in peer_groups.items():
        for gid, members in groups.items():
            if not gid.startswith("shared_resource:"):
                hubs.setdefault(gid, set()).update([u, *members])
    hub_via: dict[int, str] = {}
    for hub, members in hubs.items():
        idx = [i for i, s in enumerate(delay) if s.unit_id in members]
        local = _UF(len(idx))
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                if delay[idx[a]].unit_id != delay[idx[b]].unit_id and _overlap(delay[idx[a]], delay[idx[b]]):
                    local.union(a, b)
        comps: dict[int, list[int]] = {}
        for k in range(len(idx)):
            comps.setdefault(local.find(k), []).append(idx[k])
        independent_members = {cluster_of.get(m, m) for m in members}
        need = max(2, math.ceil(0.5 * len(independent_members)))
        for comp in comps.values():
            if len({cluster_of.get(delay[i].unit_id, delay[i].unit_id) for i in comp}) >= need:
                for i in comp:
                    uf.union(comp[0], i)
                    hub_via[i] = hub
    roots: dict[int, list[int]] = {}
    for i in range(len(delay)):
        roots.setdefault(uf.find(i), []).append(i)
    out: list[tuple[list[Segment], str | None]] = []
    for members in roots.values():
        segs_ = [delay[i] for i in members]
        if len({s.unit_id for s in segs_}) < 2:
            out.extend(([s], None) for s in segs_)
            continue
        via = next((hub_via[i] for i in members if i in hub_via), None) or next((shared_via[i] for i in members if i in shared_via), None)
        out.append((segs_, via))
    out.extend(([s], None) for s in other)
    return out


def _severity(kind: str, n_units: int, n_weeks: int, missing_share: float) -> str:
    if kind == "shared_problem":
        return "high" if n_units >= 3 or n_weeks >= 2 else "medium"
    if kind in ("missing_submission", "late_report"):
        if n_weeks >= 3 or (missing_share >= 0.75 and n_weeks >= 2):
            return "high"
        if n_weeks >= 2 or missing_share >= 0.5:
            return "medium"
        return "low"
    if kind == "count_drop":
        return "high" if n_weeks >= 3 else "medium"
    if kind == "zero_case_run":
        return "medium"
    return "medium" if n_weeks >= 2 else "low"


def via_name(via: str | None, unit_names: dict[str, str]) -> str:
    if not via:
        return ""
    if via.startswith("shared_resource:"):
        ids = via.split(":", 1)[1].split("|")
        return "the shared connection of " + " and ".join(unit_names.get(i, i) for i in ids)
    return unit_names.get(via, via)


def _week_rows(results: pd.DataFrame, unit_id: str, w0: int, w1: int, last_week: int) -> list[dict]:
    g = results[(results["unit_id"] == unit_id) & (results["week"] >= max(0, w0 - 3)) & (results["week"] <= min(last_week, w1 + 2))]
    rows = []
    for r in g.sort_values("week").itertuples(index=False):
        rows.append({
            "week": int(r.week),
            "in_concern": bool(w0 <= r.week <= w1),
            "expected": int(r.n_expected), "on_time": int(r.n_on_time), "late": int(r.n_late),
            "not_received": int(r.n_not_received), "incomplete": int(r.n_incomplete),
            "cases": float(r.total_cases), "deficit": round(float(r.deficit), 3),
            "baseline_median": round(float(r.baseline_median), 3), "history_weeks": int(r.history_weeks),
            "own_z": round(float(r.own_z), 2), "score": round(float(r.score), 2), "flagged": bool(r.flagged),
            "count_expected": None if pd.isna(r.count_expected) else round(float(r.count_expected), 1),
            "count_p": None if pd.isna(r.count_p) else float(r.count_p),
            "peer_support": round(float(r.peer_support), 2),
            "peer_affected": list(r.peer_affected) if isinstance(r.peer_affected, list) else [],
        })
    return rows


def _category_breakdown(slots: pd.DataFrame, unit_id: str, w0: int, w1: int, case_cats: set[str], hist: int) -> list[dict]:
    s = slots[(slots["unit_id"] == unit_id) & (slots["frequency"] == "weekly") & slots["category_code"].isin(case_cats)]
    out = []
    for code, g in s.groupby("category_code"):
        before = g[(g["week"] < w0) & (g["week"] >= w0 - hist) & g["value"].notna()]
        during = g[(g["week"] >= w0) & (g["week"] <= w1)]
        weeks = w1 - w0 + 1
        out.append({
            "category": code,
            "observed": float(during["value"].fillna(0).sum()),
            "expected": round(float(before["value"].mean()) * weeks, 1) if len(before) else None,
        })
    return sorted(out, key=lambda r: -(r["expected"] or 0))


def build_specs(results: pd.DataFrame, slots: pd.DataFrame, peer_groups: dict[str, dict[str, list[str]]],
                units: dict[str, dict], case_cats: set[str], method: str, params: DetectionParams) -> list[ConcernSpec]:
    names = {k: v["name"] for k, v in units.items()}
    last_week = int(results["week"].max()) if not results.empty else 0
    use_network = method == "network"
    grouped = group_shared(segments(results), peer_groups) if use_network else [([s], None) for s in segments(results)]
    specs: list[ConcernSpec] = []
    method_label = METHOD_LABELS[method]
    sim_note = {"kind": "simulated_example", "title": "Simulated example",
                "detail": "This concern was produced by running detection on simulated demonstration data. It does not describe a real facility."}

    for segs, via in grouped:
        unit_ids = sorted({s.unit_id for s in segs})
        w0, w1 = min(s.w0 for s in segs), max(s.w1 for s in segs)
        rows = pd.concat([s.rows for s in segs], ignore_index=True)
        detected_w = None
        if len(segs) == 1 and segs[0].channel == "zero_run":
            # Describe the whole run of zero-case reports, not only the weeks after it became unusual.
            detected_w = w0
            w0 = w0 - int(rows.iloc[0]["zero_streak"]) + 1
        n_weeks = w1 - w0 + 1
        expected = int(rows["n_expected"].sum())
        on_time = int(rows["n_on_time"].sum())
        late = int(rows["n_late"].sum())
        missing = int(rows["n_not_received"].sum())
        score = float(rows["score"].max())
        period = period_text(w0, w1)
        detail = {
            "weeks": [w for w in range(w0, w1 + 1)],
            "units": {u: _week_rows(results, u, w0, w1, last_week) for u in unit_ids},
            "method": method,
            "params": {k: v for k, v in params.as_dict().items()},
        }
        provinces = sorted({units[u]["province"] for u in unit_ids})
        history_n = int(rows["history_weeks"].min())
        hist_caveat = (
            f" Only {history_n} weeks of prior history were available, so a network-wide default baseline was used."
            if history_n < params.min_history else f" Baseline: the unit's previous {min(history_n, params.history_weeks)} weeks."
        )
        common_uncertainty = (
            f"Detection method: {method_label}. Peak score {score:.1f}. Scores describe how unusual the reporting pattern is "
            "compared with the unit's own recent history; they are not probabilities and do not prove a reporting failure."
        )

        if len(unit_ids) > 1:
            kind = "shared_problem"
            vn = via_name(via, names)
            group_members = set()
            for u in unit_ids:
                for gid, mem in peer_groups.get(u, {}).items():
                    if gid == via:
                        group_members.update([u, *mem])
            unaffected = sorted(group_members - set(unit_ids))
            if via and via.startswith("shared_resource:"):
                title = f"Possible shared problem — {' and '.join(names[u] for u in unit_ids)} (shared encoder/connection)"
            else:
                title = f"Possible shared problem — {len(unit_ids)} units via {vn}"
            summary = (f"In {period}, {len(unit_ids)} connected units had late or missing reports at the same time: "
                       f"{missing} of {expected} expected weekly reports were not received and {late} were late.")
            per_unit = []
            for u in unit_ids:
                r = rows[rows["unit_id"] == u]
                per_unit.append({"unit_id": u, "name": names[u], "expected": int(r["n_expected"].sum()),
                                 "on_time": int(r["n_on_time"].sum()), "late": int(r["n_late"].sum()),
                                 "not_received": int(r["n_not_received"].sum())})
            evidence = [
                {"kind": "observed", "title": f"{len(unit_ids)} connected units were delayed in the same weeks",
                 "detail": f"{on_time} of {expected} expected weekly reports were on time; {late} were late and {missing} were not received by the review date.",
                 "data": {"per_unit": per_unit}},
            ]
            if unaffected:
                evidence.append({"kind": "observed", "title": f"{len(unaffected)} unit(s) in the same group reported normally",
                                 "detail": ", ".join(names[u] for u in unaffected) + " did not show delays in these weeks.", "data": {"units": unaffected}})
            evidence += [
                {"kind": "possible_explanation", "title": "Possible shared problem",
                 "detail": f"A disruption affecting {vn} (for example connectivity, an encoding backlog or staff absence) could explain simultaneous delays. "
                           "The relationship is defined in the simulated network; the cause has not been verified.", "data": {"via": via}},
                {"kind": "requires_verification", "title": "Confirm the cause with the hub and at least one unit",
                 "detail": "Check whether consolidated submissions were delayed upstream, and ask an affected unit whether its reports were prepared on time.", "data": {}},
                sim_note,
            ]
            uncertainty = common_uncertainty + " The grouping uses relationships defined in the simulated network only." + hist_caveat
            primary = None
            cats: list[str] = []
        else:
            u = unit_ids[0]
            seg = segs[0]
            uname = names[u]
            hub = next((g for g in peer_groups.get(u, {}) if not g.startswith("shared_resource:")), None)
            peers = peer_groups.get(u, {}).get(hub, []) if hub else []
            if seg.channel == "delay":
                kind = "missing_submission" if missing >= late else "late_report"
                title = f"{'Missing submissions' if kind == 'missing_submission' else 'Late reports'} — {uname}"
                summary = (f"In {period}, {uname} submitted {on_time} of {expected} expected weekly reports on time; "
                           f"{late} were late and {missing} were not received by the review date.")
                evidence = [
                    {"kind": "observed", "title": "Late or missing weekly reports",
                     "detail": summary, "data": {"expected": expected, "on_time": on_time, "late": late, "not_received": missing}},
                    {"kind": "observed", "title": "Usual pattern for this unit",
                     "detail": (f"In its previous weeks, the unit's typical share of reports late or missing was {float(rows['baseline_median'].iloc[0]):.0%}."
                                if history_n >= params.min_history else "Not enough prior weeks to establish this unit's usual pattern."),
                     "data": {"baseline_median": float(rows["baseline_median"].iloc[0]), "history_weeks": history_n}},
                ]
                if use_network and hub:
                    affected_peers = sorted({p for lst in rows["peer_affected"] for p in (lst if isinstance(lst, list) else [])})
                    if not affected_peers:
                        evidence.append({"kind": "possible_explanation", "title": "Problem appears specific to this unit",
                                         "detail": f"Other units reporting through {names.get(hub, hub)} submitted without unusual delays in these weeks. "
                                                   "This points to a local cause (for example staffing or connectivity), but other causes are possible.",
                                         "data": {"hub": hub, "peers": peers}})
                    else:
                        evidence.append({"kind": "possible_explanation", "title": "Some connected units were also delayed",
                                         "detail": f"{len(affected_peers)} connected unit(s) also had delays ({', '.join(names.get(p, p) for p in affected_peers)}), "
                                                   "but not enough to suggest a shared problem.", "data": {"peers": affected_peers}})
                evidence.append({"kind": "requires_verification", "title": "Confirm with the unit",
                                 "detail": f"Ask {uname} whether reports were prepared and submitted through another channel, and the reason for the delay.", "data": {}})
                cats = []
            elif seg.channel == "zero_run":
                kind = "zero_case_run"
                first = rows.iloc[0]
                code = str(first["zero_category"])
                cat_name = CATEGORY_BY_CODE[code].name if code in CATEGORY_BY_CODE else code
                streak = int(rows.iloc[-1]["zero_streak"])
                mean = float(first["zero_baseline"])
                n_hist = int(first["zero_baseline_n"])
                p_run = float(np.exp(-streak * mean))
                score = round(float(-np.log10(max(p_run, 1e-300))), 2)
                title = f"Zero-case run — {uname}"
                summary = (f"{uname} submitted {cat_name.lower()} reports with zero cases for {streak} consecutive weeks ({period}). "
                           f"In its previous {n_hist} weeks it reported a mean of {mean:.1f} cases per week. "
                           "The reports were received, so this is not a missing submission.")
                evidence = [
                    {"kind": "observed", "title": f"{streak} consecutive zero-case reports for {cat_name}",
                     "detail": summary,
                     "data": {"category": code, "run_weeks": list(range(w0, w1 + 1)), "run_length": streak,
                              "baseline_mean": round(mean, 2), "baseline_weeks": n_hist, "p_run": p_run}},
                    {"kind": "observed", "title": "These are received reports, not missing ones",
                     "detail": "Zero-case reports count toward completeness. A missing submission would be a different problem.", "data": {}},
                    {"kind": "possible_explanation", "title": "Zero may be valid",
                     "detail": "Possible explanations include a genuine absence of cases, the end of a seasonal increase, or a data-entry or form error. "
                               "A flag does not establish a cause.", "data": {}},
                    {"kind": "requires_verification", "title": "Reconcile the zero counts with the source register",
                     "detail": f"Ask {uname} to compare the reported zeros with its case register or logbook for these weeks.", "data": {}},
                ]
                cats = [code]
                common_uncertainty = (
                    f"Detection channel: zero-case run (shared by every detection method; this concern came from the {method_label} run). "
                    f"Probability of a run this long under the unit's recent mean, from a simple Poisson model: about {p_run:.1e}. "
                    "This measures how unusual the run is, not whether the reports are wrong."
                )
                hist_caveat = f" Baseline: the unit's previous {n_hist} received {cat_name.lower()} reports before the run."
            elif seg.channel == "incomplete":
                kind = "incomplete_record"
                n_inc = int(rows["n_incomplete"].sum())
                n_rec = int((rows["n_expected"] - rows["n_not_received"]).sum())
                sl = slots[(slots["unit_id"] == u) & (slots["week"] >= w0) & (slots["week"] <= w1)]
                blanks = int((sl["value_status"] == "blank").sum())
                zeros = int((sl["value_status"] == "zero").sum())
                title = f"Incomplete records — {uname}"
                summary = f"In {period}, {n_inc} of {n_rec} reports received from {uname} had blank fields or fewer than 80% of required fields completed."
                evidence = [
                    {"kind": "observed", "title": "Reports received with incomplete fields", "detail": summary,
                     "data": {"incomplete": n_inc, "received": n_rec}},
                    {"kind": "observed", "title": "Blank values are kept separate from zeros",
                     "detail": f"{blanks} case-count field(s) were left blank and {zeros} were explicitly reported as zero. Blank fields are not treated as zero cases.",
                     "data": {"blank": blanks, "zero": zeros}},
                    {"kind": "requires_verification", "title": "Clarify the blank fields",
                     "detail": "Ask the unit whether blank fields mean zero cases or information that was not available.", "data": {}},
                ]
                cats = []
            else:
                kind = "count_drop"
                breakdown = _category_breakdown(slots, u, w0, w1, case_cats, params.history_weeks)
                obs = float(rows["total_cases"].sum())
                exp_ = float(np.nansum(rows["count_expected"].to_numpy(dtype=float)))
                title = f"Unexpected drop in reported counts — {uname}"
                summary = (f"In {period}, {uname} reported {obs:.0f} cases in total, compared with about {exp_:.0f} expected from its recent weeks. "
                           "Reports were received, so this is not a missing-report problem.")
                cats = [b["category"] for b in breakdown if b["expected"] and b["observed"] < 0.5 * b["expected"]][:3]
                evidence = [
                    {"kind": "observed", "title": "Reported counts were much lower than recent weeks", "detail": summary,
                     "data": {"observed": obs, "expected": round(exp_, 1), "by_category": breakdown}},
                    {"kind": "possible_explanation", "title": "Several explanations are possible",
                     "detail": "Possible explanations include under-reporting, a data-entry error, or a genuine decline in cases (for example the end of a seasonal peak). "
                               "An unusual count alone is not evidence of under-reporting.", "data": {}},
                    {"kind": "requires_verification", "title": "Verify counts against source registers",
                     "detail": "Ask the unit to compare the reported counts with its case registers or logbooks before drawing conclusions.", "data": {}},
                ]
            evidence.append(sim_note)
            uncertainty = common_uncertainty + hist_caveat
            primary = u

        missing_share = missing / expected if expected else 0.0
        specs.append(ConcernSpec(
            concern_type=kind, unit_ids=unit_ids, w0=w0, w1=w1,
            severity=_severity(kind, len(unit_ids), n_weeks, missing_share),
            title=title, summary=summary, score=round(score, 2),
            province=provinces[0] if len(provinces) == 1 else None,
            primary_unit_id=primary, shared_via=via if len(unit_ids) > 1 else None,
            detection_method=method, uncertainty_note=uncertainty, categories=cats,
            detail=detail, evidence=evidence, detected_w=detected_w,
        ))
    # Order by the week each flag was raised, so identifiers follow detection order.
    specs.sort(key=lambda s: (s.detection_week, s.unit_ids[0]))
    return specs
