from conftest import as_user

RESU, PROV, RHU, ADMIN = as_user("U-RESU-1"), as_user("U-PROV-MLY"), as_user("U-RHU-HIRAYA"), as_user("U-ADMIN")


def test_every_major_route_responds(client):
    for path in ["/api/meta", "/api/overview", "/api/concerns", "/api/network", "/api/datasets", "/api/actions", "/api/plans",
                 "/api/assignments", "/api/recovery", "/api/experiments", "/api/audit", "/api/units", "/api/imports"]:
        assert client.get(path, headers=RESU).status_code == 200, path


def test_dismiss_requires_reason_and_is_recorded(fresh):
    c = fresh
    assert c.post("/api/concerns/C-0020/dismiss", json={"reason": "no"}, headers=PROV).status_code == 422
    r = c.post("/api/concerns/C-0020/dismiss", json={"reason": "Unit confirmed the report was sent by courier."}, headers=PROV)
    assert r.status_code == 200
    body = r.json()
    assert body["concern"]["status"] == "dismissed"
    assert body["activity"][0]["action"] == "concern.dismissed"
    # Closed concerns cannot be dismissed again
    assert c.post("/api/concerns/C-0020/dismiss", json={"reason": "Trying again with a reason."}, headers=PROV).status_code == 409


def test_investigation_can_be_assigned_updated_and_resolved(fresh):
    c = fresh
    cid = "C-0019"
    assert c.post(f"/api/concerns/{cid}/review", json={}, headers=PROV).status_code == 200
    assert c.post(f"/api/concerns/{cid}/confirm", json={"reason": "Unit confirmed reports were not sent."}, headers=PROV).status_code == 200
    r = c.post(f"/api/concerns/{cid}/assign", json={"user_id": "U-RESU-2", "due": "2026-10-20"}, headers=PROV)
    assert r.status_code == 200 and r.json()["investigation"]["owner_user_id"] == "U-RESU-2"
    assert c.post(f"/api/concerns/{cid}/notes", json={"body": "Called the RHU; encoder is back tomorrow."}, headers=PROV).status_code == 200
    r = c.post(f"/api/concerns/{cid}/resolve", json={"summary": "Backlog encoded and received."}, headers=PROV)
    d = r.json()
    assert d["concern"]["status"] == "resolved" and d["investigation"]["status"] == "closed"
    actions = [a["action"] for a in d["activity"]]
    for a in ("concern.marked_for_review", "concern.confirmed", "concern.assigned", "concern.note_added", "concern.resolved"):
        assert a in actions


def test_role_permissions_are_enforced(client):
    assert client.post("/api/concerns/C-0014/confirm", json={"reason": "RHU staff should not confirm."}, headers=RHU).status_code == 403
    assert client.get("/api/concerns/C-0010", headers=RHU).status_code == 404  # not their unit
    assert client.get("/api/concerns/C-0014", headers=PROV).status_code == 404  # other province


def test_clarification_round_trip(fresh):
    c = fresh
    r = c.post("/api/concerns/C-0014/respond", json={"message": "Encoder was on leave; reports will follow."}, headers=RHU)
    assert r.status_code == 200
    assert r.json()["concern"]["status"] == "under_review"


def test_rhu_can_submit_and_correct_reports(fresh):
    c = fresh
    tasks = c.get("/api/tasks", headers=RHU).json()
    t = next(t for t in tasks if t["kind"] == "missing_report")
    body = {"unit_id": "RHU-HIRAYA", "category_code": t["category_code"], "period_start": t["period_start"], "value": 3}
    r = c.post("/api/reports", json=body, headers=RHU)
    assert r.status_code == 200 and r.json()["late"] is True
    assert len(c.get("/api/tasks", headers=RHU).json()) == len(tasks) - 1
    # Correction needs a reason
    assert c.post("/api/reports", json={**body, "value": 4}, headers=RHU).status_code == 422
    r = c.post("/api/reports", json={**body, "value": 4, "note": "Recounted from the logbook."}, headers=RHU)
    assert r.json()["revision"] == 2
    # Blank is accepted only explicitly
    assert c.post("/api/reports", json={**body, "value": None, "note": "Re-checked the register."}, headers=RHU).status_code == 422
    assert c.post("/api/reports", json={**body, "unit_id": "RHU-TALA-1"}, headers=RHU).status_code == 403


