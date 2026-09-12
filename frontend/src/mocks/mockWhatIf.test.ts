import { describe, it, expect } from 'vitest'
import mockResponse from './optimize-response.json'
import { applyWhatIfOverrides } from './mockWhatIf'
import type { OptimizeResponse, VillageConfig, WhatIfOverrides } from '../types/api'

const mockData = mockResponse as unknown as OptimizeResponse

const preset: VillageConfig = {
  id: 'kutch_village',
  location: { name: 'Kutch Village', district: 'Kutch', state: 'Gujarat', latitude: 23.25, longitude: 69.67 },
  solar: { capacity_kw: 20, system_loss: 0.12, temp_coeff_per_c: -0.004 },
  wind: { capacity_kw: 10, cut_in_ms: 3, rated_ms: 11, cut_out_ms: 25, hub_height_m: 30 },
  battery: {
    capacity_kwh: 50,
    soc_min: 0.2,
    soc_max: 1.0,
    soc_initial: 0.5,
    max_charge_kw: 25,
    max_discharge_kw: 25,
    eff_charge: 0.95,
    eff_discharge: 0.95,
    wear_cost_inr_per_kwh: 0.5,
  },
  diesel: {
    capacity_kw: 25,
    min_load_frac: 0.3,
    fuel_intercept_l_per_h_per_kw: 0.05,
    fuel_slope_l_per_kwh: 0.25,
    fuel_price_inr_per_l: 90,
    co2_kg_per_l: 2.68,
  },
  economics: { co2_penalty_inr_per_kg: 5.0, shed_penalty_inr_per_kwh: 100.0 },
  demand_components: [],
}

function expectPowerBalance(result: OptimizeResponse) {
  for (const h of result.hourly) {
    const supply = h.solar_used_kw + h.wind_used_kw + h.battery_discharge_kw + h.diesel_kw
    const servedDemand = h.demand_kw - h.load_shed_kw
    const totalLoad = servedDemand + h.battery_charge_kw
    expect(Math.abs(supply - totalLoad)).toBeLessThanOrEqual(0.01)

    // Non-critical load shed must never dip into critical demand.
    expect(h.load_shed_kw).toBeLessThanOrEqual(h.demand_kw - h.critical_demand_kw + 0.01)
  }
}

const scenarios: { name: string; overrides: WhatIfOverrides }[] = [
  { name: 'cloudy tomorrow', overrides: { cloud_cover_pct: 90 } },
  { name: 'clear skies', overrides: { cloud_cover_pct: 0 } },
  { name: 'full overcast', overrides: { cloud_cover_pct: 100 } },
  { name: 'extra solar', overrides: { extra_solar_kw: 10 } },
  { name: 'diesel price hike', overrides: { diesel_price_inr_per_l: 120 } },
  { name: 'generator failure', overrides: { diesel_available: false } },
  {
    name: 'generator failure + full overcast',
    overrides: { diesel_available: false, cloud_cover_pct: 100 },
  },
  {
    name: 'generator failure + extra solar',
    overrides: { diesel_available: false, extra_solar_kw: 10 },
  },
  {
    name: 'kitchen sink',
    overrides: {
      cloud_cover_pct: 70,
      diesel_price_inr_per_l: 130,
      extra_solar_kw: 15,
      diesel_available: false,
    },
  },
]

describe('mockWhatIf.applyWhatIfOverrides', () => {
  for (const { name, overrides } of scenarios) {
    it(`holds power balance and never sheds critical load: ${name}`, () => {
      const result = applyWhatIfOverrides(mockData, overrides, preset)
      expect(result.hourly.length).toBe(mockData.hourly.length)
      expectPowerBalance(result)
    })
  }

  it('keeps critical uptime at 100% even when the generator fails', () => {
    const result = applyWhatIfOverrides(mockData, { diesel_available: false }, preset)
    expect(result.summary.critical_uptime_pct).toBe(100)
  })

  it('never mutates the input response', () => {
    const before = JSON.parse(JSON.stringify(mockData))
    applyWhatIfOverrides(mockData, { diesel_available: false, cloud_cover_pct: 90 }, preset)
    expect(mockData).toEqual(before)
  })

  it('raises diesel usage and cost when the generator fails is reversed (baseline stays available)', () => {
    const failure = applyWhatIfOverrides(mockData, { diesel_available: false }, preset)
    const available = applyWhatIfOverrides(mockData, {}, preset)
    expect(failure.summary.diesel_hours).toBe(0)
    expect(failure.summary.load_shed_kwh).toBeGreaterThan(0)
    expect(available.summary.load_shed_kwh).toBe(0)
  })

  it('increases total cost when diesel price rises, all else equal', () => {
    const base = applyWhatIfOverrides(mockData, { diesel_price_inr_per_l: 90 }, preset)
    const expensive = applyWhatIfOverrides(mockData, { diesel_price_inr_per_l: 120 }, preset)
    expect(expensive.summary.total_cost_inr).toBeGreaterThan(base.summary.total_cost_inr)
  })

  it('leaves diesel liters and CO2 unchanged when only diesel price changes (no physical override)', () => {
    const priceOnly = applyWhatIfOverrides(mockData, { diesel_price_inr_per_l: 120 }, preset)
    expect(priceOnly.summary.diesel_liters).toBeCloseTo(mockData.summary.diesel_liters, 1)
    expect(priceOnly.summary.co2_kg).toBeCloseTo(mockData.summary.co2_kg, 1)
    expect(priceOnly.summary.diesel_hours).toBe(mockData.summary.diesel_hours)
    // Cost should move by exactly liters * price delta (nothing else changed)
    const expectedCostDelta = mockData.summary.diesel_liters * (120 - 90)
    expect(priceOnly.summary.total_cost_inr - mockData.summary.total_cost_inr).toBeCloseTo(
      expectedCostDelta,
      0
    )
  })

  it('reduces solar output as cloud cover increases', () => {
    const clear = applyWhatIfOverrides(mockData, { cloud_cover_pct: 0 }, preset)
    const cloudy = applyWhatIfOverrides(mockData, { cloud_cover_pct: 90 }, preset)
    const sumSolar = (r: OptimizeResponse) => r.hourly.reduce((s, h) => s + h.solar_used_kw, 0)
    expect(sumSolar(cloudy)).toBeLessThan(sumSolar(clear))
  })
})
