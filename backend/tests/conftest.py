import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import db_state, init_db, init_engine
from app.main import app


@pytest.fixture(autouse=True, scope="session")
def _test_database():
    init_engine()
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    with Session(db_state.engine) as session:
        yield session
