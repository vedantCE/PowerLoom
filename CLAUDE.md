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
- **Any schema change MUST update both files in the same commit.**
- **The contract is frozen**: NEVER edit `frontend/src/types/api.ts` without a corresponding
  backend schema change in `backend/app/schemas/`.
- The frontend never hand-rolls a shape that diverges from the backend schema it corresponds to.
- Internal service-layer models (e.g. the forecast models below) are **not** part of this
  contract.

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

## Forecast Service

`backend/app/services/forecast/` fetches hourly weather for a village location and **NEVER
fails**. Resolution order: **Open-Meteo → DB cache → synthetic fallback**.

1. A fresh `ForecastCache` row (fetched < 60 min ago) that covers the requested window is
   used directly (`source = CACHE`), with no network call.
2. Otherwise Open-Meteo is called; on success the result replaces the cache row for that
   (lat, lon) and is returned (`source = OPEN_METEO`).
3. If Open-Meteo fails, any cache row younger than 24 h that covers the window is used
   (`source = CACHE`, logged as stale).
4. Otherwise a deterministic synthetic forecast (NOAA-style solar elevation + Haurwitz
   clear-sky + Kasten–Czeplak cloud attenuation) is returned (`source = SYNTHETIC`), and a
   warning is logged.

Additional rules:

- **Cache TTLs**: 60 minutes fresh, 24 hours stale-but-usable.
- If the DB is unavailable, caching is skipped silently — this never blocks a forecast.
- **Cloud override formula**: `apply_weather_overrides(forecast, cloud_cover_pct)` recomputes
  `ghi = clearsky_ghi * (1 - 0.75 * (cloud_cover_pct / 100) ** 3.4)` (Kasten–Czeplak) for every
  hour, scales `gti` by the same ratio, sets `cloud_cover_pct` and `is_overridden=True`, and
  returns a **new** `WeatherForecast` — it never mutates the input.
- **Forecast models are internal**: `HourlyWeather` / `WeatherForecast`
  (`backend/app/services/forecast/models.py`) are plain service-layer models, not part of the
  frontend API contract in `backend/app/schemas/`. The debug endpoint
  (`GET /api/debug/forecast/{village_id}`, tagged `debug`) exposes them for backend
  development only; whether to promote it to a stable contract is a future decision.

## Demand Model

`backend/app/services/demand/` builds an hourly village load profile bottom-up from appliance-
level components, following the RAMP methodology (https://github.com/RAMP-project/RAMP:
quantity x rated power x usage windows x usage factor, with controlled randomness) but
simplified for speed and determinism — RAMP is **not** a dependency, and `build_demand_profile`
must build a 48-hour profile in milliseconds with identical inputs always giving identical output.

- **Allowed `DemandComponent.category` values**: `household_lighting`, `household_appliance`,
  `cooling`, `health`, `water`, `school`, `commercial`, `street_lighting`. Every preset in
  `backend/app/presets/` must use only these. `health` and `water` components are always
  `critical=true`; every other category is `critical=false`.
- **Per-hour calculation** (`build_demand_profile(village, forecast, seed=None)`):
  1. Base power = `quantity * rated_w / 1000 * usage_factor` (kW) when the local hour falls in
     one of the component's schedule windows.
  2. **Window jitter**: for non-critical components, each schedule window's start/end is shifted
     by a random integer in `{-1, 0, +1}` hours, drawn once per component per calendar day
     (RAMP-like). A shifted window can spill up to 1 hour across midnight in either direction —
     handled by checking window instances anchored at the previous/current/next calendar day.
  3. **Partial-hour ramp**: the first and last hour of an (already-jittered) window run at 50%
     power so profiles are smooth, not blocky.
  4. **Temperature coupling** (category `cooling` only): multiplied by
     `clamp(1 + 0.04 * (temp_c - 28), 0.4, 1.6)` using that hour's forecast temperature.
  5. **Street lighting**: bypasses the schedule entirely — ON only when
     `forecast.clearsky_ghi_wm2 == 0` (dark) for that hour, regardless of any configured window.
  6. **Hourly noise**: one shared multiplicative draw per hour for all non-critical categories
     (`Normal(1.0, 0.07)`, clipped to `[0.85, 1.15]`) and a separate draw for all critical
     categories (`Normal(1.0, 0.03)`, same clip range).
  7. **Deterministic seeding**: `numpy.random.default_rng(seed)`; if `seed` is `None` it is
     derived from a hash of `(village.id, start_date)`, so identical inputs always reproduce the
     same profile.
