from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health
from app.core.config import settings

app = FastAPI(title="Powerloom", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
