"""Command line: python -m iris_pipeline <step>.

  contract   write CONTRACT.md from contract.py
  select     Model A v2 phase 1: choose the variant on 2016-2019 only (writes selection.json)
  model-a    phase 2: freeze thresholds on 2019, score the 2020 test once, write outputs/model_a_v2/
  model-b    steps 3 + 4: synthetic network, graph ablation, Model B v2 optimizer, recovery simulation,
             old Model B on real labels, real 2020 plan (outputs/network/, outputs/model_b/)
  results    step 5: one results table from the saved outputs (outputs/results/RESULTS.md, results.json)
  contract-json  JSON files + schemas for the IRIS app (outputs/contract/)
  all        contract + select + model-a + model-b + results + contract-json

Dashboard: streamlit run app/streamlit_app.py
"""

from __future__ import annotations

import argparse
import sys
import time


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="iris_pipeline", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["contract", "select", "model-a", "model-b", "results", "contract-json", "all"])
    ap.add_argument("--workers", type=int, default=None, help="parallel processes (default: CPU count - 1)")
    ap.add_argument("--quick", action="store_true", help="model-b: 2 tuning + 3 test replicates (a smoke run)")
    args = ap.parse_args(argv)
    t0 = time.time()

    from .paths import PIPELINE_DIR

    if args.step in ("contract", "all"):
        from .contract import contract_markdown
        (PIPELINE_DIR / "CONTRACT.md").write_text(contract_markdown(), encoding="utf-8")
        print("wrote CONTRACT.md")
    if args.step in ("select", "model-a", "model-b", "all"):
        from . import data
        inp = data.load()
        print("input checks pass")
    if args.step in ("select", "all"):
        from .model_a.select import run_selection
        res = run_selection(inp, args.workers)
        print(f"selected {res['chosen']}: {res['reason']}")
    if args.step in ("model-a", "all"):
        from .evaluation import report_a
        from .model_a import v2
        from .paths import MODEL_A_V2_DIR
        if not (MODEL_A_V2_DIR / "selection.json").exists():
            print("selection.json not found: run `python -m iris_pipeline select` first", file=sys.stderr)
            return 2
        out = v2.run_test(inp, args.workers)
        report_a.write(out, v2.manifest(out, inp))
        print(f"wrote {MODEL_A_V2_DIR} (run {out['run_id']})")
    if args.step in ("model-b", "all"):
        from .model_b import run as run_b
        run_b.run(inp, args.workers, quick=args.quick)
    if args.step in ("results", "all"):
        from .evaluation.results import build as build_results
        build_results()
        print("wrote outputs/results/RESULTS.md and results.json")
    if args.step in ("contract-json", "all"):
        from .contract_json import build as build_json
        docs = build_json()
        print("wrote outputs/contract/: " + ", ".join(f"{k}.json" for k in docs))
    print(f"done in {time.time() - t0:.0f}s")
    return 0
