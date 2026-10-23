"""IRIS dashboard prototype (roadmap step 5): evidence -> verification -> action plan -> recovery.

Run from the pipeline folder:  streamlit run app/streamlit_app.py
Reads only saved outputs (and the clean data for the region calibrator); run `python -m iris_pipeline all` first.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import altair as alt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from iris_pipeline.config import PLAN  # noqa: E402
from iris_pipeline.contract_json import DISCLAIMER  # noqa: E402
from iris_pipeline.paths import MODEL_A_V2_DIR, OUT_DIR, SYN_DIR  # noqa: E402

st.set_page_config(page_title="IRIS", page_icon="🩺", layout="wide")
alt.data_transformers.disable_max_rows()
NET = SYN_DIR / "network"
RED, BLUE, GREY = "#c0504d", "#1f77b4", "#9e9e9e"


# ---- data ----------------------------------------------------------------------------------------------------
@st.cache_data(show_spinner="Loading Model A v2 scores…")
def scores() -> pd.DataFrame:
    from iris_pipeline.model_a.v2 import read_scores
    from iris_pipeline.data import read

    s = read_scores(MODEL_A_V2_DIR / "scores_v2.csv")
    d = s[(s.disease == "dengue") & (s.location_id != "PH")].copy()
    d["period_start"] = pd.to_datetime(d.period_start)
    names = read("shared/locations.csv", []).set_index("location_id").location
    d["location"] = d.location_id.map(names)
    d["priority"] = (d.p_fail.fillna(0) * d.shortfall.fillna(0))
    return d


@st.cache_data
def csv(path: str, **kw) -> pd.DataFrame:
    return pd.read_csv(path, keep_default_na=False, na_values=[""], **kw)


@st.cache_data
def config_a() -> dict:
    return json.loads((MODEL_A_V2_DIR / "config.json").read_text(encoding="utf-8"))


@st.cache_resource(show_spinner="Calibrating region probabilities on 2016–2018…")
def region_cal():
    from iris_pipeline import data
    from iris_pipeline.model_b.real_plan import region_calibrator

    return region_calibrator(scores(), data.load(check=False).Y_dengue)


def need(*paths: Path) -> bool:
    missing = [p for p in paths if not p.exists()]
    if missing:
        st.error("Missing outputs: " + ", ".join(str(p) for p in missing) + ". Run `python -m iris_pipeline all` first.")
        return False
    return True


def banner(extra: str = "") -> None:
    st.info(DISCLAIMER + (" " + extra if extra else ""), icon="ℹ️")


# ---- pages ---------------------------------------------------------------------------------------------------
def page_completeness():
    st.header("1 · Reporting completeness")
    banner("Real DOH dengue reports, cleaned. A missing week is a week that was due but not received.")
    d = scores()
    years = st.slider("Years", 2016, 2020, (2018, 2020))
    sel = d[d.period_start.dt.year.between(*years)]
    rep = sel.report_status.eq("reported")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Location-weeks due", f"{len(sel):,}")
    c2.metric("Received", f"{rep.mean():.1%}")
    c3.metric("Missing", f"{int((sel.report_status == 'missing').sum()):,}")
    c4.metric("Flagged by Model A v2", f"{int((sel.flag == 1).sum()):,}")
    g = sel.assign(received=rep.astype(float), flagged=(sel.flag == 1).astype(float)).groupby(
        ["region_id", "period_start"]).agg(received=("received", "mean"), flagged=("flagged", "mean")).reset_index()
    metric = st.radio("Colour by", ["share of reports received", "share of reports flagged"], horizontal=True)
    col, scheme = ("received", "blues") if metric.startswith("share of reports received") else ("flagged", "reds")
    heat = alt.Chart(g).mark_rect().encode(
        x=alt.X("period_start:T", title="week"), y=alt.Y("region_id:N", title="region"),
        color=alt.Color(f"{col}:Q", scale=alt.Scale(scheme=scheme, domain=[0, 1]), title=metric),
        tooltip=["region_id", alt.Tooltip("period_start:T", title="week"), alt.Tooltip(f"{col}:Q", format=".0%")])
    st.altair_chart(heat.properties(height=420), use_container_width=True)
    st.caption("Each cell is one region-week. Gaps in reporting and clusters of flags show where to look first.")


def page_priority():
    st.header("2 · Priority list with evidence")
    cfg = config_a()
    banner(f"An alert means p_low < {cfg['TAU_model_a_v2']:.2g}: a count this low would happen less than "
           f"{cfg['TAU_model_a_v2']:.2%} of the time if reporting were normal.")
    d = scores()
    flagged_weeks = sorted(d[(d.flag == 1)].period_start.dt.date.unique())
    default = flagged_weeks.index(pd.Timestamp("2020-11-15").date()) if pd.Timestamp("2020-11-15").date() in flagged_weeks else len(flagged_weeks) - 1
    wk = st.selectbox("Week (weeks with at least one alert)", flagged_weeks, index=default)
    w = d[d.period_start.dt.date == wk]
    alerts = w[w.flag == 1].sort_values("priority", ascending=False)
    st.subheader(f"{len(alerts)} alerts in the week of {wk}")
    show = alerts[["location", "region_id", "cases", "expected", "pi_low", "pi_high", "p_fail", "shortfall", "hub_p", "priority"]]
    st.dataframe(show.rename(columns={"pi_low": "90% low", "pi_high": "90% high", "priority": "priority (≈ cases missing)",
                                      "hub_p": "region evidence (hub_p)"}),
                 hide_index=True, use_container_width=True,
                 column_config={"p_fail": st.column_config.ProgressColumn("p_fail", min_value=0, max_value=1, format="%.2f"),
                                "expected": st.column_config.NumberColumn(format="%.1f"),
                                "shortfall": st.column_config.NumberColumn(format="%.1f"),
                                "priority (≈ cases missing)": st.column_config.NumberColumn(format="%.1f"),
                                "region evidence (hub_p)": st.column_config.NumberColumn(format="%.2g")})
    if alerts.empty:
        return
    loc = st.selectbox("Evidence for", alerts.location.tolist())
    row = alerts[alerts.location == loc].iloc[0]
    hist = d[(d.location_id == row.location_id) & d.period_start.between(pd.Timestamp(wk) - pd.Timedelta(weeks=52), pd.Timestamp(wk) + pd.Timedelta(weeks=4))]
    base = alt.Chart(hist).encode(x=alt.X("period_start:T", title="week"))
    band = base.mark_area(opacity=0.2, color=BLUE).encode(y=alt.Y("pi_low:Q", title="cases"), y2="pi_high:Q")
    exp = base.mark_line(color=BLUE).encode(y="expected:Q")
    obs = base.mark_line(color="black", point=True).encode(y="cases:Q", tooltip=["period_start:T", "cases", "expected", "p_low", "p_fail"])
    flags = base.transform_filter("datum.flag == 1").mark_point(color=RED, size=90, filled=True).encode(y="cases:Q")
    rule = alt.Chart(pd.DataFrame({"x": [pd.Timestamp(wk)]})).mark_rule(color=RED, strokeDash=[4, 3]).encode(x="x:T")
    st.markdown(f"**{loc}**: reported **{row.cases:.0f}** cases, expected **{row.expected:.0f}** "
                f"(90% range {row.pi_low:.0f}–{row.pi_high:.0f}); p_fail **{row.p_fail:.2f}**; about **{row.shortfall:.0f}** cases likely missing.")
    st.altair_chart((band + exp + obs + flags + rule).properties(height=300), use_container_width=True)
    st.caption("Blue: expected count from earlier weeks only, with its 90% range. Black: reported. Red dots: weeks flagged.")
    reg = d[(d.region_id == row.region_id) & d.period_start.between(pd.Timestamp(wk) - pd.Timedelta(weeks=12), pd.Timestamp(wk) + pd.Timedelta(weeks=2))].copy()
    reg["evidence"] = -np.log10(reg.p_low.clip(1e-8, 1))
    strip = alt.Chart(reg).mark_rect().encode(
        x=alt.X("period_start:T", title="week"), y=alt.Y("location:N", title=None),
        color=alt.Color("evidence:Q", scale=alt.Scale(scheme="reds", domain=[0, 6]), title="−log10 p_low"),
        tooltip=["location", alt.Tooltip("period_start:T"), "cases", alt.Tooltip("expected:Q", format=".1f"), alt.Tooltip("p_low:Q", format=".2g")])
    st.subheader(f"Region heat strip: {row.region_id}")
    st.altair_chart(strip.properties(height=max(160, 22 * reg.location.nunique())), use_container_width=True)
    st.caption("Darker = more suspicious. A whole column lighting up suggests a shared, region-level problem rather than one place.")


def page_network():
    st.header("3 · Reporting network (simulated)")
    banner("Every facility, hub and lab here is fictional, laid over the real regions for testing.")
    if not need(NET / "nodes.csv", OUT_DIR / "network" / "events_test.csv"):
        return
    fac = csv(str(NET / "facilities.csv"))
    nodes = csv(str(NET / "nodes.csv"))
    ev = csv(str(OUT_DIR / "network" / "events_test.csv"))
    for c, (t, label) in zip(st.columns(4), (("facility", "Facilities"), ("hub", "Reporting hubs"), ("lab", "Labs"),
                                              ("resu", "RESUs"))):
        c.metric(label, int((nodes.node_type == t).sum()))
    regions = sorted(fac.region_id.unique())
    col1, col2, col3 = st.columns(3)
    reg = col1.selectbox("Region", regions, index=regions.index("R04A") if "R04A" in regions else 0)
    seed = col2.selectbox("Simulated replicate", sorted(ev.seed.unique()))
    week = col3.slider("Week of the simulated year", 0, 51, 20)
    e = ev[(ev.seed == seed) & (ev.start_week <= week) & (ev.end_week_if_unrepaired > week)]
    down = set(";".join(e.facilities).split(";")) if len(e) else set()
    bad_src = set(e[e.kind != "isolated"].source)
    f = fac[fac.region_id == reg]
    lines = ["digraph G {", 'rankdir=LR; node [style=filled, fontname="Helvetica", fontsize=9];',
             f'"RESU-{reg}" [shape=doubleoctagon, fillcolor="#e8eaf6", label="RESU {reg}"];']
    for hub, g in f.groupby("hub_id"):
        color = "#f4cccc" if hub in bad_src else "#d9ead3"
        lines.append(f'"{hub}" [shape=box, fillcolor="{color}", label="{hub[4:]}\\n({len(g)} facilities)"];')
        lines.append(f'"{hub}" -> "RESU-{reg}";')
        for r in g.itertuples(index=False):
            c = "#e06666" if r.facility_id in down else "#ffffff"
            lines.append(f'"{r.facility_id}" [shape=ellipse, fillcolor="{c}", label="{r.facility_id[4:]}"];')
            lines.append(f'"{r.facility_id}" -> "{hub}" [color="{GREY}"];')
    for lab in sorted(f.lab_id.unique()):
        color = "#f4cccc" if lab in bad_src else "#fff2cc"
        lines.append(f'"{lab}" [shape=hexagon, fillcolor="{color}", label="{lab[4:]}"];')
        lines.append(f'"{lab}" -> "RESU-{reg}" [style=dashed];')
        for r in f[f.lab_id == lab].itertuples(index=False):
            lines.append(f'"{r.facility_id}" -> "{lab}" [style=dotted, color="#bbbbbb", arrowhead=none];')
    lines.append("}")
    st.graphviz_chart("\n".join(lines), use_container_width=True)
    st.caption("Boxes: reporting hubs. Hexagons: labs (dotted lines: specimen referral). Red: failing in this replicate and week.")
    here = e[e.facilities.str.contains(f"-{reg}-") | e.source.str.contains(reg)]
    if len(here):
        st.markdown("**Simulated failures active here this week**")
        st.dataframe(here[["event_id", "kind", "source", "n_facilities", "start_week", "end_week_if_unrepaired", "mult"]]
                     .rename(columns={"mult": "share of cases still reported"}), hide_index=True, use_container_width=True)


def page_plan():
    st.header("4 · Intervention plan (real 2020 alerts)")
    banner("Locations stand in for facilities and each region's RESU for its hub. Hours and success rates are the IRIS planner's assumptions.")
    from iris_pipeline.model_b.optimizer import greedy, objective, solve
    from iris_pipeline.model_b.real_plan import plan_rows, week_candidates

    d = scores()
    weeks = sorted(d[d.period_start.dt.year == 2020].period_start.dt.date.unique())
    c1, c2, c3 = st.columns(3)
    wk = c1.selectbox("Week", weeks, index=weeks.index(pd.Timestamp("2020-11-15").date()) if pd.Timestamp("2020-11-15").date() in weeks else 0)
    hours = c2.slider("Staff hours this week", 4, 48, int(PLAN["STAFF_HOURS_PER_WEEK"]), step=2)
    cost = c3.number_input("Budget this week (PHP)", 0, 100000, int(PLAN["COST_PHP_PER_WEEK"]), step=1000)
    g, acts = week_candidates(d[d.period_start.dt.date == wk], region_cal())
    chosen, obj = solve(acts, float(hours), float(cost))
    fac_only = [i for i, a in enumerate(acts) if a.action == "call_location"]
    order = sorted(fac_only, key=lambda i: -acts[i].value)
    ff = greedy(acts, np.array(order, dtype=int), float(hours), float(cost))
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Candidate actions", len(acts))
    m2.metric("Chosen", len(chosen))
    m3.metric("Hours used", f"{sum(acts[i].hours for i in chosen):.1f} / {hours}")
    m4.metric("Expected cases recovered", f"{obj:.0f}", delta=f"{obj - objective(acts, ff):+.0f} vs calling locations one by one")
    rows = pd.DataFrame(plan_rows(g, acts, chosen, config_a()["run_id"]))
    if rows.empty:
        st.success("No action worth its hours this week.")
    else:
        st.dataframe(rows[["action", "target", "hours", "expected_cases_recovered", "missing_reports", "reported_cases", "expected_cases",
                           "shortfall", "p_fail_max", "P_region", "locations", "status"]],
                     hide_index=True, use_container_width=True,
                     column_config={"P_region": st.column_config.ProgressColumn("P(region failure)", min_value=0, max_value=1, format="%.2f")})
    curve = pd.DataFrame([{"staff hours": h, "network-aware": solve(acts, float(h), float(cost))[1],
                           "location by location": objective(acts, greedy(acts, np.array(order, dtype=int), float(h), float(cost)))}
                          for h in range(4, 50, 4)]).melt("staff hours", var_name="policy", value_name="expected cases recovered")
    st.altair_chart(alt.Chart(curve).mark_line(point=True).encode(
        x="staff hours:Q", y="expected cases recovered:Q",
        color=alt.Color("policy:N", scale=alt.Scale(range=[BLUE, RED]))).properties(height=260), use_container_width=True)
    st.caption("The integer program re-solves live when you move the slider. 'Call RESU' covers every location of a "
               "suspect region at once, which is why it wins when a whole region drops together.")


def page_recovery():
    st.header("5 · Simulated recovery")
    banner("20 simulated years per policy, same failures and same luck for every policy. No real recovery effect is claimed.")
    if not need(OUT_DIR / "model_b" / "recovery_by_seed.csv"):
        return
    from iris_pipeline.model_b.policies import LABEL

    rec = csv(str(OUT_DIR / "model_b" / "recovery_by_seed.csv"))
    rec["policy_label"] = rec.policy.map(LABEL)
    h = PLAN["STAFF_HOURS_PER_WEEK"]
    r = rec[(rec.hours_budget == h) & (rec.policy != "none")]
    agg = r.groupby("policy_label").recovered_submissions.agg(["mean", "std", "count"]).reset_index()
    agg["lo"] = agg["mean"] - 2.093 * agg["std"] / np.sqrt(agg["count"])
    agg["hi"] = agg["mean"] + 2.093 * agg["std"] / np.sqrt(agg["count"])
    bars = alt.Chart(agg).mark_bar().encode(
        y=alt.Y("policy_label:N", sort="-x", title=None), x=alt.X("mean:Q", title="failed facility-weeks restored per year"),
        color=alt.condition("indexOf(datum.policy_label, 'Network') >= 0", alt.value(BLUE), alt.value(RED)))
    err = alt.Chart(agg).mark_errorbar().encode(y=alt.Y("policy_label:N", sort="-x"), x="lo:Q", x2="hi:Q")
    st.subheader(f"Recovered submissions at {h:.0f} staff-hours per week")
    st.altair_chart((bars + err).properties(height=240), use_container_width=True)
    t = r.groupby("policy_label").agg(recovered=("recovered_submissions", "mean"), per_hour=("recovered_per_staff_hour", "mean"),
                                       weeks_shared=("mean_shared_event_weeks", "mean"),
                                       shared_first=("shared_source_acted_on_first", "mean")).reset_index()
    st.dataframe(t.rename(columns={"policy_label": "policy", "recovered": "restored / year", "per_hour": "per staff-hour",
                                   "weeks_shared": "weeks to recover (shared failures)", "shared_first": "shared source handled first"}),
                 hide_index=True, use_container_width=True,
                 column_config={"shared source handled first": st.column_config.ProgressColumn(min_value=0, max_value=1, format="%.2f")})
    s = rec[rec.policy.isin(["network_aware", "facility_first"])].groupby(["policy_label", "hours_budget"]).recovered_submissions.mean().reset_index()
    st.subheader("Staff budget sensitivity")
    st.altair_chart(alt.Chart(s).mark_line(point=True).encode(
        x=alt.X("hours_budget:Q", title="staff hours per week"), y=alt.Y("recovered_submissions:Q", title="restored / year"),
        color=alt.Color("policy_label:N", scale=alt.Scale(range=[RED, BLUE]), title=None)).properties(height=260), use_container_width=True)


def page_results():
    st.header("Results for the proposal")
    banner()
    p = OUT_DIR / "results" / "RESULTS.md"
    if need(p):
        st.markdown(p.read_text(encoding="utf-8").split("\n", 2)[2])


PAGES = {"1 · Reporting completeness": page_completeness, "2 · Priority list": page_priority,
         "3 · Network (simulated)": page_network, "4 · Intervention plan": page_plan,
         "5 · Simulated recovery": page_recovery, "Results": page_results}

st.sidebar.title("IRIS")
st.sidebar.caption("Integrated Reporting Intervention System · Team Nex · PJDSC 2026")
choice = st.sidebar.radio("Page", list(PAGES), label_visibility="collapsed")
if need(MODEL_A_V2_DIR / "scores_v2.csv", MODEL_A_V2_DIR / "config.json"):
    st.sidebar.markdown("---")
    st.sidebar.caption(f"Model A v2 run `{config_a()['run_id']}`")
    PAGES[choice]()
