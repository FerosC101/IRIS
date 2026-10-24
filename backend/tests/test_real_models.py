"""Real-data model outputs served read-only, and human reviews of their leads."""

import json

import pytest
from conftest import as_user

RESU, PROV, RHU, ADMIN = as_user("U-RESU-1"), as_user("U-PROV-MLY"), as_user("U-RHU-HIRAYA"), as_user("U-ADMIN")
ENV = {"generated_at": "2026-10-23T00:00:00Z", "run_id": "RUN-A", "disclaimer": "Leads to verify."}
ZERO = [
    {"alert_id": "dengue|R1-A|2020-12-20|zero_priority", "location_id": "R1-A", "location_name": "PLACE A", "region_id": "R1",
     "region_name": "Region One", "week_start": "2020-12-20", "mw_year": 2020, "mw": 52, "report_status": "reported", "cases": 0,
     "expected": 12.0, "p_low": 0.001, "model_a_flag": 1, "priority_score": 70.0, "priority": "High", "rank_in_week": 1,
     "p_priority": 0.6, "p_priority_low": 0.4, "p_priority_high": 0.8, "data_sufficiency": "Adequate history",
     "top_indicators": ["Model A finds this zero unlikely"], "explanation": "Prioritised because ...", "data_warnings": ["cause cannot be determined"],
     "verification_steps": ["Call the officer"], "components": {"unexpected": 0.8}, "status": "lead_to_verify", "model_version": "zero_priority_v1"},
    {"alert_id": "dengue|R1-B|2020-12-20|zero_priority", "location_id": "R1-B", "location_name": "PLACE B", "region_id": "R1",
     "region_name": "Region One", "week_start": "2020-12-20", "mw_year": 2020, "mw": 52, "report_status": "reported", "cases": 0,
     "expected": 2.0, "p_low": 0.4, "model_a_flag": 0, "priority_score": 10.0, "priority": "Low", "rank_in_week": 2,
     "p_priority": 0.05, "p_priority_low": 0.01, "p_priority_high": 0.1, "data_sufficiency": "Adequate history",
     "top_indicators": [], "explanation": "Little evidence.", "data_warnings": [], "verification_steps": [], "components": {},
     "status": "lead_to_verify", "model_version": "zero_priority_v1"},
    {"alert_id": "dengue|R1-C|2020-12-13|zero_priority", "location_id": "R1-C", "location_name": "PLACE C", "region_id": "R1",
     "region_name": "Region One", "week_start": "2020-12-13", "report_status": "missing", "priority": "Missing report (not ranked)",
     "rank_in_week": None, "top_indicators": [], "data_warnings": [], "verification_steps": [], "components": {},
     "status": "lead_to_verify", "model_version": "zero_priority_v1"},
]
ALERT = {"alert_id": "dengue|R1-A|2020-12-20|nb_full", "disease": "dengue", "location_id": "R1-A", "location_name": "PLACE A",
         "region_id": "R1", "hub_id": "RESU-R1", "period_start": "2020-12-20", "resolution": "week", "cases": 0, "expected": 12.0,
         "pi_low": 4, "pi_high": 22, "p_low": 0.001, "p_fail": 0.4, "shortfall": 12.0, "hub_p": 0.2, "priority": 4.8,
         "status": "lead_to_verify", "model_version": "model_a_v2:nb_full"}
PLAN_ACTION = {"action": "call_resu", "target": "RESU-R1", "region_id": "R1", "hours": 5.5, "expected_cases_recovered": 10.0,
               "locations": ["R1-A", "R1-B"], "missing_reports": 0, "reported_cases": 0, "expected_cases": 14.0, "shortfall": 14.0,
               "p_fail_max": 0.6, "hub_p": 0.1, "P_region": 0.5, "status": "lead_to_verify"}


@pytest.fixture()
def contract(tmp_path, monkeypatch):
    from iris import config
    from iris.services import real_models

    docs = {
        "zero_priority": {"schema": "iris.zero_priority/1.0", **ENV, "model_run_id": "RUN-B", "model": {"weights": {}}, "summary": {},
                          "count": len(ZERO), "items": ZERO},
        "alerts": {"schema": "iris.alerts/1.0", **ENV, "threshold": {"tau": 0.001}, "count": 1, "items": [ALERT]},
        "plan": {"schema": "iris.plan/1.0", **ENV, "hours_per_week": 24, "weeks": [{"week_start": "2020-12-20", "hours_used": 5.5, "actions": [PLAN_ACTION]}]},
        "metrics": {"schema": "iris.metrics/1.0", **ENV, "objectives": [], "detection_real_swaps_2020": [], "shared_source_identification": [], "recovery": []},
    }
    for name, doc in docs.items():
        (tmp_path / f"{name}.json").write_text(json.dumps(doc))
    locs = tmp_path / "locations.csv"
    locs.write_text("location_raw,location,location_id,location_type,region_raw,region,region_id,first_week\n"
                    "A,PLACE A,R1-A,province,R1,Region One,R1,2016-01-10\nB,PLACE B,R1-B,province,R1,Region One,R1,2016-01-10\n")
    monkeypatch.setattr(config, "MODEL_CONTRACT_DIR", tmp_path)
    monkeypatch.setattr(config, "MODEL_LOCATIONS_FILE", locs)
    real_models._cache.clear()
    return tmp_path


