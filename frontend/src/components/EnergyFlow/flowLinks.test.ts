import { describe, it, expect } from 'vitest'
import mockResponse from '../../mocks/optimize-response.json'
import { computeFlowLinks, linksInto } from './flowLinks'
import type { OptimizeResponse } from '../../types/api'

const mockData = mockResponse as unknown as OptimizeResponse

describe('computeFlowLinks', () => {
  // Includes hour 28 (SOC_AT_MINIMUM + DIESEL_CHARGING_BATTERY: diesel funds most of
  // the battery charge that hour) and hour 46 (diesel-only, no charge/discharge).
  const sampleIndices = [0, 12, 24, 28, 30, 46]

  for (const i of sampleIndices) {
    const hour = mockData.hourly[i]

    it(`hour ${i}: links into village sum to demand - load_shed`, () => {
      const data = computeFlowLinks(hour)
      const intoVillage = linksInto(data, 'village').reduce((sum, l) => sum + l.kw, 0)
      expect(intoVillage).toBeCloseTo(hour.demand_kw - hour.load_shed_kw, 2)
    })

    // The schema does not guarantee battery_charge_kw/battery_discharge_kw are
    // mutually exclusive (the mock fixture has hours where both are non-zero,
    // e.g. hour 30: charge 4.75 kW and discharge 3.75 kW at once). The diagram
    // still must animate only one direction, so computeFlowLinks always resolves
    // to a single unambiguous mode — charging wins ties — for battery.mode/kw.
    it(`hour ${i}: battery.mode/kw resolves to exactly one direction`, () => {
      const data = computeFlowLinks(hour)
      expect(['charging', 'discharging', 'idle']).toContain(data.battery.mode)
      if (hour.battery_charge_kw > 1e-6) {
        expect(data.battery.mode).toBe('charging')
        expect(data.battery.kw).toBeCloseTo(hour.battery_charge_kw, 5)
      } else if (hour.battery_discharge_kw > 1e-6) {
        expect(data.battery.mode).toBe('discharging')
        expect(data.battery.kw).toBeCloseTo(hour.battery_discharge_kw, 5)
      } else {
        expect(data.battery.mode).toBe('idle')
        expect(data.battery.kw).toBe(0)
      }
    })

    it(`hour ${i}: every link kW is finite and non-negative`, () => {
      const data = computeFlowLinks(hour)
      for (const link of data.links) {
        expect(Number.isFinite(link.kw)).toBe(true)
        expect(link.kw).toBeGreaterThanOrEqual(-1e-6)
      }
    })

    it(`hour ${i}: total into battery equals battery_charge_kw`, () => {
      const data = computeFlowLinks(hour)
      const intoBattery = linksInto(data, 'battery').reduce((sum, l) => sum + l.kw, 0)
      expect(intoBattery).toBeCloseTo(hour.battery_charge_kw, 2)
    })
  }

  it('hour 28: diesel funds the shortfall the solar+wind cannot cover for battery charging', () => {
    const hour = mockData.hourly[28]
    const data = computeFlowLinks(hour)
    const dieselToBattery = data.links.find((l) => l.id === 'diesel-battery')!
    expect(dieselToBattery.kw).toBeGreaterThan(0)
  })

  it('reports SOC and diesel_on straight from the hour', () => {
    const hour = mockData.hourly[12]
    const data = computeFlowLinks(hour)
    expect(data.battery.soc).toBe(hour.soc)
    expect(data.dieselOn).toBe(hour.diesel_on)
    expect(data.nonCriticalDemandKw).toBeCloseTo(hour.demand_kw - hour.critical_demand_kw, 5)
  })
})
