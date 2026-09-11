# Powerloom

Forecast-driven energy mix optimizer for off-grid village microgrids in India. Uses weather
forecasts to estimate solar/wind generation, runs a MILP optimizer to produce a 48-hour dispatch
plan across solar, wind, battery, and diesel, and explains the plan in plain language via Gemini.

See [CLAUDE.md](./CLAUDE.md) for full product context, architecture, and conventions.

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
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` requests to the backend on port 8000,
so start the backend first (or alongside).

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
