/**
 * Formatting utilities for Powerloom dashboard.
 * - Currency in Indian Rupees (₹) with en-IN numbering format
 * - Power in kW, Energy in kWh
 * - Percentages
 * - Timezone-aware hour and day-hour formatting (Asia/Kolkata)
 */
import type { Language } from '../types/api'

export function formatINR(val: number, decimals = 0): string {
  if (isNaN(val)) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)
}

export function formatKw(val: number, decimals = 1): string {
  if (isNaN(val)) return '0.0 kW'
  return `${val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kW`
}

export function formatKwh(val: number, decimals = 1): string {
  if (isNaN(val)) return '0.0 kWh'
  return `${val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kWh`
}

export function formatPct(val: number, forceDecimals?: number): string {
  if (isNaN(val)) return '0%'
  if (forceDecimals !== undefined) {
    return `${val.toFixed(forceDecimals)}%`
  }
  const isWhole = Math.abs(val - Math.round(val)) < 0.001
  return `${isWhole ? Math.round(val) : val.toFixed(1)}%`
}

export function formatCo2(val: number, decimals = 1): string {
  if (isNaN(val)) return '0.0 kg'
  return `${val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kg`
}

type DayPeriod = 'night' | 'morning' | 'afternoon' | 'evening'

// Indian vernacular day-parts, not a literal AM/PM translation: a village
// operator thinks in "evening" not "19:00" or "7 PM". Boundaries follow
// common Hindi/Gujarati usage (evening extends through 7 PM).
function dayPeriodFor(hour24: number): DayPeriod {
  if (hour24 < 4) return 'night'
  if (hour24 < 12) return 'morning'
  if (hour24 < 16) return 'afternoon'
  if (hour24 < 20) return 'evening'
  return 'night'
}

const PERIOD_LABEL: Record<'gu' | 'hi', Record<DayPeriod, string>> = {
  gu: { night: 'રાત્રે', morning: 'સવારે', afternoon: 'બપોરે', evening: 'સાંજે' },
  hi: { night: 'रात', morning: 'सुबह', afternoon: 'दोपहर', evening: 'शाम' },
}

function hour12Of(hour24: number): number {
  const h = hour24 % 12
  return h === 0 ? 12 : h
}

function getKolkataHour24(timestamp: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).formatToParts(new Date(timestamp))
    const h = parts.find((p) => p.type === 'hour')?.value
    return h ? Number(h) % 24 : 0
  } catch {
    return 0
  }
}

/**
 * Locale-appropriate hour label: "7 PM" in English, but "સાંજે 7" / "शाम 7 बजे"
 * in Gujarati/Hindi — a vernacular day-part word instead of an AM/PM
 * translation, with Latin digits throughout (never Devanagari/Gujarati numerals).
 */
export function formatHourLabel(timestamp: string, language: Language = 'en'): string {
  if (language === 'en') {
    try {
      const d = new Date(timestamp)
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
    } catch {
      return '12 AM'
    }
  }

  const hour24 = getKolkataHour24(timestamp)
  const period = PERIOD_LABEL[language][dayPeriodFor(hour24)]
  const h = hour12Of(hour24)
  return language === 'hi' ? `${period} ${h} बजे` : `${period} ${h}`
}

export function formatHourTick(_hourIndex: number, timestamp: string, language: Language = 'en'): string {
  return formatHourLabel(timestamp, language)
}

export function formatDayHour(timestamp: string, hourIndex?: number, language: Language = 'en'): string {
  const timeLabel = formatHourLabel(timestamp, language)

  if (typeof hourIndex === 'number') {
    if (hourIndex < 24) {
      if (language === 'gu') return `આજે ${timeLabel}`
      if (language === 'hi') return `आज ${timeLabel}`
      return `Today ${timeLabel}`
    } else if (hourIndex < 48) {
      if (language === 'gu') return `આવતીકાલે ${timeLabel}`
      if (language === 'hi') return `कल ${timeLabel}`
      return `Tomorrow ${timeLabel}`
    } else {
      const dayNum = Math.floor(hourIndex / 24) + 1
      if (language === 'gu') return `દિવસ ${dayNum} ${timeLabel}`
      if (language === 'hi') return `दिन ${dayNum} ${timeLabel}`
      return `Day ${dayNum} ${timeLabel}`
    }
  }

  // Fallback: calculate difference based on date (unreached by current
  // callers, which always pass hourIndex — kept English-only intentionally).
  try {
    const d = new Date(timestamp)
    const day = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    })
    return `${day} ${timeLabel}`
  } catch {
    return timeLabel
  }
}
