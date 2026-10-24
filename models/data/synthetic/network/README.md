# Synthetic reporting network (simulated, not real)

Built by `pipeline/iris_pipeline/network/build.py` (world seed in `pipeline/iris_pipeline/config.py`).

- `nodes.csv`: facilities, provincial reporting hubs, laboratories and RESUs. All names are fictional.
- `edges.csv`: facility -> hub (reports_through), facility -> lab (specimen_referral), hub/lab -> RESU.
- `facilities.csv`: each facility's location, region, hub, lab and share of the location's cases.
- `facility_true_weekly.csv`: true weekly counts per facility, a multinomial split of each real location's
  cleaned dengue series. Failures are simulated on top of these by `network/simulate.py`; their ground truth
  is written per run to `pipeline/outputs/network/`.

Never mix these files with the real surveillance data.
