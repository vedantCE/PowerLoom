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
  type TooltipContentProps,
} from 'recharts'
import { BarChart3, Eye, GitCompareArrows } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { REASON_CODE_LABELS } from '../../i18n/index'
import { ENERGY_COLORS } from '../../theme/colors'
import { toMixSeries, dayBoundaries, nightRanges, type MixSeriesPoint } from '../../utils/chartData'
import { formatKw, formatPct, formatDayHour } from '../../utils/format'
import { CardHeader } from '../CardHeader'

const GRID_COLOR = '#e2e8f0'
const NIGHT_SHADE = '#f1f5f9'
const AXIS_TEXT = { fill: '#475569', fontSize: 12 }

function MixTooltip({ active, payload }: TooltipContentProps) {
  const { t, lang } = useT()
  const reasonLabels = REASON_CODE_LABELS[lang] ?? REASON_CODE_LABELS.en

  if (!active || !payload || payload.length === 0) return null
  const data = payload[0].payload as MixSeriesPoint

  return (
    <div className="min-w-[220px] rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-xl">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <span className="font-bold text-slate-900">{formatDayHour(data.timestamp, data.hour_index)}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
          {t('hourLabel')} {data.hour_index}
        </span>
      </div>
      <div className="space-y-1 font-semibold">
        <div className="flex items-center justify-between" style={{ color: ENERGY_COLORS.solarDark }}>
          <span>{t('solar')}</span>
          <span className="font-mono">{formatKw(data.solar_used_kw)}</span>
        </div>
        <div className="flex items-center justify-between" style={{ color: ENERGY_COLORS.windDark }}>
          <span>{t('wind')}</span>
          <span className="font-mono">{formatKw(data.wind_used_kw)}</span>
        </div>
        <div className="flex items-center justify-between" style={{ color: ENERGY_COLORS.batteryDark }}>
          <span>{t('batteryDischargeLabel')}</span>
          <span className="font-mono">{formatKw(data.battery_discharge_kw)}</span>
        </div>
        {data.battery_charge_neg_kw < 0 && (
          <div className="flex items-center justify-between pl-3 text-[11px]" style={{ color: ENERGY_COLORS.batteryDark }}>
            <span>{t('batteryChargeLabel')}</span>
            <span className="font-mono">-{formatKw(Math.abs(data.battery_charge_neg_kw))}</span>
          </div>
        )}
        <div className="flex items-center justify-between" style={{ color: ENERGY_COLORS.dieselDark }}>
          <span>{t('diesel')}</span>
          <span className="font-mono">{formatKw(data.diesel_kw)}</span>
        </div>
        {data.naive_diesel_kw !== undefined && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-slate-500">
            <span>{t('naiveDieselLabel')}</span>
            <span className="font-mono">{formatKw(data.naive_diesel_kw)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-slate-900">
          <span>{t('demand')}</span>
          <span className="font-mono">{formatKw(data.demand_kw)}</span>
        </div>
        {data.load_shed_kw > 0 && (
          <div className="flex items-center justify-between font-bold" style={{ color: ENERGY_COLORS.loadShedDark }}>
            <span>{t('loadShed')}</span>
            <span className="font-mono">{formatKw(data.load_shed_kw)}</span>
          </div>
        )}
        {data.curtailed_kw > 0 && (
          <div className="flex items-center justify-between text-slate-500">
            <span>{t('curtailed')}</span>
            <span className="font-mono">{formatKw(data.curtailed_kw)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1" style={{ color: ENERGY_COLORS.batteryDark }}>
          <span>{t('soc')}</span>
          <span className="font-mono">{formatPct(data.soc * 100)}</span>
        </div>
      </div>

      {data.reason_codes.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="flex flex-wrap gap-1">
            {data.reason_codes.map((code) => (
              <span key={code} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                {reasonLabels[code] ?? code}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const EnergyMixChart: React.FC = () => {
  const { t } = useT()
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const selectHour = useAppStore((s) => s.selectHour)
  const showCurtailed = useAppStore((s) => s.showCurtailed)
  const toggleShowCurtailed = useAppStore((s) => s.toggleShowCurtailed)
  const compareBaseline = useAppStore((s) => s.compareBaseline)
  const toggleCompareBaseline = useAppStore((s) => s.toggleCompareBaseline)

  const naiveHourly = useMemo(() => result?.baselines?.find((b) => b.strategy === 'naive')?.hourly, [result])
  const hourly = result?.hourly

  const chartData = useMemo(() => (hourly ? toMixSeries(hourly, naiveHourly) : []), [hourly, naiveHourly])
  const boundaries = useMemo(() => (hourly ? dayBoundaries(hourly) : []), [hourly])
  const nights = useMemo(() => (hourly ? nightRanges(hourly) : []), [hourly])

  if (status === 'loading' && !result) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={BarChart3} iconClassName="text-sky-600" title={t('energyMixTitle')} tooltip={t('energyMixTooltip')} />
        <div className="mt-4 h-[340px] w-full animate-pulse rounded-lg bg-slate-100" />
      </div>
    )
  }

  if (!result || chartData.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={BarChart3} iconClassName="text-sky-600" title={t('energyMixTitle')} tooltip={t('energyMixTooltip')} />
        <div className="mt-4 flex h-[200px] items-center justify-center text-sm text-slate-400">
          {t('emptyDesc')}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <CardHeader
        icon={BarChart3}
        iconClassName="text-sky-600"
        title={t('energyMixTitle')}
        subtitle={t('energyMixSubtitle')}
        tooltip={t('energyMixTooltip')}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleShowCurtailed}
              aria-pressed={showCurtailed}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                showCurtailed
                  ? 'border-slate-400 bg-slate-100 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              {t('showCurtailedToggle')}
            </button>
            {naiveHourly && (
              <button
                type="button"
                onClick={toggleCompareBaseline}
                aria-pressed={compareBaseline}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  compareBaseline
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                {t('compareNaiveToggle')}
              </button>
            )}
          </div>
        }
      />

      <div className="mt-4 h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            onClick={(e) => {
              const idx = Number(e?.activeLabel)
              if (Number.isFinite(idx)) selectHour(idx)
            }}
          >
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />

            {nights.map(([start, end]) => (
              <ReferenceArea key={`night-${start}-${end}`} x1={start} x2={end} fill={NIGHT_SHADE} fillOpacity={0.7} />
            ))}

            {boundaries.map((b) => (
              <ReferenceLine
                key={`day-${b}`}
                x={b}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: t('tomorrow'), position: 'insideTopLeft', fill: '#64748b', fontSize: 12, fontWeight: 700 }}
              />
            ))}

            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />

            {selectedHour !== null && (
              <ReferenceLine x={selectedHour} stroke={ENERGY_COLORS.demandDark} strokeWidth={2} strokeDasharray="3 3" />
            )}

            <XAxis
              dataKey="hour_index"
              tickFormatter={(idx: number) => chartData[idx]?.label ?? ''}
              interval={2}
              tick={AXIS_TEXT}
              axisLine={{ stroke: GRID_COLOR }}
              tickLine={{ stroke: GRID_COLOR }}
            />
            <YAxis tick={AXIS_TEXT} axisLine={{ stroke: GRID_COLOR }} tickLine={{ stroke: GRID_COLOR }} unit=" kW" />

            <Tooltip content={MixTooltip} />
            <Legend
              verticalAlign="top"
              height={32}
              wrapperStyle={{ fontSize: 12, paddingBottom: 6 }}
              formatter={(value) => <span className="font-medium text-slate-600">{value}</span>}
            />

            <Area
              type="monotone"
              name={t('solar')}
              dataKey="solar_used_kw"
              stackId="supply"
              fill={ENERGY_COLORS.solar}
              stroke={ENERGY_COLORS.solarDark}
              fillOpacity={0.85}
              isAnimationActive
              animationDuration={600}
            />
            <Area
              type="monotone"
              name={t('wind')}
              dataKey="wind_used_kw"
              stackId="supply"
              fill={ENERGY_COLORS.wind}
              stroke={ENERGY_COLORS.windDark}
              fillOpacity={0.85}
              isAnimationActive
              animationDuration={600}
            />
            <Area
              type="monotone"
              name={t('batteryDischargeLabel')}
              dataKey="battery_discharge_kw"
              stackId="supply"
              fill={ENERGY_COLORS.battery}
              stroke={ENERGY_COLORS.batteryDark}
              fillOpacity={0.85}
              isAnimationActive
              animationDuration={600}
            />
            <Area
              type="monotone"
              name={t('diesel')}
              dataKey="diesel_kw"
              stackId="supply"
              fill={ENERGY_COLORS.diesel}
              stroke={ENERGY_COLORS.dieselDark}
              fillOpacity={0.85}
              isAnimationActive
              animationDuration={600}
            />

            {/* Battery charging plotted BELOW zero, lighter shade */}
            <Area
              type="monotone"
              name={t('batteryChargeLabel')}
              dataKey="battery_charge_neg_kw"
              stackId="supply"
              fill={ENERGY_COLORS.batteryLight}
              stroke={ENERGY_COLORS.battery}
              fillOpacity={0.9}
              isAnimationActive
              animationDuration={600}
            />

            {showCurtailed && (
              <Area
                type="monotone"
                name={t('curtailed')}
                dataKey="curtailed_kw"
                fill={ENERGY_COLORS.curtailed}
                stroke={ENERGY_COLORS.curtailedDark}
                strokeDasharray="4 4"
                fillOpacity={0.25}
                isAnimationActive
                animationDuration={600}
              />
            )}

            {compareBaseline && naiveHourly && (
              <Line
                type="monotone"
                name={t('naiveDieselLabel')}
                dataKey="naive_diesel_kw"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive
                animationDuration={600}
              />
            )}

            <Line
              type="monotone"
              name={t('demand')}
              dataKey="demand_kw"
              stroke={ENERGY_COLORS.demand}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive
              animationDuration={600}
            />

            <Line
              type="monotone"
              name={t('loadShed')}
              dataKey={(d: MixSeriesPoint) => (d.load_shed_kw > 0 ? d.demand_kw : null)}
              stroke={ENERGY_COLORS.loadShed}
              strokeWidth={0}
              dot={{ r: 4, fill: ENERGY_COLORS.loadShed, stroke: '#fff', strokeWidth: 1.5 }}
              isAnimationActive
              animationDuration={600}
              legendType="circle"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
