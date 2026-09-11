import React from 'react'
import { LineChart, Lock } from 'lucide-react'
import { useT } from '../../i18n/strings'
import { ENERGY_COLORS } from '../../theme/colors'

export const SocChartPlaceholder: React.FC = () => {
  const { t } = useT()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">{t('socChartTitle')}</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
          <Lock className="h-2.5 w-2.5" />
          {t('socChartBadge')}
        </span>
      </div>

      <div className="mt-4 flex flex-col justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
        {/* SOC Band Legend */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENERGY_COLORS.battery }}
            />
            State of Charge (SOC %)
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="h-0.5 w-3 bg-red-400" />
            Min SOC Reserve (20%)
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="h-0.5 w-3 bg-slate-400" />
            Max SOC (100%)
          </span>
        </div>

        {/* SOC Line preview */}
        <div className="mt-5 flex h-28 items-center justify-center px-4">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 400 100" preserveAspectRatio="none">
            {/* 20% baseline */}
            <line x1="0" y1="80" x2="400" y2="80" stroke="#fca5a5" strokeDasharray="4 4" strokeWidth="1.5" />
            {/* Wave curve */}
            <path
              d="M 0,50 Q 50,20 100,30 T 200,60 T 300,25 T 400,45"
              fill="none"
              stroke={ENERGY_COLORS.battery}
              strokeWidth="2.5"
            />
          </svg>
        </div>

        <p className="mt-4 text-xs font-medium text-slate-500">
          {t('socChartDesc')}
        </p>
      </div>
    </div>
  )
}
