import pulp
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    solver_available = bool(pulp.listSolvers(onlyAvailable=True))
    return {
        "status": "ok",
        "app": "powerloom",
        "version": "0.1.0",
        "solver_available": solver_available,
    }
