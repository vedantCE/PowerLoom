export const CHART_COLORS = {
  solar: '#F59E0B',          // Amber 500
  wind: '#06B6D4',           // Cyan 500
  batteryDischarge: '#10B981', // Emerald 500
  batteryCharge: '#34D399',  // Emerald 400 (lighter shade for charging below axis)
  diesel: '#F97316',         // Orange 500
  curtailed: '#94A3B8',      // Slate 400
  demand: '#F8FAFC',         // Slate 50 (bold high-contrast white/slate)
  criticalDemand: '#F43F5E', // Rose 500
  loadShed: '#EF4444',       // Red 500
  baselineNaive: '#A855F7',  // Purple 500 (distinct dashed line)
  baselineCycle: '#EC4899',  // Pink 500
  safetyReserve: '#EF4444',  // Red 500 dashed line
  socMax: '#64748B',         // Slate 500
  nightShade: 'rgba(15, 23, 42, 0.45)', // Night background overlay
  dayBoundary: '#64748B',    // Slate 500
  selectedHour: '#38BDF8',   // Sky 400 highlight
  grid: 'rgba(148, 163, 184, 0.12)', // Subtle grid line
  text: '#94A3B8',           // Axis & label text
  tooltipBg: '#0F172A',      // Slate 900
  tooltipBorder: '#334155',  // Slate 700
} as const
