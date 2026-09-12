import type {
  ExplainRequest,
  ExplainResponse,
  HealthResponse,
  HourlyDispatch,
  Language,
  OptimizeRequest,
  OptimizeResponse,
  PresetSummary,
  ReasonCode,
  ScenarioRunSummary,
  VillageConfig,
} from '../types/api'
import mockOptimizeFixture from './optimize-response.json'
import presetsFixture from './presets.json'
import { applyWhatIfOverrides } from './mockWhatIf'

function simulateLatency(minMs = 400, maxMs = 800): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// In-memory cache of recent mock runs so explain can look up exact hourly dispatches
const mockRunsCache = new Map<string, OptimizeResponse>()

function getOrSeedFixture(villageId: string, horizonHours = 48): OptimizeResponse {
  const cloned: OptimizeResponse = JSON.parse(JSON.stringify(mockOptimizeFixture))
  const freshRunId = crypto.randomUUID()
  cloned.run_id = freshRunId
  cloned.village_id = villageId
  cloned.created_at = new Date().toISOString()
  cloned.horizon_hours = horizonHours
  cloned.is_mock = true

  if (horizonHours === 24) {
    cloned.hourly = cloned.hourly.slice(0, 24)
    if (cloned.baselines) {
      cloned.baselines = cloned.baselines.map((b) => ({
        ...b,
        hourly: b.hourly.slice(0, 24),
      }))
    }
  }

  mockRunsCache.set(freshRunId, cloned)
  return cloned
}

// Initial seed
const defaultSeed = getOrSeedFixture('kutch_village', 48)
mockRunsCache.set(mockOptimizeFixture.run_id, defaultSeed)

export async function getHealth(): Promise<HealthResponse> {
  await simulateLatency()
  return {
    status: 'ok',
    app: 'powerloom',
    version: '0.1.0',
    solver_available: true,
    database: 'sqlite',
    database_ok: true,
  }
}

export async function getPresets(): Promise<PresetSummary[]> {
  await simulateLatency()
  return JSON.parse(JSON.stringify(presetsFixture)) as PresetSummary[]
}

function buildVillageConfig(id: string): VillageConfig {
  const summary = (presetsFixture as PresetSummary[]).find((p) => p.id === id) ?? presetsFixture[0]
  return {
    id: summary.id,
    location: {
      name: summary.name,
      district: summary.district,
      state: summary.state,
      latitude: 23.25,
      longitude: 69.67,
    },
    solar: { capacity_kw: summary.solar_kw, system_loss: 0.12, temp_coeff_per_c: -0.004 },
    wind: { capacity_kw: summary.wind_kw, cut_in_ms: 3.0, rated_ms: 11.0, cut_out_ms: 25.0, hub_height_m: 30 },
    battery: {
      capacity_kwh: summary.battery_kwh,
      soc_min: 0.2,
      soc_max: 1.0,
      soc_initial: 0.5,
      max_charge_kw: summary.battery_kwh / 2,
      max_discharge_kw: summary.battery_kwh / 2,
      eff_charge: 0.95,
      eff_discharge: 0.95,
      wear_cost_inr_per_kwh: 0.5,
    },
    diesel: {
      capacity_kw: summary.diesel_kw,
      min_load_frac: 0.3,
      fuel_intercept_l_per_h_per_kw: 0.05,
      fuel_slope_l_per_kwh: 0.25,
      fuel_price_inr_per_l: 90,
      co2_kg_per_l: 2.68,
    },
    economics: {
      co2_penalty_inr_per_kg: 5.0,
      shed_penalty_inr_per_kwh: 100.0,
    },
    demand_components: [
      {
        name: 'Village Residential & Commercial',
        category: 'base',
        critical: true,
        quantity: 1,
        rated_w: 5000,
        usage_factor: 1.0,
        schedule: [[0, 24]],
      },
    ],
  }
}

export async function getPreset(id: string): Promise<VillageConfig> {
  await simulateLatency()
  return buildVillageConfig(id)
}

