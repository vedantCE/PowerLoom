# Powerloom

## Product context

Powerloom is a forecast-driven energy mix optimizer for off-grid village microgrids in India.
It uses weather forecasts (Open-Meteo) to estimate solar/wind generation, then a MILP optimizer
(PuLP + CBC) computes a 48-hour hourly dispatch plan across solar, wind, battery, and diesel,
minimizing diesel cost + CO2 while never cutting critical loads. A Gemini-based explainer turns
optimizer "reason codes" into plain-language explanations (English/Gujarati/Hindi).
A React dashboard shows the plan, savings vs a naive baseline, and what-if sliders.

## Architecture

```
Open-Meteo (weather forecast)
        │
        ▼
Generation model (solar/wind estimate)
        │
        ▼
MILP optimizer (PuLP + CBC) ──► Baseline comparison (naive dispatch)
        │
        ▼
Gemini explainer (reason codes → plain language)
        │
        ▼
FastAPI (backend API)
        │
        ▼
React dashboard (plan, savings, what-if sliders)
```

## Stack summary

- **Backend**: Python 3.11+, FastAPI, SQLModel, PuLP (CBC solver), httpx, numpy, pandas,
  google-genai, pydantic-settings, pytest
- **Frontend**: Vite + React + TypeScript, Tailwind CSS v4, recharts, framer-motion, axios,
  zustand, lucide-react
- **DB**: Neon PostgreSQL (primary) via SQLModel/psycopg 3, with automatic SQLite fallback

## API Contract

- Every request/response shape is a Pydantic model in `backend/app/schemas/` (`common.py`,
  `village.py`, `optimize.py`, `explain.py`) and is mirrored 1:1 as a TypeScript type in
  `frontend/src/types/api.ts` (same snake_case field names; enums as string unions).
- **Any schema change MUST update both files in the same commit.** The frontend never
  hand-rolls a shape that diverges from the backend schema it corresponds to.

## Database

- **Neon PostgreSQL is primary.** `DATABASE_URL` in `backend/.env` should be the Neon
  *pooled* connection string (hostname contains `-pooler`). The engine is created with
  `pool_pre_ping=True` (Neon suspends idle compute and drops stale connections) plus
  `pool_size=5`, `max_overflow=5`, `pool_recycle=300`.
- **SQLite is the automatic offline fallback.** On startup (`app/db/session.py`), the app
  tests the primary `DATABASE_URL` with `SELECT 1`; if that fails it logs a warning and
  switches to `SQLITE_FALLBACK_URL` instead of crashing. `GET /api/health` reports which
  backend is active (`database`) and whether it's healthy (`database_ok`).
- **JSON columns use the JSONB variant**: `sa.JSON().with_variant(JSONB, "postgresql")`, so
  the same model works as JSONB on Postgres and JSON on SQLite.
- **Tests always use in-memory SQLite** (`sqlite:///:memory:` with `StaticPool`), forced by
  `backend/tests/conftest.py` before the app is imported. Tests must never connect to Neon.
- **Secrets live only in `backend/.env`** (gitignored) — never commit a real `DATABASE_URL`
  or `GEMINI_API_KEY`.
- Preset endpoints (`GET /api/presets`, `GET /api/presets/{id}`) read from the `VillagePreset`
  table first and transparently fall back to the JSON files in `backend/app/presets/` if the
  database is unavailable or unseeded.

## Conventions

- Time step is 1 hour; horizon is 48 hours (24 allowed).
- Units: power in kW, energy in kWh, money in INR, CO2 in kg.
- Battery SOC is stored as a fraction 0.0–1.0 internally, shown as % in the UI.
- Timezone: Asia/Kolkata.
- The LLM only explains decisions; it NEVER makes dispatch decisions.
- Optimizer code (`backend/app/optimizer/`) is pure Python functions with no FastAPI or DB
  imports — it must be testable and runnable standalone.
- All API request/response shapes are defined as Pydantic schemas in `backend/app/schemas/`
  and mirrored as TypeScript types in `frontend/src/types/`.

## How to run

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Health check: `curl http://localhost:8000/api/health`

Run tests:

```bash
cd backend
source .venv/bin/activate
pytest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on port 5173 and proxies `/api` requests to `http://localhost:8000`.
