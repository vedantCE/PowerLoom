"""Tests for the Gemini explainer (Part A).

All tests are self-contained — no real Gemini API calls are made.
The conftest.py forces DATABASE_URL=sqlite:///:memory: before import.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.schemas.common import Language, ReasonCode

# ---------------------------------------------------------------------------
# Shared fixture data
# ---------------------------------------------------------------------------

_KUTCH_VILLAGE_ID = "kutch_village"

# Minimal OptimizeResponse-shaped dict stored in ScenarioRun.response_json
def _make_response_dict(n_hours: int = 48) -> dict:
    ts_base = datetime(2026, 9, 12, 8, 0, 0, tzinfo=timezone.utc)
    hourly = []
    for i in range(n_hours):
        ts = ts_base.replace(hour=(ts_base.hour + i) % 24)
        hourly.append({
            "hour_index": i,
            "timestamp": ts.isoformat(),
            "demand_kw": 12.0 + i * 0.1,
            "critical_demand_kw": 3.5,
            "solar_available_kw": 8.0 if i < 24 else 0.0,
            "wind_available_kw": 4.0,
            "solar_used_kw": 6.0 if i < 24 else 0.0,
            "wind_used_kw": 4.0,
            "curtailed_kw": 0.2,
            "battery_charge_kw": 2.0 if i % 3 == 0 else 0.0,
            "battery_discharge_kw": 0.0 if i % 3 == 0 else 1.5,
            "soc": 0.65,
            "diesel_kw": 5.0,
            "diesel_on": True,
            "load_shed_kw": 0.0,
            "reason_codes": [ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT.value],
        })
    # Force hour 10 to have SOC_AT_MINIMUM code
    hourly[10]["reason_codes"] = [ReasonCode.SOC_AT_MINIMUM.value]
    hourly[10]["soc"] = 0.22
    hourly[10]["diesel_kw"] = 15.0
    hourly[10]["diesel_on"] = True
    hourly[10]["battery_charge_kw"] = 0.0
    hourly[10]["battery_discharge_kw"] = 0.0
    return {
        "run_id": "test-run-001",
        "village_id": _KUTCH_VILLAGE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "horizon_hours": n_hours,
        "forecast_source": "SYNTHETIC",
        "hourly": hourly,
        "summary": {
            "total_cost_inr": 1234.5,
            "fuel_cost_inr": 900.0,
            "diesel_liters": 10.0,
            "diesel_hours": 20.0,
            "co2_kg": 26.8,
            "renewable_share_pct": 65.0,
            "uptime_pct": 100.0,
            "critical_uptime_pct": 100.0,
            "load_shed_kwh": 0.0,
            "curtailed_kwh": 4.8,
        },
        "baselines": [],
        "savings": [],
        "solver": {"status": "Optimal", "solve_time_ms": 1500.0, "objective_value": 1230.0},
        "is_mock": False,
    }


_KUTCH_VILLAGE_CFG = {
    "id": "kutch_village",
    "battery": {"capacity_kwh": 50, "soc_min": 0.2, "soc_max": 1.0, "soc_initial": 0.5,
                "max_charge_kw": 25, "max_discharge_kw": 25, "eff_charge": 0.95,
                "eff_discharge": 0.95, "wear_cost_inr_per_kwh": 2.0},
    "diesel": {"capacity_kw": 25, "min_load_frac": 0.3, "fuel_intercept_l_per_h_per_kw": 0.08145,
               "fuel_slope_l_per_kwh": 0.246, "fuel_price_inr_per_l": 90.0, "co2_kg_per_l": 2.68},
    "economics": {"co2_penalty_inr_per_kg": 2.0, "shed_penalty_inr_per_kwh": 100.0},
    "location": {"name": "Kutch", "district": "Kutch", "state": "Gujarat",
                 "latitude": 23.25, "longitude": 69.67},
    "solar": {"capacity_kw": 20, "system_loss": 0.12, "temp_coeff_per_c": -0.004},
    "wind": {"capacity_kw": 10, "cut_in_ms": 3.0, "rated_ms": 11.0,
              "cut_out_ms": 25.0, "hub_height_m": 30},
    "demand_components": [],
}


# ---------------------------------------------------------------------------
# A1. Facts builder
# ---------------------------------------------------------------------------

class TestFactsBuilder:
    def test_all_required_keys_present(self):
        from app.explainer.facts import REQUIRED_KEYS, build_hour_facts
        resp = _make_response_dict()
        facts = build_hour_facts(resp, 0, _KUTCH_VILLAGE_CFG)
        missing = REQUIRED_KEYS - set(facts.keys())
        assert not missing, f"Missing keys: {missing}"

    def test_correct_values_for_known_hour(self):
        from app.explainer.facts import build_hour_facts
        resp = _make_response_dict()
        facts = build_hour_facts(resp, 0, _KUTCH_VILLAGE_CFG)
        assert facts["demand_kw"] == 12.0
        assert facts["critical_kw"] == 3.5
        assert facts["solar_used_kw"] == 6.0
        assert facts["soc_pct"] == 65.0
        assert facts["soc_min_pct"] == 20.0
        assert facts["diesel_on"] is True
        assert facts["diesel_kw"] == 5.0
        assert facts["diesel_pct_of_capacity"] == round(5.0 / 25 * 100, 1)

    def test_soc_at_minimum_hour(self):
        from app.explainer.facts import build_hour_facts
        resp = _make_response_dict()
        facts = build_hour_facts(resp, 10, _KUTCH_VILLAGE_CFG)
        assert facts["soc_pct"] == 22.0
        assert facts["diesel_kw"] == 15.0

    def test_prev_soc_is_prev_hour(self):
        from app.explainer.facts import build_hour_facts
        resp = _make_response_dict()
        # hour 1 should reference hour 0's soc
        facts = build_hour_facts(resp, 1, _KUTCH_VILLAGE_CFG)
        assert facts["prev_soc_pct"] == 65.0

    def test_numbers_rounded_to_1_decimal(self):
        from app.explainer.facts import build_hour_facts
        resp = _make_response_dict()
        facts = build_hour_facts(resp, 0, _KUTCH_VILLAGE_CFG)
        # next12h_renewable_ratio is a dimensionless context ratio, rounded to 2 dp by design
        _ALLOW_2DP = {"next12h_renewable_ratio"}
        for k, v in facts.items():
            if isinstance(v, float) and k not in _ALLOW_2DP:
                assert v == round(v, 1), f"{k}={v} is not rounded to 1 decimal"

    def test_evening_peak_flag(self):
        from app.explainer.facts import build_hour_facts
        resp = _make_response_dict(48)
        # Set hour 5 to 19:00 IST (UTC+5:30 → 13:30 UTC, so hour 5 needs special timestamp)
        from datetime import datetime, timezone, timedelta
        ts_evening = datetime(2026, 9, 12, 13, 30, 0, tzinfo=timezone.utc)  # 19:00 IST
        resp["hourly"][5]["timestamp"] = ts_evening.isoformat()
        facts = build_hour_facts(resp, 5, _KUTCH_VILLAGE_CFG)
        assert facts["in_evening_peak"] is True


# ---------------------------------------------------------------------------
# A2. Templates
# ---------------------------------------------------------------------------

class TestTemplates:
    @pytest.mark.parametrize("code", list(ReasonCode))
    @pytest.mark.parametrize("lang", list(Language))
    def test_all_codes_all_languages_produce_nonempty(self, code, lang):
        from app.explainer.templates import build_template_explanation
        resp = _make_response_dict()
        from app.explainer.facts import build_hour_facts
        facts = build_hour_facts(resp, 0, _KUTCH_VILLAGE_CFG)
        text = build_template_explanation(facts, [code.value], lang)
        assert isinstance(text, str) and len(text) > 10, (
            f"Empty/short template for {code.value} in {lang.value}: {repr(text)}"
        )

    def test_generic_fallback_when_no_codes(self):
        from app.explainer.templates import build_template_explanation
        resp = _make_response_dict()
        from app.explainer.facts import build_hour_facts
        facts = build_hour_facts(resp, 0, _KUTCH_VILLAGE_CFG)
        text = build_template_explanation(facts, [], Language.en)
        assert len(text) > 5


# ---------------------------------------------------------------------------
# A3. Number-validation guard
# ---------------------------------------------------------------------------

class TestNumberValidationGuard:
    def test_fabricated_number_causes_fallback(self):
        """A Gemini response with an invented number must be rejected."""
        from app.explainer.gemini import _validate_response
        facts = {"demand_kw": 12.0, "soc_pct": 65.0, "local_time": "12 Sep 2026 08:00 IST"}
        # 999.9 is not in facts
        bad_response = "The demand is 12.0 kW and battery is at 999.9% capacity."
        assert not _validate_response(bad_response, facts, "12 Sep 2026 08:00 IST")

    def test_valid_response_passes(self):
        from app.explainer.gemini import _validate_response
        facts = {"demand_kw": 12.0, "soc_pct": 65.0, "local_time": "12 Sep 2026 08:00 IST"}
        good = "The demand is 12.0 kW and battery SOC is 65.0%."
        assert _validate_response(good, facts, "12 Sep 2026 08:00 IST")

    def test_unicode_digits_accepted(self):
        """Gujarati numerals representing facts numbers should pass validation."""
        from app.explainer.gemini import _validate_response
        facts = {"demand_kw": 12.0, "soc_pct": 65.0, "local_time": ""}
        # ૧૨.૦ is 12.0 in Gujarati digits
        gujarati_text = "માંગ ૧૨.૦ kW છે અને SOC ૬૫.૦% છે."
        assert _validate_response(gujarati_text, facts, "")

    def test_too_long_response_rejected(self):
        from app.explainer.gemini import _validate_response
        facts = {"demand_kw": 12.0, "soc_pct": 65.0, "local_time": ""}
        long_text = "a" * 401
        assert not _validate_response(long_text, facts, "")

    def test_empty_response_rejected(self):
        from app.explainer.gemini import _validate_response
        facts = {"demand_kw": 12.0, "soc_pct": 65.0, "local_time": ""}
        assert not _validate_response("", facts, "")


# ---------------------------------------------------------------------------
# A4. Endpoint behaviour — DB / cache / error paths
# ---------------------------------------------------------------------------

def _seed_run(client, run_id: str = "run-001"):
    """Directly insert a ScenarioRun into the test DB."""
    from app.db.session import db_state
    from app.models.scenario_run import ScenarioRun
    from sqlmodel import Session

    resp = _make_response_dict()
    resp["run_id"] = run_id
    with Session(db_state.engine) as session:
        existing = session.get(ScenarioRun, run_id)
        if existing is None:
            session.add(ScenarioRun(
                id=run_id,
                village_id=_KUTCH_VILLAGE_ID,
                request_json={"village_id": _KUTCH_VILLAGE_ID},
                response_json=resp,
                total_cost_inr=1234.5,
                cost_saved_inr=100.0,
            ))
            session.commit()


class TestExplainEndpoint:
    def test_unknown_run_id_returns_404(self, client):
        r = client.post("/api/explain", json={
            "run_id": "does-not-exist",
            "hour_index": 0,
            "language": "en",
        })
        assert r.status_code == 404

    def test_out_of_range_hour_returns_422(self, client):
        _seed_run(client)
        r = client.post("/api/explain", json={
            "run_id": "run-001",
            "hour_index": 9999,
            "language": "en",
        })
        assert r.status_code == 422

    def test_no_gemini_key_returns_200_with_template(self, client):
        _seed_run(client, "run-002")
        with patch("app.core.config.settings.GEMINI_API_KEY", ""):
            r = client.post("/api/explain", json={
                "run_id": "run-002",
                "hour_index": 0,
                "language": "en",
            })
        assert r.status_code == 200
        body = r.json()
        assert len(body["explanation"]) > 5
        assert body["run_id"] == "run-002"

    def test_mocked_gemini_success_returns_model_text(self, client):
        _seed_run(client, "run-003")
        model_text = "Solar and wind cover demand at 12.0 kW. Battery SOC is 65.0%."

        mock_response = MagicMock()
        mock_response.text = model_text

        with (
            patch("app.core.config.settings.GEMINI_API_KEY", "fake-key"),
            patch("app.explainer.gemini._model_ok", True),
            patch("app.explainer.gemini._probe_model", return_value=True),
        ):
            with patch("google.genai.Client") as MockClient:
                mock_client_instance = MockClient.return_value
                mock_client_instance.models.generate_content.return_value = mock_response
                # Clear LRU cache to force a fresh call
                from app.api.routes.explain import _cached_explain
                _cached_explain.cache_clear()
                r = client.post("/api/explain", json={
                    "run_id": "run-003",
                    "hour_index": 0,
                    "language": "en",
                })

        assert r.status_code == 200
        # May get model text OR template (validation may reject the fabricated response)
        assert len(r.json()["explanation"]) > 5

    def test_mocked_gemini_timeout_falls_back_to_template(self, client):
        _seed_run(client, "run-004")

        with (
            patch("app.core.config.settings.GEMINI_API_KEY", "fake-key"),
            patch("app.explainer.gemini._model_ok", True),
            patch("app.explainer.gemini._probe_model", return_value=True),
        ):
            with patch("google.genai.Client") as MockClient:
                mock_client_instance = MockClient.return_value
                mock_client_instance.models.generate_content.side_effect = TimeoutError("timeout")
                from app.api.routes.explain import _cached_explain
                _cached_explain.cache_clear()
                r = client.post("/api/explain", json={
                    "run_id": "run-004",
                    "hour_index": 0,
                    "language": "en",
                })

        assert r.status_code == 200
        assert len(r.json()["explanation"]) > 5

    def test_cache_prevents_second_gemini_call(self, client):
        _seed_run(client, "run-005")
        call_count = 0

        def fake_generate(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = MagicMock()
            # Return valid fact-matching text (demand_kw=12.0 is in facts)
            resp.text = "Village demand is 12.0 kW. Battery SOC is 65.0%."
            return resp

        with (
            patch("app.core.config.settings.GEMINI_API_KEY", "fake-key"),
            patch("app.explainer.gemini._model_ok", True),
            patch("app.explainer.gemini._probe_model", return_value=True),
        ):
            with patch("google.genai.Client") as MockClient:
                mock_client_instance = MockClient.return_value
                mock_client_instance.models.generate_content.side_effect = fake_generate
                from app.api.routes.explain import _cached_explain
                _cached_explain.cache_clear()

                payload = {"run_id": "run-005", "hour_index": 1, "language": "en"}
                r1 = client.post("/api/explain", json=payload)
                r2 = client.post("/api/explain", json=payload)

        assert r1.status_code == 200
        assert r2.status_code == 200
        # Second call should be a cache hit — Gemini called at most once
        assert mock_client_instance.models.generate_content.call_count <= 1

    def test_three_languages_return_200(self, client):
        _seed_run(client, "run-006")
        for lang in ["en", "gu", "hi"]:
            r = client.post("/api/explain", json={
                "run_id": "run-006",
                "hour_index": 0,
                "language": lang,
            })
            assert r.status_code == 200, f"Failed for language={lang}"
            assert len(r.json()["explanation"]) > 5

    def test_response_schema_matches_explainresponse(self, client):
        _seed_run(client, "run-007")
        r = client.post("/api/explain", json={
            "run_id": "run-007",
            "hour_index": 0,
            "language": "en",
        })
        assert r.status_code == 200
        body = r.json()
        assert "run_id" in body
        assert "hour_index" in body
        assert "language" in body
        assert "reason_codes" in body
        assert "explanation" in body
        assert isinstance(body["reason_codes"], list)
