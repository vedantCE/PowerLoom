// Lightweight, deterministic what-if transform for MOCK MODE ONLY (VITE_USE_MOCK=true).
// The static optimize-response.json fixture never changes on its own, so this module
// re-derives plausible hourly dispatch + summary numbers from the fixture whenever
// WhatIfOverrides are present, so sliders visibly move the charts and savings.
//
// This is NOT the real optimizer — it never runs against the live backend and must
// never be imported outside src/mocks/.
import type {
  HourlyDispatch,
  OptimizeResponse,
  PlanSummary,
  Savings,
  VillageConfig,
  WhatIfOverrides,
} from '../types/api'

// Assumed cloudiness baked into the static fixture (see CLAUDE.md cloud override formula).
const FIXTURE_BASE_CLOUD_FRACTION = 0.3
const EPSILON = 1e-6

function round3(v: number): number {
  return Number(v.toFixed(3))
}

function kastenCzeplak(cloudFraction: number): number {
  return 1 - 0.75 * Math.pow(cloudFraction, 3.4)
}

function solarScaleFactor(overrides: WhatIfOverrides, preset: VillageConfig): number {
  let factor = 1

  if (overrides.cloud_cover_pct !== undefined && overrides.cloud_cover_pct !== null) {
    const c = overrides.cloud_cover_pct / 100
    factor *= kastenCzeplak(c) / kastenCzeplak(FIXTURE_BASE_CLOUD_FRACTION)
  }

  const baseKw = preset.solar.capacity_kw
  if (overrides.extra_solar_kw && baseKw > 0) {
    factor *= (baseKw + overrides.extra_solar_kw) / baseKw
  }

  return factor
}

/**
 * Recompute one hour's dispatch given a solar scale factor and generator availability.
 * Battery charge/discharge are treated as fixed ("kept unchanged") in the common case;
 * they are only nudged as a last resort to guarantee critical load is never shed and the
 * hourly power balance always holds (see: emergency reserve tap below).
 */
function recomputeHour(
  h: HourlyDispatch,
  solarFactor: number,
  dieselAvailable: boolean
): HourlyDispatch {
  const solar_available_kw = round3(h.solar_available_kw * solarFactor)
  let solar_used_kw = round3(h.solar_used_kw * solarFactor)

  let battery_charge_kw = h.battery_charge_kw
  let battery_discharge_kw = h.battery_discharge_kw

  const netAvailable = solar_used_kw + h.wind_used_kw + battery_discharge_kw - battery_charge_kw
  const gap = h.demand_kw - netAvailable

  let diesel_kw = 0
  let curtailed_kw = 0
  let load_shed_kw = 0
  let reason_codes = h.reason_codes

  if (gap > EPSILON) {
    if (dieselAvailable) {
      diesel_kw = round3(gap)
    } else {
      const cap = Math.max(0, h.demand_kw - h.critical_demand_kw)
      load_shed_kw = round3(Math.min(gap, cap))
      let remaining = gap - load_shed_kw

      if (remaining > EPSILON) {
        // Discretionary battery charging is dropped first to protect critical load.
        const chargeReduction = Math.min(battery_charge_kw, remaining)
        battery_charge_kw = round3(battery_charge_kw - chargeReduction)
        remaining -= chargeReduction
      }

      if (remaining > EPSILON) {
        // Emergency reserve tap: as a last resort, discharge a little further so
        // critical demand is genuinely never shed (matches the stress-test guarantee).
        battery_discharge_kw = round3(battery_discharge_kw + remaining)
        remaining = 0
      }

      if (load_shed_kw > EPSILON && !reason_codes.includes('NONCRITICAL_LOAD_SHED')) {
        reason_codes = [...reason_codes, 'NONCRITICAL_LOAD_SHED']
      }
    }
  } else if (gap < -EPSILON) {
    // Surplus: it isn't actually delivered, so pull it back out of solar_used_kw
    // (curtailment is assumed to hit solar first, since only solar is scaled here)
    // before reporting it as curtailed_kw.
    curtailed_kw = round3(-gap)
    const reduceFromSolar = Math.min(curtailed_kw, solar_used_kw)
    solar_used_kw = round3(solar_used_kw - reduceFromSolar)
  }

  return {
    ...h,
    solar_available_kw,
    solar_used_kw,
    battery_charge_kw,
    battery_discharge_kw,
    diesel_kw,
    diesel_on: diesel_kw > EPSILON,
    curtailed_kw,
    load_shed_kw,
    reason_codes,
  }
}