def test_filters_affect_records(client):
    all_rows = client.get("/api/datasets/DS-DEMO-FACILITY/records", headers=RESU).json()["total"]
    missing = client.get("/api/datasets/DS-DEMO-FACILITY/records?status=not_received", headers=RESU).json()
    assert 0 < missing["total"] < all_rows
    assert all(r["status"] == "not_received" for r in missing["rows"])
    one = client.get("/api/datasets/DS-DEMO-FACILITY/records?unit_id=RHU-HIRAYA&page_size=5&page=2", headers=RESU).json()
    assert one["page"] == 2 and all(r["unit_id"] == "RHU-HIRAYA" for r in one["rows"])
    s = client.get("/api/datasets/DS-DEMO-FACILITY/records?search=luntian", headers=RESU).json()
    assert s["total"] > 0 and all("Luntian" in r["unit_name"] for r in s["rows"])


def test_recovery_not_calculable_without_expectations(client):
    r = client.get("/api/recovery?dataset_id=DS-DEMO-PROVINCIAL", headers=RESU).json()
    assert r["completeness_available"] is False
    assert any("Not calculable" in m for m in r["messages"])


def test_budget_affects_plan_and_approval_creates_follow_up(fresh):
    c = fresh
    small = c.post("/api/plans/compare", json={"budget_hours": 5}, headers=RESU).json()
    large = c.post("/api/plans/compare", json={"budget_hours": 60}, headers=RESU).json()
    assert small["optimized"]["total_cost_hours"] <= 5
    assert large["optimized"]["total_expected_benefit"] > small["optimized"]["total_expected_benefit"]
    assert large["optimized"]["total_expected_benefit"] >= large["baseline"]["total_expected_benefit"]
    ids = small["optimized"]["action_ids"]
    p = c.post("/api/plans", json={"name": "Test plan", "method": "optimized", "budget_hours": 5, "action_ids": ids}, headers=RESU)
    assert p.status_code == 200
    pid = p.json()["id"]
    assert c.post(f"/api/plans/{pid}/decision", json={"decision": "reject", "note": "no"}, headers=RESU).status_code == 422
    d = c.post(f"/api/plans/{pid}/decision", json={"decision": "approve"}, headers=RESU).json()
    assert d["status"] == "approved" and len(d["assignments"]) == len(ids)
    aid = d["assignments"][0]["id"]
    assert c.patch(f"/api/assignments/{aid}", json={"status": "completed"}, headers=RESU).status_code == 409
    assert c.patch(f"/api/assignments/{aid}", json={"status": "in_progress"}, headers=RESU).status_code == 200
    assert c.patch(f"/api/assignments/{aid}", json={"status": "completed"}, headers=RESU).status_code == 422  # needs evidence
    assert c.patch(f"/api/assignments/{aid}", json={"status": "completed", "evidence": "Call log attached (demo)."}, headers=RESU).status_code == 200
    assert c.patch(f"/api/assignments/{aid}", json={"status": "closed"}, headers=RESU).status_code == 422  # needs outcome
    r = c.post(f"/api/assignments/{aid}/outcomes", json={"outcome_status": "not_yet_verified", "summary": "Waiting for next week's reports."}, headers=RESU)
    assert r.json()["stage"] == "completed_outcome_not_verified"
    assert c.patch(f"/api/assignments/{aid}", json={"status": "closed"}, headers=RESU).json()["status"] == "closed"


def test_plan_over_budget_is_rejected(fresh):
    c = fresh
    pool = c.get("/api/actions", headers=RESU).json()["actions"]
    ids = [a["id"] for a in pool if not a["depends_on"]][:3]
    r = c.post("/api/plans", json={"name": "Too big", "method": "manual", "budget_hours": 1, "action_ids": ids}, headers=RESU)
    assert r.status_code == 422 and "budget" in r.json()["detail"]


CSV_OK = "week_start,disease,province,cases\n2026-05-04,Dengue,Masagana,12\n2026-05-11,Dengue,Masagana,\n2026-05-18,Dengue,Masagana,0\n"


