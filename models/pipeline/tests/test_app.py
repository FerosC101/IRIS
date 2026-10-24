"""The dashboard loads every page without an error, and the plan page re-solves when the slider moves."""

from pathlib import Path

import pytest

from iris_pipeline.paths import MODEL_A_V2_DIR, OUT_DIR

APP = Path(__file__).resolve().parents[1] / "app" / "streamlit_app.py"
PAGES = ["1 · Reporting completeness", "2 · Priority list", "3 · Network (simulated)", "4 · Intervention plan",
         "5 · Simulated recovery", "Results"]


@pytest.fixture(scope="module")
def app(inputs):
    if not (MODEL_A_V2_DIR / "scores_v2.csv").exists() or not (OUT_DIR / "results" / "RESULTS.md").exists():
        pytest.skip("run `python -m iris_pipeline all` first")
    from streamlit.testing.v1 import AppTest

    at = AppTest.from_file(str(APP), default_timeout=180)
    at.run()
    assert not at.exception, at.exception
    return at


@pytest.mark.parametrize("page", PAGES)
def test_page_renders(app, page):
    app.sidebar.radio[0].set_value(page).run()
    assert not app.exception, app.exception
    assert app.info, "every page shows the limits banner"
    assert "leads for surveillance staff to verify" in app.info[0].value


def test_plan_slider_resolves(app):
    app.sidebar.radio[0].set_value("4 · Intervention plan").run()
    used = lambda: float(app.metric[2].value.split("/")[0])  # noqa: E731
    app.slider[0].set_value(8).run()
    assert not app.exception
    low = used()
    app.slider[0].set_value(48).run()
    assert not app.exception
    assert low <= 8 and used() <= 48 and used() >= low
