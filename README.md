# Powerloom

Forecast-driven energy mix optimizer for off-grid village microgrids in India. Uses weather
forecasts to estimate solar/wind generation, runs a MILP optimizer to produce a 48-hour dispatch
plan across solar, wind, battery, and diesel, and explains the plan in plain language via Gemini.


## Prerequisites

- Python 3.11+
- Node.js 18+ and npm

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in GEMINI_API_KEY if needed
uvicorn app.main:app --reload --port 8000
```

Verify it's running:

```bash
curl http://localhost:8000/api/health
```

Run the test suite:

```bash
source .venv/bin/activate
pytest
```

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env    # VITE_USE_MOCK=false by default — talks to the real backend
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` requests to the backend on port 8000,
so start the backend first (or alongside).

## Running both servers together

The frontend runs against the real backend by default (`VITE_USE_MOCK=false`). To use the app
end-to-end:

```bash
# Terminal 1 — backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

Then open http://localhost:5173. The header shows a "Live Backend" badge (with the active
database — `postgresql` or `sqlite`) once the first optimization run completes.

If you want to work on the UI without a backend running (e.g. offline, or the backend isn't
ready yet), set `VITE_USE_MOCK=true` in `frontend/.env` and restart `npm run dev` — every API
call is served from the static fixtures in `frontend/src/mocks/`, and the header shows a
"Mock Data" badge instead.

Note: `POST /api/explain` is not implemented on the backend yet. Against the real backend, the
Optimizer Decision Explainer panel automatically falls back to the same offline template-based
explanation generator mock mode uses, with a small "offline explanation" note — this is expected
until the Gemini-based explainer backend phase lands.

## Project structure

```
powerloom/
├── backend/           # FastAPI + PuLP/CBC optimizer + SQLModel
│   └── app/
│       ├── api/routes/    # API endpoints
│       ├── core/          # config/settings
│       ├── db/            # database session/engine
│       ├── models/        # SQLModel tables
│       ├── schemas/       # Pydantic request/response schemas
│       ├── services/      # forecast, generation, demand logic
│       ├── optimizer/     # MILP dispatch optimizer + baselines
│       ├── explainer/     # Gemini-based plain-language explainer
│       └── presets/       # village preset JSON files
└── frontend/           # Vite + React + TypeScript + Tailwind CSS v4
    └── src/
        ├── api/            # API client
        ├── types/          # TypeScript types (mirrors backend schemas)
        ├── store/          # zustand state stores
        ├── components/     # reusable UI components
        └── pages/          # page-level views
```
