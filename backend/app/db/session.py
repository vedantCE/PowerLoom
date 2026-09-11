import logging
from typing import Generator

from sqlalchemy import Engine, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseState:
    def __init__(self) -> None:
        self.engine: Engine | None = None
        self.backend: str = "sqlite"
        self.healthy: bool = False


db_state = DatabaseState()


def _build_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        if ":memory:" in url:
            return create_engine(url, connect_args=connect_args, poolclass=StaticPool)
        return create_engine(url, connect_args=connect_args)

    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_recycle=300,
    )


def _test_connection(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("Database connection test failed: %s", exc)
        return False


def init_engine() -> None:
    primary_url = settings.normalized_database_url
    engine = _build_engine(primary_url)

    if _test_connection(engine):
        db_state.engine = engine
        db_state.backend = "sqlite" if primary_url.startswith("sqlite") else "postgresql"
        db_state.healthy = True
        return

    logger.warning(
        "Primary database at DATABASE_URL is unavailable; falling back to SQLite at %s",
        settings.SQLITE_FALLBACK_URL,
    )
    fallback_engine = _build_engine(settings.SQLITE_FALLBACK_URL)
    fallback_ok = _test_connection(fallback_engine)
    db_state.engine = fallback_engine
    db_state.backend = "sqlite"
    db_state.healthy = fallback_ok


def init_db() -> None:
    if db_state.engine is None:
        init_engine()
    SQLModel.metadata.create_all(db_state.engine)


def get_session() -> Generator[Session, None, None]:
    if db_state.engine is None:
        init_engine()
    with Session(db_state.engine) as session:
        yield session


def database_status() -> tuple[str, bool]:
    if db_state.engine is None:
        init_engine()
    else:
        db_state.healthy = _test_connection(db_state.engine)
    return db_state.backend, db_state.healthy
