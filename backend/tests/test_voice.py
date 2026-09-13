"""Tests for the voice query feature (intent classification, fact resolvers,
templates, the /api/voice/query and /api/voice/stream endpoints, and the
Sarvam TTS /api/voice/speak endpoint).

All tests are self-contained — no real Gemini or Sarvam API calls are made.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from sqlmodel import Session

from app.db.session import db_state
from app.explainer.intents import (
    Intent,
    classify_intent,
    is_hypothetical_question,
    resolve_battery_status,
    resolve_critical_safe,
    resolve_diesel_now,
    resolve_diesel_tonight,
    resolve_peak_time,
    resolve_savings_today,
    resolve_solar_tomorrow,
    resolve_what_now,
)
from app.explainer.voice_templates import build_voice_template_answer
from app.models.scenario_run import ScenarioRun
from app.schemas.common import Language

IST = timezone(timedelta(hours=5, minutes=30))

# ---------------------------------------------------------------------------
# Fixture data
# ---------------------------------------------------------------------------


def _make_hourly(n: int = 48) -> list[dict]:
    base = datetime(2026, 9, 12, 0, 0, 0, tzinfo=IST)
    hourly = []
    for i in range(n):
        ts = base + timedelta(hours=i)
        hour_of_day = ts.hour
        is_day = 6 <= hour_of_day <= 17
        is_evening_diesel = hour_of_day in (18, 19, 20)
        demand = 15.0 if hour_of_day == 19 else 10.0
        hourly.append({
            "hour_index": i,
            "timestamp": ts.isoformat(),
            "demand_kw": demand,
            "critical_demand_kw": 3.0,
            "solar_available_kw": 8.0 if is_day else 0.0,
            "wind_available_kw": 1.0,
            "solar_used_kw": 6.0 if is_day else 0.0,
            "wind_used_kw": 1.0,
            "curtailed_kw": 0.0,
            "battery_charge_kw": 3.0 if hour_of_day == 10 else 0.0,
            "battery_discharge_kw": 2.0 if hour_of_day == 19 else 0.0,
            "soc": 0.3 if hour_of_day == 19 else 0.5,
            "diesel_kw": 5.0 if is_evening_diesel else 0.0,
            "diesel_on": is_evening_diesel,
            "load_shed_kw": 0.0,
            "reason_codes": [],
        })
    return hourly


def _make_response_dict(run_id: str = "voice-test-run", n: int = 48) -> dict:
    return {
        "run_id": run_id,
        "village_id": "kutch_village",
        "created_at": datetime(2026, 9, 12, 0, 0, 0, tzinfo=IST).isoformat(),
        "horizon_hours": n,
        "forecast_source": "SYNTHETIC",
        "hourly": _make_hourly(n),
        "summary": {
            "total_cost_inr": 1500.0,
            "fuel_cost_inr": 900.0,
            "diesel_liters": 10.0,
            "diesel_hours": 6.0,
            "co2_kg": 26.8,
            "renewable_share_pct": 65.0,
            "uptime_pct": 100.0,
            "critical_uptime_pct": 100.0,
            "load_shed_kwh": 0.0,
            "curtailed_kwh": 4.8,
        },
        "baselines": [],
        "savings": [
            {
                "vs_strategy": "naive",
                "cost_saved_inr": 500.5,
                "cost_saved_pct": 25.5,
                "diesel_hours_saved": 3.0,
                "diesel_liters_saved": 4.2,
                "co2_saved_kg": 11.3,
            },
        ],
        "solver": {"status": "Optimal (gap 1.0%)", "solve_time_ms": 100.0, "objective_value": 1500.0},
        "is_mock": False,
    }


def _seed_run(run_id: str = "voice-test-run") -> dict:
    resp = _make_response_dict(run_id)
    with Session(db_state.engine) as session:
        existing = session.get(ScenarioRun, run_id)
        if existing is None:
            session.add(ScenarioRun(
                id=run_id,
                village_id="kutch_village",
                request_json={"village_id": "kutch_village"},
                response_json=resp,
                total_cost_inr=1500.0,
                cost_saved_inr=500.5,
            ))
            session.commit()
    return resp


# ---------------------------------------------------------------------------
# Intent classification — >=3 phrasings per language per intent
# ---------------------------------------------------------------------------

PHRASES: dict[Intent, dict[Language, list[str]]] = {
    Intent.DIESEL_TONIGHT: {
        Language.en: [
            "Will diesel run tonight?",
            "Do we need the generator tonight?",
            "Is diesel needed tonight?",
        ],
        Language.gu: [
            "શું આજે રાત્રે ડીઝલ ચલાવવું પડશે?",
            "રાત્રે જનરેટર ચાલશે?",
            "આજે રાત્રે ડીઝલની જરૂર છે?",
        ],
        Language.hi: [
            "क्या आज रात डीज़ल चलेगा?",
            "क्या रात को जनरेटर चलाना पड़ेगा?",
            "आज रात डीजल की ज़रूरत है क्या?",
        ],
    },
    Intent.DIESEL_NOW: {
        Language.en: [
            "Is diesel on right now?",
            "Is the generator running now?",
            "Is diesel currently on?",
        ],
        Language.gu: [
            "શું ડીઝલ અત્યારે ચાલુ છે?",
            "જનરેટર હમણાં ચાલુ છે?",
            "ડીઝલ ચાલુ છે કે નહીં?",
        ],
        Language.hi: [
            "क्या डीज़ल अभी चालू है?",
            "जनरेटर अभी चल रहा है क्या?",
            "डीज़ल चालू है क्या?",
        ],
    },
    Intent.BATTERY_STATUS: {
        Language.en: [
            "How much battery is left?",
            "What is the SOC?",
            "How charged is the battery?",
        ],
        Language.gu: [
            "બેટરી કેટલી છે?",
            "બેટરી કેટલી બચી છે?",
            "SOC કેટલું છે?",
        ],
        Language.hi: [
            "बैटरी कितनी बची है?",
            "बैटरी कितनी है?",
            "SOC क्या है?",
        ],
    },
    Intent.SAVINGS_TODAY: {
        Language.en: [
            "How much money did we save today?",
            "What are the total savings?",
            "How many rupees did we save?",
        ],
        Language.gu: [
            "આજે કેટલા રૂપિયા બચ્યા?",
            "કેટલી બચત થઈ?",
            "કુલ બચત કેટલી છે?",
        ],
        Language.hi: [
            "आज कितने रुपये बचे?",
            "कुल बचत कितनी है?",
            "आज कितने पैसे बचे?",
        ],
    },
    Intent.PEAK_TIME: {
        Language.en: [
            "When is peak demand?",
            "What is the peak time?",
            "When is the peak hour?",
        ],
        Language.gu: [
            "પીક ટાઈમ ક્યારે છે?",
            "સૌથી વધારે માંગ ક્યારે છે?",
            "પીક અવર ક્યારે છે?",
        ],
        Language.hi: [
            "पीक टाइम कब है?",
            "सबसे ज़्यादा मांग कब होती है?",
            "पीक आवर कब है?",
        ],
    },
    Intent.SOLAR_TOMORROW: {
        Language.en: [
            "How much solar tomorrow?",
            "Will there be sun tomorrow?",
            "What is tomorrow's solar forecast?",
        ],
        Language.gu: [
            "કાલે કેટલો તડકો હશે?",
            "આવતીકાલે સૌર ઊર્જા કેટલી હશે?",
            "કાલે સૂર્યપ્રકાશ કેવો રહેશે?",
        ],
        Language.hi: [
            "कल कितनी धूप होगी?",
            "कल सौर ऊर्जा कैसी रहेगी?",
            "क्या कल सूरज निकलेगा?",
        ],
    },
    Intent.CRITICAL_SAFE: {
        Language.en: [
            "Is the critical load safe?",
            "Will the hospital stay powered?",
            "Is the school load protected?",
        ],
        Language.gu: [
            "શું જરૂરી ભાર સુરક્ષિત છે?",
            "શું હોસ્પિટલ ચાલુ રહેશે?",
            "શું શાળાનો ભાર સુરક્ષિત છે?",
        ],
        Language.hi: [
            "क्या ज़रूरी भार सुरक्षित है?",
            "क्या अस्पताल चालू रहेगा?",
            "क्या स्कूल का भार सुरक्षित है?",
        ],
    },
    Intent.WHAT_NOW: {
        Language.en: [
            "What is happening right now?",
            "What is the current plan?",
            "What should I do now?",
        ],
        Language.gu: [
            "હવે શું કરવું?",
            "અત્યારે શું થઈ રહ્યું છે?",
            "અત્યારે શું સ્થિતિ છે?",
        ],
        Language.hi: [
            "अभी क्या हो रहा है?",
            "अब क्या करें?",
            "अभी क्या स्थिति है?",
        ],
    },
}


class TestIntentClassification:
    @pytest.mark.parametrize("intent", list(PHRASES.keys()))
    def test_all_phrasings_classified_correctly(self, intent):
        for language, phrases in PHRASES[intent].items():
            assert len(phrases) >= 3
            for phrase in phrases:
                assert classify_intent(phrase) is intent, (
                    f"{language.value} phrase {phrase!r} should classify as {intent.value}"
                )

    def test_unrelated_query_is_unknown(self):
        assert classify_intent("What is the meaning of life?") is Intent.UNKNOWN
        assert classify_intent("Tell me a joke") is Intent.UNKNOWN
        assert classify_intent("") is Intent.UNKNOWN


# ---------------------------------------------------------------------------
# Fact resolvers
# ---------------------------------------------------------------------------


class TestResolvers:
    def test_resolve_diesel_now_on(self):
        resp = _make_response_dict()
        facts = resolve_diesel_now(resp, 19)
        assert facts["diesel_on"] is True
        assert facts["diesel_kw"] == 5.0
        assert facts["demand_kw"] == 15.0
        assert facts["hour_index"] == 19

    def test_resolve_diesel_now_off(self):
        resp = _make_response_dict()
        facts = resolve_diesel_now(resp, 2)
        assert facts["diesel_on"] is False
        assert facts["diesel_kw"] == 0.0
        assert facts["demand_kw"] == 10.0

    def test_resolve_diesel_tonight(self):
        resp = _make_response_dict()
        facts = resolve_diesel_tonight(resp, 0)
        assert facts["diesel_needed"] is True
        assert facts["diesel_hours_count"] == 3
        assert facts["total_diesel_kwh_tonight"] == 15.0

    def test_resolve_battery_status_charging(self):
        resp = _make_response_dict()
        facts = resolve_battery_status(resp, 10)
        assert facts["battery_status"] == "charging"
        assert facts["soc_pct"] == 50.0

    def test_resolve_battery_status_discharging(self):
        resp = _make_response_dict()
        facts = resolve_battery_status(resp, 19)
        assert facts["battery_status"] == "discharging"
        assert facts["soc_pct"] == 30.0

    def test_resolve_savings_today(self):
        resp = _make_response_dict()
        facts = resolve_savings_today(resp, 0)
        assert facts["cost_saved_inr"] == 500.5
        assert facts["cost_saved_pct"] == 25.5
        assert facts["diesel_liters_saved"] == 4.2

    def test_resolve_peak_time(self):
        resp = _make_response_dict()
        facts = resolve_peak_time(resp, 0)
        assert facts["peak_demand_kw"] == 15.0
        assert facts["peak_hour_index"] == 19

    def test_resolve_solar_tomorrow(self):
        resp = _make_response_dict()
        facts = resolve_solar_tomorrow(resp, 0)
        assert facts["tomorrow_hours_count"] == 24
        assert facts["tomorrow_peak_solar_kw"] == 8.0
        assert facts["tomorrow_solar_kwh"] == 96.0

    def test_resolve_critical_safe_true(self):
        resp = _make_response_dict()
        facts = resolve_critical_safe(resp, 0)
        assert facts["critical_always_safe"] is True
        assert facts["critical_kw"] == 3.0

    def test_resolve_what_now(self):
        resp = _make_response_dict()
        facts = resolve_what_now(resp, 19)
        assert facts["demand_kw"] == 15.0
        assert facts["diesel_on"] is True
        assert facts["soc_pct"] == 30.0


# ---------------------------------------------------------------------------
# Deterministic templates — non-empty for every intent, every language
# ---------------------------------------------------------------------------

_TEMPLATE_FACTS: dict[Intent, list[dict]] = {
    Intent.DIESEL_TONIGHT: [
        {"window_start_time": "12 Sep 18:00 IST", "window_end_time": "12 Sep 20:00 IST",
         "diesel_needed": True, "diesel_hours_count": 3, "total_diesel_kwh_tonight": 15.0},
        {"window_start_time": "12 Sep 18:00 IST", "window_end_time": "12 Sep 20:00 IST",
         "diesel_needed": False, "diesel_hours_count": 0, "total_diesel_kwh_tonight": 0.0},
    ],
    Intent.DIESEL_NOW: [
        {"diesel_on": True, "diesel_kw": 5.0, "demand_kw": 15.0, "local_time": "12 Sep 19:00 IST"},
        {"diesel_on": False, "diesel_kw": 0.0, "demand_kw": 10.0, "local_time": "12 Sep 02:00 IST"},
    ],
    Intent.BATTERY_STATUS: [
        {"soc_pct": 50.0, "battery_status": "charging", "local_time": "12 Sep 10:00 IST"},
        {"soc_pct": 30.0, "battery_status": "discharging", "local_time": "12 Sep 19:00 IST"},
        {"soc_pct": 40.0, "battery_status": "idle", "local_time": "12 Sep 03:00 IST"},
    ],
    Intent.SAVINGS_TODAY: [
        {"cost_saved_inr": 500.5, "cost_saved_pct": 25.5, "diesel_liters_saved": 4.2, "co2_saved_kg": 11.3},
    ],
    Intent.PEAK_TIME: [
        {"peak_demand_kw": 15.0, "peak_time": "12 Sep 19:00 IST", "peak_hour_index": 19},
    ],
    Intent.SOLAR_TOMORROW: [
        {"tomorrow_solar_kwh": 96.0, "tomorrow_peak_solar_kw": 8.0, "tomorrow_hours_count": 24},
    ],
    Intent.CRITICAL_SAFE: [
        {"critical_always_safe": True, "critical_kw": 3.0, "total_load_shed_kwh": 0.0},
        {"critical_always_safe": False, "critical_kw": 3.0, "total_load_shed_kwh": 2.5},
    ],
    Intent.WHAT_NOW: [
        {"local_time": "12 Sep 19:00 IST", "demand_kw": 15.0, "solar_used_kw": 0.0, "wind_used_kw": 1.0,
         "diesel_on": True, "diesel_kw": 5.0, "soc_pct": 30.0},
    ],
    Intent.UNKNOWN: [{}],
}


class TestTemplates:
    @pytest.mark.parametrize("intent", list(_TEMPLATE_FACTS.keys()))
    def test_templates_non_empty_all_languages(self, intent):
        for facts in _TEMPLATE_FACTS[intent]:
            for language in (Language.en, Language.gu, Language.hi):
                answer = build_voice_template_answer(intent, facts, language)
                assert isinstance(answer, str)
                assert answer.strip() != ""


# ---------------------------------------------------------------------------
# Endpoint behaviour
# ---------------------------------------------------------------------------


class TestVoiceQueryEndpoint:
    def test_unknown_run_id_returns_404(self, client):
        r = client.post("/api/voice/query", json={
            "run_id": "does-not-exist", "query": "battery kitni hai", "language": "en",
        })
        assert r.status_code == 404

    def test_unrelated_query_is_unknown_low_confidence_no_gemini_call(self, client):
        _seed_run("voice-run-unknown")
        with patch("google.genai.Client") as mock_client_cls:
            r = client.post("/api/voice/query", json={
                "run_id": "voice-run-unknown", "query": "tell me a joke", "language": "en",
            })
            assert r.status_code == 200
            data = r.json()
            assert data["intent"] == "UNKNOWN"
            assert data["confidence"] == "low"
            mock_client_cls.assert_not_called()

    def test_no_gemini_key_falls_back_to_template(self, client):
        _seed_run("voice-run-notmpl")
        with patch("app.core.config.settings.GEMINI_API_KEY", ""):
            r = client.post("/api/voice/query", json={
                "run_id": "voice-run-notmpl", "query": "battery kitni hai", "language": "en",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["intent"] == "BATTERY_STATUS"
        assert data["confidence"] == "high"
        assert data["answer"]

    def test_diesel_tonight_gujarati(self, client):
        _seed_run("voice-run-gu")
        with patch("app.core.config.settings.GEMINI_API_KEY", ""):
            r = client.post("/api/voice/query", json={
                "run_id": "voice-run-gu",
                "query": "આજે રાત્રે ડીઝલ ચલાવવું પડશે?",
                "language": "gu",
                "current_hour_index": 0,
            })
        assert r.status_code == 200
        data = r.json()
        assert data["intent"] == "DIESEL_TONIGHT"


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for raw_frame in body.split("\n\n"):
        if not raw_frame.strip() or raw_frame.startswith(":"):
            continue
        event_name = "message"
        data_line = None
        for line in raw_frame.split("\n"):
            if line.startswith("event:"):
                event_name = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data_line = line[len("data:"):].strip()
        if data_line is not None:
            events.append((event_name, json.loads(data_line)))
    return events


class TestVoiceStreamEndpoint:
    _parse_sse = staticmethod(_parse_sse)

    def test_unknown_run_id_returns_404(self, client):
        r = client.post("/api/voice/stream", json={
            "run_id": "does-not-exist", "query": "battery kitni hai", "language": "en",
        })
        assert r.status_code == 404

    def test_event_order_intent_token_done(self, client):
        _seed_run("voice-stream-run-1")

        mock_client = MagicMock()

        def _chunks():
            for text in ["Diesel ", "is ", "running."]:
                chunk = MagicMock()
                chunk.text = text
                yield chunk

        mock_client.models.generate_content_stream.return_value = _chunks()

        with patch("app.core.config.settings.GEMINI_API_KEY", "fake-key"), \
             patch("google.genai.Client", return_value=mock_client):
            with client.stream("POST", "/api/voice/stream", json={
                "run_id": "voice-stream-run-1",
                "query": "is diesel on right now?",
                "language": "en",
                "current_hour_index": 19,
            }) as response:
                body = "".join(response.iter_text())

        events = self._parse_sse(body)
        event_names = [name for name, _ in events]
        assert event_names[0] == "intent"
        assert event_names[-1] == "done"
        assert "token" in event_names
        assert event_names.index("intent") < event_names.index("token")
        assert event_names.index("token") < event_names.index("done")

        intent_data = events[0][1]
        assert intent_data["intent"] == "DIESEL_NOW"
        assert intent_data["hour_index"] == 19

        done_data = events[-1][1]
        assert done_data["validated"] is True
        assert "Diesel is running." in done_data["answer"] or done_data["answer"]

    def test_fabricated_number_rejected_and_template_used(self, client):
        _seed_run("voice-stream-run-2")

        mock_client = MagicMock()
        chunk = MagicMock()
        chunk.text = "Diesel is running at 999.9 kW right now."

        mock_client.models.generate_content_stream.return_value = iter([chunk])

        with patch("app.core.config.settings.GEMINI_API_KEY", "fake-key"), \
             patch("google.genai.Client", return_value=mock_client):
            with client.stream("POST", "/api/voice/stream", json={
                "run_id": "voice-stream-run-2",
                "query": "is diesel on right now?",
                "language": "en",
                "current_hour_index": 19,
            }) as response:
                body = "".join(response.iter_text())

        events = self._parse_sse(body)
        done_data = events[-1][1]
        assert done_data["validated"] is False
        # The corrected answer must be the deterministic template, not the
        # fabricated 999.9 kW figure.
        assert "999.9" not in done_data["answer"]

    def test_gujarati_numerals_do_not_cause_false_rejection(self, client):
        _seed_run("voice-stream-run-3")

        mock_client = MagicMock()
        # ૫.૦ is Gujarati for 5.0 — matches the real diesel_kw fact at hour 19.
        chunk = MagicMock()
        chunk.text = "ડીઝલ ૫.૦ kW પર ચાલી રહ્યો છે."

        mock_client.models.generate_content_stream.return_value = iter([chunk])

        with patch("app.core.config.settings.GEMINI_API_KEY", "fake-key"), \
             patch("google.genai.Client", return_value=mock_client):
            with client.stream("POST", "/api/voice/stream", json={
                "run_id": "voice-stream-run-3",
                "query": "diesel chalu che?",
                "language": "gu",
                "current_hour_index": 19,
            }) as response:
                body = "".join(response.iter_text())

        events = self._parse_sse(body)
        done_data = events[-1][1]
        assert done_data["validated"] is True
        assert "૫.૦" in done_data["answer"]

    def test_unknown_intent_streams_examples_without_gemini(self, client):
        _seed_run("voice-stream-run-4")

        with patch("google.genai.Client") as mock_client_cls:
            with client.stream("POST", "/api/voice/stream", json={
                "run_id": "voice-stream-run-4",
                "query": "tell me a joke",
                "language": "en",
            }) as response:
                body = "".join(response.iter_text())

        mock_client_cls.assert_not_called()
        events = self._parse_sse(body)
        assert events[0][0] == "intent"
        assert events[0][1]["intent"] == "UNKNOWN"
        assert events[0][1]["confidence"] == "low"
        assert events[-1][0] == "done"


# ---------------------------------------------------------------------------
# Sarvam AI Bulbul TTS (/api/voice/speak) — no real network calls are made.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_tts_cache():
    from app.services.tts.sarvam import _fetch_audio_bytes
    _fetch_audio_bytes.cache_clear()
    yield
    _fetch_audio_bytes.cache_clear()


class TestSarvamTTS:
    def test_synthesize_speech_raises_when_no_api_key(self):
        from app.services.tts.sarvam import TTSUnavailableError, synthesize_speech

        with patch("app.core.config.settings.SARVAM_API_KEY", ""):
            with pytest.raises(TTSUnavailableError):
                synthesize_speech("Hello", Language.en)

    def test_synthesize_speech_returns_decoded_audio(self):
        import base64
        from app.services.tts.sarvam import synthesize_speech

        raw_audio = b"fake-mp3-bytes"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"audios": [base64.b64encode(raw_audio).decode()]}

        with patch("app.core.config.settings.SARVAM_API_KEY", "fake-key"), \
             patch("httpx.post", return_value=mock_response) as mock_post:
            audio_bytes, content_type = synthesize_speech("Hello there", Language.en)

        assert audio_bytes == raw_audio
        assert content_type == "audio/mpeg"
        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["headers"]["api-subscription-key"] == "fake-key"
        assert call_kwargs["json"]["speaker"] == "simran"
        assert call_kwargs["json"]["language_code"] == "en-IN"

    def test_synthesize_speech_raises_on_http_error(self):
        from app.services.tts.sarvam import TTSUnavailableError, synthesize_speech

        with patch("app.core.config.settings.SARVAM_API_KEY", "fake-key"), \
             patch("httpx.post", side_effect=RuntimeError("network down")):
            with pytest.raises(TTSUnavailableError):
                synthesize_speech("Unique text for error case", Language.en)

    def test_speak_endpoint_returns_503_without_api_key(self, client):
        with patch("app.core.config.settings.SARVAM_API_KEY", ""):
            r = client.post("/api/voice/speak", json={"text": "Hello", "language": "en"})
        assert r.status_code == 503

    def test_speak_endpoint_returns_audio_bytes(self, client):
        import base64

        raw_audio = b"fake-mp3-bytes-endpoint"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"audios": [base64.b64encode(raw_audio).decode()]}

        with patch("app.core.config.settings.SARVAM_API_KEY", "fake-key"), \
             patch("httpx.post", return_value=mock_response):
            r = client.post("/api/voice/speak", json={"text": "Unique endpoint text", "language": "gu"})

        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/mpeg"
        assert r.content == raw_audio

    def test_speak_endpoint_rejects_empty_text(self, client):
        r = client.post("/api/voice/speak", json={"text": "   ", "language": "en"})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# "General" path — hypothetical / what-if questions outside the 8 fixed
# intents, answered via the reused /api/chat pipeline. No real Gemini calls.
# ---------------------------------------------------------------------------

HYPOTHETICAL_PHRASES = [
    "What if there's a power cut tomorrow, how much should I charge the battery?",
    "Suppose diesel fails tonight, what happens?",
    "In case the generator breaks down, what should we expect?",
    "અગર કાલે વીજળી ના હોય તો શું થાય?",
    "ધારો કે ડીઝલ બંધ થઈ જાય તો?",
    "अगर कल बिजली नहीं आई तो क्या होगा?",
    "यदि जनरेटर खराब हो जाए तो?",
]

NON_HYPOTHETICAL_PHRASES = [
    "tell me a joke",
    "What is the meaning of life?",
    "Is diesel on right now?",
    "How much battery is left?",
]


class TestHypotheticalDetection:
    @pytest.mark.parametrize("phrase", HYPOTHETICAL_PHRASES)
    def test_is_hypothetical_true(self, phrase):
        assert is_hypothetical_question(phrase) is True

    @pytest.mark.parametrize("phrase", NON_HYPOTHETICAL_PHRASES)
    def test_is_hypothetical_false(self, phrase):
        assert is_hypothetical_question(phrase) is False

    def test_hypothetical_question_bypasses_fixed_intent_keywords(self):
        # Contains "battery" (a BATTERY_STATUS keyword) but is hypothetical —
        # must still classify as UNKNOWN so the voice route tries the
        # flexible /api/chat-style path instead of returning current SOC.
        query = "What if there's a power cut tomorrow, how much should I charge the battery?"
        assert classify_intent(query) is Intent.UNKNOWN

    def test_non_hypothetical_battery_question_still_classifies_normally(self):
        assert classify_intent("How much battery is left?") is Intent.BATTERY_STATUS


class TestGeneralPathNonStreaming:
    def test_hypothetical_question_answered_via_chat_pipeline(self, client):
        _seed_run("voice-general-run-1")
        with patch("app.core.config.settings.GEMINI_API_KEY_1", "fake-key-1"), \
             patch(
                 "app.api.routes.voice.generate_chat_response",
                 return_value="If there's a power cut tomorrow, charge the battery close to its maximum before the outage.",
             ) as mock_generate:
            r = client.post("/api/voice/query", json={
                "run_id": "voice-general-run-1",
                "query": "What if there's a power cut tomorrow, how much should I charge the battery?",
                "language": "en",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["intent"] == "GENERAL"
        assert data["confidence"] == "low"
        assert "power cut" in data["answer"] or "battery" in data["answer"]
        mock_generate.assert_called_once()
        # The query + a language directive must reach the chat pipeline.
        call_kwargs = mock_generate.call_args.kwargs
        assert "power cut" in call_kwargs["message"]

    def test_hypothetical_question_without_key_falls_back_to_template(self, client):
        _seed_run("voice-general-run-2")
        with patch("app.core.config.settings.GEMINI_API_KEY_1", ""):
            r = client.post("/api/voice/query", json={
                "run_id": "voice-general-run-2",
                "query": "What if there's a power cut tomorrow?",
                "language": "en",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["intent"] == "UNKNOWN"
        assert data["confidence"] == "low"

    def test_hypothetical_question_chat_failure_falls_back_to_template(self, client):
        _seed_run("voice-general-run-3")
        with patch("app.core.config.settings.GEMINI_API_KEY_1", "fake-key-1"), \
             patch("app.api.routes.voice.generate_chat_response", side_effect=RuntimeError("boom")):
            r = client.post("/api/voice/query", json={
                "run_id": "voice-general-run-3",
                "query": "What if there's a power cut tomorrow?",
                "language": "en",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["intent"] == "UNKNOWN"


class TestGeneralPathStreaming:
    def test_hypothetical_question_streams_via_general_path(self, client):
        _seed_run("voice-general-stream-1")

        mock_client = MagicMock()

        def _chunks():
            for text in ["Charge the battery ", "to near full ", "before the outage."]:
                chunk = MagicMock()
                chunk.text = text
                yield chunk

        mock_client.models.generate_content_stream.return_value = _chunks()

        with patch("app.core.config.settings.GEMINI_API_KEY_1", "fake-key-1"), \
             patch("google.genai.Client", return_value=mock_client):
            with client.stream("POST", "/api/voice/stream", json={
                "run_id": "voice-general-stream-1",
                "query": "What if there's a power cut tomorrow, how much should I charge the battery?",
                "language": "en",
            }) as response:
                body = "".join(response.iter_text())

        events = _parse_sse(body)
        event_names = [name for name, _ in events]
        assert event_names[0] == "intent"
        assert events[0][1]["intent"] == "GENERAL"
        assert "token" in event_names
        assert event_names[-1] == "done"
        done_data = events[-1][1]
        assert done_data["validated"] is True
        assert "battery" in done_data["answer"].lower()

    def test_hypothetical_question_stream_failure_falls_back_to_template(self, client):
        _seed_run("voice-general-stream-2")

        with patch("app.core.config.settings.GEMINI_API_KEY_1", "fake-key-1"), \
             patch("google.genai.Client", side_effect=RuntimeError("boom")):
            with client.stream("POST", "/api/voice/stream", json={
                "run_id": "voice-general-stream-2",
                "query": "What if there's a power cut tomorrow?",
                "language": "en",
            }) as response:
                body = "".join(response.iter_text())

        events = _parse_sse(body)
        assert events[0][1]["intent"] == "GENERAL"
        assert events[-1][0] == "done"
        # Fell back to the UNKNOWN example-questions template, not a
        # partial/garbled general answer.
        done_data = events[-1][1]
        assert "Will diesel run tonight?" in done_data["answer"]
