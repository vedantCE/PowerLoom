import React, { useEffect, useState } from 'react'
import { Sparkles, Clock, Battery, Sun, Wind, Fuel, Users, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { explain as apiExplain } from '../../api/client'
import { formatDayHour, formatKw, formatPct } from '../../utils/format'
import type { ExplainResponse, ReasonCode } from '../../types/api'

export const ExplainBox: React.FC = () => {
  const { t, lang } = useT()
  const { result, selectedHour, status } = useAppStore()

  const [explanationData, setExplanationData] = useState<ExplainResponse | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)

  const activeHourIndex = selectedHour ?? 0
  const hour = result?.hourly?.find((h) => h.hour_index === activeHourIndex)

  const isDataStale =
    Boolean(result?.run_id) &&
    selectedHour !== null &&
    (explanationData?.run_id !== result?.run_id ||
      explanationData?.hour_index !== selectedHour ||
      explanationData?.language !== lang)

  const loadingExplain = isDataStale && !explainError

  useEffect(() => {
    if (!result?.run_id || selectedHour === null) return

    let cancelled = false

    apiExplain({
      run_id: result.run_id,
      hour_index: selectedHour,
      language: lang,
    })
      .then((res) => {
        if (cancelled) return
        setExplanationData(res)
        setExplainError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setExplainError(err instanceof Error ? err.message : 'Could not load explanation')
      })

    return () => {
      cancelled = true
    }
  }, [result?.run_id, selectedHour, lang])

  if (status === 'loading' || !hour) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <div className="h-5 w-5 rounded-full bg-slate-200 animate-pulse" />
          <div className="h-5 w-48 rounded bg-slate-200 animate-pulse" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    )
  }

  const reasonCodeLabels: Record<ReasonCode, string> = {
    RENEWABLES_COVER_DEMAND: 'Renewables Cover Demand',
    SOLAR_SURPLUS_CHARGING: 'Solar Surplus Charging',
    PRECHARGE_FOR_FORECAST_DEFICIT: 'Pre-charge for Deficit',
    EVENING_PEAK_DISCHARGE: 'Evening Peak Discharge',
    SOC_AT_MINIMUM: 'SOC at Minimum Reserve',
    DIESEL_EFFICIENT_LOADING: 'Diesel Efficient Loading',
    DIESEL_CHARGING_BATTERY: 'Diesel Charging Battery',
    CURTAILMENT_BATTERY_FULL: 'Curtailment (Battery Full)',
    NONCRITICAL_LOAD_SHED: 'Non-critical Load Shed',
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/20 to-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100/80 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
            <Sparkles className="h-4 w-4 fill-indigo-200 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('explainTitle')}</h2>
            <p className="text-xs text-slate-500">{t('explainSubtitle')}</p>
          </div>
        </div>

        {/* Selected Hour Pill */}
        <div className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1 text-xs font-bold text-indigo-900">
          <Clock className="h-3.5 w-3.5 text-indigo-600" />
          <span>
            {t('selectedHour')} {hour.hour_index} &middot; {formatDayHour(hour.timestamp, hour.hour_index)}
          </span>
        </div>
      </div>

      {/* Hourly Power Metrics Strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Demand */}
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Users className="h-3.5 w-3.5 text-indigo-500" />
            {t('demand')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-900">
            {formatKw(hour.demand_kw)}
          </div>
        </div>

        {/* Solar */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            {t('solar')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-amber-900">
            {formatKw(hour.solar_used_kw)}
          </div>
        </div>

        {/* Wind */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800">
            <Wind className="h-3.5 w-3.5 text-sky-500" />
            {t('wind')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-sky-900">
            {formatKw(hour.wind_used_kw)}
          </div>
        </div>

        {/* Battery SOC */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
            <Battery className="h-3.5 w-3.5 text-emerald-500" />
            {t('soc')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-900">
            {formatPct(hour.soc * 100, 0)}
          </div>
        </div>

        {/* Battery Flow */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
            <Battery className="h-3.5 w-3.5 text-emerald-500" />
            {hour.battery_charge_kw > 0 ? 'Charge' : 'Discharge'}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-900">
            {hour.battery_charge_kw > 0
              ? `+${formatKw(hour.battery_charge_kw)}`
              : hour.battery_discharge_kw > 0
                ? `-${formatKw(hour.battery_discharge_kw)}`
                : '0.0 kW'}
          </div>
        </div>

        {/* Diesel */}
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-800">
            <Fuel className="h-3.5 w-3.5 text-rose-500" />
            {t('diesel')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-rose-900">
            {formatKw(hour.diesel_kw)}
          </div>
        </div>
      </div>

      {/* Decision Reason Codes Badges */}
      {hour.reason_codes && hour.reason_codes.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t('reasonCodes')}:
          </span>
          {hour.reason_codes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-900 shadow-2xs"
            >
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-indigo-600" />
              {reasonCodeLabels[code] ?? code}
            </span>
          ))}
        </div>
      )}

      {/* Natural Language Explanation Box */}
      <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs">
        {loadingExplain ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-1">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"
            />
            <span>{t('explainLoading')}</span>
          </div>
        ) : explainError ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span>{explainError}</span>
          </div>
        ) : (
          <p className="text-sm font-medium leading-relaxed text-slate-800">
            {explanationData?.explanation ||
              `At this hour, the optimizer balanced ${formatKw(hour.demand_kw)} of demand using ${formatKw(hour.solar_used_kw)} solar and ${formatKw(hour.wind_used_kw)} wind, with battery state of charge at ${formatPct(hour.soc * 100)}.`}
          </p>
        )}
      </div>
    </div>
  )
}