export async function optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
  await simulateLatency()
  const horizon = req.horizon_hours ?? 48
  const response = getOrSeedFixture(req.village_id, horizon)

  if (req.overrides && Object.keys(req.overrides).length > 0) {
    const preset = buildVillageConfig(req.village_id)
    const transformed = applyWhatIfOverrides(response, req.overrides, preset)
    mockRunsCache.set(transformed.run_id, transformed)
    return transformed
  }

  return response
}

export async function getRuns(villageId?: string): Promise<ScenarioRunSummary[]> {
  await simulateLatency()
  const runs: ScenarioRunSummary[] = []
  for (const [, run] of mockRunsCache.entries()) {
    if (!villageId || run.village_id === villageId) {
      const naiveSavings = run.savings?.find((s) => s.vs_strategy === 'naive')
      runs.push({
        id: run.run_id,
        village_id: run.village_id,
        created_at: run.created_at,
        total_cost_inr: run.summary.total_cost_inr,
        cost_saved_inr: naiveSavings ? naiveSavings.cost_saved_inr : null,
      })
    }
  }
  return runs
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return '00:00'
  }
}

type ReasonTemplateMap = Record<
  ReasonCode,
  (h: HourlyDispatch, timeStr: string) => string
>

const TEMPLATES: Record<Language, ReasonTemplateMap> = {
  en: {
    RENEWABLES_COVER_DEMAND: (h, t) =>
      `Renewables (${(h.solar_used_kw + h.wind_used_kw).toFixed(1)} kW: ${h.solar_used_kw.toFixed(1)} kW solar, ${h.wind_used_kw.toFixed(1)} kW wind) fully met village demand of ${h.demand_kw.toFixed(1)} kW at ${t}.`,
    SOLAR_SURPLUS_CHARGING: (h) =>
      `Surplus solar generation charged the battery at ${h.battery_charge_kw.toFixed(1)} kW, raising SOC to ${Math.round(h.soc * 100)}%.`,
    PRECHARGE_FOR_FORECAST_DEFICIT: () =>
      `Battery was pre-charged in anticipation of forecasted renewable deficit in coming hours.`,
    EVENING_PEAK_DISCHARGE: (h) =>
      `Battery discharged at ${h.battery_discharge_kw.toFixed(1)} kW during peak demand (${h.demand_kw.toFixed(1)} kW), keeping SOC at ${Math.round(h.soc * 100)}% without diesel.`,
    SOC_AT_MINIMUM: (h) =>
      `Battery reached minimum reserve limit (${Math.round(h.soc * 100)}%), requiring backup dispatch to meet ${h.demand_kw.toFixed(1)} kW demand.`,
    DIESEL_EFFICIENT_LOADING: (h) =>
      `Diesel generator dispatched efficiently at ${h.diesel_kw.toFixed(1)} kW to meet ${h.demand_kw.toFixed(1)} kW load without low-load penalties.`,
    DIESEL_CHARGING_BATTERY: (h) =>
      `Diesel generator ran at optimal load, supplying village load and charging battery at ${h.battery_charge_kw.toFixed(1)} kW.`,
    CURTAILMENT_BATTERY_FULL: (h) =>
      `Renewable power was curtailed by ${h.curtailed_kw.toFixed(1)} kW because the battery was full (${Math.round(h.soc * 100)}% SOC).`,
    NONCRITICAL_LOAD_SHED: (h) =>
      `Non-critical load of ${h.load_shed_kw.toFixed(1)} kW was shed to protect battery reserves and preserve critical power.`,
  },
  gu: {
    RENEWABLES_COVER_DEMAND: (h, t) =>
      `${t} વાગ્યે પુનઃપ્રાપ્ય ઊર્જા (${(h.solar_used_kw + h.wind_used_kw).toFixed(1)} kW: ${h.solar_used_kw.toFixed(1)} kW સોલર, ${h.wind_used_kw.toFixed(1)} kW પવન) દ્વારા ગામની સમગ્ર વીજ માંગ (${h.demand_kw.toFixed(1)} kW) પૂરી કરવામાં આવી હતી.`,
    SOLAR_SURPLUS_CHARGING: (h) =>
      `વધારાની સૌર ઉર્જાથી બેટરી ${h.battery_charge_kw.toFixed(1)} kW ના દરે ચાર્જ થઈ, જે SOC વધારીને ${Math.round(h.soc * 100)}% કરે છે.`,
    PRECHARGE_FOR_FORECAST_DEFICIT: () =>
      `આગામી કલાકોમાં અપેક્ષિત પુનઃપ્રાપ્ય ઊર્જાની અછતને પહોંચી વળવા બેટરીને અગાઉથી ચાર્જ કરવામાં આવી.`,
    EVENING_PEAK_DISCHARGE: (h) =>
      `સાંજના પીક લોડ (${h.demand_kw.toFixed(1)} kW) દરમિયાન બેટરીમાંથી ${h.battery_discharge_kw.toFixed(1)} kW વીજળી પૂરી પાડવામાં આવી, SOC ${Math.round(h.soc * 100)}% રહ્યું.`,
    SOC_AT_MINIMUM: (h) =>
      `બેટરી તેના ન્યૂનતમ ચાર્જ સ્તર (${Math.round(h.soc * 100)}%) પર પહોંચી ગઈ, જેથી ${h.demand_kw.toFixed(1)} kW માંગ માટે બેકઅપ પાવરની જરૂર પડી.`,
    DIESEL_EFFICIENT_LOADING: (h) =>
      `ઓછા લોડ પર બળતણના બગાડથી બચવા અને ${h.demand_kw.toFixed(1)} kW માંગ પૂરી કરવા ડીઝલ જનરેટરને ${h.diesel_kw.toFixed(1)} kW ની કાર્યક્ષમ ક્ષમતા પર ચલાવવામાં આવ્યું.`,
    DIESEL_CHARGING_BATTERY: (h) =>
      `ડીઝલ જનરેટર શ્રેષ્ઠ કાર્યક્ષમતા પર ચાલ્યું અને વધારાની વીજળીથી બેટરી ${h.battery_charge_kw.toFixed(1)} kW ના દરે ચાર્જ કરવામાં આવી.`,
    CURTAILMENT_BATTERY_FULL: (h) =>
      `બેટરી સંપૂર્ણ ચાર્જ (${Math.round(h.soc * 100)}%) હોવાથી વધારાની ${h.curtailed_kw.toFixed(1)} kW સૌર/પવન ઊર્જા મર્યાદિત (કર્ટાઇલ) કરવામાં આવી.`,
    NONCRITICAL_LOAD_SHED: (h) =>
      `બેટરીના સ્વાસ્થ્ય અને નિર્ણાયક સેવાઓ માટે બિન-આવશ્યક વીજ વપરાશ (${h.load_shed_kw.toFixed(1)} kW) બંધ કરવામાં આવ્યો.`,
  },
  hi: {
    RENEWABLES_COVER_DEMAND: (h, t) =>
      `${t} बजे नवीकरणीय ऊर्जा (${(h.solar_used_kw + h.wind_used_kw).toFixed(1)} kW: ${h.solar_used_kw.toFixed(1)} kW सौर, ${h.wind_used_kw.toFixed(1)} kW पवन) ने गाँव की पूरी माँग (${h.demand_kw.toFixed(1)} kW) को पूरा किया।`,
    SOLAR_SURPLUS_CHARGING: (h) =>
      `अतिरिक्त सौर उत्पादन से बैटरी ${h.battery_charge_kw.toFixed(1)} kW पर चार्ज हुई, जिससे SOC ${Math.round(h.soc * 100)}% तक बढ़ गया।`,
    PRECHARGE_FOR_FORECAST_DEFICIT: () =>
      `आने वाले घंटों में अनुमानित नवीकरणीय कमी को पूरा करने के लिए बैटरी को पहले से चार्ज किया गया।`,
    EVENING_PEAK_DISCHARGE: (h) =>
      `शाम के पीक लोड (${h.demand_kw.toFixed(1)} kW) के दौरान बैटरी से ${h.battery_discharge_kw.toFixed(1)} kW डिस्चार्ज किया गया, SOC ${Math.round(h.soc * 100)}% रहा।`,
    SOC_AT_MINIMUM: (h) =>
      `बैटरी अपने न्यूनतम चार्ज स्तर (${Math.round(h.soc * 100)}%) पर पहुंच गई, जिससे ${h.demand_kw.toFixed(1)} kW माँग के लिए बैकअप की आवश्यकता हुई।`,
    DIESEL_EFFICIENT_LOADING: (h) =>
      `कम लोड पर ईंधन नुकसान से बचने और ${h.demand_kw.toFixed(1)} kW माँग पूरी करने के लिए डीजल जनरेटर को ${h.diesel_kw.toFixed(1)} kW पर कुशलता से चलाया गया।`,
    DIESEL_CHARGING_BATTERY: (h) =>
      `डीजल जनरेटर ने आदर्श क्षमता पर कार्य कर गाँव की आपूर्ति की और अतिरिक्त ${h.battery_charge_kw.toFixed(1)} kW से बैटरी चार्ज की।`,
    CURTAILMENT_BATTERY_FULL: (h) =>
      `बैटरी पूरी तरह चार्ज (${Math.round(h.soc * 100)}%) होने के कारण ${h.curtailed_kw.toFixed(1)} kW नवीकरणीय ऊर्जा को सीमित (कटौती) किया गया।`,
    NONCRITICAL_LOAD_SHED: (h) =>
      `बैटरी सुरक्षा और महत्वपूर्ण सेवाओं को चालू रखने के लिए ${h.load_shed_kw.toFixed(1)} kW गैर-जरूरी लोड को बंद किया गया।`,
  },
}

