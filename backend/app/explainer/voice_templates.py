"""Deterministic per-intent template answers for the voice query feature.

Mirrors app.explainer.templates: used when Gemini is unavailable, errors, or
its answer fails the number-validation guard, and always for UNKNOWN intent
(no LLM call is ever made for UNKNOWN). Must always return a non-empty,
correct sentence built ONLY from the resolved facts dict — never invents a
number.
"""

from __future__ import annotations

from app.explainer.intents import EXAMPLE_QUESTIONS, Intent
from app.schemas.common import Language

_UNKNOWN_PREFIX: dict[Language, str] = {
    Language.en: "I didn't understand that. Try asking:",
    Language.gu: "મને એ સમજાયું નહીં. આ રીતે પૂછી જુઓ:",
    Language.hi: "मुझे समझ नहीं आया। ऐसे पूछ कर देखें:",
}

_BATTERY_STATUS_WORD: dict[str, dict[Language, str]] = {
    "charging": {Language.en: "charging", Language.gu: "ચાર્જ થઈ રહી છે", Language.hi: "चार्ज हो रही है"},
    "discharging": {Language.en: "discharging", Language.gu: "ડિસ્ચાર્જ થઈ રહી છે", Language.hi: "डिस्चार्ज हो रही है"},
    "idle": {Language.en: "idle", Language.gu: "સ્થિર છે", Language.hi: "स्थिर है"},
}

_DIESEL_TONIGHT_YES: dict[Language, str] = {
    Language.en: (
        "Yes — tonight ({window_start_time} to {window_end_time}) diesel is scheduled to "
        "run for {diesel_hours_count} hour(s), using about {total_diesel_kwh_tonight} kWh."
    ),
    Language.gu: (
        "હા — આજે રાત્રે ({window_start_time} થી {window_end_time}) ડીઝલ "
        "{diesel_hours_count} કલાક ચાલવાનું આયોજન છે, અંદાજે {total_diesel_kwh_tonight} kWh વપરાશે."
    ),
    Language.hi: (
        "हाँ — आज रात ({window_start_time} से {window_end_time}) डीज़ल "
        "{diesel_hours_count} घंटे चलने वाला है, लगभग {total_diesel_kwh_tonight} kWh उपयोग होगा।"
    ),
}

_DIESEL_TONIGHT_NO: dict[Language, str] = {
    Language.en: (
        "No — the plan does not need diesel tonight ({window_start_time} to {window_end_time}); "
        "renewables and the battery cover demand."
    ),
    Language.gu: (
        "ના — આજે રાત્રે ({window_start_time} થી {window_end_time}) ડીઝલની જરૂર નથી; "
        "નવીકરણીય ઊર્જા અને બૅટરી માંગ પૂરી કરે છે."
    ),
    Language.hi: (
        "नहीं — आज रात ({window_start_time} से {window_end_time}) डीज़ल की ज़रूरत नहीं है; "
        "नवीकरणीय ऊर्जा और बैटरी माँग पूरी कर रही हैं।"
    ),
}

_DIESEL_NOW_ON: dict[Language, str] = {
    Language.en: "Yes, diesel is running now at {diesel_kw} kW to meet {demand_kw} kW demand ({local_time}).",
    Language.gu: "હા, ડીઝલ અત્યારે {diesel_kw} kW પર ચાલી રહ્યો છે, {demand_kw} kW માંગ માટે ({local_time}).",
    Language.hi: "हाँ, डीज़ल अभी {diesel_kw} kW पर चल रहा है, {demand_kw} kW माँग के लिए ({local_time})।",
}

_DIESEL_NOW_OFF: dict[Language, str] = {
    Language.en: "No, diesel is OFF right now ({local_time}); demand is {demand_kw} kW.",
    Language.gu: "ના, ડીઝલ અત્યારે બંધ છે ({local_time}); માંગ {demand_kw} kW છે.",
    Language.hi: "नहीं, डीज़ल अभी बंद है ({local_time}); माँग {demand_kw} kW है।",
}

_BATTERY_STATUS: dict[Language, str] = {
    Language.en: "The battery is at {soc_pct}% and is currently {status_word} ({local_time}).",
    Language.gu: "બૅટરી {soc_pct}% પર છે અને હાલમાં {status_word} ({local_time}).",
    Language.hi: "बैटरी {soc_pct}% पर है और अभी {status_word} है ({local_time})।",
}

_SAVINGS_TODAY: dict[Language, str] = {
    Language.en: (
        "This plan saves about ₹{cost_saved_inr} ({cost_saved_pct}%) versus the naive "
        "baseline, and avoids {diesel_liters_saved} L of diesel."
    ),
    Language.gu: (
        "આ યોજના સામાન્ય પદ્ધતિની સરખામણીમાં લગભગ ₹{cost_saved_inr} ({cost_saved_pct}%) "
        "બચાવે છે અને {diesel_liters_saved} L ડીઝલ ટાળે છે."
    ),
    Language.hi: (
        "यह योजना सामान्य तरीके की तुलना में लगभग ₹{cost_saved_inr} ({cost_saved_pct}%) "
        "बचाती है और {diesel_liters_saved} L डीज़ल बचाती है।"
    ),
}

_PEAK_TIME: dict[Language, str] = {
    Language.en: "The highest demand is {peak_demand_kw} kW, at {peak_time}.",
    Language.gu: "સૌથી વધુ માંગ {peak_demand_kw} kW છે, {peak_time} વખતે.",
    Language.hi: "सबसे ज़्यादा माँग {peak_demand_kw} kW है, {peak_time} पर।",
}

