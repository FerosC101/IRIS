"""Synthetic reporting network over the real geography (roadmap step 3).

facilities -> provincial reporting hubs -> RESU (one per region), and facilities -> labs (specimen referral).
Every facility, hub and lab is fictional. Each location's true weekly dengue counts (the cleaned series, with the
answer-key corrections applied and gaps interpolated, i.e. the best estimate of what really happened) are split
across its facilities by a multinomial draw. Levels and seasonality are therefore realistic while every failure
label in the simulation is known exactly. Written to models/data/synthetic/network/, never mixed with real data.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import NETWORK
from ..data import read
from ..paths import SYN_DIR

NET_DIR = SYN_DIR / "network"


@dataclass
class World:
    nodes: pd.DataFrame          # node_id, node_type, location_id, region_id, name, n_facilities
    edges: pd.DataFrame          # source, target, relationship
    weeks: pd.DatetimeIndex      # weekly grid (Sunday starts)
    true: np.ndarray             # facilities x weeks, true counts
    facilities: pd.DataFrame     # facility_id, location_id, region_id, hub_id, lab_id, share (row order = true rows)
    location_totals: dict = None  # location_id -> int array of true weekly totals

    def resample(self, seed: int) -> "World":
        """Same network and facility shares, fresh facility-level noise: a new multinomial split of the location totals."""
        rng = np.random.default_rng([seed, 7])
        true = np.zeros_like(self.true)
        tot = self.location_totals
        for loc, idx in self.facilities.groupby("location_id").indices.items():
            p = self.facilities.share.to_numpy()[idx]
            true[idx] = np.array([rng.multinomial(n, p) for n in tot[loc]]).T
        return World(self.nodes, self.edges, self.weeks, true, self.facilities, self.location_totals)

    @property
    def n_fac(self) -> int:
        return len(self.facilities)

    def members(self, node_id: str) -> np.ndarray:
        """Row indices of the facilities behind a hub, lab or RESU."""
        f = self.facilities
        if node_id.startswith("HUB-"):
            return np.flatnonzero(f.hub_id.to_numpy() == node_id)
        if node_id.startswith("LAB-"):
            return np.flatnonzero(f.lab_id.to_numpy() == node_id)
        if node_id.startswith("RESU-"):
            return np.flatnonzero(("RESU-" + f.region_id).to_numpy() == node_id)
        return np.flatnonzero(f.facility_id.to_numpy() == node_id)


def true_location_counts() -> pd.DataFrame:
    """Weeks x locations of the best estimate of true counts (cases_fixed, gaps interpolated)."""
    prov = read("dengue/clean/dengue_province_weekly.csv", ["week_start"])
    wide = prov.pivot(index="week_start", columns="location_id", values="cases_fixed").sort_index()
    wide = wide.interpolate(limit_direction="both").round().clip(lower=0)
    return wide


def build_world(seed: int | None = None) -> World:
    cfg = NETWORK
    rng = np.random.default_rng(cfg["WORLD_SEED"] if seed is None else seed)
    locs = read("shared/locations.csv", []).sort_values(["region_id", "location_id"]).reset_index(drop=True)
    wide = true_location_counts()[locs.location_id]
    vol = wide[wide.index < "2020-01-01"].mean()
    pct = vol.rank(pct=True)
    n_fac = (cfg["FACILITIES_MIN"] + np.round(pct * (cfg["FACILITIES_MAX"] - cfg["FACILITIES_MIN"]))).astype(int)

    nodes, edges, fac_rows = [], [], []
    for reg, g in locs.groupby("region_id", sort=True):
        resu = f"RESU-{reg}"
        nodes.append({"node_id": resu, "node_type": "resu", "location_id": None, "region_id": reg,
                      "name": f"Regional Epidemiology and Surveillance Unit {reg} (simulated)"})
        n_labs = next(k for mx, k in cfg["LABS_PER_REGION"] if len(g) <= mx)
        labs = [f"LAB-{reg}-{i + 1}" for i in range(n_labs)]
        for lab in labs:
            nodes.append({"node_id": lab, "node_type": "lab", "location_id": None, "region_id": reg,
                          "name": f"Simulated laboratory {lab[4:]}"})
            edges.append({"source": lab, "target": resu, "relationship": "reports_results_to"})
        order = rng.permutation(g.location_id.to_numpy())
        i, h = 0, 0
        while i < len(order):
            size = int(rng.integers(cfg["HUB_SIZE"][0], cfg["HUB_SIZE"][1] + 1))
            h += 1
            hub = f"HUB-{reg}-{h:02d}"
            nodes.append({"node_id": hub, "node_type": "hub", "location_id": None, "region_id": reg,
                          "name": f"Simulated reporting hub {hub[4:]}"})
            edges.append({"source": hub, "target": resu, "relationship": "forwards_reports_to"})
            for loc in order[i:i + size]:
                k = int(n_fac[loc])
                shares = rng.dirichlet(np.full(k, cfg["FACILITY_SHARE_CONCENTRATION"]))
                for j in range(k):
                    fid = f"FAC-{loc}-{j + 1}"
                    lab = labs[int(rng.integers(len(labs)))]
                    fac_rows.append({"facility_id": fid, "location_id": loc, "region_id": reg, "hub_id": hub,
                                     "lab_id": lab, "share": float(shares[j])})
                    nodes.append({"node_id": fid, "node_type": "facility", "location_id": loc, "region_id": reg,
                                  "name": f"Simulated facility {j + 1} of {loc}"})
                    edges.append({"source": fid, "target": hub, "relationship": "reports_through"})
                    edges.append({"source": fid, "target": lab, "relationship": "specimen_referral"})
            i += size
    fac = pd.DataFrame(fac_rows)
    # split each location's weekly total across its facilities (multinomial: totals preserved exactly)
    true = np.zeros((len(fac), len(wide)), dtype=float)
    for loc, idx in fac.groupby("location_id").indices.items():
        p = fac.share.to_numpy()[idx]
        tot = wide[loc].to_numpy().astype(int)
        draws = np.array([rng.multinomial(n, p) for n in tot]).T
        true[idx] = draws
    nodes = pd.DataFrame(nodes)
    counts = {n: 0 for n in nodes.node_id}
    for col in ("hub_id", "lab_id"):
        for k, v in fac[col].value_counts().items():
            counts[k] = int(v)
    for k, v in fac.region_id.value_counts().items():
        counts[f"RESU-{k}"] = int(v)
    nodes["n_facilities"] = nodes.node_id.map(counts).where(nodes.node_type != "facility", 1).astype(int)
    totals = {loc: wide[loc].to_numpy().astype(int) for loc in wide.columns}
    return World(nodes=nodes, edges=pd.DataFrame(edges), weeks=pd.DatetimeIndex(wide.index), true=true, facilities=fac,
                 location_totals=totals)


def save_world(w: World) -> None:
    NET_DIR.mkdir(parents=True, exist_ok=True)
    w.nodes.to_csv(NET_DIR / "nodes.csv", index=False, lineterminator="\n")
    w.edges.to_csv(NET_DIR / "edges.csv", index=False, lineterminator="\n")
    w.facilities.to_csv(NET_DIR / "facilities.csv", index=False, lineterminator="\n", float_format="%.6g")
    tc = pd.DataFrame(w.true.T.astype(int), index=w.weeks, columns=w.facilities.facility_id)
    tc.index.name = "week_start"
    tc.to_csv(NET_DIR / "facility_true_weekly.csv", lineterminator="\n", date_format="%Y-%m-%d")
    (NET_DIR / "README.md").write_text(
        "# Synthetic reporting network (simulated, not real)\n\n"
        "Built by `pipeline/iris_pipeline/network/build.py` (world seed in `pipeline/iris_pipeline/config.py`).\n\n"
        "- `nodes.csv`: facilities, provincial reporting hubs, laboratories and RESUs. All names are fictional.\n"
        "- `edges.csv`: facility -> hub (reports_through), facility -> lab (specimen_referral), hub/lab -> RESU.\n"
        "- `facilities.csv`: each facility's location, region, hub, lab and share of the location's cases.\n"
        "- `facility_true_weekly.csv`: true weekly counts per facility, a multinomial split of each real location's\n"
        "  cleaned dengue series. Failures are simulated on top of these by `network/simulate.py`; their ground truth\n"
        "  is written per run to `pipeline/outputs/network/`.\n\n"
        "Never mix these files with the real surveillance data.\n", encoding="utf-8")
