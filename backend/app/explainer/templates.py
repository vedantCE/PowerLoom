"""Deterministic template fallback for the explainer.

One template per ReasonCode × language (en, gu, hi).
Called when Gemini is unavailable or its response fails validation.
Must ALWAYS produce a correct, readable sentence — the demo never shows an error.

Gujarati and Hindi templates are natural language, not transliterated English.
"""

from __future__ import annotations

from app.schemas.common import Language, ReasonCode

# ---------------------------------------------------------------------------
# Template bank: {ReasonCode: {Language: template_string}}
# All templates use {key} placeholders from the facts dict.
# ---------------------------------------------------------------------------

_TEMPLATES: dict[ReasonCode, dict[Language, str]] = {
    ReasonCode.PRECHARGE_FOR_FORECAST_DEFICIT: {
        Language.en: (
            "The optimizer is pre-charging the battery to {soc_pct}% using diesel "
            "({diesel_kw} kW, {diesel_pct_of_capacity}% of capacity) because the next "
            "12 hours have only {next12h_renewable_ratio:.2f}× renewable cover versus demand. "
            "This look-ahead prevents a supply shortfall later in the night."
        ),
        Language.gu: (
            "ઓપ્ટિમાઇઝર ડીઝલ ({diesel_kw} kW) વડે બૅટરી {soc_pct}% સુધી ચાર્જ કરી રહ્યો છે "
            "કારણ કે આગામી ૧૨ કલાકમાં નવીકરણીય ઊર્જા માંગ કરતાં માત્ર {next12h_renewable_ratio:.2f} "
            "ગણી ઉપલબ્ધ છે. "
            "આ આગળ જોઈને લેવાયેલ નિર્ણય ભવિષ્યમાં વીજ ખામી ટાળે છે."
        ),
        Language.hi: (
            "ऑप्टिमाइज़र डीज़ल ({diesel_kw} kW) से बैटरी को {soc_pct}% तक पहले से चार्ज कर "
            "रहा है क्योंकि अगले 12 घंटों में नवीकरणीय ऊर्जा माँग का केवल "
            "{next12h_renewable_ratio:.2f} गुना उपलब्ध है। "
            "यह पूर्वानुमान-आधारित निर्णय बाद में आपूर्ति की कमी को रोकता है।"
        ),
    },
    ReasonCode.RENEWABLES_COVER_DEMAND: {
        Language.en: (
            "Solar ({solar_used_kw} kW) and wind ({wind_used_kw} kW) together cover the "
            "full {demand_kw} kW village demand this hour — no diesel is needed. "
            "The battery is at {soc_pct}%."
        ),
        Language.gu: (
            "સૌર ({solar_used_kw} kW) અને પવન ({wind_used_kw} kW) મળીને આ કલાકે ગામની "
            "સંપૂર્ણ {demand_kw} kW માંગ પૂરી કરે છે — ડીઝલની જરૂર નથી. "
            "બૅટરી {soc_pct}% પર છે."
        ),
        Language.hi: (
            "सौर ({solar_used_kw} kW) और पवन ({wind_used_kw} kW) मिलकर इस घंटे गाँव की पूरी "
            "{demand_kw} kW माँग को पूरा कर रहे हैं — डीज़ल की आवश्यकता नहीं है। "
            "बैटरी {soc_pct}% पर है।"
        ),
    },
    ReasonCode.SOLAR_SURPLUS_CHARGING: {
        Language.en: (
            "There is a solar surplus this hour — {solar_used_kw} kW of solar charges "
            "the battery at {battery_charge_kw} kW, bringing it to {soc_pct}%. "
            "{curtailed_kw} kW is curtailed because the battery is nearly full."
        ),
        Language.gu: (
            "આ કલાકે સૌર ઊર્જા વધારે છે — {solar_used_kw} kW સૌરથી "
            "બૅટરી {battery_charge_kw} kW ઝડપે ચાર્જ થઈ {soc_pct}% સુધી પહોંચી. "
            "{curtailed_kw} kW ઊર્જા વ્યર્થ ગઈ કારણ કે બૅટરી લગભગ ભરેલી છે."
        ),
        Language.hi: (
            "इस घंटे सौर अधिशेष है — {solar_used_kw} kW सौर ऊर्जा से बैटरी "
            "{battery_charge_kw} kW की दर से चार्ज होकर {soc_pct}% तक पहुँची। "
            "{curtailed_kw} kW ऊर्जा बर्बाद हुई क्योंकि बैटरी लगभग भरी है।"
        ),
    },
    ReasonCode.EVENING_PEAK_DISCHARGE: {
        Language.en: (
            "It is evening peak time ({local_time}): the battery discharges at "
            "{battery_discharge_kw} kW to meet the {demand_kw} kW demand, avoiding "
            "an expensive diesel start. Battery SOC is at {soc_pct}%."
        ),
        Language.gu: (
            "સાંજની પીક ટાઇમ ({local_time}) છે: {demand_kw} kW માંગ માટે "
            "બૅટરી {battery_discharge_kw} kW ઉર્જા આપી રહી છે, "
            "ડીઝલ ચાલુ કરવું ટળ્યું. બૅટરી SOC {soc_pct}% છે."
        ),
        Language.hi: (
            "शाम की पीक अवधि ({local_time}) है: {demand_kw} kW माँग के लिए "
            "बैटरी {battery_discharge_kw} kW बिजली दे रही है, "
            "महँगा डीज़ल चालू करना टला। बैटरी SOC {soc_pct}% है।"
        ),
    },
    ReasonCode.SOC_AT_MINIMUM: {
        Language.en: (
            "The battery SOC ({soc_pct}%) is at or near its minimum ({soc_min_pct}%), "
            "so it cannot provide more discharge. "
            "Diesel ({diesel_kw} kW) is covering the {demand_kw} kW demand."
        ),
        Language.gu: (
            "બૅટરી SOC ({soc_pct}%) ન્યૂનતમ ({soc_min_pct}%) પર અથવા નજીક છે, "
            "એટલે વધુ ડિસ્ચાર્જ શક્ય નથી. "
            "ડીઝલ ({diesel_kw} kW) {demand_kw} kW માંગ સ્વીકારી રહ્યો છે."
        ),
        Language.hi: (
            "बैटरी SOC ({soc_pct}%) अपने न्यूनतम ({soc_min_pct}%) पर या उसके निकट है, "
            "इसलिए और डिस्चार्ज सम्भव नहीं। "
            "डीज़ल ({diesel_kw} kW) {demand_kw} kW माँग पूरी कर रहा है।"
        ),
    },
    ReasonCode.DIESEL_EFFICIENT_LOADING: {
        Language.en: (
            "Diesel is running at {diesel_kw} kW ({diesel_pct_of_capacity}% of "
            "its {capacity_kw} kW capacity) — this is an efficient high-load run "
            "that minimises fuel waste from the fixed startup cost."
        ),
        Language.gu: (
            "ડીઝલ {diesel_kw} kW ({diesel_pct_of_capacity}% ક્ષમતા) પર ચાલી રહ્યો છે — "
            "આ ઊંચા ભારે ઉત્પાદન ઈંધણ-કાર્યક્ષમ છે "
            "અને ચાલુ કરવાના નિયત ખર્ચ ઘટાડે છે."
        ),
        Language.hi: (
            "डीज़ल {diesel_kw} kW ({diesel_pct_of_capacity}% क्षमता) पर चल रहा है — "
            "यह उच्च-भार पर कुशल संचालन है जो "
            "निश्चित स्टार्टअप लागत से होने वाली ईंधन बर्बादी को कम करता है।"
        ),
    },
    ReasonCode.DIESEL_CHARGING_BATTERY: {
        Language.en: (
            "Diesel ({diesel_kw} kW) is running and simultaneously charging the battery "
            "at {battery_charge_kw} kW (SOC now {soc_pct}%). "
            "This avoids another diesel start later in the day."
        ),
        Language.gu: (
            "ડીઝલ ({diesel_kw} kW) ચાલી રહ્યો છે અને સાથે બૅટરી "
            "{battery_charge_kw} kW ઝડપે ચાર્જ થઈ રહી છે (SOC {soc_pct}%). "
            "આ ભવિષ્યમાં ફરી ડીઝલ ચાલુ કરવું ટાળે છે."
        ),
        Language.hi: (
            "डीज़ल ({diesel_kw} kW) चल रहा है और साथ ही बैटरी "
            "{battery_charge_kw} kW की दर से चार्ज हो रही है (SOC {soc_pct}%)। "
            "यह बाद में फिर से डीज़ल चालू करने की ज़रूरत टालता है।"
        ),
    },
    ReasonCode.CURTAILMENT_BATTERY_FULL: {
        Language.en: (
            "The battery is full ({soc_pct}%), so {curtailed_kw} kW of renewable "
            "energy is curtailed this hour — it cannot be stored or used. "
            "Solar supply is {solar_used_kw} kW and wind is {wind_used_kw} kW."
        ),
        Language.gu: (
            "બૅટરી ભરેલી ({soc_pct}%) છે, તેથી {curtailed_kw} kW નવીકરણીય ઊર્જા "
            "આ કલાકે વ્યર્થ ગઈ — સંગ્રહ કે ઉપયોગ શક્ય ન હતો. "
            "સૌર {solar_used_kw} kW અને પવન {wind_used_kw} kW ઉપલબ્ધ છે."
        ),
        Language.hi: (
            "बैटरी पूरी ({soc_pct}%) भरी है, इसलिए {curtailed_kw} kW नवीकरणीय ऊर्जा "
            "इस घंटे व्यर्थ हो गई — न संग्रहित हो सकी न उपयोग हुई। "
            "सौर {solar_used_kw} kW और पवन {wind_used_kw} kW उपलब्ध है।"
        ),
    },
    ReasonCode.NONCRITICAL_LOAD_SHED: {
        Language.en: (
            "{load_shed_kw} kW of non-critical load was shed this hour because "
            "supply was insufficient — critical loads ({critical_kw} kW) were kept on. "
            "Battery SOC is {soc_pct}% and diesel is {'ON' if diesel_on else 'OFF'}."
        ),
        Language.gu: (
            "{load_shed_kw} kW બિનજરૂરી ભાર આ કલાકે ઘટાડ્યો — "
            "પૂરવઠો ઓછો હતો. "
            "જરૂરી ભાર ({critical_kw} kW) ચાલુ રાખ્યો. "
            "બૅટરી {soc_pct}% અને ડીઝલ {'ચાલુ' if diesel_on else 'બંધ'} છે."
        ),
        Language.hi: (
            "इस घंटे {load_shed_kw} kW गैर-ज़रूरी भार काटा गया क्योंकि "
            "आपूर्ति पर्याप्त नहीं थी — ज़रूरी भार ({critical_kw} kW) चालू रखा। "
            "बैटरी {soc_pct}% और डीज़ल {'चालू' if diesel_on else 'बंद'} है।"
        ),
    },
}

