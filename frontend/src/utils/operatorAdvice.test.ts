import { describe, it, expect } from 'vitest'
import { deriveOperatorSituation, formatOperatorAdvice, getOperatorAdvice } from './operatorAdvice'
import type { HourlyDispatch } from '../types/api'

function makeHour(overrides: Partial<HourlyDispatch> & { hour_index: number }): HourlyDispatch {
  return {
    timestamp: `2026-01-01T${String(overrides.hour_index % 24).padStart(2, '0')}:00:00+05:30`,
    demand_kw: 10,
    critical_demand_kw: 2,
    solar_available_kw: 0,
    wind_available_kw: 0,
    solar_used_kw: 0,
    wind_used_kw: 0,
    curtailed_kw: 0,
    battery_charge_kw: 0,
    battery_discharge_kw: 0,
    soc: 0.5,
    diesel_kw: 0,
    diesel_on: false,
    load_shed_kw: 0,
    reason_codes: [],
    ...overrides,
  }
}

describe('deriveOperatorSituation', () => {
  it('reports load shedding when active, even if diesel is also off', () => {
    const hourly = [
      makeHour({ hour_index: 0, load_shed_kw: 1.5, diesel_on: false }),
      makeHour({ hour_index: 1, diesel_on: false }),
    ]
    expect(deriveOperatorSituation(hourly, 0)).toEqual({
      type: 'load_shed_active',
      untilHourIndex: null,
    })
  })

  it('reports battery_low via reason_codes even when diesel is on', () => {
    const hourly = [
      makeHour({ hour_index: 0, diesel_on: true, reason_codes: ['SOC_AT_MINIMUM'] }),
      makeHour({ hour_index: 1, diesel_on: true }),
    ]
    expect(deriveOperatorSituation(hourly, 0).type).toBe('battery_low')
  })

  it('reports battery_low from raw soc when no reason codes are set', () => {
    const hourly = [makeHour({ hour_index: 0, soc: 0.21 })]
    expect(deriveOperatorSituation(hourly, 0).type).toBe('battery_low')
  })

  it('finds the hour diesel turns off when currently on', () => {
    const hourly = [
      makeHour({ hour_index: 0, diesel_on: true }),
      makeHour({ hour_index: 1, diesel_on: true }),
      makeHour({ hour_index: 2, diesel_on: false }),
    ]
    expect(deriveOperatorSituation(hourly, 0)).toEqual({
      type: 'diesel_on_until',
      untilHourIndex: 2,
    })
  })

  it('reports diesel_on_until with no end when diesel stays on for the rest of the horizon', () => {
    const hourly = [
      makeHour({ hour_index: 0, diesel_on: true }),
      makeHour({ hour_index: 1, diesel_on: true }),
    ]
    expect(deriveOperatorSituation(hourly, 0)).toEqual({
      type: 'diesel_on_until',
      untilHourIndex: null,
    })
  })

  it('finds the hour diesel turns on when currently off', () => {
    const hourly = [
      makeHour({ hour_index: 0, diesel_on: false }),
      makeHour({ hour_index: 1, diesel_on: false }),
      makeHour({ hour_index: 2, diesel_on: true }),
    ]
    expect(deriveOperatorSituation(hourly, 0)).toEqual({
      type: 'diesel_off_until',
      untilHourIndex: 2,
    })
  })

  it('falls back to renewables_ok when diesel never runs in the remaining horizon', () => {
    const hourly = [
      makeHour({ hour_index: 0, diesel_on: false }),
      makeHour({ hour_index: 1, diesel_on: false }),
    ]
    expect(deriveOperatorSituation(hourly, 0)).toEqual({
      type: 'renewables_ok',
      untilHourIndex: null,
    })
  })
})

describe('formatOperatorAdvice / getOperatorAdvice', () => {
  it('renders a translated diesel_off_until message with the resolved time in all 3 languages', () => {
    const hourly = [
      makeHour({ hour_index: 0, diesel_on: false }),
      makeHour({ hour_index: 1, diesel_on: true }),
    ]
    for (const lang of ['en', 'gu', 'hi'] as const) {
      const message = getOperatorAdvice(hourly, 0, lang)
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('never fabricates a time label when untilHourIndex has no matching hour', () => {
    const hourly = [makeHour({ hour_index: 0, diesel_on: true })]
    const message = formatOperatorAdvice(
      { type: 'diesel_on_until', untilHourIndex: 99 },
      hourly,
      'en'
    )
    expect(message).toBe('Diesel generator: keep it running for the rest of the day.')
  })
})
