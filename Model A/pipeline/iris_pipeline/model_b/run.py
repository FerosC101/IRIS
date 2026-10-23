"""Orchestrates steps 3 and 4: network, graph ablation, stress tests, recovery simulation, real-data checks."""

from __future__ import annotations

import pickle
import time

import pandas as pd

from .. import config
from ..data import Inputs
from ..model_a.v2 import read_scores
from ..paths import MODEL_A_V2_DIR, OUT_DIR
from ..network.ablation import run_network
from ..network.build import build_world, save_world
from . import old_b, real_plan
from .recovery import run_recovery, summarise

NET_OUT = OUT_DIR / "network"
B_OUT = OUT_DIR / "model_b"


def run(inp: Inputs, workers=None, quick: bool = False) -> None:
    from ..contract import validate
    from ..evaluation import report_b

    t0 = time.time()
    NET_OUT.mkdir(parents=True, exist_ok=True)
    B_OUT.mkdir(parents=True, exist_ok=True)
    scores = read_scores(MODEL_A_V2_DIR / "scores_v2.csv")
    validate(scores)  # Model B only reads a file that passes the contract
    scores["period_start"] = pd.to_datetime(scores.period_start)

    world = build_world()
    save_world(world)
    stats = world.nodes.node_type.value_counts().to_dict()
    test_seeds = config.SIM["TEST_SEEDS"][:3] if quick else config.SIM["TEST_SEEDS"]
    tune_seeds = config.SIM["TUNE_SEEDS"][:2] if quick else config.SIM["TUNE_SEEDS"]

    print("step 3: tuning + graph ablation", flush=True)
    net = run_network(world, inp.cal, workers, tune_seeds=tune_seeds, test_seeds=test_seeds)
    stress = {}
    for yr in config.SIM["STRESS_YEARS"]:
        print(f"step 3: stress test {yr}", flush=True)
        stress[yr] = run_network(world, inp.cal, workers, test_seeds=test_seeds[:10], test_year=yr, tuned=net["tuned"])
    net["fw"].to_csv(NET_OUT / "ablation_facility_weeks_by_seed.csv", index=False, float_format="%.6g")
    net["ev"].to_csv(NET_OUT / "ablation_events_by_seed.csv", index=False, float_format="%.6g")
    net["events_test"].to_csv(NET_OUT / "events_test.csv", index=False)
    net["events_tune"].to_csv(NET_OUT / "events_tune.csv", index=False)
    with open(NET_OUT / "tuned.pkl", "wb") as f:
        pickle.dump(net["tuned"], f)

    print("step 4: recovery simulation", flush=True)
    rec, log = run_recovery(world, inp.cal, net["tuned"], net["src"], test_seeds, config.SIM["TEST_YEAR"],
                            config.PLAN["HOURS_SENSITIVITY"], workers)
    rec_sum = summarise(rec)
    rec.to_csv(B_OUT / "recovery_by_seed.csv", index=False, float_format="%.6g")
    log[log.policy.isin(["network_aware", "facility_first", "oracle"])].to_csv(B_OUT / "actions_log.csv", index=False)

    print("step 4: real-data checks", flush=True)
    ob, ob_info = old_b.evaluate(inp, scores)
    ob.to_csv(B_OUT / "old_model_b_real_eval.csv", index=False, float_format="%.6g")
    plan, weekly = real_plan.plan(inp, scores)
    validate(plan, "plan_real_2020")
    plan.to_csv(B_OUT / "plan_real_2020.csv", index=False)
    validate(pd.read_csv(B_OUT / "plan_real_2020.csv", keep_default_na=False, na_values=[""]), "plan_real_2020")
    weekly.to_csv(B_OUT / "plan_real_2020_weekly.csv", index=False)

    report_b.write(net, stress, rec, rec_sum, ob, ob_info, plan, weekly, stats, round(time.time() - t0, 1))
    print(f"wrote {NET_OUT} and {B_OUT}")