def test_missing_outputs_are_reported_not_invented(client, tmp_path, monkeypatch):
    from iris import config
    from iris.services import real_models
    monkeypatch.setattr(config, "MODEL_CONTRACT_DIR", tmp_path / "nothing")
    real_models._cache.clear()
    assert client.get("/api/real/status", headers=RESU).json()["available"] is False
    r = client.get("/api/real/zero-reports", headers=RESU)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "model_output_missing"


def test_zero_reports_by_week_band_and_rank(client, contract):
    d = client.get("/api/real/zero-reports", headers=RESU).json()
    assert d["week"] == "2020-12-20" and [i["location_id"] for i in d["items"]] == ["R1-A", "R1-B"]
    assert {w["week_start"]: w["missing"] for w in d["weeks"]} == {"2020-12-13": 1, "2020-12-20": 0}
    high = client.get("/api/real/zero-reports?week=2020-12-20&band=High", headers=RESU).json()
    assert [i["priority"] for i in high["items"]] == ["High"]
    miss = client.get("/api/real/zero-reports?week=2020-12-13", headers=RESU).json()["items"]
    assert miss[0]["report_status"] == "missing" and miss[0]["rank_in_week"] is None


def test_closing_a_lead_needs_a_reason_and_evidence(client, contract):
    lid = ZERO[0]["alert_id"]
    base = {"lead_type": "zero_report", "lead_id": lid}
    assert client.post("/api/real/reviews", json={**base, "status": "not_a_problem", "note": "too short"}, headers=PROV).status_code == 422
    r = client.post("/api/real/reviews", json={**base, "status": "not_a_problem", "note": "Genuine lull confirmed by PESU", "evidence": ""}, headers=PROV)
    assert r.status_code == 422 and "evidence" in r.json()["detail"]
    assert client.post("/api/real/reviews", json={**base, "status": "in_review"}, headers=PROV).status_code == 200
    r = client.post("/api/real/reviews", json={**base, "status": "confirmed", "note": "Cases found in the hospital log",
                                               "evidence": "Hospital admission log, MW 52"}, headers=RESU)
    body = r.json()
    assert body["review"]["status"] == "confirmed" and body["review"]["model_run_id"] == "RUN-B"
    assert [h["status"] for h in body["history"]] == ["confirmed", "in_review"]
    items = client.get("/api/real/zero-reports?week=2020-12-20", headers=RESU).json()["items"]
    assert items[0]["review"]["status"] == "confirmed" and items[1]["review"] is None
    unrev = client.get("/api/real/zero-reports?week=2020-12-20&review=unreviewed", headers=RESU).json()["items"]
    assert [i["location_id"] for i in unrev] == ["R1-B"]


def test_review_permissions_and_unknown_leads(client, contract):
    lid = ZERO[0]["alert_id"]
    assert client.get("/api/real/status", headers=RHU).status_code == 403
    assert client.get("/api/real/status", headers=ADMIN).status_code == 200
    assert client.post("/api/real/reviews", json={"lead_type": "zero_report", "lead_id": lid, "status": "in_review"}, headers=ADMIN).status_code == 403
    assert client.post("/api/real/reviews", json={"lead_type": "zero_report", "lead_id": "dengue|NOPE|2020-01-01|x", "status": "in_review"}, headers=RESU).status_code == 404


def test_alerts_and_plan_join_names_and_reviews(client, contract):
    a = client.get("/api/real/alerts?year=2020", headers=RESU).json()
    assert a["total"] == 1 and a["items"][0]["region_name"] == "Region One"
    p = client.get("/api/real/plan", headers=RESU).json()
    act = p["actions"][0]
    assert act["target_name"] == "Region One RESU" and act["location_names"] == ["PLACE A", "PLACE B"]
    r = client.post("/api/real/reviews", json={"lead_type": "plan_action", "lead_id": act["lead_id"], "status": "in_review", "note": "Calling today"}, headers=RESU)
    assert r.status_code == 200
    assert client.get("/api/real/plan", headers=RESU).json()["actions"][0]["review"]["status"] == "in_review"


def test_wrong_schema_version_is_refused(client, contract):
    from iris.services import real_models
    doc = json.loads((contract / "alerts.json").read_text())
    (contract / "alerts.json").write_text(json.dumps({**doc, "schema": "iris.alerts/2.0"}))
    real_models._cache.clear()
    assert client.get("/api/real/alerts", headers=RESU).status_code == 500


def test_reviews_survive_a_demo_reset(client, contract):
    lid = ZERO[1]["alert_id"]
    client.post("/api/real/reviews", json={"lead_type": "zero_report", "lead_id": lid, "status": "in_review", "note": "x"}, headers=RESU)
    assert client.post("/api/demo/reset", json={"confirm": "RESET"}).status_code == 200
    h = client.get(f"/api/real/reviews?lead_type=zero_report&lead_id={lid}", headers=RESU).json()
    assert h and h[0]["status"] == "in_review"
