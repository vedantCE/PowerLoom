"""Deterministic keyword intent classifier for the voice query feature.

NOT an LLM — this is a pure, fast, auditable text classifier. It exists so the
frontend can jump the UI to the relevant hour and pick a fact-resolution
strategy BEFORE any Gemini call is made (see routes/voice.py's streaming
`intent` event, emitted immediately after classification).

Keyword lists intentionally mix English, Gujarati script, Hindi (Devanagari)
script, and common Gujlish/Hinglish Latin-script spellings, since village
operators mix scripts freely when typing or speaking.

Each intent also has a pure resolver: (OptimizeResponse dict, hour_index) ->
facts dict. Resolvers never call an LLM and never invent a number — every
value comes straight from the stored optimizer output.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Callable
from zoneinfo import ZoneInfo

from app.schemas.common import Language

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

# "Tonight" / evening window, local hour-of-day, inclusive.
EVENING_START = 18
EVENING_END = 23


class Intent(str, Enum):
    DIESEL_TONIGHT = "DIESEL_TONIGHT"
    DIESEL_NOW = "DIESEL_NOW"
    BATTERY_STATUS = "BATTERY_STATUS"
    SAVINGS_TODAY = "SAVINGS_TODAY"
    PEAK_TIME = "PEAK_TIME"
    SOLAR_TOMORROW = "SOLAR_TOMORROW"
    CRITICAL_SAFE = "CRITICAL_SAFE"
    WHAT_NOW = "WHAT_NOW"
    UNKNOWN = "UNKNOWN"


# ---------------------------------------------------------------------------
# Keyword banks
# ---------------------------------------------------------------------------

_DIESEL_WORDS = [
    "diesel", "generator", "genset", "dizel", "jeneretar",
    "ડીઝલ", "જનરેટર",
    "डीज़ल", "डीजल", "जनरेटर",
]

_TONIGHT_WORDS = [
    "tonight", "night", "raat", "raatre", "raatna", "aaj raat", "raat ko",
    "aaj ki raat", "aaje raatre",
    "રાત્રે", "રાત", "આજે રાત્રે",
    "रात", "रात्रि", "आज रात",
]

_NOW_WORDS = [
    "now", "right now", "currently", "at the moment", "abhi", "abhi abhi",
    "atyare", "atyaare", "hamana",
    "હમણાં", "અત્યારે",
    "अभी",
]

_BATTERY_WORDS = [
    "battery", "soc", "state of charge", "battery kitni", "battery kharab",
    "kitni battery", "battery केटली",
    "બેટરી",
    "बैटरी",
]

_SAVINGS_WORDS = [
    "savings", "saved", "save", "money saved", "rupees saved", "cost saved",
    "save money", "kitne paise", "kitna paisa", "ketla rupiya",
    "rupiya bachya", "paisa bachaya", "ketla paisa bachya",
    "રૂપિયા", "બચ્યા", "બચત",
    "रुपये", "रुपए", "बचत", "बचे", "पैसे",
]

_PEAK_WORDS = [
    "peak", "peak time", "peak hour", "highest demand", "busiest hour",
    "sabse zyada demand", "sauthi vadhare demand", "sabse jyada load",
    "પીક", "સૌથી વધારે",
    "पीक", "सबसे ज़्यादा", "सबसे ज्यादा",
]

_TOMORROW_WORDS = [
    "tomorrow", "kal", "kale", "aavti kale", "aavatikale", "aavti kaale",
    "કાલે", "આવતીકાલે",
    "कल", "आने वाला कल",
]

_SOLAR_WORDS = [
    "solar", "sun", "sunlight", "surya", "taap", "tadko",
    "સૌર", "તડકો", "સૂર્ય",
    "सौर", "धूप", "सूरज",
]

_CRITICAL_WORDS = [
    "critical", "hospital", "school", "water pump", "essential load", "safe",
    "zaruri", "jaruri bijli", "zaruri load band",
    "જરૂરી", "સુરક્ષિત", "હોસ્પિટલ", "શાળા",
    "जरूरी", "ज़रूरी", "सुरक्षित", "अस्पताल", "स्कूल",
]

_WHAT_NOW_WORDS = [
    "what now", "what should i do", "what is happening", "status",
    "current plan", "abhi kya karu", "have su karvu", "aa vakhte shu",
    "હવે શું", "અત્યારે શું",
    "अभी क्या", "अब क्या करें",
]

# "What if" / hypothetical-scenario phrasing. Checked BEFORE the fixed-intent
# keyword matches above so a hypothetical question always gets routed to the
# flexible, grounded reasoning path (see routes/voice.py's reuse of the
# /api/chat pipeline) rather than a narrow factual template — even when it
# happens to also contain a tracked keyword like "battery" or "diesel".
_HYPOTHETICAL_WORDS = [
    "what if", "hypothetically", "in case", "suppose", "imagine if",
    "agar", "agar kal", "jo kal", "maan lo", "man lo",
    "અગર", "જો ", "ધારો કે",
    "अगर", "यदि", "मान लीजिए", "मान लो",
]


def is_hypothetical_question(query: str) -> bool:
    """True for "what if" / hypothetical-scenario phrasing (any of the three
    languages, plus common Latin-script spellings). Used both inside
    classify_intent (to bypass fixed-intent matching) and by the voice
    routes (to decide whether an UNKNOWN query deserves a full grounded
    answer instead of the static "try asking one of these" template).
    """
    return _matches(_norm(query), _HYPOTHETICAL_WORDS)


def _norm(text: str) -> str:
    return text.strip().lower()


def _matches(text: str, keywords: list[str]) -> bool:
    return any(kw.lower() in text for kw in keywords)


def classify_intent(query: str) -> Intent:
    """Classify free-text (typed or voice-transcribed) into one Intent.

    Deterministic keyword matching, checked in priority order — most
    specific / time-qualified intents first so e.g. "diesel tonight" does not
    fall through to the generic DIESEL_NOW bucket.
    """
    text = _norm(query)

    if is_hypothetical_question(query):
        return Intent.UNKNOWN

    has_diesel = _matches(text, _DIESEL_WORDS)
    has_tonight = _matches(text, _TONIGHT_WORDS)

    if has_diesel and has_tonight:
        return Intent.DIESEL_TONIGHT
    if has_diesel:
        return Intent.DIESEL_NOW
    if _matches(text, _BATTERY_WORDS):
        return Intent.BATTERY_STATUS
    if _matches(text, _SAVINGS_WORDS):
        return Intent.SAVINGS_TODAY
    if _matches(text, _PEAK_WORDS):
        return Intent.PEAK_TIME
    if _matches(text, _SOLAR_WORDS) and _matches(text, _TOMORROW_WORDS):
        return Intent.SOLAR_TOMORROW
    if _matches(text, _CRITICAL_WORDS):
        return Intent.CRITICAL_SAFE
    if _matches(text, _WHAT_NOW_WORDS):
        return Intent.WHAT_NOW
    return Intent.UNKNOWN


EXAMPLE_QUESTIONS: dict[Language, list[str]] = {
    Language.en: [
        "Will diesel run tonight?",
        "How much battery is left?",
        "How much money did we save today?",
    ],
    Language.gu: [
        "શું આજે રાત્રે ડીઝલ ચલાવવું પડશે?",
        "બેટરી કેટલી બચી છે?",
        "આજે કેટલા રૂપિયા બચ્યા?",
    ],
    Language.hi: [
        "क्या आज रात डीज़ल चलेगा?",
        "बैटरी कितनी बची है?",
        "आज कितने रुपये बचे?",
    ],
}


# ---------------------------------------------------------------------------
# Pure fact resolvers — NO LLM, NO side effects. Every value traces straight
# back to the stored OptimizeResponse dict.
# ---------------------------------------------------------------------------


def _to_local(ts_raw) -> datetime:
    ts = datetime.fromisoformat(ts_raw) if isinstance(ts_raw, str) else ts_raw
    return ts.astimezone(KOLKATA_TZ)


def _time_label(ts_raw) -> str:
    return _to_local(ts_raw).strftime("%d %b %H:%M IST")


def _r1(v) -> float:
    if v is None or isinstance(v, bool):
        return float(v or 0)
    return round(float(v), 1)


def _hour_or_default(response_dict: dict, hour_index: int | None) -> int:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return 0
    if hour_index is None:
        return 0
    return max(0, min(hour_index, len(hourly) - 1))


def resolve_diesel_now(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return {"hour_index": 0, "local_time": "", "diesel_on": False, "diesel_kw": 0.0, "demand_kw": 0.0}
    idx = _hour_or_default(response_dict, hour_index)
    h = hourly[idx]
    return {
        "hour_index": idx,
        "local_time": _time_label(h["timestamp"]),
        "diesel_on": bool(h.get("diesel_on", False)),
        "diesel_kw": _r1(h.get("diesel_kw", 0)),
        "demand_kw": _r1(h.get("demand_kw", 0)),
    }


def resolve_diesel_tonight(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return {
            "window_start_time": "", "window_end_time": "", "diesel_needed": False,
            "diesel_hours_count": 0, "total_diesel_kwh_tonight": 0.0,
        }
    start_idx = _hour_or_default(response_dict, hour_index)

    # Find the single nearest contiguous evening window at or after start_idx
    # — NOT every evening window in the horizon (a 48h run spans two nights).
    window_indices: list[int] = []
    started = False
    for i in range(start_idx, len(hourly)):
        is_evening = EVENING_START <= _to_local(hourly[i]["timestamp"]).hour <= EVENING_END
        if is_evening:
            window_indices.append(i)
            started = True
        elif started:
            break
    if not window_indices:
        window_indices = [start_idx]

    diesel_hours = [i for i in window_indices if hourly[i].get("diesel_on")]
    total_diesel_kwh = round(sum(hourly[i].get("diesel_kw", 0) for i in window_indices), 1)

    return {
        "window_start_time": _time_label(hourly[window_indices[0]]["timestamp"]),
        "window_end_time": _time_label(hourly[window_indices[-1]]["timestamp"]),
        "diesel_needed": bool(diesel_hours),
        "diesel_hours_count": len(diesel_hours),
        "total_diesel_kwh_tonight": total_diesel_kwh,
    }


def resolve_battery_status(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return {
            "hour_index": 0, "local_time": "", "soc_pct": 0.0,
            "battery_charge_kw": 0.0, "battery_discharge_kw": 0.0, "battery_status": "idle",
        }
    idx = _hour_or_default(response_dict, hour_index)
    h = hourly[idx]
    charge_kw = _r1(h.get("battery_charge_kw", 0))
    discharge_kw = _r1(h.get("battery_discharge_kw", 0))
    if charge_kw > 0:
        status = "charging"
    elif discharge_kw > 0:
        status = "discharging"
    else:
        status = "idle"
    return {
        "hour_index": idx,
        "local_time": _time_label(h["timestamp"]),
        "soc_pct": round(h.get("soc", 0) * 100, 1),
        "battery_charge_kw": charge_kw,
        "battery_discharge_kw": discharge_kw,
        "battery_status": status,
    }


def resolve_savings_today(response_dict: dict, hour_index: int) -> dict:
    savings_list = response_dict.get("savings", [])
    naive = next((s for s in savings_list if s.get("vs_strategy") == "naive"), {})
    return {
        "cost_saved_inr": round(float(naive.get("cost_saved_inr", 0.0)), 1),
        "cost_saved_pct": round(float(naive.get("cost_saved_pct", 0.0)), 1),
        "diesel_liters_saved": round(float(naive.get("diesel_liters_saved", 0.0)), 1),
        "co2_saved_kg": round(float(naive.get("co2_saved_kg", 0.0)), 1),
    }


def resolve_peak_time(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return {"peak_hour_index": 0, "peak_time": "", "peak_demand_kw": 0.0}
    peak_idx = max(range(len(hourly)), key=lambda i: hourly[i].get("demand_kw", 0))
    h = hourly[peak_idx]
    return {
        "peak_hour_index": peak_idx,
        "peak_time": _time_label(h["timestamp"]),
        "peak_demand_kw": _r1(h.get("demand_kw", 0)),
    }


def resolve_solar_tomorrow(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return {"tomorrow_solar_kwh": 0.0, "tomorrow_peak_solar_kw": 0.0, "tomorrow_hours_count": 0}
    idx = _hour_or_default(response_dict, hour_index)
    today_date = _to_local(hourly[idx]["timestamp"]).strftime("%Y-%m-%d")
    tomorrow_hours = [h for h in hourly if _to_local(h["timestamp"]).strftime("%Y-%m-%d") != today_date]
    if not tomorrow_hours:
        tomorrow_hours = hourly[idx:]
    total_kwh = round(sum(h.get("solar_available_kw", 0) for h in tomorrow_hours), 1)
    peak_kw = round(max((h.get("solar_available_kw", 0) for h in tomorrow_hours), default=0.0), 1)
    return {
        "tomorrow_solar_kwh": total_kwh,
        "tomorrow_peak_solar_kw": peak_kw,
        "tomorrow_hours_count": len(tomorrow_hours),
    }


def resolve_critical_safe(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    idx = _hour_or_default(response_dict, hour_index)
    total_shed_kwh = round(sum(h.get("load_shed_kw", 0) for h in hourly), 1)
    critical_kw = _r1(hourly[idx].get("critical_demand_kw", 0)) if hourly else 0.0
    return {
        "hour_index": idx,
        "critical_kw": critical_kw,
        "total_load_shed_kwh": total_shed_kwh,
        "critical_always_safe": total_shed_kwh == 0.0,
    }


def resolve_what_now(response_dict: dict, hour_index: int) -> dict:
    hourly = response_dict.get("hourly", [])
    if not hourly:
        return {
            "hour_index": 0, "local_time": "", "demand_kw": 0.0, "solar_used_kw": 0.0,
            "wind_used_kw": 0.0, "diesel_on": False, "diesel_kw": 0.0, "soc_pct": 0.0,
            "load_shed_kw": 0.0, "reason_codes": [],
        }
    idx = _hour_or_default(response_dict, hour_index)
    h = hourly[idx]
    return {
        "hour_index": idx,
        "local_time": _time_label(h["timestamp"]),
        "demand_kw": _r1(h.get("demand_kw", 0)),
        "solar_used_kw": _r1(h.get("solar_used_kw", 0)),
        "wind_used_kw": _r1(h.get("wind_used_kw", 0)),
        "diesel_on": bool(h.get("diesel_on", False)),
        "diesel_kw": _r1(h.get("diesel_kw", 0)),
        "soc_pct": round(h.get("soc", 0) * 100, 1),
        "load_shed_kw": _r1(h.get("load_shed_kw", 0)),
        "reason_codes": h.get("reason_codes", []),
    }


def resolve_unknown(response_dict: dict, hour_index: int) -> dict:
    return {}


RESOLVERS: dict[Intent, Callable[[dict, int], dict]] = {
    Intent.DIESEL_TONIGHT: resolve_diesel_tonight,
    Intent.DIESEL_NOW: resolve_diesel_now,
    Intent.BATTERY_STATUS: resolve_battery_status,
    Intent.SAVINGS_TODAY: resolve_savings_today,
    Intent.PEAK_TIME: resolve_peak_time,
    Intent.SOLAR_TOMORROW: resolve_solar_tomorrow,
    Intent.CRITICAL_SAFE: resolve_critical_safe,
    Intent.WHAT_NOW: resolve_what_now,
    Intent.UNKNOWN: resolve_unknown,
}


def resolve_facts(intent: Intent, response_dict: dict, hour_index: int | None) -> dict:
    """Resolve the facts dict for one intent. Never raises."""
    idx = _hour_or_default(response_dict, hour_index)
    resolver = RESOLVERS.get(intent, resolve_unknown)
    return resolver(response_dict, idx)
