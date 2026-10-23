import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="iris-test-"))
os.environ["IRIS_DB_PATH"] = str(_tmp / "test.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from iris.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def fresh(client):
    """Reset the demo database before a test that mutates it."""
    r = client.post("/api/demo/reset", json={"confirm": "RESET"})
    assert r.status_code == 200
    return client


def as_user(user_id: str) -> dict:
    return {"X-IRIS-User": user_id}
