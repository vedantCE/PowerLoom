import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient

from app.db.session import init_db, init_engine
from app.main import app


@pytest.fixture(autouse=True, scope="session")
def _test_database():
    init_engine()
    init_db()


@pytest.fixture
def client():
    return TestClient(app)
