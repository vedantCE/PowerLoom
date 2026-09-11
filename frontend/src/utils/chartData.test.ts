import { describe, it, expect } from 'vitest'
import mockResponse from '../mocks/optimize-response.json'
import {
  toMixSeries,
  toSocSeries,
  dayBoundaries,
  nightRanges,
  dominantSource,
} from './chartData'
import type { OptimizeResponse } from '../types/api'

const mockData = mockResponse as unknown as OptimizeResponse

describe('chartData transforms', () => {
  const hourly = mockData.hourly
  const naiveBaseline = mockData.baselines.find((b) => b.strategy === 'naive')

  it('preserves energy conservation: supply stack equals (demand - load_shed + charge) within 0.01 kW for every mock hour', () => {
    expect(hourly.length).toBe(48)
    for (const h of hourly) {
      const supply = h.solar_used_kw + h.wind_used_kw + h.battery_discharge_kw + h.diesel_kw
      const servedDemand = h.demand_kw - h.load_shed_kw
      const totalLoad = servedDemand + h.battery_charge_kw

      expect(Math.abs(supply - totalLoad)).toBeLessThanOrEqual(0.01)
    }
  })

  it('transforms mix series correctly with negative battery charging and naive comparison', () => {
    const series = toMixSeries(hourly, naiveBaseline?.hourly)
    expect(series.length).toBe(48)

    for (let i = 0; i < series.length; i++) {
      const pt = series[i]
      const h = hourly[i]
      expect(pt.hour_index).toBe(i)
      expect(pt.solar_used_kw).toBeCloseTo(h.solar_used_kw, 2)
      expect(pt.wind_used_kw).toBeCloseTo(h.wind_used_kw, 2)
      expect(pt.battery_discharge_kw).toBeCloseTo(h.battery_discharge_kw, 2)
      expect(pt.diesel_kw).toBeCloseTo(h.diesel_kw, 2)
      expect(pt.battery_charge_neg_kw).toBeCloseTo(-h.battery_charge_kw, 2)
      expect(pt.battery_charge_neg_kw).toBeLessThanOrEqual(0)
      expect(pt.demand_kw).toBeCloseTo(h.demand_kw, 2)
      expect(pt.is_night).toBe(h.solar_available_kw === 0)
      if (naiveBaseline?.hourly) {
        expect(pt.naive_diesel_kw).toBeDefined()
      }
    }
  })

  it('transforms soc series correctly with percentage scaling', () => {
    const series = toSocSeries(hourly, naiveBaseline?.hourly)
    expect(series.length).toBe(48)

    for (let i = 0; i < series.length; i++) {
      const pt = series[i]
      const h = hourly[i]
      expect(pt.hour_index).toBe(i)
      expect(pt.soc_pct).toBeCloseTo(h.soc * 100, 1)
      expect(pt.diesel_on).toBe(h.diesel_on)
      if (naiveBaseline?.hourly) {
        expect(pt.baseline_soc_pct).toBeCloseTo(naiveBaseline.hourly[i].soc * 100, 1)
      }
    }
  })

  it('detects day boundary for the 48-hour fixture at hour 24', () => {
    const boundaries = dayBoundaries(hourly)
    expect(boundaries).toEqual([24])
  })

  it('identifies correct night ranges based on solar_available_kw === 0', () => {
    const ranges = nightRanges(hourly)
    expect(ranges.length).toBeGreaterThan(0)

    for (const [start, end] of ranges) {
      for (let i = start; i <= end; i++) {
        expect(hourly[i].solar_available_kw).toBe(0)
      }
      if (start > 0) {
        expect(hourly[start - 1].solar_available_kw).toBeGreaterThan(0)
      }
      if (end < hourly.length - 1) {
        expect(hourly[end + 1].solar_available_kw).toBeGreaterThan(0)
      }
    }
  })

  it('calculates dominantSource correctly', () => {
    const solarHour = { ...hourly[0], solar_used_kw: 10, wind_used_kw: 2, battery_discharge_kw: 0, diesel_kw: 0 }
    expect(dominantSource(solarHour)).toBe('solar')

    const windHour = { ...hourly[0], solar_used_kw: 1, wind_used_kw: 8, battery_discharge_kw: 0, diesel_kw: 0 }
    expect(dominantSource(windHour)).toBe('wind')

    const battHour = { ...hourly[0], solar_used_kw: 0, wind_used_kw: 0, battery_discharge_kw: 5, diesel_kw: 0 }
    expect(dominantSource(battHour)).toBe('battery')

    const dieselHour = { ...hourly[0], solar_used_kw: 0, wind_used_kw: 0, battery_discharge_kw: 0, diesel_kw: 6 }
    expect(dominantSource(dieselHour)).toBe('diesel')

    const zeroHour = { ...hourly[0], solar_used_kw: 0, wind_used_kw: 0, battery_discharge_kw: 0, diesel_kw: 0 }
    expect(dominantSource(zeroHour)).toBe('none')
  })
})
