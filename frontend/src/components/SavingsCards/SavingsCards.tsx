import React from 'react'
import { useAppStore } from '../../store/useAppStore'
import { formatInr, formatCo2, formatPct } from '../../utils/format'
import { useT } from '../../i18n/useT'
import { IndianRupee, Clock, Leaf, Zap } from 'lucide-react'

export const SavingsCards: React.FC = () => {
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const { t } = useT()

  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-slate-800 bg-slate-900/60 p-4" />
        ))}
      </div>
    )
  }

  if (!result) return null

  const savings = result.savings?.[0]
  const summary = result.summary

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Total Cost & Savings */}
      <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1.5">
            <IndianRupee className="h-4 w-4 text-emerald-400" />
            {t('totalCost')}
          </span>
          {savings && (
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              Save {savings.cost_saved_pct}%
            </span>
          )}
        </div>
        <div className="mt-2">
          <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono">
            {formatInr(summary.total_cost_inr)}
          </div>
          {savings && (
            <div className="text-[11px] text-emerald-400/90 font-medium">
              Save {formatInr(savings.cost_saved_inr)} vs naive
            </div>
          )}
        </div>
      </div>

      {/* Renewable Share */}
      <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-400" />
            {t('renewableShare')}
          </span>
        </div>
        <div className="mt-2">
          <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono">
            {formatPct(summary.renewable_share_pct)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            Solar & wind contribution
          </div>
        </div>
      </div>

      {/* Diesel Runtime */}
      <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-orange-400" />
            {t('dieselHours')}
          </span>
          {savings && (
            <span className="rounded-full bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold text-orange-400">
              -{savings.diesel_hours_saved}h
            </span>
          )}
        </div>
        <div className="mt-2">
          <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono">
            {summary.diesel_hours} hrs
          </div>
          <div className="text-[11px] text-orange-400/90 font-medium">
            {summary.diesel_liters.toFixed(1)} L fuel consumed
          </div>
        </div>
      </div>

      {/* CO2 Emissions */}
      <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1.5">
            <Leaf className="h-4 w-4 text-emerald-400" />
            {t('co2Emissions')}
          </span>
          {savings && (
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              -{savings.co2_saved_kg}kg
            </span>
          )}
        </div>
        <div className="mt-2">
          <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono">
            {formatCo2(summary.co2_kg)}
          </div>
          <div className="text-[11px] text-emerald-400/90 font-medium">
            Uptime: {summary.critical_uptime_pct}% critical
          </div>
        </div>
      </div>
    </div>
  )
}
