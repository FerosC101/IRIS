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
    # Resolution needs evidence a person attached, as well as the confirmation above.
    assert c.post(f"/api/concerns/{cid}/resolve", json={"summary": "Backlog encoded and received."}, headers=PROV).status_code == 409
    ev = {"title": "Backlog received", "detail": "The two missing weekly reports arrived on 9 Oct."}
    assert c.post(f"/api/concerns/{cid}/evidence", json=ev, headers=PROV).status_code == 200
    r = c.post(f"/api/concerns/{cid}/resolve", json={"summary": "Backlog encoded and received."}, headers=PROV)
    d = r.json()
    assert d["concern"]["status"] == "resolved" and d["investigation"]["status"] == "closed"
    actions = [a["action"] for a in d["activity"]]
    for a in ("concern.marked_for_review", "concern.confirmed", "concern.assigned", "concern.note_added", "concern.evidence_attached", "concern.resolved"):
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


def test_unknown_demo_user_is_rejected_not_replaced(client):
    r = client.get("/api/meta", headers=as_user("U-DOES-NOT-EXIST"))
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "unknown_demo_user"
    # A rejected identity must not be able to act as the default analyst.
    assert client.post("/api/detection/run", json={"method": "network"}, headers=as_user("U-DOES-NOT-EXIST")).status_code == 400
    # No header at all still means the default demo user.
    assert client.get("/api/meta").json()["actor"]["user_id"] == "U-RESU-1"
    assert client.get("/api/meta", headers=PROV).json()["actor"]["user_id"] == "U-PROV-MLY"


def test_demo_reset_requires_typed_confirmation(fresh):
    c = fresh
    assert c.post("/api/concerns/C-0020/notes", json={"body": "Note that must survive a refused reset."}, headers=PROV).status_code == 200
    assert c.post("/api/demo/reset", json={}, headers=RESU).status_code == 422
    r = c.post("/api/demo/reset", json={"confirm": "reset please"}, headers=RESU)
    assert r.status_code == 422 and "Type RESET" in r.json()["detail"]
    notes = c.get("/api/concerns/C-0020", headers=PROV).json()["notes"]
    assert any(n["body"] == "Note that must survive a refused reset." for n in notes)
    assert c.post("/api/demo/reset", json={"confirm": "RESET"}, headers=RESU).status_code == 200
    assert not any(n["body"].startswith("Note that must survive") for n in c.get("/api/concerns/C-0020", headers=PROV).json()["notes"])


def test_zero_case_run_concern_from_demo_scenario(client):
    d = client.get("/api/concerns/C-0021", headers=RESU).json()
    c = d["concern"]
    assert c["concern_type"] == "zero_case_run" and c["concern_type_label"] == "Zero-case run"
    assert c["category_code"] == "DENGUE" and c["primary_unit_id"] == "RHU-TALA-2"
    assert (c["week_start_index"], c["week_end_index"]) == (23, 25)
    kinds = [e["kind"] for e in d["evidence"]]
    assert "observed" in kinds and "possible_explanation" in kinds and "requires_verification" in kinds
    assert any("not a missing submission" in e["detail"] for e in d["evidence"])
    # The answer key ties it to the injected scenario.
    assert any((e["data"].get("scenario") or {}).get("id") == "S11-ZERO-TALA2" for e in d["evidence"])


def test_flags_carry_a_simulated_reference_band(client):
    for cid in ("C-0021", "C-0012"):
        ev = client.get(f"/api/concerns/{cid}", headers=RESU).json()["evidence"]
        band = next(e["data"]["reference_band"] for e in ev if "reference_band" in e["data"])
        assert band["label"] == "Simulated reference band" and 0 <= band["low"] <= band["high"]
    zero = next(e for e in client.get("/api/concerns/C-0021", headers=RESU).json()["evidence"] if "reference_band" in e["data"])
    assert zero["data"]["reference_band"]["per"] == "week" and zero["data"]["reference_band"]["low"] > 0
    rows = client.get("/api/concerns/C-0012", headers=RESU).json()["timeline"]["units"]["RHU-TALA-1"]
    assert any(r["count_band"] for r in rows)


