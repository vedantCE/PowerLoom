import React from 'react'
import { Activity, Network, Sun, Wind, Battery, Fuel, Home, Lock } from 'lucide-react'
import { useT } from '../../i18n/strings'

export const EnergyFlowPlaceholder: React.FC = () => {
  const { t } = useT()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900">{t('energyFlowTitle')}</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/20">
          <Lock className="h-2.5 w-2.5" />
          {t('energyFlowBadge')}
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
        {/* Visual schematic preview */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400">
          <div className="flex flex-col items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-amber-700">
            <Sun className="h-5 w-5" />
            <span className="text-[10px] font-bold">Solar</span>
          </div>
          <span className="font-mono text-slate-300">&rarr;</span>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5 text-sky-700">
            <Wind className="h-5 w-5" />
            <span className="text-[10px] font-bold">Wind</span>
          </div>
          <span className="font-mono text-slate-300">&rarr;</span>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-emerald-700">
            <Battery className="h-5 w-5" />
            <span className="text-[10px] font-bold">Battery</span>
          </div>
          <span className="font-mono text-slate-300">&rarr;</span>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-rose-700">
            <Fuel className="h-5 w-5" />
            <span className="text-[10px] font-bold">Diesel</span>
          </div>
          <span className="font-mono text-slate-300">&rarr;</span>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 text-indigo-700">
            <Home className="h-5 w-5" />
            <span className="text-[10px] font-bold">Village Load</span>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-slate-500 max-w-md">
          {t('energyFlowDesc')}
        </p>
        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
          <Network className="h-3.5 w-3.5" />
          Interactive animated SVG circuit coming in Phase 4.4
        </span>
      </div>
    </div>
  )
}
