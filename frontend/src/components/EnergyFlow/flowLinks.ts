// The ONLY place that maps a single hour's dispatch into flow-diagram link values.
// HourlyDispatch records battery_charge_kw as one number without saying which
// generation source funded it, and curtailed_kw without saying which source was
// curtailed. This module makes that attribution explicit and deterministic so the
// diagram (and its tests) have one source of truth for "what fed what, this hour".
import type { HourlyDispatch, ReasonCode } from '../../types/api'

export type FlowNodeId = 'solar' | 'wind' | 'battery' | 'diesel' | 'village' | 'curtailed' | 'shed'

export interface FlowLink {
  id: string
  from: FlowNodeId
  to: FlowNodeId
  kw: number
}

export type BatteryMode = 'charging' | 'discharging' | 'idle'

export interface FlowBattery {
  soc: number
  mode: BatteryMode
  /** Magnitude of the active charge/discharge, 0 when idle. */
  kw: number
}

export interface FlowData {
  links: FlowLink[]
  battery: FlowBattery
  dieselOn: boolean
  demandKw: number
  criticalDemandKw: number
  nonCriticalDemandKw: number
  curtailedKw: number
  loadShedKw: number
  reasonCodes: ReasonCode[]
}

const EPSILON = 1e-6

/**
 * Maps one hour of dispatch to flow-diagram links.
 *
 * Battery charging is attributed to solar/wind first (proportional to their used
 * share), since those are the links the diagram draws; any charge beyond what
 * solar+wind generated this hour (e.g. an hour with DIESEL_CHARGING_BATTERY) is
 * attributed to diesel instead of being silently dropped or shown as an
 * impossible negative flow. Curtailment (not source-attributed in the schema) is
 * assigned to whichever of solar/wind had the larger unused surplus this hour.
 */
export function computeFlowLinks(hour: HourlyDispatch): FlowData {
  const renewableGen = hour.solar_used_kw + hour.wind_used_kw
  const renewableToBattery = Math.min(hour.battery_charge_kw, renewableGen)
  const solarToBattery = renewableGen > 0 ? renewableToBattery * (hour.solar_used_kw / renewableGen) : 0
  const windToBattery = renewableToBattery - solarToBattery
  const dieselToBattery = Math.max(0, hour.battery_charge_kw - renewableToBattery)

  const solarToVillage = Math.max(0, hour.solar_used_kw - solarToBattery)
  const windToVillage = Math.max(0, hour.wind_used_kw - windToBattery)
  const dieselToVillage = Math.max(0, hour.diesel_kw - dieselToBattery)
  const batteryToVillage = hour.battery_discharge_kw

  const solarSurplus = Math.max(0, hour.solar_available_kw - hour.solar_used_kw)
  const windSurplus = Math.max(0, hour.wind_available_kw - hour.wind_used_kw)
  const curtailFrom: FlowNodeId = solarSurplus >= windSurplus ? 'solar' : 'wind'

  const links: FlowLink[] = [
    { id: 'solar-village', from: 'solar', to: 'village', kw: solarToVillage },
    { id: 'wind-village', from: 'wind', to: 'village', kw: windToVillage },
    { id: 'diesel-village', from: 'diesel', to: 'village', kw: dieselToVillage },
    { id: 'solar-battery', from: 'solar', to: 'battery', kw: solarToBattery },
    { id: 'wind-battery', from: 'wind', to: 'battery', kw: windToBattery },
    { id: 'diesel-battery', from: 'diesel', to: 'battery', kw: dieselToBattery },
    { id: 'battery-village', from: 'battery', to: 'village', kw: batteryToVillage },
    { id: 'curtailed', from: curtailFrom, to: 'curtailed', kw: hour.curtailed_kw },
    { id: 'shed', from: 'village', to: 'shed', kw: hour.load_shed_kw },
  ]

  const mode: BatteryMode =
    hour.battery_charge_kw > EPSILON
      ? 'charging'
      : hour.battery_discharge_kw > EPSILON
        ? 'discharging'
        : 'idle'

  return {
    links,
    battery: {
      soc: hour.soc,
      mode,
      kw: mode === 'charging' ? hour.battery_charge_kw : mode === 'discharging' ? hour.battery_discharge_kw : 0,
    },
    dieselOn: hour.diesel_on,
    demandKw: hour.demand_kw,
    criticalDemandKw: hour.critical_demand_kw,
    nonCriticalDemandKw: Math.max(0, hour.demand_kw - hour.critical_demand_kw),
    curtailedKw: hour.curtailed_kw,
    loadShedKw: hour.load_shed_kw,
    reasonCodes: hour.reason_codes,
  }
}

/** Links worth drawing (non-zero kW), in the order they should be rendered. */
export function activeLinks(data: FlowData): FlowLink[] {
  return data.links.filter((l) => l.kw > EPSILON)
}

export function linksInto(data: FlowData, node: FlowNodeId): FlowLink[] {
  return data.links.filter((l) => l.to === node)
}
