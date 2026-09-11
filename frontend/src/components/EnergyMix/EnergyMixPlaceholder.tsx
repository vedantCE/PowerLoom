import React from 'react'
import { BarChart3, Lock } from 'lucide-react'
import { useT } from '../../i18n/strings'
import { ENERGY_COLORS } from '../../theme/colors'

export const EnergyMixPlaceholder: React.FC = () => {
  const { t } = useT()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-bold text-slate-900">{t('energyMixTitle')}</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-600/20">
          <Lock className="h-2.5 w-2.5" />
          {t('energyMixBadge')}
        </span>
      </div>

      <div className="mt-4 flex flex-col justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
        {/* Color Legend Preview */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ENERGY_COLORS.solar }}
            />
            {t('solar')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ENERGY_COLORS.wind }}
            />
            {t('wind')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ENERGY_COLORS.battery }}
            />
            {t('battery')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ENERGY_COLORS.diesel }}
            />
            {t('diesel')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-xs"
              style={{ backgroundColor: ENERGY_COLORS.demand }}
            />
            {t('demand')}
          </span>
        </div>

        {/* Chart Skeleton Preview */}
        <div className="mt-5 flex h-36 items-end gap-1.5 px-4">
          {[40, 65, 80, 50, 90, 75, 45, 85, 95, 60, 70, 85, 55, 65, 80, 70, 60, 45].map(
            (val, idx) => (
              <div key={idx} className="flex-1 flex flex-col justify-end h-full">
                <div
                  className="w-full rounded-t-xs bg-slate-200/80 transition-all hover:bg-slate-300"
                  style={{ height: `${val}%` }}
                />
              </div>
            )
          )}
        </div>

        <p className="mt-4 text-xs font-medium text-slate-500">
          {t('energyMixDesc')}
        </p>
      </div>
    </div>
  )
}
