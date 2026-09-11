/**
 * Single source of truth color palette for Powerloom.
 * Used across charts, timeline, energy flow diagrams, and badges.
 *
 * Rules:
 * - solar: amber
 * - wind: sky/cyan
 * - battery: emerald
 * - diesel: slate/rose
 * - demand: indigo
 * - curtailed: light grey
 * - load shed: red
 */

export const ENERGY_COLORS = {
  solar: '#f59e0b',       // Amber 500
  solarDark: '#d97706',   // Amber 600
  solarLight: '#fef3c7',  // Amber 100

  wind: '#0ea5e9',        // Sky 500
  windDark: '#0284c7',    // Sky 600
  windLight: '#e0f2fe',   // Sky 100

  battery: '#10b981',     // Emerald 500
  batteryDark: '#059669', // Emerald 600
  batteryLight: '#d1fae5',// Emerald 100

  diesel: '#f43f5e',      // Rose 500
  dieselSlate: '#64748b', // Slate 500
  dieselDark: '#e11d48',  // Rose 600
  dieselLight: '#ffe4e6', // Rose 100

  demand: '#6366f1',      // Indigo 500
  demandDark: '#4f46e5',  // Indigo 600
  demandLight: '#e0e7ff', // Indigo 100

  curtailed: '#94a3b8',   // Slate 400
  curtailedDark: '#64748b',
  curtailedLight: '#f1f5f9',

  loadShed: '#ef4444',    // Red 500
  loadShedDark: '#dc2626',
  loadShedLight: '#fee2e2',
} as const

export type EnergySourceKey =
  | 'solar'
  | 'wind'
  | 'battery'
  | 'diesel'
  | 'demand'
  | 'curtailed'
  | 'loadShed'

export const SOURCE_LABELS: Record<EnergySourceKey, string> = {
  solar: 'Solar PV',
  wind: 'Wind',
  battery: 'Battery Storage',
  diesel: 'Diesel Generator',
  demand: 'Village Demand',
  curtailed: 'Curtailed',
  loadShed: 'Load Shed',
}

// Projector-optimized light theme surface and contrast tokens
export const THEME_TOKENS = {
  canvasBg: '#f8fafc',    // Slate 50
  cardBg: '#ffffff',      // Pure White
  cardBorder: '#e2e8f0',  // Slate 200
  cardBorderHover: '#cbd5e1', // Slate 300
  textPrimary: '#0f172a', // Slate 900 (ultra high contrast)
  textSecondary: '#475569', // Slate 600
  textMuted: '#64748b',   // Slate 500
  borderDark: '#94a3b8',  // Slate 400
} as const