- **Sanity checks** (`backend/app/services/demand/checks.py`,
  `check_system_adequacy(village, demand_profile)`) return **warnings only** (never raise):
  evening peak outside 60–95% of diesel capacity, peak demand exceeding diesel + battery max
  discharge, and critical demand peak exceeding diesel capacity alone.
- **`OptimizationInputs`** (`backend/app/services/pipeline.py`) is the **only** object the MILP
  optimizer consumes — it bundles the effective village config, timestamps, demand/critical/
  noncritical/solar/wind arrays, forecast metadata, and adequacy warnings, and has a
  `validate()` that checks array lengths and rejects NaN/negative values.

## Optimizer

`backend/app/optimizer/` is the core MILP dispatch optimizer. It is **pure Python** — no
FastAPI, DB, or HTTP imports — so it takes an `OptimizationInputs` bundle and returns a plain
`DispatchResult` and can be tested/run standalone. Time step is 1 hour, so kW and kWh are
numerically equal per step; all energy accounting is at the battery terminals (efficiency
losses apply on charge and discharge).

`solve_dispatch(inputs, fast=False, time_limit_s=None)` (`backend/app/optimizer/milp.py`) builds
a PuLP/CBC model with these variables for every hour `t`:

- `solar_used[t] ∈ [0, solar_available[t]]`, `wind_used[t] ∈ [0, wind_available[t]]`, `curtail[t] ≥ 0`
- `charge[t] ∈ [0, max_charge_kw]`, `discharge[t] ∈ [0, max_discharge_kw]`
- `soc_kwh[t] ∈ [capacity·soc_min, capacity·soc_max]` (energy at END of hour `t`)
- `diesel[t] ∈ [0, diesel.capacity_kw]`, `diesel_on[t]` binary
- `shed[t] ∈ [0, noncritical_kw[t]]` — **critical load can never be shed** (unless relaxed, below)
- `charge_on[t]` binary (prevents simultaneous charge/discharge)

Constraints for every `t`:

1. **Power balance**: `solar_used + wind_used + discharge + diesel == demand − shed + charge`
2. **Renewable accounting**: `solar_used + wind_used + curtail == solar_available + wind_available`
3. **Battery dynamics**: `soc_kwh[t] == soc_prev + eff_charge·charge[t] − discharge[t]/eff_discharge`
   (`soc_prev = capacity·soc_initial` for `t=0`, else `soc_kwh[t-1]`)
4. **No simultaneous charge/discharge**: `charge[t] ≤ max_charge_kw·charge_on[t]`,
   `discharge[t] ≤ max_discharge_kw·(1 − charge_on[t])`
5. **Diesel operating range**: `diesel[t] ≥ capacity·min_load_frac·diesel_on[t]`,
   `diesel[t] ≤ capacity·diesel_on[t]`
6. If `inputs.diesel_available` is `False`: `diesel_on[t] == 0` for all `t`.
7. **Terminal condition**: `soc_kwh[T-1] ≥ capacity·soc_initial` — the plan may never borrow
   energy from the next day.

**Objective** (minimise the sum over `t`): fuel cost
(`fuel_price · (fuel_intercept_l_per_h_per_kw · capacity_kw · diesel_on[t] + fuel_slope_l_per_kwh · diesel[t])`)
+ CO2 penalty (`co2_penalty_inr_per_kg · co2_kg_per_l ·` the same litres expression) + battery
wear (`wear_cost_inr_per_kwh · (charge[t] + discharge[t]) / 2`) + shed penalty
(`shed_penalty_inr_per_kwh · shed[t]`). **The fuel intercept is a no-load cost paid whenever the
generator is ON** regardless of output — this is what makes long, lightly-loaded diesel running
expensive and is the key economic insight the optimizer exploits (short, efficiently-loaded
diesel runs beat long idling ones).

- **Feasibility safeguard**: because `shed[t]` is capped at `noncritical_kw[t]`, the model can be
  infeasible if critical demand in some hour exceeds solar + wind + diesel + battery max
  discharge combined. A pre-check (`_needs_critical_relaxation`) detects this, logs a warning,
  and relaxes `shed[t]`'s upper bound to `demand_kw[t]` with a 10x shed penalty so the solver
  always returns a plan; this is recorded as `DispatchResult.relaxed_critical`.
- **Solver tuning / fast mode**: the diesel on/off and battery charge/discharge binaries give CBC
  a weak LP relaxation, so proving strict optimality on a 48-hour preset can take 10+ seconds on
  one thread. `PULP_CBC_CMD` always runs with `threads=min(os.cpu_count(), 8)`. `fast=False`
  (the default full-quality run) uses `gapRel=0.01` and a 20 s time limit; `fast=True`
  (slider-driven what-if runs, which must feel instant) uses `gapRel=0.05` and a 5 s time limit.
  If the solver status is not `Optimal`, `DispatchResult.infeasible=True` and whatever values
  exist are still returned — `solve_dispatch` never raises on a solver failure.