def test_display_ids_and_linked_concerns(client):
    rows = client.get("/api/datasets/DS-DEMO-FACILITY/records?unit_id=RHU-TALA-2&category=DENGUE&date_from=2026-09-07&page_size=10", headers=RESU).json()["rows"]
    by_week = {r["week"]: r for r in rows}
    assert by_week[24]["report_id"] == f"RPT-{by_week[24]['record_id']:04d}"
    assert by_week[24]["value_status"] == "zero" and by_week[24]["concern_id"] == "C-0021"
    assert by_week[22]["concern_id"] is None  # before the zero run
    # A missing submission is not a report: it has no report id, but can still belong to a concern.
    miss = client.get("/api/datasets/DS-DEMO-FACILITY/records?unit_id=RHU-SILANGAN&status=not_received&date_from=2026-09-28", headers=RESU).json()["rows"]
    assert miss and all(r["report_id"] is None for r in miss) and miss[0]["concern_id"] == "C-0020"
    # Count-type concerns link only their own category.
    measles = client.get("/api/datasets/DS-DEMO-FACILITY/records?unit_id=RHU-TALA-2&category=MEASLES&date_from=2026-09-21", headers=RESU).json()["rows"]
    assert all(r["concern_id"] != "C-0021" for r in measles)

    d = client.get(f"/api/reports/{by_week[24]['report_id']}", headers=RESU).json()
    assert d["id"] == by_week[24]["record_id"] and d["concern_id"] == "C-0021" and d["designation"] == "synthetic"
    assert client.get("/api/reports/RPT-99999999", headers=RESU).status_code == 404
    assert client.get(f"/api/reports/{by_week[24]['report_id']}", headers=RHU).status_code == 404  # another unit's report


def test_investigation_ids_resolve_to_their_concern(client):
    d = client.get("/api/concerns/INV-0010", headers=RESU).json()
    assert d["concern"]["id"] == "C-0010" and d["concern"]["investigation_id"] == "INV-0010" and d["concern"]["display_id"] == "INV-0010"
    q = client.get("/api/concerns?status=active&page_size=100", headers=RESU).json()["rows"]
    row = next(r for r in q if r["id"] == "C-0010")
    assert row["investigation_id"] == "INV-0010"
    new = next(r for r in q if r["id"] == "C-0020")
    assert new["investigation_id"] is None and new["display_id"] == "C-0020"
    assert client.get("/api/concerns/INV-9999", headers=RESU).status_code == 404


def test_surveillance_summary_keeps_zero_blank_and_missing_apart(client):
    s = client.get("/api/surveillance/summary?category=DENGUE", headers=RESU).json()
    assert s["available"] and s["week"]["week"] == 25 and s["week"]["iso_label"] == "ISO W40 · 28 Sep–04 Oct"
    u = s["units"]
    assert u["with_cases"] + u["zero"] + u["blank"] + u["missing"] == u["expected"] == 18
    assert u["received"] == u["expected"] - u["missing"]
    assert abs(u["completeness"] - u["received"] / u["expected"]) < 1e-9  # zero and blank reports count as received
    tala2 = next(r for r in s["heatmap"]["units"] if r["unit_id"] == "RHU-TALA-2")
    assert [c["state"] for c in tala2["cells"][-3:]] == ["zero", "zero", "zero"]
    assert tala2["cells"][-1]["concern_id"] == "C-0021" and tala2["cells"][-1]["report_id"].startswith("RPT-")
    silangan = next(r for r in s["heatmap"]["units"] if r["unit_id"] == "RHU-SILANGAN")
    assert silangan["cells"][-1]["state"] == "missing" and silangan["cells"][-1]["report_id"] is None
    assert "C-0021" in s["flow"]["flag_ids"] and s["flow"]["flags"] >= s["flow"]["under_verification"]
    t = s["trend"]
    assert len(t) == 12 and all(r["trailing_median"] is not None for r in t)
    early = client.get("/api/surveillance/summary?category=DENGUE&week=3", headers=RESU).json()["trend"]
    assert early[0]["trailing_median"] is None  # not enough prior weeks


