import React from 'react'
import { useAppStore } from '../../store/useAppStore'
import { CHART_COLORS } from '../../theme/colors'
import { dominantSource, dayBoundaries } from '../../utils/chartData'
import { formatHourTick } from '../../utils/format'
import { useT } from '../../i18n/useT'

export const HourTimeline: React.FC = () => {
  const result = useAppStore((s) => s.result)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const setSelectedHour = useAppStore((s) => s.setSelectedHour)
  const { t } = useT()

  if (!result?.hourly || result.hourly.length === 0) return null

  const boundaries = dayBoundaries(result.hourly)

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'solar':
        return CHART_COLORS.solar
      case 'wind':
        return CHART_COLORS.wind
      case 'battery':
        return CHART_COLORS.batteryDischarge
      case 'diesel':
        return CHART_COLORS.diesel
      default:
        return '#334155'
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4 sm:p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            48-Hour Dispatch Timeline
          </span>
          <span className="text-[11px] text-slate-500">
            ({t('selectedHour')}: {selectedHour ?? 0})
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t('solar')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" /> {t('wind')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t('batteryDischarge')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> {t('diesel')}
          </span>
        </div>
      </div>

      {/* Interactive 48-hour bar */}
      <div className="relative flex h-10 w-full items-center gap-[2px] rounded-lg bg-slate-950 p-1">
        {result.hourly.map((hour) => {
          const dom = dominantSource(hour)
          const isSelected = selectedHour === hour.hour_index
          const isBoundary = boundaries.includes(hour.hour_index)

          return (
            <button
              key={`timeline-hour-${hour.hour_index}`}
              type="button"
              onClick={() => setSelectedHour(hour.hour_index)}
              title={`Hour ${hour.hour_index} (${formatHourTick(hour.hour_index, hour.timestamp)}): Dominant ${dom}`}
              className={`group relative flex h-full flex-1 flex-col items-center justify-between rounded-[2px] transition-all ${
                isSelected
                  ? 'ring-2 ring-sky-400 z-20 scale-105'
                  : 'hover:opacity-90 hover:scale-105'
              } ${isBoundary ? 'border-l-2 border-slate-500' : ''}`}
              style={{ backgroundColor: getSourceColor(dom) }}
            >
              {hour.hour_index % 6 === 0 && (
                <span className="absolute -bottom-5 text-[9px] font-mono text-slate-400">
                  {formatHourTick(hour.hour_index, hour.timestamp)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="h-2" />
    </div>
  )
}