# Generic fallback used when a code is somehow missing from the map
_GENERIC: dict[Language, str] = {
    Language.en: (
        "At {local_time} the village demand is {demand_kw} kW. "
        "Solar provides {solar_used_kw} kW, wind {wind_used_kw} kW, "
        "diesel {diesel_kw} kW, and the battery SOC is {soc_pct}%."
    ),
    Language.gu: (
        "{local_time} એ ગામની માંગ {demand_kw} kW છે. "
        "સૌર {solar_used_kw} kW, પવન {wind_used_kw} kW, "
        "ડીઝલ {diesel_kw} kW, અને બૅટરી SOC {soc_pct}% છે."
    ),
    Language.hi: (
        "{local_time} पर गाँव की माँग {demand_kw} kW है। "
        "सौर {solar_used_kw} kW, पवन {wind_used_kw} kW, "
        "डीज़ल {diesel_kw} kW, और बैटरी SOC {soc_pct}% है।"
    ),
}


def build_template_explanation(facts: dict, reason_codes: list[str], language: Language) -> str:
    """Return a deterministic sentence for the highest-priority reason code.

    Always returns a non-empty string — never raises.
    """
    # Augment facts with diesel_on string representations for templates
    augmented = dict(facts)
    augmented.setdefault("capacity_kw", 25.0)  # fallback if not set

    for code_str in reason_codes:
        try:
            code = ReasonCode(code_str)
        except ValueError:
            continue
        template_map = _TEMPLATES.get(code)
        if template_map is None:
            continue
        template = template_map.get(language, template_map.get(Language.en, ""))
        if not template:
            continue
        try:
            return template.format(**augmented)
        except (KeyError, ValueError):
            continue

    # Nothing matched — use generic
    template = _GENERIC.get(language, _GENERIC[Language.en])
    try:
        return template.format(**augmented)
    except (KeyError, ValueError):
        return (
            f"Village demand: {facts.get('demand_kw', '?')} kW, "
            f"battery SOC: {facts.get('soc_pct', '?')}%."
        )
