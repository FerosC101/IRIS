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


def test_f1_is_zero_when_defined_and_none_only_when_undefined():
    import numpy as np

    from iris.evaluation.runner import _binary_metrics

    # Flags exist but none are correct: precision = recall = 0, so F1 is a defined 0.
    m = _binary_metrics(np.array([True, False, False]), np.array([False, True, True]))
    assert m["precision"] == 0 and m["recall"] == 0 and m["f1"] == 0.0
    # No flags at all: precision is undefined, so F1 is undefined.
    m = _binary_metrics(np.array([True, False]), np.array([False, False]))
    assert m["precision"] is None and m["f1"] is None
    m = _binary_metrics(np.array([True, True, False]), np.array([True, False, False]))
    assert abs(m["f1"] - 2 * 1.0 * 0.5 / 1.5) < 1e-12


def test_evaluation_includes_zero_run_scenarios():
    res = run_evaluation(EvaluationConfig(replications=3, base_seed=42))
    kinds = {k["kind"]: k for k in res["methods"]["network"]["by_kind"]}
    assert kinds["zero_run"]["events"] > 0
    assert "zero_run_only" in res["methods"]["network"]["false_alarm_channel"]