- **Result cache**: `solve_dispatch` keeps an in-process LRU cache (`maxsize=64`) keyed by a
  SHA-256 hash of the effective village config, horizon, start hour, the demand/critical/
  noncritical/solar/wind arrays (rounded to 3 decimals), `diesel_available`, and the `fast` flag
  — so re-running an identical scenario (e.g. a what-if slider snapping back to a previously-seen
  value) returns the cached `DispatchResult` instantly instead of re-solving.
- `format_solver_status(status, gap_rel)` turns e.g. `"Optimal"` into `"Optimal (gap 1.0%)"` for
  `SolverInfo.status` — this is CBC's *configured* gap tolerance (the guarantee it solved to),
  not a re-derived exact achieved gap, since PuLP doesn't expose CBC's internal bound without
  parsing solver logs.
- **`verify_dispatch(inputs, result, skip_terminal_soc=False)`** (`backend/app/optimizer/verify.py`)
  is a pure post-hoc checker (no FastAPI/DB imports) used by tests and the debug endpoint — it
  re-derives power balance, renewable accounting, SOC bounds/dynamics, diesel operating range,
  the shed bound, and (unless skipped) the terminal SOC condition from the result, and returns a
  list of violation strings. **Every `DispatchResult` produced by `solve_dispatch` must pass
  `verify_dispatch` with zero violations**; baselines (below) legitimately don't guarantee the
  terminal SOC condition, so callers checking one pass `skip_terminal_soc=True`.
- `DispatchHour` / `DispatchResult` (`backend/app/optimizer/models.py`) are internal models, not
  part of the frontend API contract.

## Baselines

`backend/app/optimizer/baselines.py` simulates two rule-based strategies hour-by-hour with the
same physics as the MILP (efficiencies, SOC limits, diesel min load) but **no forecast
look-ahead** — they are the "what would happen without the optimizer" comparison, and both
return a `DispatchResult` (`status="Simulated"`, `objective_value=None`).

- **`naive_dispatch`** (`strategy="naive"`): load-following, how operators run these systems
  today. Per hour: serve demand with renewables first (surplus charges the battery up to
  `max_charge_kw`/`soc_max`, remainder curtailed); any deficit discharges the battery down to
  `soc_min`; any deficit still remaining runs diesel clamped up (not down) to `min_load_frac` and
  up to capacity, with any excess above the deficit first freeing up battery headroom by
  reducing the discharge just committed, then charging the battery with what's left, and only
  truly wasting (curtailing) whatever still doesn't fit; any deficit that's still unmet sheds
  non-critical load first, then critical only if unavoidable. Never pre-charges.
- **`cycle_charging_dispatch`** (`strategy="cycle_charging"`): identical to naive, except
  whenever diesel turns on it targets covering the deficit **and** charging the battery at max
  rate (clamped to capacity), avoiding naive's inefficient low-load diesel running.
- Both are simulated forward with a single running SOC — no MILP, no PuLP — so they're
  effectively free to compute (sub-millisecond for a 48 h horizon).

## Metrics

`backend/app/optimizer/metrics.py` turns any `DispatchResult` (optimized or baseline) into the
API's `PlanSummary`/`Savings` schemas, so all three strategies can be compared apples-to-apples.

