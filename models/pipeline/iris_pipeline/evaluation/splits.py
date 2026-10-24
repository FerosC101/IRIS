"""The shared split (roadmap step 1): train 2016-2018, tune 2019, test 2020."""

from __future__ import annotations

import pandas as pd

from ..config import SPLIT

TRAIN_YEARS = list(range(SPLIT["train"][0], SPLIT["train"][1] + 1))
TUNE_YEAR = SPLIT["tune"]
TEST_YEAR = SPLIT["test"]


def part(dates: pd.Series) -> pd.Series:
    y = pd.to_datetime(dates).dt.year
    return pd.Series(pd.NA, index=dates.index, dtype="object").mask(y.isin(TRAIN_YEARS), "train") \
        .mask(y == TUNE_YEAR, "tune").mask(y == TEST_YEAR, "test")


def is_year(dates: pd.Series, year: int) -> pd.Series:
    return pd.to_datetime(dates).dt.year == year
