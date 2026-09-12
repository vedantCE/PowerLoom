import React, { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { Scale, TrendingDown } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { ENERGY_COLORS } from '../../theme/colors'
import { formatINR, formatCo2 } from '../../utils/format'
import { CardHeader } from '../CardHeader'

interface StrategyMetric {
  name: string
  label: string
  value: number
  color: string
}

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#0f172a',
}

export const BaselineComparison: React.FC = () => {
  const { t } = useT()
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)

  const naive = useMemo(() => result?.baselines?.find((b) => b.strategy === 'naive'), [result])
  const cycle = useMemo(() => result?.baselines?.find((b) => b.strategy === 'cycle_charging'), [result])

  const build = (
    pick: (summary: { total_cost_inr: number; diesel_hours: number; co2_kg: number }) => number,
    decimals: number
  ): StrategyMetric[] => {
    if (!result?.summary) return []
    const items: StrategyMetric[] = [
      {
        name: 'powerloom',
        label: t('strategyPowerloom'),
        value: Number(pick(result.summary).toFixed(decimals)),
        color: ENERGY_COLORS.battery,
      },
    ]
    if (naive) {
      items.push({
        name: 'naive',
        label: t('strategyNaive'),
        value: Number(pick(naive.summary).toFixed(decimals)),
        color: '#94a3b8',
      })
    }
    if (cycle) {
      items.push({
        name: 'cycle_charging',
        label: t('strategyCycle'),
        value: Number(pick(cycle.summary).toFixed(decimals)),
        color: '#a855f7',
      })
    }
    return items
  }

  // Trivial O(3) work — not worth memoizing, so `build` doesn't need a stable identity.
  const costData = build((s) => s.total_cost_inr, 0)
  const hoursData = build((s) => s.diesel_hours, 1)
  const co2Data = build((s) => s.co2_kg, 1)

  const costSavingsPct = useMemo(() => {
    if (!result?.summary || !naive) return null
    const diff = naive.summary.total_cost_inr - result.summary.total_cost_inr
    return Math.max(0, Number(((diff / naive.summary.total_cost_inr) * 100).toFixed(1)))
  }, [result, naive])

  if (status === 'loading' && !result) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={Scale} iconClassName="text-purple-600" title={t('baselineTitle')} tooltip={t('baselineTooltip')} />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (!result || costData.length <= 1) {
    return null
  }

  const charts: { title: string; data: StrategyMetric[]; tickFormatter: (v: number) => string; tooltipFormatter: (v: number) => string }[] = [
    {
      title: t('impactTotalCost'),
      data: costData,
      tickFormatter: (v) => `₹${v}`,
      tooltipFormatter: (v) => formatINR(v),
    },
    {
      title: t('impactDieselHours'),
      data: hoursData,
      tickFormatter: (v) => `${v}h`,
      tooltipFormatter: (v) => `${v} h`,
    },
    {
      title: t('impactCo2'),
      data: co2Data,
      tickFormatter: (v) => `${v}`,
      tooltipFormatter: (v) => formatCo2(v),
    },
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <CardHeader
        icon={Scale}
        iconClassName="text-purple-600"
        title={t('baselineTitle')}
        subtitle={t('baselineSubtitle')}
        tooltip={t('baselineTooltip')}
        right={
          costSavingsPct !== null &&
          costSavingsPct > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <TrendingDown className="h-3.5 w-3.5" />
              {costSavingsPct}% {t('savings')}
            </span>
          )
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {charts.map((chart) => (
          <div key={chart.title} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <div className="mb-1.5 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
              {chart.title}
            </div>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={chart.tickFormatter}
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [chart.tooltipFormatter(Number(v)), chart.title] as [string, string]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={600}>
                    {chart.data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
