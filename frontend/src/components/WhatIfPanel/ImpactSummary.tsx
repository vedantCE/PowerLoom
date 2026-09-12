import React from 'react'
import { Loader2, TrendingDown, TrendingUp, Minus, Gauge } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { formatINR, formatPct } from '../../utils/format'
import type { PlanSummary } from '../../types/api'

interface MetricDef {
  key: keyof PlanSummary
  labelKey: 'impactTotalCost' | 'impactDieselHours' | 'impactCo2' | 'impactRenewableShare' | 'impactCriticalUptime'
  lowerIsBetter: boolean
  format: (v: number) => string
}

const METRICS: MetricDef[] = [
  { key: 'total_cost_inr', labelKey: 'impactTotalCost', lowerIsBetter: true, format: (v) => formatINR(v) },
  { key: 'diesel_hours', labelKey: 'impactDieselHours', lowerIsBetter: true, format: (v) => `${v.toFixed(1)} h` },
  { key: 'co2_kg', labelKey: 'impactCo2', lowerIsBetter: true, format: (v) => `${v.toFixed(1)} kg` },
  {
    key: 'renewable_share_pct',
    labelKey: 'impactRenewableShare',
    lowerIsBetter: false,
    format: (v) => formatPct(v),
  },
  {
    key: 'critical_uptime_pct',
    labelKey: 'impactCriticalUptime',
    lowerIsBetter: false,
    format: (v) => formatPct(v),
  },
]

const EPSILON = 0.01

export const ImpactSummary: React.FC = () => {
  const { t } = useT()
  const result = useAppStore((s) => s.result)
  const baselineRun = useAppStore((s) => s.baselineRun)
  const overrides = useAppStore((s) => s.overrides)
  const horizon = useAppStore((s) => s.horizon)
  const status = useAppStore((s) => s.status)

  if (!result) return null

  const hasOverrides = Object.keys(overrides).length > 0
  const summary = result.summary
  const baseSummary = baselineRun?.summary

  const naiveSavings = result.savings?.find((s) => s.vs_strategy === 'naive') ?? result.savings?.[0]
  const monthlyImpact = naiveSavings ? (naiveSavings.cost_saved_inr * 30 * 24) / horizon : null

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        </div>
      )}

      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">{t('impactSummaryTitle')}</h3>
        </div>
        {!hasOverrides && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {t('impactDefaultPlan')}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {METRICS.map((metric) => {
          const value = summary[metric.key] as number
          const baseValue =
            hasOverrides && baseSummary ? (baseSummary[metric.key] as number) : undefined
          const delta = baseValue !== undefined ? value - baseValue : null
          const isNeutral = delta !== null && Math.abs(delta) < EPSILON
          const isBetter =
            delta !== null && !isNeutral ? (metric.lowerIsBetter ? delta < 0 : delta > 0) : null

          return (
            <div key={metric.key} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{t(metric.labelKey)}</span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-slate-900">
                  {metric.format(value)}
                </span>
                {delta !== null && !isNeutral && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      isBetter
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {isBetter ? (
                      <TrendingDown className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingUp className="h-2.5 w-2.5" />
                    )}
                    {delta > 0 ? '+' : ''}
                    {metric.format(delta)}
                  </span>
                )}
                {delta !== null && isNeutral && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    <Minus className="h-2.5 w-2.5" />
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {monthlyImpact !== null && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">{t('impactMonthlyEstimateLabel')}</span>
            <span className="font-mono font-bold text-emerald-700">{formatINR(monthlyImpact)}</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            {t('impactMonthlyEstimateNote')}
          </p>
        </div>
      )}
    </div>
  )
}
