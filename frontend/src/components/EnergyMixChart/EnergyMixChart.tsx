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
  toMixSeries,
  dayBoundaries,
  nightRanges,
  type MixSeriesPoint,
} from '../../utils/chartData'
import { formatKw, formatPct, formatFullTimestamp, formatHourTick } from '../../utils/format'
import { useT } from '../../i18n/useT'
import { Sun, Wind, Battery, Fuel, Eye, GitCompare } from 'lucide-react'

export const EnergyMixChart: React.FC = () => {
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const setSelectedHour = useAppStore((s) => s.setSelectedHour)
  const showCurtailed = useAppStore((s) => s.showCurtailed)
  const toggleShowCurtailed = useAppStore((s) => s.toggleShowCurtailed)
  const compareBaseline = useAppStore((s) => s.compareBaseline)
  const toggleCompareBaseline = useAppStore((s) => s.toggleCompareBaseline)
  const { t, reasonLabel } = useT()

  const naiveHourly = useMemo(() => {
    return result?.baselines?.find((b) => b.strategy === 'naive')?.hourly
  }, [result])

  const hourly = result?.hourly

  const chartData = useMemo(() => {
    if (!hourly) return []
    return toMixSeries(hourly, naiveHourly)
  }, [hourly, naiveHourly])

  const boundaries = useMemo(() => {
    if (!hourly) return []
    return dayBoundaries(hourly)
  }, [hourly])

  const nights = useMemo(() => {
    if (!hourly) return []
    return nightRanges(hourly)
  }, [hourly])

  // Custom tooltip renderer
  const renderTooltip = (props: any) => {
    const { active, payload } = props
    if (!active || !payload || !payload.length) return null

    const data: MixSeriesPoint = payload[0].payload
    const hasNaive = data.naive_diesel_kw !== undefined && compareBaseline

    return (
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md text-xs text-slate-200 min-w-[240px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
          <div className="font-semibold text-sm text-slate-100">
            {formatFullTimestamp(data.timestamp)}
          </div>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-sky-400">
            {t('hour')} {data.hour_index}
          </span>
        </div>

        <div className="space-y-1.5 font-medium">
          <div className="flex items-center justify-between text-amber-400">
            <span className="flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5" /> {t('solar')}
            </span>
            <span className="font-mono">{formatKw(data.solar_used_kw)}</span>
          </div>

          <div className="flex items-center justify-between text-cyan-400">
            <span className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5" /> {t('wind')}
            </span>
            <span className="font-mono">{formatKw(data.wind_used_kw)}</span>
          </div>

          <div className="flex items-center justify-between text-emerald-400">
            <span className="flex items-center gap-1.5">
              <Battery className="h-3.5 w-3.5" /> {t('batteryDischarge')}
            </span>
            <span className="font-mono">{formatKw(data.battery_discharge_kw)}</span>
          </div>

          {Math.abs(data.battery_charge_neg_kw) > 0 && (
            <div className="flex items-center justify-between text-emerald-300/90 pl-3 text-[11px]">
              <span>└ {t('batteryCharge')}</span>
              <span className="font-mono">-{formatKw(Math.abs(data.battery_charge_neg_kw))}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-orange-400">
            <span className="flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5" /> {t('diesel')}
            </span>
            <span className="font-mono">{formatKw(data.diesel_kw)}</span>
          </div>

          {hasNaive && (
            <div className="flex items-center justify-between text-purple-400 border-t border-slate-800/80 pt-1">
              <span>{t('naiveDiesel')}</span>
              <span className="font-mono">{formatKw(data.naive_diesel_kw)}</span>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-800 pt-1.5 font-semibold text-slate-100">
            <span>{t('demand')}</span>
            <span className="font-mono">{formatKw(data.demand_kw)}</span>
          </div>

          {data.load_shed_kw > 0 && (
            <div className="flex items-center justify-between text-red-400 font-bold">
              <span>{t('loadShed')}</span>
              <span className="font-mono">{formatKw(data.load_shed_kw)}</span>
            </div>
          )}

          {data.curtailed_kw > 0 && showCurtailed && (
            <div className="flex items-center justify-between text-slate-400">
              <span>{t('curtailed')}</span>
              <span className="font-mono">{formatKw(data.curtailed_kw)}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sky-300/90 pt-1">
            <span>{t('batterySoc')}</span>
            <span className="font-mono">{formatPct(data.soc * 100)}</span>
          </div>
        </div>

        {data.reason_codes && data.reason_codes.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
              {t('reasons')}
            </div>
            <div className="flex flex-wrap gap-1">
              {data.reason_codes.map((code) => (
                <span
                  key={code}
                  className="rounded-md bg-slate-800/90 border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {reasonLabel(code)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm animate-pulse">
        <div className="h-6 w-56 rounded bg-slate-800 mb-2" />
        <div className="h-4 w-80 rounded bg-slate-800/60 mb-6" />
        <div className="h-[340px] w-full rounded-xl bg-slate-800/30" />
      </div>
    )
  }

  if (!result || chartData.length === 0) {
    return (
      <div className="flex h-[380px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-slate-400">
        <p className="text-base font-medium">{t('noData')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 sm:p-6 shadow-2xl backdrop-blur-md">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
            {t('energyMixTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">{t('energyMixSubtitle')}</p>
        </div>

        {/* Toggle Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleShowCurtailed}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              showCurtailed
                ? 'border-slate-500 bg-slate-700/80 text-slate-100 shadow'
                : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {t('showCurtailed')}
          </button>

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
              {t('compareNaiveDiesel')}
            </button>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div className="w-full h-[340px]">
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

            {/* Day Boundaries ("Tomorrow") */}
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

            {/* Zero Line */}
            <ReferenceLine y={0} stroke={CHART_COLORS.dayBoundary} strokeWidth={1} />

            {/* Selected Hour Highlight */}
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
              tickFormatter={(val) => `${val}`}
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={{ stroke: CHART_COLORS.grid }}
              unit=" kW"
            />

            <Tooltip content={renderTooltip} />

            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
              formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
            />

            {/* Stacked Areas above 0 (order: solar, wind, battery discharge, diesel) */}
            <Area
              type="monotone"
              name={t('solar')}
              dataKey="solar_used_kw"
              stackId="supply"
              fill={CHART_COLORS.solar}
              stroke={CHART_COLORS.solar}
              fillOpacity={0.85}
              isAnimationActive={true}
            />

            <Area
              type="monotone"
              name={t('wind')}
              dataKey="wind_used_kw"
              stackId="supply"
              fill={CHART_COLORS.wind}
              stroke={CHART_COLORS.wind}
              fillOpacity={0.85}
              isAnimationActive={true}
            />

            <Area
              type="monotone"
              name={t('batteryDischarge')}
              dataKey="battery_discharge_kw"
              stackId="supply"
              fill={CHART_COLORS.batteryDischarge}
              stroke={CHART_COLORS.batteryDischarge}
              fillOpacity={0.85}
              isAnimationActive={true}
            />

            <Area
              type="monotone"
              name={t('diesel')}
              dataKey="diesel_kw"
              stackId="supply"
              fill={CHART_COLORS.diesel}
              stroke={CHART_COLORS.diesel}
              fillOpacity={0.85}
              isAnimationActive={true}
            />

            {/* Battery Charging BELOW zero (Negative stack) */}
            <Area
              type="monotone"
              name={t('batteryCharge')}
              dataKey="battery_charge_neg_kw"
              stackId="supply"
              fill={CHART_COLORS.batteryCharge}
              stroke={CHART_COLORS.batteryCharge}
              fillOpacity={0.65}
              isAnimationActive={true}
            />

            {/* Curtailed area (if enabled) */}
            {showCurtailed && (
              <Area
                type="monotone"
                name={t('curtailed')}
                dataKey="curtailed_kw"
                fill={CHART_COLORS.curtailed}
                stroke={CHART_COLORS.curtailed}
                strokeDasharray="4 4"
                fillOpacity={0.25}
                isAnimationActive={true}
              />
            )}

            {/* Naive baseline comparison line */}
            {compareBaseline && naiveHourly && (
              <Line
                type="monotone"
                name={t('naiveDiesel')}
                dataKey="naive_diesel_kw"
                stroke={CHART_COLORS.baselineNaive}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={true}
              />
            )}

            {/* Total Demand line on top */}
            <Line
              type="monotone"
              name={t('demand')}
              dataKey="demand_kw"
              stroke={CHART_COLORS.demand}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={true}
            />

            {/* Load Shed red marker dots where load_shed_kw > 0 */}
            <Line
              type="monotone"
              name={t('loadShed')}
              dataKey={(d) => (d.load_shed_kw > 0 ? d.demand_kw : null)}
              stroke={CHART_COLORS.loadShed}
              strokeWidth={0}
              dot={{ r: 4, fill: CHART_COLORS.loadShed, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              isAnimationActive={true}
              legendType="circle"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
