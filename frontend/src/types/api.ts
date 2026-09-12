// Mirrors backend/app/schemas/*.py — any schema change MUST update both files
// in the same commit.

export type ReasonCode =
  | 'RENEWABLES_COVER_DEMAND'
  | 'SOLAR_SURPLUS_CHARGING'
  | 'PRECHARGE_FOR_FORECAST_DEFICIT'
  | 'EVENING_PEAK_DISCHARGE'
  | 'SOC_AT_MINIMUM'
  | 'DIESEL_EFFICIENT_LOADING'
  | 'DIESEL_CHARGING_BATTERY'
  | 'CURTAILMENT_BATTERY_FULL'
  | 'NONCRITICAL_LOAD_SHED'

export type ForecastSource = 'OPEN_METEO' | 'CACHE' | 'SYNTHETIC'

export type Language = 'en' | 'gu' | 'hi'

// --- village.py ---

export interface Location {
  name: string
  district: string
  state: string
  latitude: number
  longitude: number
}

export interface SolarConfig {
  capacity_kw: number
  system_loss: number
  temp_coeff_per_c: number
}

export interface WindConfig {
  capacity_kw: number
  cut_in_ms: number
  rated_ms: number
  cut_out_ms: number
  hub_height_m: number
}

export interface BatteryConfig {
  capacity_kwh: number
  soc_min: number
  soc_max: number
  soc_initial: number
  max_charge_kw: number
  max_discharge_kw: number
  eff_charge: number
  eff_discharge: number
  wear_cost_inr_per_kwh: number
}

export interface DieselConfig {
  capacity_kw: number
  min_load_frac: number
  fuel_intercept_l_per_h_per_kw: number
  fuel_slope_l_per_kwh: number
  fuel_price_inr_per_l: number
  co2_kg_per_l: number
}

export interface EconomicsConfig {
  co2_penalty_inr_per_kg: number
  shed_penalty_inr_per_kwh: number
}

export interface DemandComponent {
  name: string
  category: string
  critical: boolean
  quantity: number
  rated_w: number
  usage_factor: number
  schedule: [number, number][]
}

export interface VillageConfig {
  id: string
  location: Location
  solar: SolarConfig
  wind: WindConfig
  battery: BatteryConfig
  diesel: DieselConfig
  economics: EconomicsConfig
  demand_components: DemandComponent[]
}

export interface PresetSummary {
  id: string
  name: string
  district: string
  state: string
  solar_kw: number
  wind_kw: number
  battery_kwh: number
  diesel_kw: number
}

// --- optimize.py ---

export interface WhatIfOverrides {
  cloud_cover_pct?: number | null
  diesel_price_inr_per_l?: number | null
  extra_solar_kw?: number | null
  extra_battery_kwh?: number | null
  initial_soc?: number | null
  diesel_available?: boolean
}

export interface OptimizeRequest {
  village_id: string
  horizon_hours?: 24 | 48
  start_time?: string | null
  overrides?: WhatIfOverrides
}

export interface HourlyDispatch {
  hour_index: number
  timestamp: string
  demand_kw: number
  critical_demand_kw: number
  solar_available_kw: number
  wind_available_kw: number
  solar_used_kw: number
  wind_used_kw: number
  curtailed_kw: number
  battery_charge_kw: number
  battery_discharge_kw: number
  soc: number
  diesel_kw: number
  diesel_on: boolean
  load_shed_kw: number
  reason_codes: ReasonCode[]
}

export interface PlanSummary {
  total_cost_inr: number
  fuel_cost_inr: number
  diesel_liters: number
  diesel_hours: number
  co2_kg: number
  renewable_share_pct: number
  uptime_pct: number
  critical_uptime_pct: number
  load_shed_kwh: number
  curtailed_kwh: number
}

export interface BaselineResult {
  strategy: 'naive' | 'cycle_charging'
  summary: PlanSummary
  hourly: HourlyDispatch[]
}

export interface Savings {
  vs_strategy: string
  cost_saved_inr: number
  cost_saved_pct: number
  diesel_hours_saved: number
  diesel_liters_saved: number
  co2_saved_kg: number
}

export interface SolverInfo {
  status: string
  solve_time_ms: number
  objective_value: number | null
}

export interface OptimizeResponse {
  run_id: string
  village_id: string
  created_at: string
  horizon_hours: number
  forecast_source: ForecastSource
  hourly: HourlyDispatch[]
  summary: PlanSummary
  baselines: BaselineResult[]
  savings: Savings[]
  solver: SolverInfo
  is_mock: boolean
}

// --- explain.py ---

export interface ExplainRequest {
  run_id: string
  hour_index: number
  language?: Language
}

export interface ExplainResponse {
  run_id: string
  hour_index: number
  language: Language
  reason_codes: ReasonCode[]
  explanation: string
}

// --- health / runs ---

export interface HealthResponse {
  status: string
  app: string
  version: string
  solver_available: boolean
  database: 'postgresql' | 'sqlite'
  database_ok: boolean
}

export interface ScenarioRunSummary {
  id: string
  village_id: string
  created_at: string
  total_cost_inr: number
  cost_saved_inr: number | null
}

// --- chat.py ---

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequest {
  message: string
  village_id?: string | null
  run_id?: string | null
  horizon_hours?: 24 | 48
  overrides?: WhatIfOverrides | null
  history?: ChatMessage[]
}

export interface ChatResponse {
  message: string
  village_id: string
  run_id?: string | null
  sources_used?: string[]
}

