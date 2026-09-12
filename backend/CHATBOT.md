# Powerloom Energy Optimization Assistant (AI Chatbot)

The **Powerloom Energy Optimization Assistant** is a backend service powered by Google Gemini (using `GEMINI_API_KEY_1`) and grounded in the live microgrid state, MILP optimizer outputs, hourly dispatch schedules, baseline comparisons, and energy KPIs.

---

## 1. Overview & Architecture

```
User Query (e.g., "Why is diesel off right now?")
                       │
                       ▼
               POST /api/chat
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│               ChatService & Context Builder            │
│  - Village Microgrid Config (PV, Wind, BESS, Diesel)   │
│  - Current Operating State (Demand, Solar, SOC, etc.)  │
│  - 48-Hour Full Dispatch Schedule & Reason Codes       │
│  - Performance KPIs (Cost, Fuel, Clean Uptime, CO2)    │
│  - Baseline Comparison (Naive vs Cycle Charging)       │
└────────────────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│             Gemini Client (google-genai)               │
│  - Model: gemini-2.5-flash                             │
│  - Strict API Key: GEMINI_API_KEY_1                    │
│  - Anti-Hallucination & Decision Explainer Prompts     │
└────────────────────────────────────────────────────────┘
                       │
                       ▼
            Grounded ChatResponse
```

---

## 2. API Key Configuration

The chatbot uses **strictly** `GEMINI_API_KEY_1` loaded from `backend/.env`.

- **Key Variable**: `GEMINI_API_KEY_1`
- **Isolation**: The chatbot will **not** fall back to `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, or any other key.
- If `GEMINI_API_KEY_1` is missing or empty, the API returns a `503 Service Unavailable` with a clear configuration message.
- API keys are never exposed in responses or logs.

Example `backend/.env`:
```env
GEMINI_API_KEY_1=your_gemini_api_key_here
```

---

## 3. Chat Endpoint Specification

### `POST /api/chat`

#### Request Schema (`ChatRequest`)

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | User question (1–2000 chars, non-empty) |
| `village_id` | string | No | Preset ID (default: `"dang_village"`) |
| `run_id` | string | No | ID of an existing `ScenarioRun` (if asking about a past run) |
| `horizon_hours` | int (24 or 48) | No | Simulation horizon (default: `48`) |
| `overrides` | WhatIfOverrides | No | Optional what-if parameters (cloud cover, diesel price, etc.) |
| `history` | list[ChatMessage] | No | Previous conversation turns (max 20) |

#### ChatMessage Schema
```json
{
  "role": "user",
  "content": "Why is diesel running at 6 PM?"
}
```

#### Response Schema (`ChatResponse`)
```json
{
  "message": "At 6:00 PM (Hour 18), diesel generator is turned ON at 6.5 kW to meet peak evening village demand because solar generation has ended and battery discharge is restricted to maintain the 20% safety reserve.",
  "village_id": "dang_village",
  "run_id": null,
  "sources_used": [
    "site_microgrid_config",
    "current_operating_state",
    "hourly_dispatch_schedule",
    "performance_kpis",
    "baseline_comparison",
    "decision_reason_codes"
  ]
}
```

---

## 4. Context Assembly Details

The context builder (`app.services.chat.context.build_powerloom_context`) dynamically extracts:
1. **Site Specifications**: Installed solar PV (kW), wind (kW), battery capacity (kWh), battery charge/discharge power limits (kW), SOC safety limits (min/max/initial), diesel generator capacity (kW) and min-load fraction (30%), fuel pricing, emissions factor.
2. **Current State (Hour 0)**: Live demand, critical load, solar generation, battery SOC %, charge/discharge power, diesel ON/OFF status, load shed.
3. **Optimized KPIs**: Total cost (INR), fuel cost (INR), diesel fuel consumption (L), diesel operating hours, CO2 emissions (kg), clean uptime %, critical power security %.
4. **Baseline Comparisons**: Direct savings vs. Naive dispatch (load-following operator practice) and Cycle Charging.
5. **Full Hourly Dispatch Table**: All 24 or 48 hours containing generation, battery flow, SOC, diesel dispatch, and reason codes (e.g., `PRECHARGE_FOR_FORECAST_DEFICIT`, `SOLAR_SURPLUS_CHARGING`, `EVENING_PEAK_DISCHARGE`).
6. **Key Milestones**: Diesel operating hours, lowest battery SOC hour, peak demand hour, peak solar hour.

---

## 5. Example API Requests

### Example 1: Basic Question about Current State
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the current battery SOC and is diesel running?",
    "village_id": "dang_village"
  }'
```

### Example 2: Question about Optimization Savings
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How much money and fuel did Powerloom save compared to naive dispatch?",
    "village_id": "dang_village"
  }'
```

### Example 3: Multi-turn Follow-up
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How much fuel does that consume?",
    "village_id": "dang_village",
    "history": [
      {"role": "user", "content": "Why is diesel running at 6 PM?"},
      {"role": "assistant", "content": "At 6 PM, diesel is turned on at 6.5 kW to meet evening peak demand."}
    ]
  }'
```

---

## 6. Running Tests

### Run Unit Tests
```bash
cd backend
source .venv/bin/activate
pytest tests/test_chat.py -v
```

### Run Live Gemini Integration Tests (using `GEMINI_API_KEY_1`)
```bash
cd backend
source .venv/bin/activate
pytest tests/test_chat_live.py -v -s
```

### Run Full Backend Test Suite
```bash
cd backend
source .venv/bin/activate
pytest
```
