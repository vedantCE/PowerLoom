import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import { useAppStore } from '../../store/useAppStore'
import { CHART_COLORS } from '../../theme/colors'
import { formatInr, formatCo2 } from '../../utils/format'
import { useT } from '../../i18n/useT'
import { IndianRupee, Clock, Leaf, TrendingDown } from 'lucide-react'

interface StrategyMetric {
  name: string
  label: string
  value: number
  color: string
}

export const BaselineComparison: React.FC = () => {
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const { t } = useT()

  const naive = useMemo(
    () => result?.baselines?.find((b) => b.strategy === 'naive'),
    [result]
  )

  const cycle = useMemo(
    () => result?.baselines?.find((b) => b.strategy === 'cycle_charging'),
    [result]
  )

  const costData = useMemo<StrategyMetric[]>(() => {
    if (!result?.summary) return []
    const items: StrategyMetric[] = [
      {
        name: 'powerloom',
        label: t('strategyPowerloom'),
        value: Math.round(result.summary.total_cost_inr),
        color: CHART_COLORS.batteryDischarge,
      },
    ]
    if (naive) {
      items.push({
        name: 'naive',
        label: t('strategyNaive'),
        value: Math.round(naive.summary.total_cost_inr),
        color: CHART_COLORS.baselineNaive,
      })
    }
    if (cycle) {
      items.push({
        name: 'cycle_charging',
        label: t('strategyCycle'),
        value: Math.round(cycle.summary.total_cost_inr),
        color: CHART_COLORS.baselineCycle,
      })
    }
    return items
  }, [result, naive, cycle, t])

  const hoursData = useMemo<StrategyMetric[]>(() => {
    if (!result?.summary) return []
    const items: StrategyMetric[] = [
      {
        name: 'powerloom',
        label: t('strategyPowerloom'),
        value: Number(result.summary.diesel_hours.toFixed(1)),
        color: CHART_COLORS.batteryDischarge,
      },
    ]
    if (naive) {
      items.push({
        name: 'naive',
        label: t('strategyNaive'),
        value: Number(naive.summary.diesel_hours.toFixed(1)),
        color: CHART_COLORS.baselineNaive,
      })
    }
    if (cycle) {
      items.push({
        name: 'cycle_charging',
        label: t('strategyCycle'),
        value: Number(cycle.summary.diesel_hours.toFixed(1)),
        color: CHART_COLORS.baselineCycle,
      })
    }
    return items
  }, [result, naive, cycle, t])

  const co2Data = useMemo<StrategyMetric[]>(() => {
    if (!result?.summary) return []
    const items: StrategyMetric[] = [
      {
        name: 'powerloom',
        label: t('strategyPowerloom'),
        value: Number(result.summary.co2_kg.toFixed(1)),
        color: CHART_COLORS.batteryDischarge,
      },
    ]
    if (naive) {
      items.push({
        name: 'naive',
        label: t('strategyNaive'),
        value: Number(naive.summary.co2_kg.toFixed(1)),
        color: CHART_COLORS.baselineNaive,
      })
    }
    if (cycle) {
      items.push({
        name: 'cycle_charging',
        label: t('strategyCycle'),
        value: Number(cycle.summary.co2_kg.toFixed(1)),
        color: CHART_COLORS.baselineCycle,
      })
    }
    return items
  }, [result, naive, cycle, t])

  // Savings calculations vs naive
  const costSavingsPct = useMemo(() => {
    if (!result?.summary || !naive) return null
    const diff = naive.summary.total_cost_inr - result.summary.total_cost_inr
    const pct = (diff / naive.summary.total_cost_inr) * 100
    return Math.max(0, Number(pct.toFixed(1)))
  }, [result, naive])

  const hoursSaved = useMemo(() => {
    if (!result?.summary || !naive) return null
    return Math.max(0, Number((naive.summary.diesel_hours - result.summary.diesel_hours).toFixed(1)))
  }, [result, naive])

  const co2Saved = useMemo(() => {
    if (!result?.summary || !naive) return null
    return Math.max(0, Number((naive.summary.co2_kg - result.summary.co2_kg).toFixed(1)))
  }, [result, naive])

  if (status === 'loading') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm"
          />
        ))}
      </div>
    )
  }

  if (!result || costData.length <= 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
            {t('baselineTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">{t('baselineSubtitle')}</p>
        </div>
      </div>

      {/* 3 Metric Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Total Cost */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <IndianRupee className="h-4 w-4 text-emerald-400" />
              {t('totalCost')}
            </span>
            {costSavingsPct !== null && costSavingsPct > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                <TrendingDown className="h-3 w-3" />
                {costSavingsPct}% {t('savings')}
              </span>
            )}
          </div>

          <div className="h-40 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `₹${val}`}
                  tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any) => [formatInr(Number(val)), t('totalCost')]}
                  contentStyle={{
                    backgroundColor: CHART_COLORS.tooltipBg,
                    borderColor: CHART_COLORS.tooltipBorder,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {costData.map((entry, index) => (
                    <Cell key={`cost-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Metric 2: Diesel Runtime */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Clock className="h-4 w-4 text-orange-400" />
              {t('dieselHours')}
            </span>
            {hoursSaved !== null && hoursSaved > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 text-[11px] font-bold text-orange-400">
                <TrendingDown className="h-3 w-3" />
                -{hoursSaved} hrs
              </span>
            )}
          </div>

          <div className="h-40 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hoursData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `${val}h`}
                  tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any) => [`${val} hrs`, t('dieselHours')]}
                  contentStyle={{
                    backgroundColor: CHART_COLORS.tooltipBg,
                    borderColor: CHART_COLORS.tooltipBorder,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {hoursData.map((entry, index) => (
                    <Cell key={`hours-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Metric 3: CO2 Emissions */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Leaf className="h-4 w-4 text-emerald-400" />
              {t('co2Emissions')}
            </span>
            {co2Saved !== null && co2Saved > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                <TrendingDown className="h-3 w-3" />
                -{co2Saved} kg
              </span>
            )}
          </div>

          <div className="h-40 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={co2Data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `${val}`}
                  tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any) => [formatCo2(Number(val)), t('co2Emissions')]}
                  contentStyle={{
                    backgroundColor: CHART_COLORS.tooltipBg,
                    borderColor: CHART_COLORS.tooltipBorder,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {co2Data.map((entry, index) => (
                    <Cell key={`co2-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