- **`compute_summary(inputs, result) -> PlanSummary`**: per hour, diesel litres are
  `fuel_intercept_l_per_h_per_kw · capacity_kw` (only when `diesel_on`) `+ fuel_slope_l_per_kwh ·
  diesel_kw`; `fuel_cost_inr`, `co2_kg` follow directly. `total_cost_inr` sums the same four terms
  as the MILP objective (fuel + CO2 penalty + battery wear + shed penalty) **plus one more: a
  terminal-SOC shortfall penalty**, `max(0, initial_soc_kwh − final_soc_kwh) ·
  shed_penalty_inr_per_kwh`. The MILP is hard-constrained to end at or above its initial SOC (see
  the Optimizer section's terminal condition), so this term is always exactly 0 for an optimized
  result — it never affects the objective-agreement check below. A baseline has no such
  constraint and can end lower, effectively spending down stored energy for free; without pricing
  that shortfall, comparing raw costs would unfairly favor a baseline that ends with a more
  depleted battery. **The optimizer's `objective_value` and `compute_summary`'s `total_cost_inr`
  must agree within 1%** for the optimized result — this is asserted directly in
  `test_metrics.py`.
- **`compute_savings(optimized, baseline, strategy) -> Savings`**: straight differences
  (`baseline − optimized`) for cost, diesel hours/litres, and CO2. Values are never clamped —
  a negative saving is a valid, meaningful result — and cost-percent guards against a zero-cost
  baseline.

## Reason codes

`backend/app/optimizer/reasons.py`'s `assign_reason_codes(inputs, result)` fills in
`DispatchHour.reason_codes` for the **optimized** plan only (baselines aren't explained — the LLM
only explains the optimizer's decisions, never makes them). Every hour gets 1–3 codes from
`app.schemas.common.ReasonCode`, in priority order (most interesting/important first):
`PRECHARGE_FOR_FORECAST_DEFICIT` (charging *and* diesel-on *and* the next 12 hours' forecast
renewable energy is below 60% of demand — the one genuine look-ahead behaviour, and the most
important code for the demo), `DIESEL_EFFICIENT_LOADING`, `RENEWABLES_COVER_DEMAND`,
`DIESEL_CHARGING_BATTERY`, `EVENING_PEAK_DISCHARGE` (17:00–22:59), `SOLAR_SURPLUS_CHARGING`,
`NONCRITICAL_LOAD_SHED`, `SOC_AT_MINIMUM` (within 2 points of `soc_min`),
`CURTAILMENT_BATTERY_FULL` (within 2 points of `soc_max`). If nothing matches, it falls back to
whichever of renewables/discharge/diesel supplied the most power that hour.

## Frontend

- **Sync 1 (frontend↔backend integration) is done.** The frontend runs against the real
  FastAPI backend by default (`VITE_USE_MOCK=false` in `frontend/.env.example` and
  `frontend/.env`). The contract audit found zero mismatches between `backend/app/schemas/*.py`
  and `frontend/src/types/api.ts`. `POST /api/explain` is not implemented on the backend yet
  (next backend phase); `ExplainBox` automatically falls back to the offline template-based
  explanation generator (`buildTemplateExplanation` in `src/mocks/mockApi.ts`, shared with mock
  mode) when the real endpoint errors, and shows a small "offline explanation" note.
- **Mock Mode**: When `VITE_USE_MOCK=true` in `frontend/.env`, all API client functions route
  to `src/mocks/mockApi.ts` with 400–800 ms simulated latency and use
  `src/mocks/optimize-response.json` and `src/mocks/presets.json`. Switching to the live
  backend requires ONLY changing `VITE_USE_MOCK=false`. Mock mode remains available for offline
  frontend work and is unaffected by the Sync 1 change.
- **Shared Colour Palette**: `src/theme/colors.ts` is the single source of truth for energy
  source colours. All charts, timelines, and flow diagrams must use this palette:
  - Solar → amber
  - Wind → sky / cyan
  - Battery → emerald
  - Diesel → slate / rose
  - Demand → indigo
  - Curtailed → light grey
  - Load shed → red
- **Chart data**: `src/utils/chartData.ts` is the ONLY place that transforms API data for
  charts. Battery charging is plotted as **negative** (below the zero axis).
- **State**: The `compareBaseline` toggle lives in the zustand store (`useAppStore`).

- **i18n**: Multi-language support (English, Gujarati, Hindi) is centralized in
  `src/i18n/strings.ts` and consumed via the `useT()` hook. Explanations from `explain()` also
  support all three languages.
- **Component Convention**: Place components in `src/components/<Name>/<Name>.tsx`, one
  component per file.
- **API types**: Only from `frontend/src/types/api.ts` — see [API Contract](#api-contract).

### What-if Simulator (Phase 4.3)

- **Overrides flow**: a control in `src/components/WhatIfPanel/` calls `store.setOverride()` (or
  `store.applyScenario()` for the quick-scenario chips), which updates `store.overrides`
  immediately (UI stays responsive) and schedules `store.runOptimize()` after a 400 ms debounce.
  Only the field(s) that differ from the preset default are ever present in `overrides` — a
  control writes `undefined` to delete its key when the user returns it to the default value, so
  `Object.keys(overrides).length === 0` reliably means "default plan".
- **`baselineRun`**: the store also holds the result of the same village/horizon with **no**
  overrides, refetched by `runBaseline()` whenever the village or horizon changes. It exists
  purely so `ImpactSummary` can show deltas ("+₹1,068 vs default") without re-deriving a baseline
  from scratch or calling the API twice per render.
- **Quick scenario chips** (`ScenarioChips.tsx`): Cloudy tomorrow (`cloud_cover_pct: 90`), Diesel
  ₹120 (`diesel_price_inr_per_l: 120`), +10 kW solar (`extra_solar_kw: 10`), Bigger battery
  (`extra_battery_kwh: 50`), Generator failure (`diesel_available: false`), and Reset (clears all
  overrides). Manually moving a slider clears the active chip highlight.
- **`src/mocks/mockWhatIf.ts` is mock-only**: it re-derives plausible hourly dispatch + summary
  numbers from the static fixture so the panel is demoable without a backend. It is wired in only
  from `mockApi.optimize()` and must never be imported by, or influence, real-backend code paths.

### Energy Flow diagram (Phase 4.4)

- **Single-hour view**: `src/components/EnergyFlow/EnergyFlow.tsx` reads
  `result.hourly[selectedHour]` from the store (falling back to hour 0) — it never looks at more
  than one hour at a time.
- **`flowLinks.ts` is the only place** that maps an `HourlyDispatch` into the diagram's link
  values (solar/wind/diesel → village or battery, battery → village, curtailed, shed). It resolves
  two schema gaps deterministically: battery charge is attributed to solar/wind first and any
  remainder to diesel (never shown as an impossible negative flow), and `battery.mode` always
  picks a single charging/discharging/idle direction even on the rare hour where the fixture has
  both `battery_charge_kw` and `battery_discharge_kw` non-zero.
- **Playback** (`PlaybackBar.tsx`) drives `store.selectHour()` on a timer — it does not keep its
  own copy of "which hour is showing". Playback play/pause/speed live in the store
  (`playbackPlaying`, `playbackSpeed`) rather than component state, specifically so the global
  `Space` keyboard shortcut can control it from anywhere in the app.

### Explain panel, run history, presentation mode (Phase 4.5)

- **Explanation cache key**: `explanationCacheKey(run_id, hour_index, language)` (in
  `store/useAppStore.ts`) is the cache key for `store.explanationCache`. `ExplainBox` checks this
  cache before calling `explain()`, so revisiting an hour/language pair already fetched is
  instant. The typing/streaming reveal (`useTypewriter`) separately remembers which exact
  explanation *strings* it has already animated, so a cache hit never re-types.
- **Run history restore**: every successful `runOptimize()` unshifts a `RunHistoryEntry`
  (`{ overrides, result, baselineRun, ... }`) onto `store.runHistory` (max 10, newest first) — this
  is a frontend-only convenience type, not part of the API contract. `restoreRun(id)` replays an
  entry's `overrides`/`result`/`baselineRun` straight into the store and does **not** call
  `optimize()` again.
- **Presentation mode**: `store.presentationMode` hides the sidebar (What-if panel + run history),
  widens the main content column, and scales `document.documentElement`'s font size to 115% (so
  Tailwind's rem-based utility classes cascade). Toggle via the header button or the `P` shortcut.
- **Keyboard shortcuts** (`src/hooks/useKeyboardShortcuts.ts`, mounted once in `App.tsx`): `Space`
  play/pause the energy flow, `←`/`→` step the selected hour, `1`/`2`/`3` switch language, `R`
  re-runs, `P` toggles presentation mode, `?` opens the shortcuts overlay. All are disabled while
  focus is inside an input/textarea/select/contenteditable element.
- **Dev-only response validator** (`src/api/validate.ts`): `logValidationWarnings()` is called
  from `store.runOptimize()` and only runs anything when `import.meta.env.DEV` is true. It checks
  `hourly.length === horizon_hours`, per-hour power balance within 0.01 kW, and `soc` within
  `[0, 1]`, logging a single `console.warn` listing every violation — this is meant to catch
  backend contract drift immediately once the real backend is connected, not to run in production.

## Conventions

- Time step is 1 hour; horizon is 48 hours (24 allowed).
- Units: power in kW, energy in kWh, money in INR, CO2 in kg.
- Battery SOC is stored as a fraction 0.0–1.0 internally, shown as % in the UI.
- Timezone: Asia/Kolkata.
- The LLM only explains decisions; it NEVER makes dispatch decisions.
- Optimizer code (`backend/app/optimizer/`) is pure Python functions with no FastAPI or DB
  imports — it must be testable and runnable standalone.
- All API request/response shapes are Pydantic schemas in `backend/app/schemas/`, mirrored
  1:1 in `frontend/src/types/api.ts`.

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

Health check:

```bash
curl http://localhost:8000/api/health
```

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
To run the frontend without the backend, set `VITE_USE_MOCK=true` in `frontend/.env`.