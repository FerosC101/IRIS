from iris.evaluation.runner import EvaluationConfig, run_evaluation


def test_evaluation_metrics_are_computed_on_identical_data():
    res = run_evaluation(EvaluationConfig(replications=3, base_seed=42))
    positives = res["positives"]
    assert positives > 0
    for m, v in res["methods"].items():
        o = v["overall"]
        assert o["tp"] + o["fn"] == positives, m
        assert o["tp"] + o["fn"] + o["fp"] + o["tn"] == res["unit_weeks_per_method"], m
        for k in ("precision", "recall", "false_alarm_rate"):
            assert o[k] is None or 0 <= o[k] <= 1
    assert res["methods"]["network"]["shared_identification"] is not None
    assert res["methods"]["threshold"]["shared_identification"] is None


def test_evaluation_is_reproducible():
    a = run_evaluation(EvaluationConfig(replications=2, base_seed=5))
    b = run_evaluation(EvaluationConfig(replications=2, base_seed=5))
    assert a["methods"]["network"]["overall"] == b["methods"]["network"]["overall"]