def test_surveillance_summary_scope_and_validation(client):
    rhu = client.get("/api/surveillance/summary?category=DENGUE", headers=RHU).json()
    assert rhu["units"]["expected"] == 1 and [r["unit_id"] for r in rhu["heatmap"]["units"]] == ["RHU-HIRAYA"]
    prov = client.get("/api/surveillance/summary?category=DENGUE", headers=PROV).json()
    assert prov["scope"]["province"] == "Malaya"
    hosp = client.get("/api/surveillance/summary?category=DENGUE&unit_type=hospital", headers=RESU).json()
    assert all(r["unit_type"] == "hospital" for r in hosp["heatmap"]["units"])
    assert client.get("/api/surveillance/summary?category=DENGUE&week=99", headers=RESU).status_code == 422
    assert client.get("/api/surveillance/summary?category=MCS", headers=RESU).status_code == 422
    assert client.get("/api/surveillance/summary?dataset_id=DS-DEMO-PROVINCIAL", headers=RESU).json()["available"] is False


def test_attach_evidence_records_who_and_validates(fresh):
    c = fresh
    body = {"title": "Register photo", "detail": "Dengue register pages for W38–W40 show three cases.", "link": "https://example.org/register"}
    assert c.post("/api/concerns/C-0021/evidence", json={**body, "link": "ftp://x"}, headers=RESU).status_code == 422
    assert c.post("/api/concerns/C-0021/evidence", json={**body, "detail": "short"}, headers=RESU).status_code == 422
    assert c.post("/api/concerns/C-0021/evidence", json=body, headers=ADMIN).status_code == 403
    d = c.post("/api/concerns/C-0021/evidence", json=body, headers=RESU).json()
    item = next(e for e in d["evidence"] if e["kind"] == "attached")
    assert item["title"] == "Register photo" and item["data"]["link"] == "https://example.org/register"
    assert item["created_by"] == "RESU Surveillance Analyst (demo)"
    assert d["activity"][0]["action"] == "concern.evidence_attached"
    # RHU staff may attach evidence to their own unit's concern, not to others.
    assert c.post("/api/concerns/C-0014/evidence", json={"title": "Encoder log", "detail": "Encoder was on leave for two weeks."}, headers=RHU).status_code == 200
    assert c.post("/api/concerns/C-0021/evidence", json=body, headers=RHU).status_code == 404
    c.post("/api/concerns/C-0020/dismiss", json={"reason": "Report sent by courier and received."}, headers=PROV)
    assert c.post("/api/concerns/C-0020/evidence", json=body, headers=PROV).status_code == 409  # closed


def test_resolve_requires_verification_and_attached_evidence(fresh):
    c = fresh
    ev = {"title": "Register check", "detail": "Register pages for W38–W40 were reviewed with the nurse."}
    d = c.get("/api/concerns/C-0021", headers=RESU).json()
    assert d["resolution_requirements"] == {"verified": False, "evidence_attached": False, "can_resolve": False, "missing": d["resolution_requirements"]["missing"]}
    assert len(d["resolution_requirements"]["missing"]) == 2
    # Evidence alone is not enough: the flag still needs a human-reviewed finding.
    c.post("/api/concerns/C-0021/evidence", json=ev, headers=RESU)
    r = c.post("/api/concerns/C-0021/resolve", json={"summary": "Zero counts were checked."}, headers=RESU)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "resolution_requirements"
    assert r.json()["detail"]["missing"] == ["Record a human-reviewed finding: confirm the concern with a reason."]
    # Confirmation alone is not enough either.
    c.post("/api/concerns/C-0020/confirm", json={"reason": "Unit confirmed the report was not sent."}, headers=PROV)
    r = c.post("/api/concerns/C-0020/resolve", json={"summary": "Report re-sent by the unit."}, headers=PROV)
    assert r.status_code == 409 and r.json()["detail"]["missing"] == ["Attach evidence of what was checked."]
    # Both together allow resolution.
    c.post("/api/concerns/C-0021/confirm", json={"reason": "Nurse confirmed three cases were not entered."}, headers=RESU)
    assert c.get("/api/concerns/C-0021", headers=RESU).json()["resolution_requirements"]["can_resolve"] is True
    assert c.post("/api/concerns/C-0021/resolve", json={"summary": "Counts corrected after register check."}, headers=RESU).status_code == 200


def test_seeded_resolutions_meet_the_resolution_rule(client):
    rows = client.get("/api/concerns?status=resolved&page_size=100", headers=RESU).json()["rows"]
    assert rows
    for r in rows:
        d = client.get(f"/api/concerns/{r['id']}", headers=RESU).json()
        assert d["concern"]["verification"] == "confirmed", r["id"]
        assert any(e["kind"] == "attached" for e in d["evidence"]), r["id"]