def _upload(client, text, name="data.csv"):
    return client.post("/api/imports/preview", files={"file": (name, text.encode(), "text/csv")}, headers=ADMIN)


def test_csv_import_success(client):
    p = _upload(client, CSV_OK).json()
    assert p["suggested_mapping"]["period_start"] == "week_start" and p["suggested_mapping"]["value"] == "cases"
    mapping = {"period_start": "week_start", "value": "cases", "category": "disease", "area": "province"}
    v = client.post("/api/imports/validate", json={"token": p["token"], "mapping": mapping}, headers=ADMIN).json()
    assert v["can_accept"] and v["summary"]["value_status"] == {"reported": 1, "zero": 1, "blank": 1}
    meta = {"name": "Test import", "source": "Unit test", "designation": "synthetic", "geographic_level": "province"}
    r = client.post("/api/imports/commit", json={"token": p["token"], "mapping": mapping, "metadata": meta}, headers=ADMIN)
    assert r.status_code == 200
    ds = r.json()
    assert ds["row_count"] == 3 and ds["designation"] == "synthetic"
    rec = client.get(f"/api/recovery?dataset_id={ds['id']}", headers=RESU).json()
    assert rec["completeness_available"] is False


def test_csv_import_reports_row_errors(client):
    bad = "week_start,cases\n2026-05-04,12\nnot-a-date,3\n2026-05-18,-1\n2026-05-25,abc\n2026-05-04,5\n"
    p = _upload(client, bad).json()
    v = client.post("/api/imports/validate", json={"token": p["token"], "mapping": {"period_start": "week_start", "value": "cases"}}, headers=ADMIN).json()
    assert not v["can_accept"]
    rows = {(e["row"], e["column"]) for e in v["errors"] if e["row"]}
    assert (3, "week_start") in rows and (4, "cases") in rows and (5, "cases") in rows
    assert any("share the same" in e["message"] for e in v["errors"])
    meta = {"name": "Bad import", "source": "Unit test", "designation": "unknown", "geographic_level": "province"}
    r = client.post("/api/imports/commit", json={"token": p["token"], "mapping": {"period_start": "week_start", "value": "cases"}, "metadata": meta}, headers=ADMIN)
    assert r.status_code == 422


def test_csv_file_level_errors(client):
    assert _upload(client, "a,b\n1,2", name="data.xlsx").status_code == 422
    assert _upload(client, "", name="empty.csv").status_code == 422
    r = _upload(client, "a,a\n1,2\n")
    assert r.status_code == 422 and "same header" in r.json()["detail"]["message"]
    hist = client.get("/api/imports", headers=ADMIN).json()
    assert any(h["status"] == "rejected" for h in hist)
    assert _upload(client, CSV_OK).status_code == 200
    assert client.post("/api/imports/preview", files={"file": ("d.csv", CSV_OK.encode(), "text/csv")}, headers=PROV).status_code == 403


def test_experiment_runs_and_reports_metrics(client):
    r = client.post("/api/experiments", json={"replications": 3, "base_seed": 99}, headers=RESU)
    assert r.status_code == 200
    m = r.json()["results"]["methods"]
    assert set(m) == {"threshold", "ewma", "network"}
    assert client.post("/api/experiments", json={"replications": 3}, headers=PROV).status_code == 403


def test_network_and_unit_detail(client):
    g = client.get("/api/network", headers=RESU).json()
    assert g["defined"] and all(e["simulated"] for e in g["edges"])
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    u = client.get("/api/network/units/HUB-THM", headers=RESU).json()
    assert u["unit"]["unit_type"] == "hub" and len(u["history"]) == 26


def test_unit_metadata_management(fresh):
    c = fresh
    assert c.patch("/api/units/RHU-HIRAYA", json={"notes": "Encoder rota changed."}, headers=RESU).status_code == 403
    r = c.patch("/api/units/RHU-HIRAYA", json={"notes": "Encoder rota changed."}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["notes"] == "Encoder rota changed."


def test_detection_run_does_not_duplicate(fresh):
    r = fresh.post("/api/detection/run", json={"method": "network"}, headers=RESU).json()
    assert r["created"] == [] and r["skipped_existing"] > 0
