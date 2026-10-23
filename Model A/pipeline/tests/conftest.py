import sys
import warnings
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
warnings.filterwarnings("ignore")


@pytest.fixture(scope="session")
def inputs():
    from iris_pipeline import data
    from iris_pipeline.paths import DATA_DIR

    if not (DATA_DIR / "dengue" / "clean" / "dengue_province_weekly.csv").exists():
        pytest.skip("clean data not present (not in git); rebuild with MODEL A/scripts/clean_*.py")
    return data.load()
