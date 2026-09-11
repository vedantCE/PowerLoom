import React from 'react'
import { SlidersHorizontal, CloudRain, Fuel, Sun, BatteryCharging, Lock } from 'lucide-react'
import { useT } from '../../i18n/strings'

export const WhatIfPlaceholder: React.FC = () => {
  const { t } = useT()

  return (
    <aside className="w-full lg:w-80 shrink-0">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">{t('whatIfTitle')}</h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-600/20">
            <Lock className="h-2.5 w-2.5" />
            {t('whatIfBadge')}
          </span>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          {t('whatIfDescription')}
        </p>

        {/* Mock Controls Preview */}
        <div className="mt-4 space-y-3.5 opacity-70">
          {/* Cloud Cover */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <CloudRain className="h-3.5 w-3.5 text-sky-500" />
                {t('cloudCoverParam')}
              </span>
              <span className="font-mono text-slate-500">Auto (Forecast)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 w-1/3 rounded-full bg-sky-300" />
            </div>
          </div>

          {/* Diesel Price */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Fuel className="h-3.5 w-3.5 text-rose-500" />
                {t('dieselPriceParam')}
              </span>
              <span className="font-mono text-slate-500">₹90 / L</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 w-1/2 rounded-full bg-rose-300" />
            </div>
          </div>

          {/* Extra Solar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                {t('extraSolarParam')}
              </span>
              <span className="font-mono text-slate-500">+0 kW</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 w-0 rounded-full bg-amber-300" />
            </div>
          </div>

          {/* Extra Battery */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <BatteryCharging className="h-3.5 w-3.5 text-emerald-500" />
                {t('extraBatteryParam')}
              </span>
              <span className="font-mono text-slate-500">+0 kWh</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 w-0 rounded-full bg-emerald-300" />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-[11px] font-medium text-slate-500">
            {t('simulatorUpcoming')}
          </p>
        </div>
      </div>
    </aside>
  )
}
