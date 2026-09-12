// Dev-only contract check for OptimizeResponse. Catches backend drift from the
// Pydantic schema (backend/app/schemas/optimize.py) immediately in the browser
// console, rather than surfacing as a confusing downstream chart/store bug.
import type { OptimizeResponse } from '../types/api'

const BALANCE_TOLERANCE_KW = 0.01

export function validateOptimizeResponse(response: OptimizeResponse): string[] {
  const issues: string[] = []

  if (response.hourly.length !== response.horizon_hours) {
    issues.push(
      `hourly.length (${response.hourly.length}) does not match horizon_hours (${response.horizon_hours})`
    )
  }

  response.hourly.forEach((h, i) => {
    const supply = h.solar_used_kw + h.wind_used_kw + h.battery_discharge_kw + h.diesel_kw
    const servedDemand = h.demand_kw - h.load_shed_kw + h.battery_charge_kw
    const imbalance = supply - servedDemand
    if (Math.abs(imbalance) > BALANCE_TOLERANCE_KW) {
      issues.push(
        `hour ${i}: power balance off by ${imbalance.toFixed(3)} kW (supply=${supply.toFixed(3)}, demand+charge-shed=${servedDemand.toFixed(3)})`
      )
    }
    if (h.soc < 0 || h.soc > 1) {
      issues.push(`hour ${i}: soc (${h.soc}) is outside the [0, 1] range`)
    }
  })

  return issues
}

export function logValidationWarnings(response: OptimizeResponse): void {
  if (!import.meta.env.DEV) return

  const issues = validateOptimizeResponse(response)
  if (issues.length === 0) return

  console.warn(
    `[Powerloom] OptimizeResponse contract violations for run ${response.run_id} (village ${response.village_id}):\n` +
      issues.map((issue) => ` - ${issue}`).join('\n')
  )
}
