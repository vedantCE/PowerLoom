import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.api.routes import debug, explain, health, optimize, presets, runs
from app.core.config import settings
from app.db.seed import seed_presets
from app.db.session import db_state, init_db, init_engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine()
    init_db()
    try:
        with Session(db_state.engine) as session:
            seed_presets(session)
    except Exception as exc:
        logger.warning("Preset seeding skipped: %s", exc)
    yield


app = FastAPI(title="Powerloom", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(presets.router, prefix="/api")
app.include_router(optimize.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(debug.router, prefix="/api")
app.include_router(explain.router, prefix="/api")
