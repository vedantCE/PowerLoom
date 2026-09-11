import React from 'react'
import { Calendar, Clock, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { ENERGY_COLORS, type EnergySourceKey } from '../../theme/colors'
import { formatHourLabel } from '../../utils/format'
import type { HourlyDispatch } from '../../types/api'

interface DominantSourceInfo {
  key: EnergySourceKey
  label: string
  color: string
  bgColor: string
  valueKw: number
}

function getDominantSource(h: HourlyDispatch): DominantSourceInfo {
  const sources: { key: EnergySourceKey; label: string; color: string; bgColor: string; val: number }[] = [
    {
      key: 'solar',
      label: 'Solar PV',
      color: ENERGY_COLORS.solar,
      bgColor: ENERGY_COLORS.solarLight,
      val: h.solar_used_kw,
    },
    {
      key: 'wind',
      label: 'Wind',
      color: ENERGY_COLORS.wind,
      bgColor: ENERGY_COLORS.windLight,
      val: h.wind_used_kw,
    },
    {
      key: 'battery',
      label: 'Battery Discharge',
      color: ENERGY_COLORS.battery,
      bgColor: ENERGY_COLORS.batteryLight,
      val: h.battery_discharge_kw,
    },
    {
      key: 'diesel',
      label: 'Diesel Generator',
      color: ENERGY_COLORS.diesel,
      bgColor: ENERGY_COLORS.dieselLight,
      val: h.diesel_kw,
    },
    {
      key: 'loadShed',
      label: 'Load Shed',
      color: ENERGY_COLORS.loadShed,
      bgColor: ENERGY_COLORS.loadShedLight,
      val: h.load_shed_kw,
    },
  ]

  sources.sort((a, b) => b.val - a.val)
  const top = sources[0]

  if (top.val <= 0.05) {
    if (h.battery_charge_kw > 0.05) {
      return {
        key: 'battery',
        label: 'Battery Charging',
        color: ENERGY_COLORS.battery,
        bgColor: ENERGY_COLORS.batteryLight,
        valueKw: h.battery_charge_kw,
      }
    }
    return {
      key: 'curtailed',
      label: 'Low / Idle',
      color: ENERGY_COLORS.curtailed,
      bgColor: ENERGY_COLORS.curtailedLight,
      valueKw: 0,
    }
  }

  return {
    key: top.key,
    label: top.label,
    color: top.color,
    bgColor: top.bgColor,
    valueKw: top.val,
  }
}

export const HourTimeline: React.FC = () => {
  const { t } = useT()
  const { result, selectedHour, selectHour, status } = useAppStore()

  if (status === 'loading') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="h-4 w-44 rounded bg-slate-200 animate-pulse" />
          <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto py-2">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="h-16 w-11 shrink-0 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const hourly = result?.hourly ?? []
  if (hourly.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t('timelineTitle')}</h2>
            <p className="text-[11px] text-slate-500">{t('timelineDesc')}</p>
          </div>
        </div>

        {/* Mini Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENERGY_COLORS.solar }}
            />
            {t('solar')}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENERGY_COLORS.wind }}
            />
            {t('wind')}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENERGY_COLORS.battery }}
            />
            {t('battery')}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENERGY_COLORS.diesel }}
            />
            {t('diesel')}
          </span>
        </div>
      </div>

      {/* Horizontal Strip of Hour Cells */}
      <div className="mt-4 overflow-x-auto pb-2">
        {/* Day Header Banners if 48h */}
        {hourly.length > 24 && (
          <div className="mb-2 flex text-xs font-bold text-slate-500">
            <div className="w-[864px] shrink-0 border-b border-indigo-200 pb-1 text-indigo-700 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Day 1 ({t('today')}) &mdash; Hours 00 to 23
            </div>
            <div className="w-[864px] shrink-0 border-b border-indigo-200 pb-1 pl-4 text-indigo-700 flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              Day 2 ({t('tomorrow')}) &mdash; Hours 24 to 47
            </div>
          </div>
        )}

        <div className="flex gap-1.5 min-w-max py-1">
          {hourly.map((hour) => {
            const isSelected = selectedHour === hour.hour_index
            const dominant = getDominantSource(hour)
            const timeLabel = formatHourLabel(hour.timestamp)

            return (
              <button
                key={hour.hour_index}
                type="button"
                id={`hour-cell-${hour.hour_index}`}
                onClick={() => selectHour(hour.hour_index)}
                className={`group relative flex h-20 w-9 shrink-0 flex-col items-center justify-between rounded-lg p-1.5 transition-all focus:outline-none ${
                  isSelected
                    ? 'ring-3 ring-indigo-600 ring-offset-2 scale-105 z-10 shadow-md font-bold'
                    : 'border border-slate-200/90 hover:border-slate-400 hover:scale-102 opacity-95 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: dominant.bgColor,
                }}
                title={`Hour ${hour.hour_index} (${timeLabel}): Dominant ${dominant.label} (${dominant.valueKw.toFixed(1)} kW) | SOC ${Math.round(hour.soc * 100)}%`}
              >
                {/* Hour number */}
                <span className="text-[10px] font-mono font-bold text-slate-700">
                  H{hour.hour_index}
                </span>

                {/* Dominant source indicator pill */}
                <div
                  className="h-3.5 w-3.5 rounded-full shadow-xs ring-1 ring-white/60 transition-transform group-hover:scale-115"
                  style={{ backgroundColor: dominant.color }}
                />

                {/* Hour of day (e.g. 7P, 12A) */}
                <span className="text-[9px] font-semibold text-slate-600 truncate max-w-full">
                  {timeLabel.replace(' ', '')}
                </span>

                {/* Active marker pin */}
                {isSelected && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-indigo-600" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