// Pure, synchronous, deterministic template renderer for a single hour's
// explanation. Shared by the mock `explain()` below AND by ExplainBox as an
// offline fallback when the real POST /api/explain isn't implemented yet
// (see backend/app/api/routes — no explain router registered).
export function buildTemplateExplanation(hour: HourlyDispatch, lang: Language): string {
  const timeStr = formatTime(hour.timestamp)
  const langTemplates = TEMPLATES[lang] ?? TEMPLATES.en
  const sentences: string[] = []

  if (hour.reason_codes && hour.reason_codes.length > 0) {
    for (const code of hour.reason_codes) {
      const templateFn = langTemplates[code]
      if (templateFn) {
        sentences.push(templateFn(hour, timeStr))
      }
    }
  }

  if (sentences.length === 0) {
    if (lang === 'gu') {
      sentences.push(
        `${timeStr} વાગ્યે, વીજ માંગ ${hour.demand_kw.toFixed(1)} kW હતી, જેને સોલર (${hour.solar_used_kw.toFixed(1)} kW), પવન (${hour.wind_used_kw.toFixed(1)} kW) અને બેટરી (${Math.round(hour.soc * 100)}% SOC) દ્વારા સંતુલિત કરવામાં આવી.`
      )
    } else if (lang === 'hi') {
      sentences.push(
        `${timeStr} बजे, माँग ${hour.demand_kw.toFixed(1)} kW थी, जिसे सौर (${hour.solar_used_kw.toFixed(1)} kW), पवन (${hour.wind_used_kw.toFixed(1)} kW) और बैटरी (${Math.round(hour.soc * 100)}% SOC) द्वारा संतुलित किया गया।`
      )
    } else {
      sentences.push(
        `At ${timeStr}, total demand was ${hour.demand_kw.toFixed(1)} kW, balanced with ${hour.solar_used_kw.toFixed(1)} kW solar, ${hour.wind_used_kw.toFixed(1)} kW wind, and battery at ${Math.round(hour.soc * 100)}% SOC.`
      )
    }
  }

  return sentences.join(' ')
}

export async function explain(req: ExplainRequest): Promise<ExplainResponse> {
  await simulateLatency()
  const lang: Language = req.language ?? 'en'
  const run = mockRunsCache.get(req.run_id) ?? defaultSeed
  const hour = run.hourly.find((h) => h.hour_index === req.hour_index) ?? run.hourly[0]

  return {
    run_id: req.run_id,
    hour_index: req.hour_index,
    language: lang,
    reason_codes: hour.reason_codes,
    explanation: buildTemplateExplanation(hour, lang),
  }
}
