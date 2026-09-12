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
    <div className="space-y-6">
      {/* 1. What should I do now? */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-xs sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
            <Lightbulb className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-700">
              {t('operatorAdviceTitle')}
            </h2>
            <p className="mt-2 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{advice}</p>
          </div>
        </div>
      </div>

      {/* 2. Energy flow, large */}
      <EnergyFlow />

      {/* 3. Next 6 hours icon strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <CardHeader
          icon={Sun}
          iconClassName="text-amber-500"
          title={t('operatorNextHoursTitle')}
          tooltip={t('operatorNextHoursTitle')}
        />
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {nextHours.map((hour) => {
            const source = dominantSource(hour)
            const Icon = SOURCE_ICON[source]
            return (
              <div
                key={hour.hour_index}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center ${SOURCE_COLOR[source]}`}
              >
                <Icon className="h-7 w-7" />
                <span className="text-sm font-bold">{formatHourLabel(hour.timestamp, lang)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4. Today's savings in rupees */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-xs sm:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
            <IndianRupee className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700">
              {t('operatorSavingsTitle')}
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              {formatINR(costSavedVal)}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">{t('operatorSavingsSub')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
