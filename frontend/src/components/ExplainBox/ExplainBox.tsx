import React from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/useT'
import { formatKw, formatPct, formatFullTimestamp } from '../../utils/format'
import { Sun, Wind, Battery, Fuel, Activity, Sparkles, CheckCircle2 } from 'lucide-react'

export const ExplainBox: React.FC = () => {
  const result = useAppStore((s) => s.result)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const { t, reasonLabel } = useT()

  if (!result?.hourly || selectedHour === null) return null

  const hourData = result.hourly.find((h) => h.hour_index === selectedHour)
  if (!hourData) return null

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400 border border-sky-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100">
              Hour {hourData.hour_index} Decision Breakdown
            </h3>
            <p className="text-xs text-slate-400">{formatFullTimestamp(hourData.timestamp)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-mono text-sky-400">
            SOC: {formatPct(hourData.soc * 100)}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              hourData.diesel_on
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            }`}
          >
            Diesel {hourData.diesel_on ? 'Active' : 'Off'}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-1">
            <Sun className="h-3.5 w-3.5" /> {t('solar')}
          </div>
          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
            {formatKw(hourData.solar_used_kw)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-1">
            <Wind className="h-3.5 w-3.5" /> {t('wind')}
          </div>
          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
            {formatKw(hourData.wind_used_kw)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-1">
            <Battery className="h-3.5 w-3.5" /> {t('batteryDischarge')}
          </div>
          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
            {formatKw(hourData.battery_discharge_kw)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-300 mb-1">
            <Battery className="h-3.5 w-3.5" /> {t('batteryCharge')}
          </div>
          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
            {formatKw(hourData.battery_charge_kw)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-orange-400 mb-1">
            <Fuel className="h-3.5 w-3.5" /> {t('diesel')}
          </div>
          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
            {formatKw(hourData.diesel_kw)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-1">
            <Activity className="h-3.5 w-3.5 text-sky-400" /> {t('demand')}
          </div>
          <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
            {formatKw(hourData.demand_kw)}
          </div>
        </div>
      </div>

      {/* Reason Codes */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          {t('reasons')} ({hourData.reason_codes.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {hourData.reason_codes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-950/60 border border-sky-800/60 px-3 py-1.5 text-xs font-medium text-sky-200"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
              {reasonLabel(code)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
