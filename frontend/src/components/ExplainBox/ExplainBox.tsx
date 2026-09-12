import React, { useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  Clock,
  Battery,
  Sun,
  Wind,
  Fuel,
  Users,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Languages,
  Inbox,
} from 'lucide-react'
import { useAppStore, explanationCacheKey } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { REASON_CODE_LABELS } from '../../i18n/index'
import { CardHeader } from '../CardHeader'
import { explain as apiExplain } from '../../api/client'
import { buildTemplateExplanation } from '../../mocks/mockApi'
import { useTypewriter } from '../../hooks/useTypewriter'
import { formatDayHour, formatKw, formatPct } from '../../utils/format'
import type { Language } from '../../types/api'

const PANEL_LANGUAGES: Language[] = ['en', 'gu', 'hi']
const PANEL_LANGUAGE_LABEL: Record<Language, string> = { en: 'EN', gu: 'ગુજ', hi: 'हिं' }

export const ExplainBox: React.FC = () => {
  const { t } = useT()
  const result = useAppStore((s) => s.result)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const selectHour = useAppStore((s) => s.selectHour)
  const status = useAppStore((s) => s.status)
  const globalLang = useAppStore((s) => s.language)
  const explanationCache = useAppStore((s) => s.explanationCache)
  const cacheExplanation = useAppStore((s) => s.cacheExplanation)

  const [panelLang, setPanelLang] = useState<Language | null>(null)
  const [loadingExplain, setLoadingExplain] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [offlineExplainKeys, setOfflineExplainKeys] = useState<Set<string>>(new Set())

  const effectiveLang = panelLang ?? globalLang
  const hourIndex = selectedHour
  const hour = hourIndex !== null ? result?.hourly?.find((h) => h.hour_index === hourIndex) : undefined

  const cacheKey =
    result && hourIndex !== null ? explanationCacheKey(result.run_id, hourIndex, effectiveLang) : null
  const cached = cacheKey ? explanationCache[cacheKey] : undefined

  useEffect(() => {
    if (!result || hourIndex === null || !cacheKey) return
    if (explanationCache[cacheKey]) {
      setExplainError(null)
      return
    }

    let cancelled = false
    setLoadingExplain(true)
    setExplainError(null)

    apiExplain({ run_id: result.run_id, hour_index: hourIndex, language: effectiveLang })
      .then((res) => {
        if (cancelled) return
        cacheExplanation(cacheKey, res)
      })
      .catch(() => {
        if (cancelled) return
        // POST /api/explain is not implemented on the backend yet (next
        // backend phase) — fall back to the same offline template generator
        // mock mode uses, rather than showing a hard error for every hour.
        if (!hour) {
          setExplainError('Could not load explanation')
          return
        }
        cacheExplanation(cacheKey, {
          run_id: result.run_id,
          hour_index: hourIndex,
          language: effectiveLang,
          reason_codes: hour.reason_codes,
          explanation: buildTemplateExplanation(hour, effectiveLang),
        })
        setOfflineExplainKeys((prev) => new Set(prev).add(cacheKey))
      })
      .finally(() => {
        if (!cancelled) setLoadingExplain(false)
      })

    return () => {
      cancelled = true
    }
    // explanationCache/cacheExplanation deliberately excluded: cacheKey already
    // encodes (run_id, hour_index, language), and this effect's only job is to
    // fetch once per unique key — re-running it when unrelated cache entries
    // arrive elsewhere would just re-check the same guard for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hourIndex, effectiveLang, cacheKey, retryToken])

  const reasonLabels = REASON_CODE_LABELS[effectiveLang] ?? REASON_CODE_LABELS.en

  const { display: typedExplanation } = useTypewriter(cached?.explanation ?? '', 500)

  const hourly = useMemo(() => result?.hourly ?? [], [result])
  const canGoPrev = hourIndex !== null && hourIndex > 0
  const canGoNext = hourIndex !== null && hourIndex < hourly.length - 1

  if (status === 'loading' && !result) {
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

  if (!result || hourIndex === null || !hour) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader
          icon={Sparkles}
          title={t('explainTitle')}
          subtitle={t('explainSubtitle')}
          tooltip={t('explainTooltip')}
        />
        <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
          <Inbox className="h-6 w-6 text-slate-300" />
          <p className="max-w-xs text-xs font-medium text-slate-500">{t('explainEmptyPrompt')}</p>
        </div>
      </div>
    )
  }

  const batteryActive = hour.battery_charge_kw > hour.battery_discharge_kw
  const batteryFlowLabel = batteryActive ? t('flowChargingLabel') : t('flowDischargingLabel')
  const batteryFlowValue =
    hour.battery_charge_kw > hour.battery_discharge_kw
      ? `+${formatKw(hour.battery_charge_kw)}`
      : hour.battery_discharge_kw > 0
        ? `-${formatKw(hour.battery_discharge_kw)}`
        : '0.0 kW'

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/20 to-white p-6 shadow-xs">
      <CardHeader
        icon={Sparkles}
        iconClassName="text-indigo-600"
        title={t('explainTitle')}
        subtitle={t('explainSubtitle')}
        tooltip={t('explainTooltip')}
        right={
          <div className="flex items-center gap-2">
            {/* Panel-local language override */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <Languages className="ml-1 mr-0.5 h-3 w-3 text-slate-400" />
              {PANEL_LANGUAGES.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setPanelLang(lng === globalLang ? null : lng)}
                  aria-pressed={effectiveLang === lng}
                  title={t('panelLanguageLabel')}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                    effectiveLang === lng
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {PANEL_LANGUAGE_LABEL[lng]}
                </button>
              ))}
            </div>

            {/* Selected Hour Pill + Prev/Next */}
            <div className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 px-1 py-1 text-xs font-bold text-indigo-900">
              <button
                type="button"
                onClick={() => canGoPrev && selectHour(hourIndex - 1)}
                disabled={!canGoPrev}
                aria-label={t('prevHour')}
                className="flex h-5 w-5 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="flex items-center gap-1 px-1">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                {t('selectedHour')} {hour.hour_index} &middot; {formatDayHour(hour.timestamp, hour.hour_index)}
              </span>
              <button
                type="button"
                onClick={() => canGoNext && selectHour(hourIndex + 1)}
                disabled={!canGoNext}
                aria-label={t('nextHour')}
                className="flex h-5 w-5 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        }
      />

      {/* Hourly Power Metrics Strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Users className="h-3.5 w-3.5 text-indigo-500" />
            {t('demand')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-900">{formatKw(hour.demand_kw)}</div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            {t('solar')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-amber-900">{formatKw(hour.solar_used_kw)}</div>
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800">
            <Wind className="h-3.5 w-3.5 text-sky-500" />
            {t('wind')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-sky-900">{formatKw(hour.wind_used_kw)}</div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
            <Battery className="h-3.5 w-3.5 text-emerald-500" />
            {t('soc')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-900">
            {formatPct(hour.soc * 100, 0)}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
            <Battery className="h-3.5 w-3.5 text-emerald-500" />
            {batteryFlowLabel}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-900">{batteryFlowValue}</div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-800">
            <Fuel className="h-3.5 w-3.5 text-rose-500" />
            {t('diesel')}
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-rose-900">{formatKw(hour.diesel_kw)}</div>
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
              {reasonLabels[code] ?? code}
            </span>
          ))}
        </div>
      )}

      {/* Natural Language Explanation Box */}
      <div className="mt-4 min-h-[64px] rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs">
        {loadingExplain ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-1">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span>{t('explainLoading')}</span>
          </div>
        ) : explainError ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>{explainError}</span>
            </div>
            <button
              type="button"
              onClick={() => setRetryToken((n) => n + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {t('retry')}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium leading-relaxed text-slate-800">
              {typedExplanation}
              {typedExplanation.length > 0 && typedExplanation.length < (cached?.explanation.length ?? 0) && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-indigo-400 align-middle" />
              )}
            </p>
            {cacheKey && offlineExplainKeys.has(cacheKey) && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {t('offlineExplanationNote')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
