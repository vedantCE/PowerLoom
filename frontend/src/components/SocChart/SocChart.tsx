import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Legend,
} from 'recharts'
import { useAppStore } from '../../store/useAppStore'
import { CHART_COLORS } from '../../theme/colors'
import {
  toSocSeries,
  dayBoundaries,
  nightRanges,
  type SocSeriesPoint,
} from '../../utils/chartData'
import { formatPct, formatFullTimestamp, formatHourTick } from '../../utils/format'
import { useT } from '../../i18n/useT'
import { Battery, Fuel, GitCompare } from 'lucide-react'

export const SocChart: React.FC = () => {
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const setSelectedHour = useAppStore((s) => s.setSelectedHour)
  const compareBaseline = useAppStore((s) => s.compareBaseline)
  const toggleCompareBaseline = useAppStore((s) => s.toggleCompareBaseline)
  const { t } = useT()

  const naiveHourly = useMemo(() => {
    return result?.baselines?.find((b) => b.strategy === 'naive')?.hourly
  }, [result])

  const hourly = result?.hourly

  const chartData = useMemo(() => {
    if (!hourly) return []
    return toSocSeries(hourly, naiveHourly)
  }, [hourly, naiveHourly])

  const boundaries = useMemo(() => {
    if (!hourly) return []
    return dayBoundaries(hourly)
  }, [hourly])

  const nights = useMemo(() => {
    if (!hourly) return []
    return nightRanges(hourly)
  }, [hourly])

  const renderTooltip = (props: any) => {
    const { active, payload } = props
    if (!active || !payload || !payload.length) return null

    const data: SocSeriesPoint = payload[0].payload
    const hasBaseline = data.baseline_soc_pct !== undefined && compareBaseline

    return (
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-xs text-slate-200 min-w-[210px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
          <div className="font-semibold text-slate-100">
            {formatFullTimestamp(data.timestamp)}
          </div>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-sky-400">
            {t('hour')} {data.hour_index}
          </span>
        </div>

        <div className="space-y-1.5 font-medium">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="flex items-center gap-1.5">
              <Battery className="h-3.5 w-3.5" /> {t('batterySoc')}
            </span>
            <span className="font-mono font-bold">{formatPct(data.soc_pct)}</span>
          </div>

          {hasBaseline && (
            <div className="flex items-center justify-between text-purple-400">
              <span className="flex items-center gap-1.5">
                <GitCompare className="h-3.5 w-3.5" /> {t('naiveSoc')}
              </span>
              <span className="font-mono">{formatPct(data.baseline_soc_pct)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Fuel className="h-3.5 w-3.5 text-orange-400" /> {t('dieselRunning')}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                data.diesel_on
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {data.diesel_on ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm animate-pulse">
        <div className="h-6 w-48 rounded bg-slate-800 mb-2" />
        <div className="h-4 w-72 rounded bg-slate-800/60 mb-6" />
        <div className="h-[220px] w-full rounded-xl bg-slate-800/30" />
      </div>
    )
  }

  if (!result || chartData.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
            {t('socTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">{t('socSubtitle')}</p>
        </div>

        {naiveHourly && (
          <button
            type="button"
            onClick={toggleCompareBaseline}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              compareBaseline
                ? 'border-purple-500/80 bg-purple-950/60 text-purple-200 shadow'
                : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5 text-purple-400" />
            {t('compareBaseline')}
          </button>
        )}
      </div>

      {/* SOC Main Chart */}
      <div className="w-full h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
            onClick={(e: any) => {
              if (e && e.activePayload && e.activePayload.length > 0) {
                const hour = e.activePayload[0].payload.hour_index
                setSelectedHour(hour)
              }
            }}
          >
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />

            {/* Night Shading */}
            {nights.map(([start, end]) => (
              <ReferenceArea
                key={`night-${start}-${end}`}
                x1={start}
                x2={end}
                fill={CHART_COLORS.nightShade}
                fillOpacity={0.6}
              />
            ))}

            {/* Day Boundaries */}
            {boundaries.map((boundary) => (
              <ReferenceLine
                key={`day-${boundary}`}
                x={boundary}
                stroke={CHART_COLORS.dayBoundary}
                strokeDasharray="4 4"
                label={{
                  value: t('tomorrow'),
                  position: 'insideTopLeft',
                  fill: CHART_COLORS.text,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            ))}

            {/* 20% Reserve Limit */}
            <ReferenceLine
              y={20}
              stroke={CHART_COLORS.safetyReserve}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: t('safetyReserve'),
                position: 'insideBottomRight',
                fill: CHART_COLORS.safetyReserve,
                fontSize: 11,
                fontWeight: 600,
              }}
            />

            {/* 100% Full Line */}
            <ReferenceLine
              y={100}
              stroke={CHART_COLORS.socMax}
              strokeDasharray="2 2"
              strokeWidth={1}
            />

            {/* Selected Hour Line */}
            {selectedHour !== null && (
              <ReferenceLine
                x={selectedHour}
                stroke={CHART_COLORS.selectedHour}
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            )}

            <XAxis
              dataKey="hour_index"
              tickFormatter={(idx) => formatHourTick(idx, chartData[idx]?.timestamp)}
              interval={2}
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
            />

            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(val) => `${val}%`}
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
            />

            <Tooltip content={renderTooltip} />

            <Legend
              verticalAlign="top"
              height={32}
              wrapperStyle={{ fontSize: '12px', paddingBottom: '4px' }}
              formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
            />

            {/* Powerloom Optimized SOC Area */}
            <Area
              type="monotone"
              name={t('batterySoc')}
              dataKey="soc_pct"
              fill={CHART_COLORS.batteryDischarge}
              stroke={CHART_COLORS.batteryDischarge}
              fillOpacity={0.25}
              strokeWidth={2.5}
              isAnimationActive={true}
            />

            {/* Naive Baseline SOC Line (if enabled) */}
            {compareBaseline && naiveHourly && (
              <Line
                type="monotone"
                name={t('naiveSoc')}
                dataKey="baseline_soc_pct"
                stroke={CHART_COLORS.baselineNaive}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={true}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Diesel ON Strip underneath */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
          <span className="flex items-center gap-1.5">
            <Fuel className="h-3.5 w-3.5 text-orange-500" />
            {t('dieselRunning')}
          </span>
          <span className="text-[11px] font-mono text-slate-500">48-hour timeline</span>
        </div>

        <div className="grid grid-cols-48 gap-[1.5px] h-4 rounded bg-slate-950 p-[2px]">
          {chartData.map((pt) => {
            const isSelected = selectedHour === pt.hour_index
            return (
              <button
                key={`diesel-strip-${pt.hour_index}`}
                type="button"
                onClick={() => setSelectedHour(pt.hour_index)}
                title={`Hour ${pt.hour_index}: Diesel ${pt.diesel_on ? 'ON' : 'OFF'}`}
                className={`h-full w-full rounded-[1px] transition-all ${
                  pt.diesel_on ? 'bg-orange-500 hover:bg-orange-400' : 'bg-slate-800/50 hover:bg-slate-700/60'
                } ${isSelected ? 'ring-2 ring-sky-400 z-10' : ''}`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
