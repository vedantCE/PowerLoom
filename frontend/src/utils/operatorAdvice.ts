import type { HourlyDispatch, Language } from '../types/api'
import { formatHourLabel } from './format'

// One instruction per situation, derived from the plan's own facts (load
// shed, SOC, diesel on/off) — never invented advice. Mirrors the backend's
// reason-code approach: report what the plan already decided, in plain
// language, rather than generating new recommendations.
export type OperatorSituationType =
  | 'load_shed_active'
  | 'battery_low'
  | 'diesel_on_until'
  | 'diesel_off_until'
  | 'renewables_ok'

export interface OperatorSituation {
  type: OperatorSituationType
  /** Hour index where the current diesel on/off state changes, or null if it holds for the rest of the horizon. Only meaningful for diesel_on_until / diesel_off_until. */
  untilHourIndex: number | null
}

// Matches the backend's SOC_AT_MINIMUM heuristic ("within 2 points of
// soc_min") using the common 20% soc_min default as a plain fallback signal;
// reason_codes (when present) are checked first and take priority.
const SOC_LOW_FALLBACK_THRESHOLD = 0.22

/**
 * Pure, facts-only situation derivation for one hour of a dispatch plan.
 * No translation, no formatting — see formatOperatorAdvice for that.
 */
export function deriveOperatorSituation(
  hourly: HourlyDispatch[],
  currentHourIndex: number
): OperatorSituation {
  const current = hourly.find((h) => h.hour_index === currentHourIndex) ?? hourly[0]
  if (!current) {
    return { type: 'renewables_ok', untilHourIndex: null }
  }

  if (current.load_shed_kw > 0.05) {
    return { type: 'load_shed_active', untilHourIndex: null }
  }

  if (current.reason_codes?.includes('SOC_AT_MINIMUM') || current.soc <= SOC_LOW_FALLBACK_THRESHOLD) {
    return { type: 'battery_low', untilHourIndex: null }
  }

  const dieselOn = current.diesel_on
  const flipHour = hourly.find((h) => h.hour_index > currentHourIndex && h.diesel_on !== dieselOn)

  if (dieselOn) {
    return { type: 'diesel_on_until', untilHourIndex: flipHour ? flipHour.hour_index : null }
  }

  // Diesel is off. Only worth surfacing "keep off" as the instruction when
  // there's nothing more urgent — otherwise the plan is simply running on
  // renewables/battery and there's no diesel-related action to report.
  if (flipHour) {
    return { type: 'diesel_off_until', untilHourIndex: flipHour.hour_index }
  }
  return { type: 'renewables_ok', untilHourIndex: null }
}

type TemplateFn = (untilLabel: string | null) => string

const TEMPLATES: Record<Language, Record<OperatorSituationType, TemplateFn>> = {
  en: {
    load_shed_active:
      () => 'Some non-essential appliances are switched off right now to protect power for essential needs.',
    battery_low: () => 'Battery is low — avoid running extra appliances until it recharges.',
    diesel_on_until: (until) =>
      until
        ? `Diesel generator: keep it running until ${until}.`
        : 'Diesel generator: keep it running for the rest of the day.',
    diesel_off_until: (until) => `Diesel generator: keep OFF until ${until}.`,
    renewables_ok: () => 'Solar and wind are covering the village needs right now — diesel is not needed.',
  },
  gu: {
    load_shed_active: () => 'મહત્વપૂર્ણ પુરવઠો સુરક્ષિત રાખવા થોડાં બિન-જરૂરી સાધનો હાલ બંધ છે.',
    battery_low: () => 'બેટરી ઓછી છે — તે ફરી ચાર્જ ન થાય ત્યાં સુધી વધારાનાં સાધનો ચલાવવાનું ટાળો.',
    diesel_on_until: (until) =>
      until
        ? `ડીઝલ જનરેટર: ${until} સુધી ચાલુ રાખો.`
        : 'ડીઝલ જનરેટર: આજે બાકીના સમય માટે ચાલુ રાખો.',
    diesel_off_until: (until) => `ડીઝલ જનરેટર: ${until} સુધી બંધ રાખો.`,
    renewables_ok: () => 'સૌર અને પવન ઊર્જા હાલ ગામની જરૂરિયાત પૂરી કરી રહી છે — ડીઝલની જરૂર નથી.',
  },
  hi: {
    load_shed_active: () => 'ज़रूरी बिजली सुरक्षित रखने के लिए कुछ गैर-ज़रूरी उपकरण अभी बंद हैं।',
    battery_low: () => 'बैटरी कम है — इसके फिर चार्ज होने तक अतिरिक्त उपकरण चलाने से बचें।',
    diesel_on_until: (until) =>
      until
        ? `डीजल जनरेटर: ${until} तक चालू रखें।`
        : 'डीजल जनरेटर: आज बाकी समय के लिए चालू रखें।',
    diesel_off_until: (until) => `डीजल जनरेटर: ${until} तक बंद रखें।`,
    renewables_ok: () => 'सौर और पवन ऊर्जा अभी गाँव की ज़रूरत पूरी कर रही है — डीजल की ज़रूरत नहीं है।',
  },
}

export function formatOperatorAdvice(
  situation: OperatorSituation,
  hourly: HourlyDispatch[],
  language: Language
): string {
  let untilLabel: string | null = null
  if (situation.untilHourIndex !== null) {
    const untilHour = hourly.find((h) => h.hour_index === situation.untilHourIndex)
    untilLabel = untilHour ? formatHourLabel(untilHour.timestamp, language) : null
  }
  const templates = TEMPLATES[language] ?? TEMPLATES.en
  return templates[situation.type](untilLabel)
}

export function getOperatorAdvice(
  hourly: HourlyDispatch[],
  currentHourIndex: number,
  language: Language
): string {
  const situation = deriveOperatorSituation(hourly, currentHourIndex)
  return formatOperatorAdvice(situation, hourly, language)
}
