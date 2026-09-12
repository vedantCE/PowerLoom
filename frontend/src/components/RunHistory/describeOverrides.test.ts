import { describe, it, expect } from 'vitest'
import { describeOverrides } from './describeOverrides'
import { STRINGS } from '../../i18n/strings'
import type { StringKey } from '../../i18n/strings'

const t = (key: StringKey): string => STRINGS.en[key]

describe('describeOverrides', () => {
  it('returns "Default plan" for empty overrides', () => {
    expect(describeOverrides({}, t)).toBe(STRINGS.en.impactDefaultPlan)
  })

  it('describes a single override', () => {
    expect(describeOverrides({ cloud_cover_pct: 90 }, t)).toBe('Cloudy 90%')
  })

  it('joins multiple overrides with commas, in a stable order', () => {
    const desc = describeOverrides({ diesel_price_inr_per_l: 120, cloud_cover_pct: 90 }, t)
    expect(desc).toBe('Cloudy 90%, Diesel ₹120')
  })

  it('describes the generator-failure override', () => {
    expect(describeOverrides({ diesel_available: false }, t)).toBe('Generator offline')
  })

  it('ignores extra_solar_kw / extra_battery_kwh when zero (treated as default)', () => {
    expect(describeOverrides({ extra_solar_kw: 0, extra_battery_kwh: 0 }, t)).toBe(
      STRINGS.en.impactDefaultPlan
    )
  })
})
