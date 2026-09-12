import React from 'react'
import { TrendingDown, Clock, Leaf, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { formatINR, formatPct } from '../../utils/format'

export const SavingsCards: React.FC = () => {
  const { t } = useT()
  const { result, status } = useAppStore()

  if (status === 'loading' && !result) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            <div className="h-4 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-8 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    )
  }

  const naiveSavings =
    result?.savings?.find((s) => s.vs_strategy === 'naive') ?? result?.savings?.[0]
  const summary = result?.summary

  const costSavedVal = naiveSavings?.cost_saved_inr ?? 0
  const costPctVal = naiveSavings?.cost_saved_pct ?? 0
  const dieselHoursVal = naiveSavings?.diesel_hours_saved ?? 0
  const dieselLitersVal = naiveSavings?.diesel_liters_saved ?? 0
  const co2Val = naiveSavings?.co2_saved_kg ?? 0
  const uptimeVal = summary?.uptime_pct ?? 100

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      {/* 1. Cost Saved Card */}
      <div
        id="savings-card-cost"
        className="relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40 p-5 shadow-xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            {t('costSaved')}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <TrendingDown className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {formatINR(costSavedVal)}
          </span>
          <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">
            <ArrowUpRight className="h-3 w-3 mr-0.5 rotate-45" />
            {formatPct(costPctVal)}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 font-medium">
          {t('costSavedSub')}
        </p>
      </div>

      {/* 2. Diesel Saved Card */}
      <div
        id="savings-card-diesel"
        className="relative overflow-hidden rounded-xl border border-rose-200 bg-gradient-to-br from-white to-rose-50/40 p-5 shadow-xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
            {t('dieselHoursSaved')}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {dieselHoursVal.toFixed(1)} hrs
          </span>
          <span className="inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-800">
            -{dieselHoursVal.toFixed(0)}h run
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 font-medium">
          {dieselLitersVal.toFixed(1)} L {t('fuelAvoided')}
        </p>
      </div>

      {/* 3. CO2 Avoided Card */}
      <div
        id="savings-card-co2"
        className="relative overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-white to-sky-50/40 p-5 shadow-xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
            {t('co2Avoided')}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Leaf className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {co2Val.toFixed(1)} kg
          </span>
          <span className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-bold text-sky-800">
            CO₂ offset
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 font-medium">
          Cleaner air for village microgrid
        </p>
      </div>

      {/* 4. Clean Uptime Card */}
      <div
        id="savings-card-uptime"
        className="relative overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/40 p-5 shadow-xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
            {t('cleanUptime')}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {formatPct(uptimeVal)}
          </span>
          <span className="inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-800">
            Zero blackout
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 font-medium">
          {t('criticalUptimeNote')}
        </p>
      </div>
    </div>
  )
}