_SOLAR_TOMORROW: dict[Language, str] = {
    Language.en: (
        "Tomorrow's forecast shows about {tomorrow_solar_kwh} kWh of solar available, "
        "peaking at {tomorrow_peak_solar_kw} kW."
    ),
    Language.gu: (
        "આવતીકાલના અંદાજ મુજબ લગભગ {tomorrow_solar_kwh} kWh સૌર ઊર્જા ઉપલબ્ધ છે, "
        "મહત્તમ {tomorrow_peak_solar_kw} kW."
    ),
    Language.hi: (
        "कल के पूर्वानुमान के अनुसार लगभग {tomorrow_solar_kwh} kWh सौर ऊर्जा उपलब्ध है, "
        "अधिकतम {tomorrow_peak_solar_kw} kW।"
    ),
}

_CRITICAL_SAFE_YES: dict[Language, str] = {
    Language.en: "Yes, critical loads ({critical_kw} kW) stay fully powered — no load shedding in this plan.",
    Language.gu: "હા, જરૂરી ભાર ({critical_kw} kW) સંપૂર્ણ ચાલુ રહે છે — આ યોજનામાં કોઈ ભાર ઘટાડો નથી.",
    Language.hi: "हाँ, ज़रूरी भार ({critical_kw} kW) पूरी तरह चालू रहता है — इस योजना में कोई भार कटौती नहीं है।",
}

_CRITICAL_SAFE_NO: dict[Language, str] = {
    Language.en: (
        "Non-critical load was shed at times ({total_load_shed_kwh} kWh total), but critical "
        "loads are protected by design."
    ),
    Language.gu: (
        "અમુક સમયે બિનજરૂરી ભાર ઘટાડ્યો ({total_load_shed_kwh} kWh કુલ), પરંતુ જરૂરી ભાર "
        "સુરક્ષિત રહે છે."
    ),
    Language.hi: (
        "कुछ समय पर गैर-ज़रूरी भार काटा गया (कुल {total_load_shed_kwh} kWh), लेकिन ज़रूरी "
        "भार सुरक्षित रहता है।"
    ),
}

_WHAT_NOW: dict[Language, str] = {
    Language.en: (
        "Right now ({local_time}): demand is {demand_kw} kW, solar {solar_used_kw} kW, "
        "wind {wind_used_kw} kW, diesel {diesel_kw} kW, battery at {soc_pct}%."
    ),
    Language.gu: (
        "અત્યારે ({local_time}): માંગ {demand_kw} kW, સૌર {solar_used_kw} kW, "
        "પવન {wind_used_kw} kW, ડીઝલ {diesel_kw} kW, બૅટરી {soc_pct}%."
    ),
    Language.hi: (
        "अभी ({local_time}): माँग {demand_kw} kW, सौर {solar_used_kw} kW, "
        "पवन {wind_used_kw} kW, डीज़ल {diesel_kw} kW, बैटरी {soc_pct}%।"
    ),
}

_GENERIC: dict[Language, str] = {
    Language.en: "Here is the current plan status.",
    Language.gu: "આ વર્તમાન યોજનાની સ્થિતિ છે.",
    Language.hi: "यह वर्तमान योजना की स्थिति है।",
}


def _fmt_examples(language: Language) -> str:
    examples = EXAMPLE_QUESTIONS.get(language, EXAMPLE_QUESTIONS[Language.en])
    return " | ".join(examples)


def build_voice_template_answer(intent: Intent, facts: dict, language: Language) -> str:
    """Deterministic, facts-only answer for one intent. Never raises, never empty."""
    try:
        if intent is Intent.UNKNOWN:
            prefix = _UNKNOWN_PREFIX.get(language, _UNKNOWN_PREFIX[Language.en])
            return f"{prefix} {_fmt_examples(language)}"

        if intent is Intent.DIESEL_TONIGHT:
            bank = _DIESEL_TONIGHT_YES if facts.get("diesel_needed") else _DIESEL_TONIGHT_NO
            return bank[language].format(**facts)

        if intent is Intent.DIESEL_NOW:
            bank = _DIESEL_NOW_ON if facts.get("diesel_on") else _DIESEL_NOW_OFF
            return bank[language].format(**facts)

        if intent is Intent.BATTERY_STATUS:
            status_word = _BATTERY_STATUS_WORD.get(
                facts.get("battery_status", "idle"), _BATTERY_STATUS_WORD["idle"]
            )[language]
            return _BATTERY_STATUS[language].format(**facts, status_word=status_word)

        if intent is Intent.SAVINGS_TODAY:
            return _SAVINGS_TODAY[language].format(**facts)

        if intent is Intent.PEAK_TIME:
            return _PEAK_TIME[language].format(**facts)

        if intent is Intent.SOLAR_TOMORROW:
            return _SOLAR_TOMORROW[language].format(**facts)

        if intent is Intent.CRITICAL_SAFE:
            bank = _CRITICAL_SAFE_YES if facts.get("critical_always_safe") else _CRITICAL_SAFE_NO
            return bank[language].format(**facts)

        if intent is Intent.WHAT_NOW:
            return _WHAT_NOW[language].format(**facts)

    except (KeyError, ValueError):
        pass

    return _GENERIC.get(language, _GENERIC[Language.en])
