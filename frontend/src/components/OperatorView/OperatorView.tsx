import React from 'react'
import { Lightbulb, Sun, Wind, Battery, Fuel, IndianRupee, Inbox } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { EnergyFlow } from '../EnergyFlow'
import { CardHeader } from '../CardHeader'
import { formatINR, formatHourLabel } from '../../utils/format'
import { dominantSource, type DominantSourceType } from '../../utils/chartData'
import { getOperatorAdvice } from '../../utils/operatorAdvice'

const SOURCE_ICON: Record<DominantSourceType, React.ElementType> = {
  solar: Sun,
  wind: Wind,
  battery: Battery,
  diesel: Fuel,
  none: Battery,
}

const SOURCE_COLOR: Record<DominantSourceType, string> = {
  solar: 'text-amber-500 bg-amber-50 border-amber-200',
  wind: 'text-sky-500 bg-sky-50 border-sky-200',
  battery: 'text-emerald-500 bg-emerald-50 border-emerald-200',
  diesel: 'text-rose-500 bg-rose-50 border-rose-200',
  none: 'text-slate-400 bg-slate-50 border-slate-200',
}

export const OperatorView: React.FC = () => {
  const { t, lang } = useT()
  const result = useAppStore((s) => s.result)
  const selectedHour = useAppStore((s) => s.selectedHour)

  if (!result || result.hourly.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Inbox className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-500">{t('operatorEmptyPrompt')}</p>
      </div>
    )
  }

  const currentHourIndex = selectedHour ?? result.hourly[0].hour_index
  const advice = getOperatorAdvice(result.hourly, currentHourIndex, lang)

  const naiveSavings = result.savings?.find((s) => s.vs_strategy === 'naive') ?? result.savings?.[0]
  const costSavedVal = naiveSavings?.cost_saved_inr ?? 0

  const currentIdx = result.hourly.findIndex((h) => h.hour_index === currentHourIndex)
  const nextHours = result.hourly.slice(Math.max(currentIdx, 0), Math.max(currentIdx, 0) + 6)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-stretch h-full lg:overflow-hidden">
      {/* Left Column */}
      <div className="lg:col-span-2 flex flex-col gap-4 lg:gap-6 h-full min-h-0">
        {/* 1. What should I do now? */}
        <div className="shrink-0 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6 shadow-xs flex items-center min-h-[110px]">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
              <Lightbulb className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-indigo-700">
                {t('operatorAdviceTitle')}
              </h2>
              <p className="mt-1 text-lg font-bold leading-snug text-slate-900 sm:text-2xl">{advice}</p>
            </div>
          </div>
        </div>

        {/* 2. Energy flow, large */}
        <div className="flex-1 min-h-0 flex flex-col">
          <EnergyFlow className="h-full" />
        </div>
      </div>

      {/* Right Column */}
      <div className="flex flex-col gap-4 lg:gap-6 h-full min-h-0">
        {/* 4. Today's savings in rupees (Top) */}
        <div className="shrink-0 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 sm:p-6 shadow-xs flex items-center min-h-[110px]">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
              <IndianRupee className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-700">
                {t('operatorSavingsTitle')}
              </h2>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                {formatINR(costSavedVal)}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{t('operatorSavingsSub')}</p>
            </div>
          </div>
        </div>

        {/* 3. Next 6 hours icon strip (Bottom) */}
        <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs min-h-0 justify-between">
          <CardHeader
            icon={Sun}
            iconClassName="text-amber-500"
            title={t('operatorNextHoursTitle')}
            tooltip={t('operatorNextHoursTitle')}
          />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 flex-1 min-h-0 overflow-y-auto">
            {nextHours.map((hour) => {
              const source = dominantSource(hour)
              const Icon = SOURCE_ICON[source]
              return (
                <div
                  key={hour.hour_index}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 sm:p-4 text-center ${SOURCE_COLOR[source]}`}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                  <span className="text-xs sm:text-sm font-bold">{formatHourLabel(hour.timestamp, lang)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
