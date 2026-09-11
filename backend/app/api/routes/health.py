import pulp
from fastapi import APIRouter

from app.db.session import database_status

router = APIRouter()


@router.get("/health")
def health() -> dict:
    solver_available = bool(pulp.listSolvers(onlyAvailable=True))
    backend, healthy = database_status()
    return {
        "status": "ok",
        "app": "powerloom",
        "version": "0.1.0",
        "solver_available": solver_available,
        "database": backend,
        "database_ok": healthy,
    }