function recomputeSummary(
  hourly: HourlyDispatch[],
  originalHourly: HourlyDispatch[],
  originalSummary: PlanSummary,
  preset: VillageConfig,
  dieselPrice: number
): PlanSummary {
  const co2PerL = preset.diesel.co2_kg_per_l

  // Calibrate a blended liters-per-kWh rate from the fixture itself (rather than
  // preset.diesel's intercept/slope, which was not what the static fixture's
  // summary was originally seeded with) so that a diesel-price-only override
  // reproduces the exact same diesel_liters/co2_kg as the untouched baseline.
  const originalDieselKwh = originalHourly.reduce((sum, h) => sum + h.diesel_kw, 0)
  const litersPerKwh = originalDieselKwh > 0 ? originalSummary.diesel_liters / originalDieselKwh : 0

  let dieselHours = 0
  let dieselLiters = 0
  let renewableKwh = 0
  let servedKwh = 0
  let loadShedKwh = 0
  let curtailedKwh = 0
  let hoursWithFullUptime = 0
  let hoursWithCriticalMet = 0

  for (const h of hourly) {
    if (h.diesel_on) {
      dieselHours += 1
      dieselLiters += litersPerKwh * h.diesel_kw
    }
    renewableKwh += h.solar_used_kw + h.wind_used_kw
    servedKwh += h.demand_kw - h.load_shed_kw
    loadShedKwh += h.load_shed_kw
    curtailedKwh += h.curtailed_kw
    if (h.load_shed_kw <= EPSILON) hoursWithFullUptime += 1
    if (h.demand_kw - h.load_shed_kw >= h.critical_demand_kw - EPSILON) hoursWithCriticalMet += 1
  }

  const fuelCostInr = dieselLiters * dieselPrice
  const co2Kg = dieselLiters * co2PerL

  // Preserve whatever cost the fixture attributed to things this mock doesn't model
  // (battery wear, etc.) so total_cost still moves sensibly with diesel price / shed.
  const otherCost =
    originalSummary.total_cost_inr -
    originalSummary.fuel_cost_inr -
    preset.economics.co2_penalty_inr_per_kg * originalSummary.co2_kg -
    preset.economics.shed_penalty_inr_per_kwh * originalSummary.load_shed_kwh

  const totalCostInr =
    fuelCostInr +
    preset.economics.co2_penalty_inr_per_kg * co2Kg +
    preset.economics.shed_penalty_inr_per_kwh * loadShedKwh +
    otherCost

  return {
    total_cost_inr: round3(totalCostInr),
    fuel_cost_inr: round3(fuelCostInr),
    diesel_liters: round3(dieselLiters),
    diesel_hours: dieselHours,
    co2_kg: round3(co2Kg),
    renewable_share_pct: servedKwh > 0 ? round3((renewableKwh / servedKwh) * 100) : 0,
    uptime_pct: round3((hoursWithFullUptime / hourly.length) * 100),
    critical_uptime_pct: round3((hoursWithCriticalMet / hourly.length) * 100),
    load_shed_kwh: round3(loadShedKwh),
    curtailed_kwh: round3(curtailedKwh),
  }
}

function recomputeSavings(summary: PlanSummary, naiveSummary: PlanSummary): Savings {
  return {
    vs_strategy: 'naive',
    cost_saved_inr: round3(naiveSummary.total_cost_inr - summary.total_cost_inr),
    cost_saved_pct:
      naiveSummary.total_cost_inr > 0
        ? round3(
            ((naiveSummary.total_cost_inr - summary.total_cost_inr) / naiveSummary.total_cost_inr) *
              100
          )
        : 0,
    diesel_hours_saved: round3(naiveSummary.diesel_hours - summary.diesel_hours),
    diesel_liters_saved: round3(naiveSummary.diesel_liters - summary.diesel_liters),
    co2_saved_kg: round3(naiveSummary.co2_kg - summary.co2_kg),
  }
}

/**
 * Apply WhatIfOverrides to a mock OptimizeResponse, returning a NEW response.
 * Never mutates the input. Only src/mocks/mockApi.ts should call this.
 */
export function applyWhatIfOverrides(
  response: OptimizeResponse,
  overrides: WhatIfOverrides,
  preset: VillageConfig
): OptimizeResponse {
  const solarFactor = solarScaleFactor(overrides, preset)
  const dieselAvailable = overrides.diesel_available !== false
  const dieselPrice = overrides.diesel_price_inr_per_l ?? preset.diesel.fuel_price_inr_per_l

  const hourly = response.hourly.map((h) => recomputeHour(h, solarFactor, dieselAvailable))
  const summary = recomputeSummary(hourly, response.hourly, response.summary, preset, dieselPrice)

  const naiveBaseline = response.baselines.find((b) => b.strategy === 'naive')
  const savings = naiveBaseline ? [recomputeSavings(summary, naiveBaseline.summary)] : response.savings

  return {
    ...response,
    hourly,
    summary,
    savings,
  }
}
