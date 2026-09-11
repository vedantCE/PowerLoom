/**
 * Formatting utilities for Powerloom dashboard.
 * - Currency in Indian Rupees (₹) with en-IN numbering format
 * - Power in kW, Energy in kWh
 * - Percentages
 * - Timezone-aware hour and day-hour formatting (Asia/Kolkata)
 */

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

export function formatHourLabel(timestamp: string): string {
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

export function formatDayHour(timestamp: string, hourIndex?: number): string {
  const timeLabel = formatHourLabel(timestamp)

  if (typeof hourIndex === 'number') {
    if (hourIndex < 24) {
      return `Today ${timeLabel}`
    } else if (hourIndex < 48) {
      return `Tomorrow ${timeLabel}`
    } else {
      const dayNum = Math.floor(hourIndex / 24) + 1
      return `Day ${dayNum} ${timeLabel}`
    }
  }

  // Fallback: calculate difference based on date
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
