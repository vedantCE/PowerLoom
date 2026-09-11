export function formatKw(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.0 kW'
  return `${Number(val).toFixed(1)} kW`
}

export function formatKwh(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.0 kWh'
  return `${Number(val).toFixed(1)} kWh`
}

export function formatInr(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '₹0'
  return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`
}

export function formatPct(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.0%'
  return `${Number(val).toFixed(1)}%`
}

export function formatCo2(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.0 kg'
  return `${Number(val).toFixed(1)} kg`
}

export function formatLiters(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.0 L'
  return `${Number(val).toFixed(1)} L`
}

export function formatHourTick(hourIndex: number, timestamp?: string): string {
  if (timestamp) {
    try {
      const date = new Date(timestamp)
      const hours = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
      return hours
    } catch {
      // Fall back to index calculation
    }
  }
  const h = hourIndex % 24
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

export function formatFullTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return timestamp
  }
}
