import type { HourlyDispatch, ReasonCode } from '../types/api'
import { formatHourTick } from './format'

export interface MixSeriesPoint {
  label: string
  timestamp: string
  hour_index: number
  solar_used_kw: number
  wind_used_kw: number
  battery_discharge_kw: number
  diesel_kw: number
  battery_charge_neg_kw: number
  curtailed_kw: number
  load_shed_kw: number
  demand_kw: number
  is_night: boolean
  day_index: number
  soc: number
  reason_codes: ReasonCode[]
  diesel_on: boolean
  naive_diesel_kw?: number
}

export interface SocSeriesPoint {
  label: string
  timestamp: string
  hour_index: number
  soc_pct: number
  diesel_on: boolean
  baseline_soc_pct?: number
  is_night: boolean
  day_index: number
}

export type DominantSourceType = 'solar' | 'wind' | 'battery' | 'diesel' | 'none'

function getKolkataDateString(timestamp: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return timestamp.slice(0, 10)
  }
}

/**
 * Detect hour indices where a new calendar day starts (Asia/Kolkata)
 */
export function dayBoundaries(hourly: HourlyDispatch[]): number[] {
  if (!hourly || hourly.length === 0) return []
  const boundaries: number[] = []
  let prevDate = getKolkataDateString(hourly[0].timestamp)

  for (let i = 1; i < hourly.length; i++) {
    const currDate = getKolkataDateString(hourly[i].timestamp)
    if (currDate !== prevDate) {
      boundaries.push(hourly[i].hour_index)
      prevDate = currDate
    }
  }
  return boundaries
}

/**
 * Returns contiguous [start, end] index ranges where is_night is true (solar_available_kw === 0)
 */
export function nightRanges(hourly: HourlyDispatch[]): [number, number][] {
  if (!hourly || hourly.length === 0) return []
  const ranges: [number, number][] = []
  let inNight = false
  let rangeStart = 0

  for (let i = 0; i < hourly.length; i++) {
    const isNight = hourly[i].solar_available_kw === 0
    if (isNight && !inNight) {
      inNight = true
      rangeStart = hourly[i].hour_index
    } else if (!isNight && inNight) {
      inNight = false
      ranges.push([rangeStart, hourly[i - 1].hour_index])
    }
  }

  if (inNight) {
    ranges.push([rangeStart, hourly[hourly.length - 1].hour_index])
  }

  return ranges
}

/**
 * Determine the dominant source for a given hour dispatch
 */
export function dominantSource(hour: HourlyDispatch): DominantSourceType {
  const sources: { type: DominantSourceType; val: number }[] = [
    { type: 'solar', val: hour.solar_used_kw },
    { type: 'wind', val: hour.wind_used_kw },
    { type: 'battery', val: hour.battery_discharge_kw },
    { type: 'diesel', val: hour.diesel_kw },
  ]
  const max = sources.reduce<{ type: DominantSourceType; val: number }>(
    (prev, curr) => (curr.val > prev.val ? curr : prev),
    { type: 'none', val: 0 }
  )
  return max.val > 0.05 ? max.type : 'none'
}

/**
 * Transform hourly dispatch data into energy mix chart series
 */
export function toMixSeries(
  hourly: HourlyDispatch[],
  naiveHourly?: HourlyDispatch[]
): MixSeriesPoint[] {
  if (!hourly || hourly.length === 0) return []
  const startDate = getKolkataDateString(hourly[0].timestamp)
  const naiveMap = new Map<number, HourlyDispatch>()
  if (naiveHourly) {
    for (const nh of naiveHourly) {
      naiveMap.set(nh.hour_index, nh)
    }
  }

  return hourly.map((h) => {
    const currDate = getKolkataDateString(h.timestamp)
    const dayIndex = currDate === startDate ? 0 : 1
    const naivePoint = naiveMap.get(h.hour_index)

    return {
      label: formatHourTick(h.hour_index, h.timestamp),
      timestamp: h.timestamp,
      hour_index: h.hour_index,
      solar_used_kw: Number(h.solar_used_kw.toFixed(3)),
      wind_used_kw: Number(h.wind_used_kw.toFixed(3)),
      battery_discharge_kw: Number(h.battery_discharge_kw.toFixed(3)),
      diesel_kw: Number(h.diesel_kw.toFixed(3)),
      battery_charge_neg_kw: Number((-h.battery_charge_kw).toFixed(3)),
      curtailed_kw: Number(h.curtailed_kw.toFixed(3)),
      load_shed_kw: Number(h.load_shed_kw.toFixed(3)),
      demand_kw: Number(h.demand_kw.toFixed(3)),
      is_night: h.solar_available_kw === 0,
      day_index: dayIndex,
      soc: h.soc,
      reason_codes: h.reason_codes || [],
      diesel_on: h.diesel_on,
      naive_diesel_kw: naivePoint ? Number(naivePoint.diesel_kw.toFixed(3)) : undefined,
    }
  })
}

/**
 * Transform hourly dispatch data into battery SOC chart series
 */
export function toSocSeries(
  hourly: HourlyDispatch[],
  baselineHourly?: HourlyDispatch[]
): SocSeriesPoint[] {
  if (!hourly || hourly.length === 0) return []
  const startDate = getKolkataDateString(hourly[0].timestamp)
  const baselineMap = new Map<number, HourlyDispatch>()
  if (baselineHourly) {
    for (const bh of baselineHourly) {
      baselineMap.set(bh.hour_index, bh)
    }
  }

  return hourly.map((h) => {
    const currDate = getKolkataDateString(h.timestamp)
    const dayIndex = currDate === startDate ? 0 : 1
    const baselinePoint = baselineMap.get(h.hour_index)

    return {
      label: formatHourTick(h.hour_index, h.timestamp),
      timestamp: h.timestamp,
      hour_index: h.hour_index,
      soc_pct: Number((h.soc * 100).toFixed(2)),
      diesel_on: h.diesel_on,
      baseline_soc_pct: baselinePoint ? Number((baselinePoint.soc * 100).toFixed(2)) : undefined,
      is_night: h.solar_available_kw === 0,
      day_index: dayIndex,
    }
  })
}
