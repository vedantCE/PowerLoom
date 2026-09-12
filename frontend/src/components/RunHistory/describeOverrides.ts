import type { WhatIfOverrides } from '../../types/api'
import type { StringKey } from '../../i18n/strings'

type Translate = (key: StringKey) => string

/** Short, human-readable summary of a scenario's overrides for the run-history list. */
export function describeOverrides(overrides: WhatIfOverrides, t: Translate): string {
  const parts: string[] = []

  if (overrides.cloud_cover_pct !== undefined && overrides.cloud_cover_pct !== null) {
    parts.push(`${t('historyCloudPrefix')} ${overrides.cloud_cover_pct}%`)
  }
  if (overrides.diesel_price_inr_per_l !== undefined && overrides.diesel_price_inr_per_l !== null) {
    parts.push(`${t('historyDieselPrefix')} ₹${overrides.diesel_price_inr_per_l}`)
  }
  if (overrides.extra_solar_kw) {
    parts.push(`+${overrides.extra_solar_kw}kW ${t('historySolarPrefix')}`)
  }
  if (overrides.extra_battery_kwh) {
    parts.push(`+${overrides.extra_battery_kwh}kWh ${t('historyBatteryPrefix')}`)
  }
  if (overrides.initial_soc !== undefined && overrides.initial_soc !== null) {
    parts.push(`${t('historySocPrefix')} ${Math.round(overrides.initial_soc * 100)}%`)
  }
  if (overrides.diesel_available === false) {
    parts.push(t('historyGeneratorOffline'))
  }

  return parts.length > 0 ? parts.join(', ') : t('impactDefaultPlan')
}
