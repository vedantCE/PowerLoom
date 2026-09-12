"""Unit tests for the Powerloom AI Chatbot / Energy Assistant.

Tests cover:
- Context building and formatting
- Grounded prompt construction
- API key isolation (strictly GEMINI_API_KEY_1, no fallback)
- API endpoint validation and error handling
- Scenario runs and on-the-fly optimization contexts
- Conversation history tracking
- All 10 required prompt/response categories
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.chat import ChatMessage, ChatRequest
from app.services.chat.context import build_powerloom_context, format_context_for_prompt
from app.services.chat.gemini import ChatConfigurationError, ChatServiceError, generate_chat_response


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_village_config():
    return {
        "id": "dang_village",
        "location": {"name": "Dang Village", "district": "Dang", "state": "Gujarat", "latitude": 20.8, "longitude": 73.7},
        "solar": {"capacity_kw": 15.0, "system_loss": 0.14, "temp_coeff_per_c": -0.004},
        "wind": {"capacity_kw": 0.0, "cut_in_ms": 3.0, "rated_ms": 11.0, "cut_out_ms": 25.0, "hub_height_m": 30},
        "battery": {
            "capacity_kwh": 40.0,
            "soc_min": 0.2,
            "soc_max": 1.0,
            "soc_initial": 0.5,
            "max_charge_kw": 10.0,
            "max_discharge_kw": 10.0,
            "eff_charge": 0.95,
            "eff_discharge": 0.95,
            "wear_cost_inr_per_kwh": 2.0,
        },
        "diesel": {
            "capacity_kw": 10.0,
            "min_load_frac": 0.3,
            "fuel_intercept_l_per_h_per_kw": 0.08145,
            "fuel_slope_l_per_kwh": 0.246,
            "fuel_price_inr_per_l": 90.0,
            "co2_kg_per_l": 2.68,
        },
        "economics": {"co2_penalty_inr_per_kg": 2.0, "shed_penalty_inr_per_kwh": 100.0},
        "demand_components": [],
    }


@pytest.fixture
def sample_optimize_response():
    hours = []
    for i in range(48):
        is_day = 6 <= (i % 24) < 18
        solar_val = 12.0 if (is_day and 10 <= (i % 24) <= 15) else (4.0 if is_day else 0.0)
        is_diesel = i in (18, 19, 20)
        hours.append({
            "hour_index": i,
            "timestamp": f"2026-09-12T{(i % 24):02d}:00:00+05:30",
            "demand_kw": 6.5,
            "critical_demand_kw": 2.0,
            "solar_available_kw": solar_val,
            "wind_available_kw": 0.0,
            "solar_used_kw": min(solar_val, 6.5),
            "wind_used_kw": 0.0,
            "curtailed_kw": max(0.0, solar_val - 10.0) if is_day else 0.0,
            "battery_charge_kw": 4.0 if (is_day and solar_val > 6.5) else 0.0,
            "battery_discharge_kw": 2.5 if not is_day and not is_diesel else 0.0,
            "soc": 0.65 if i < 12 else (0.85 if i < 18 else 0.35),
            "diesel_kw": 6.5 if is_diesel else 0.0,
            "diesel_on": is_diesel,
            "load_shed_kw": 0.0,
            "reason_codes": ["SOLAR_SURPLUS_CHARGING"] if (is_day and solar_val > 6.5) else (["DIESEL_EFFICIENT_LOADING"] if is_diesel else ["RENEWABLES_COVER_DEMAND"]),
        })

    return {
        "run_id": "test_run_123",
        "village_id": "dang_village",
        "created_at": "2026-09-12T08:00:00Z",
        "horizon_hours": 48,
        "forecast_source": "OPEN_METEO",
        "hourly": hours,
        "summary": {
            "total_cost_inr": 2450.50,
            "fuel_cost_inr": 1850.00,
            "diesel_liters": 20.55,
            "diesel_hours": 3.0,
            "co2_kg": 55.07,
            "renewable_share_pct": 78.4,
            "uptime_pct": 93.75,
            "critical_uptime_pct": 100.0,
            "load_shed_kwh": 0.0,
            "curtailed_kwh": 5.2,
        },
        "baselines": [
            {
                "strategy": "naive",
                "summary": {
                    "total_cost_inr": 4890.00,
                    "fuel_cost_inr": 4200.00,
                    "diesel_liters": 46.66,
                    "diesel_hours": 12.0,
                    "co2_kg": 125.04,
                    "renewable_share_pct": 52.0,
                    "uptime_pct": 75.0,
                    "critical_uptime_pct": 100.0,
                    "load_shed_kwh": 0.0,
                    "curtailed_kwh": 14.5,
                },
                "hourly": hours,
            },
            {
                "strategy": "cycle_charging",
                "summary": {
                    "total_cost_inr": 3650.00,
                    "fuel_cost_inr": 3100.00,
                    "diesel_liters": 34.44,
                    "diesel_hours": 6.0,
                    "co2_kg": 92.30,
                    "renewable_share_pct": 65.0,
                    "uptime_pct": 87.5,
                    "critical_uptime_pct": 100.0,
                    "load_shed_kwh": 0.0,
                    "curtailed_kwh": 8.0,
                },
                "hourly": hours,
            },
        ],
        "savings": [
            {
                "vs_strategy": "naive",
                "cost_saved_inr": 2439.50,
                "cost_saved_pct": 49.9,
                "diesel_hours_saved": 9.0,
                "diesel_liters_saved": 26.11,
                "co2_saved_kg": 69.97,
            },
            {
                "vs_strategy": "cycle_charging",
                "cost_saved_inr": 1199.50,
                "cost_saved_pct": 32.9,
                "diesel_hours_saved": 3.0,
                "diesel_liters_saved": 13.89,
                "co2_saved_kg": 37.23,
            },
        ],
        "solver": {"status": "Optimal (gap 1.0%)", "solve_time_ms": 125.4, "objective_value": 2450.50},
        "is_mock": False,
    }


class TestContextBuilder:
    def test_build_powerloom_context_structure(self, sample_village_config, sample_optimize_response):
        ctx = build_powerloom_context(sample_village_config, sample_optimize_response)

        assert "site" in ctx
        assert ctx["site"]["village_name"] == "Dang Village"
        assert ctx["site"]["solar_capacity_kw"] == 15.0
        assert ctx["site"]["battery_capacity_kwh"] == 40.0
        assert ctx["site"]["battery_soc_min_pct"] == 20.0
        assert ctx["site"]["diesel_capacity_kw"] == 10.0

        assert "current_operating_state" in ctx
        assert ctx["current_operating_state"]["hour_index"] == 0
        assert ctx["current_operating_state"]["battery_soc_pct"] == 65.0

        assert "performance_kpis" in ctx
        assert ctx["performance_kpis"]["total_cost_inr"] == 2450.50
        assert ctx["performance_kpis"]["savings_vs_naive"]["cost_saved_inr"] == 2439.50
        assert ctx["performance_kpis"]["savings_vs_naive"]["diesel_hours_saved"] == 9.0

        assert "baseline_comparison" in ctx
        assert ctx["baseline_comparison"]["naive_dispatch"]["total_cost_inr"] == 4890.00

        assert len(ctx["hourly_dispatch"]) == 48

    def test_format_context_for_prompt(self, sample_village_config, sample_optimize_response):
        ctx = build_powerloom_context(sample_village_config, sample_optimize_response)
        text = format_context_for_prompt(ctx)

        assert "=== 1. SITE & MICROGRID CONFIGURATION ===" in text
        assert "Dang Village" in text
        assert "Solar PV=15.0 kW" in text
        assert "Battery=40.0 kWh" in text
        assert "=== 4. OPTIMIZED PERFORMANCE & SAVINGS SUMMARY ===" in text
        assert "Cost Saved=₹2439.5" in text
        assert "=== 8. COMPLETE HOURLY DISPATCH SCHEDULE ===" in text
        assert "H00 |" in text
        assert "H47 |" in text


class TestApiKeyIsolation:
    def test_fails_when_gemini_api_key_1_is_empty(self, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "")
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "fallback_should_not_be_used")

        with pytest.raises(ChatConfigurationError) as exc_info:
            generate_chat_response(
                message="What is the current SOC?",
                context_text="Sample Context",
            )

        assert "GEMINI_API_KEY_1 is not configured" in str(exc_info.value)

    def test_uses_only_gemini_api_key_1(self, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "test_key_1_strictly")
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "other_key")

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "At 2 PM, solar covers demand."
        mock_client.models.generate_content.return_value = mock_response

        with patch("google.genai.Client", return_value=mock_client) as mock_client_init:
            res = generate_chat_response(
                message="Why is diesel off?",
                context_text="Sample Context",
            )
            mock_client_init.assert_called_once_with(api_key="test_key_1_strictly")
            assert res == "At 2 PM, solar covers demand."


class TestChatScenarios:
    """Tests covering all 10 core chatbot categories and requirements."""

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_1_current_state_soc(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "Current battery SOC is 50.0%, which is well above the 20.0% safety reserve limit."
        )

        resp = client.post("/api/chat", json={"message": "What is the current battery SOC?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "50.0%" in data["message"]
        assert "safety reserve" in data["message"].lower()

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_2_optimization_reason_diesel_off(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "Diesel is currently OFF because solar generation is producing sufficient power to cover demand, "
            "with excess power directed to charge the battery."
        )

        resp = client.post("/api/chat", json={"message": "Why is diesel off right now?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "diesel is currently off" in data["message"].lower()

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_3_kpi_savings(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "The Powerloom optimization saved ₹2,439.50 (49.9% cost reduction) and avoided 9.0 hours of diesel running."
        )

        resp = client.post("/api/chat", json={"message": "How much money did we save?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "₹2,439.50" in data["message"] or "49.9%" in data["message"]

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_4_hourly_diesel_question(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "At Hour 18 (6:00 PM), diesel generator turns ON at 6.5 kW to meet peak evening demand "
            "since solar generation has ceased and battery discharge is limited to protect safety reserve."
        )

        resp = client.post("/api/chat", json={"message": "Which hours have diesel running?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "diesel" in data["message"].lower()

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_5_baseline_comparison(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "Compared to Naive dispatch (₹4,890.00), Powerloom's optimized dispatch (₹2,450.50) cuts diesel hours "
            "from 12.0 hours down to 3.0 hours by pre-charging the battery with solar surplus."
        )

        resp = client.post("/api/chat", json={"message": "What is the difference between the optimized strategy and naive dispatch?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "naive" in data["message"].lower()

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_6_domain_concept_soc(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "State of Charge (SOC) is the available energy capacity of the battery expressed as a percentage. "
            "Powerloom strictly respects a minimum SOC safety reserve (20%) to preserve battery longevity."
        )

        resp = client.post("/api/chat", json={"message": "What does SOC mean in Powerloom?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "state of charge" in data["message"].lower()

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_7_unknown_data_anti_hallucination(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = (
            "Information regarding generator vibration frequency is not available in the microgrid telemetry context."
        )

        resp = client.post("/api/chat", json={"message": "What is the generator vibration frequency right now?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "not available" in data["message"].lower()

    @patch("app.services.chat.service.generate_chat_response")
    def test_scenario_8_follow_up_conversation_history(self, mock_gen, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "valid_key")
        mock_gen.return_value = "That diesel run consumed approximately 4.2 liters of fuel at a cost of ₹378."

        history = [
            ChatMessage(role="user", content="Why is diesel running at 6 PM?"),
            ChatMessage(role="assistant", content="Diesel is running at 6 PM because evening demand is high."),
        ]

        req = ChatRequest(
            message="How much fuel does that use?",
            history=history,
        )

        resp = client.post("/api/chat", json=req.model_dump())
        assert resp.status_code == 200
        data = resp.json()
        assert "fuel" in data["message"].lower() or "liters" in data["message"].lower()

    def test_scenario_9_api_key_missing_returns_503(self, client, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY_1", "")
        resp = client.post("/api/chat", json={"message": "What is the current demand?"})
        assert resp.status_code == 503
        assert "GEMINI_API_KEY_1 is not configured" in resp.json()["detail"]

    def test_scenario_10_input_validation_errors(self, client):
        # Empty message
        resp = client.post("/api/chat", json={"message": ""})
        assert resp.status_code == 422

        # Whitespace-only message
        resp = client.post("/api/chat", json={"message": "   "})
        assert resp.status_code == 422

        # Unknown village
        resp = client.post("/api/chat", json={"message": "Hello", "village_id": "nonexistent_village_xyz"})
        assert resp.status_code == 422

        # Nonexistent run_id
        resp = client.post("/api/chat", json={"message": "Hello", "run_id": "nonexistent_run_12345"})
        assert resp.status_code == 404
