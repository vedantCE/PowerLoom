import React, { useMemo, useState } from 'react'
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
import { LineChart, Fuel, GitCompareArrows, Sparkles, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useAppStore, explanationCacheKey } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { REASON_CODE_LABELS } from '../../i18n/index'
import { ENERGY_COLORS } from '../../theme/colors'
import { toSocSeries, dayBoundaries, nightRanges, type SocSeriesPoint } from '../../utils/chartData'
import { formatKw, formatPct, formatDayHour } from '../../utils/format'
import { CardHeader } from '../CardHeader'
import { buildTemplateExplanation } from '../../mocks/mockApi'

const GRID_COLOR = '#e2e8f0'
const NIGHT_SHADE = '#f1f5f9'
const AXIS_TEXT = { fill: '#475569', fontSize: 12 }
const DEFAULT_SAFETY_RESERVE_PCT = 20

function SocTooltip({ active, payload }: TooltipContentProps) {
  const { t, lang } = useT()
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0].payload as SocSeriesPoint

  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <span className="font-bold text-slate-900">{formatDayHour(data.timestamp, data.hour_index, lang)}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
          {t('hourLabel')} {data.hour_index}
        </span>
      </div>
      <div className="space-y-1 font-semibold">
        <div className="flex items-center justify-between" style={{ color: ENERGY_COLORS.batteryDark }}>
          <span>{t('soc')}</span>
          <span className="font-mono">{formatPct(data.soc_pct)}</span>
        </div>
        {data.baseline_soc_pct !== undefined && (
          <div className="flex items-center justify-between text-slate-500">
            <span>{t('naiveSocLabel')}</span>
            <span className="font-mono">{formatPct(data.baseline_soc_pct)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-slate-600">
          <span>{t('dieselRunningLabel')}</span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              data.diesel_on ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {data.diesel_on ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
    </div>
  )
}

export const SocChart: React.FC = () => {
  const { t, lang } = useT()
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const [selectedHour, setSelectedHour] = useState<number>(0)
  const selectHour = (h: number | null) => setSelectedHour(h ?? 0)
  const compareBaseline = useAppStore((s) => s.compareBaseline)
  const toggleCompareBaseline = useAppStore((s) => s.toggleCompareBaseline)
  const currentPreset = useAppStore((s) => s.currentPreset)
  const explanationCache = useAppStore((s) => s.explanationCache)

  const [showExplain, setShowExplain] = useState(false)

  const safetyReservePct = currentPreset ? currentPreset.battery.soc_min * 100 : DEFAULT_SAFETY_RESERVE_PCT

  const naiveHourly = useMemo(() => result?.baselines?.find((b) => b.strategy === 'naive')?.hourly, [result])
  const hourly = result?.hourly

  const activeHourIndex = selectedHour ?? 0
  const activeHourData = useMemo(
    () => hourly?.find((h) => h.hour_index === activeHourIndex) ?? hourly?.[0],
    [hourly, activeHourIndex]
  )

  const pointExplanation = useMemo(() => {
    if (!result || !activeHourData) return ''
    const cacheKey = explanationCacheKey(result.run_id, activeHourData.hour_index, lang)
    if (explanationCache[cacheKey]?.explanation) {
      return explanationCache[cacheKey].explanation
    }
    return buildTemplateExplanation(activeHourData, lang)
  }, [result, activeHourData, lang, explanationCache])

  const canGoPrev = activeHourIndex > 0
  const canGoNext = hourly ? activeHourIndex < hourly.length - 1 : false

  const chartData = useMemo(
    () => (hourly ? toSocSeries(hourly, naiveHourly, lang) : []),
    [hourly, naiveHourly, lang]
  )
  const boundaries = useMemo(() => (hourly ? dayBoundaries(hourly) : []), [hourly])
  const nights = useMemo(() => (hourly ? nightRanges(hourly) : []), [hourly])

  if (status === 'loading' && !result) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={LineChart} iconClassName="text-emerald-600" title={t('socChartTitle')} tooltip={t('socTooltip')} />
        <div className="mt-4 h-[220px] w-full animate-pulse rounded-lg bg-slate-100" />
      </div>
    )
  }

  if (!result || chartData.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={LineChart} iconClassName="text-emerald-600" title={t('socChartTitle')} tooltip={t('socTooltip')} />
        <div className="mt-4 flex h-[150px] items-center justify-center text-sm text-slate-400">{t('emptyDesc')}</div>
      </div>
    )
  }

  return (
    <div className="relative w-full">
      {/* Left Explain Panel */}
      {activeHourData && (
        <div
          className={`transition-all duration-300 ease-in-out ${
            showExplain
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-4 pointer-events-none'
          } absolute top-0 right-[calc(100%+1.5rem)] w-80 z-20 rounded-xl border border-indigo-200 bg-white p-5 shadow-xl flex flex-col justify-between space-y-3`}
        >
          <div>
            {/* Header & Hour selector */}
            <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5 mb-3">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                {t('explainPointTitle')}
              </span>
              <div className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 px-2 py-0.5 text-[11px] font-bold text-indigo-900 shadow-2xs">
                <button
                  type="button"
                  onClick={() => canGoPrev && selectHour(activeHourIndex - 1)}
                  disabled={!canGoPrev}
                  title={t('prevHour')}
                  className="hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-indigo-600" />
                  {t('hourLabel')} {activeHourData.hour_index} &middot; {formatDayHour(activeHourData.timestamp, activeHourData.hour_index, lang)}
                </span>
                <button
                  type="button"
                  onClick={() => canGoNext && selectHour(activeHourIndex + 1)}
                  disabled={!canGoNext}
                  title={t('nextHour')}
                  className="hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-1.5 font-semibold text-[11px]">
              <div className="flex items-center justify-between rounded-md bg-emerald-50 p-2 border border-emerald-200 text-emerald-900 col-span-2">
                <span>{t('soc')}</span>
                <span className="font-mono font-bold">{formatPct(activeHourData.soc * 100)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-slate-50 p-2 border border-slate-200">
                <span className="text-slate-500">{t('demand')}</span>
                <span className="font-mono text-slate-900 font-bold">{formatKw(activeHourData.demand_kw)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-rose-50 p-2 border border-rose-200 text-rose-900">
                <span>{t('diesel')}</span>
                <span className="font-mono font-bold">{formatKw(activeHourData.diesel_kw)}</span>
              </div>
            </div>

            {/* Active Reason Codes */}
            {activeHourData.reason_codes && activeHourData.reason_codes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {activeHourData.reason_codes.map((code) => (
                  <span
                    key={code}
                    className="rounded border border-indigo-200 bg-indigo-50/60 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 shadow-2xs"
                  >
                    {REASON_CODE_LABELS[lang]?.[code] ?? code}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Easy Natural Language Explanation */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 shadow-2xs mt-2">
            <p className="text-[12px] font-medium leading-relaxed text-slate-800">
              {pointExplanation}
            </p>
          </div>
        </div>
      )}

      {/* Main Chart Box */}
      <div className="w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader
          icon={LineChart}
          iconClassName="text-emerald-600"
          title={t('socChartTitle')}
          subtitle={t('socChartSubtitle')}
          tooltip={t('socTooltip')}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExplain((prev) => !prev)}
                aria-pressed={showExplain}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  showExplain
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-2xs ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                {t('explainToggle')}
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

      <div className="mt-4 h-[220px] w-full">
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

            <ReferenceLine
              y={safetyReservePct}
              stroke={ENERGY_COLORS.loadShedDark}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: t('safetyReserveLabel'), position: 'insideBottomRight', fill: ENERGY_COLORS.loadShedDark, fontSize: 11, fontWeight: 700 }}
            />
            <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="2 2" strokeWidth={1} />

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
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={AXIS_TEXT}
              axisLine={{ stroke: GRID_COLOR }}
              tickLine={{ stroke: GRID_COLOR }}
            />

            <Tooltip content={SocTooltip} />
            <Legend
              verticalAlign="top"
              height={28}
              wrapperStyle={{ fontSize: 12, paddingBottom: 6 }}
              formatter={(value) => <span className="font-medium text-slate-600">{value}</span>}
            />

            <Area
              type="monotone"
              name={t('soc')}
              dataKey="soc_pct"
              fill={ENERGY_COLORS.battery}
              stroke={ENERGY_COLORS.batteryDark}
              fillOpacity={0.25}
              strokeWidth={2.5}
              isAnimationActive
              animationDuration={600}
            />

            {compareBaseline && naiveHourly && (
              <Line
                type="monotone"
                name={t('naiveSocLabel')}
                dataKey="baseline_soc_pct"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive
                animationDuration={600}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Diesel ON strip */}
      <div className="mt-2 border-t border-slate-100 pt-2">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span className="flex items-center gap-1.5">
            <Fuel className="h-3.5 w-3.5" style={{ color: ENERGY_COLORS.diesel }} />
            {t('dieselRunningLabel')}
          </span>
        </div>
        <div className="flex h-4 gap-[1.5px] rounded bg-slate-100 p-[2px]">
          {chartData.map((pt) => (
            <button
              key={`diesel-${pt.hour_index}`}
              type="button"
              onClick={() => selectHour(pt.hour_index)}
              title={`${t('hourLabel')} ${pt.hour_index}: ${pt.diesel_on ? 'ON' : 'OFF'}`}
              className={`h-full flex-1 rounded-[1px] transition-all ${
                pt.diesel_on ? 'hover:opacity-80' : 'bg-slate-200/70 hover:bg-slate-300/70'
              } ${selectedHour === pt.hour_index ? 'ring-2 ring-indigo-500' : ''}`}
              style={pt.diesel_on ? { backgroundColor: ENERGY_COLORS.diesel } : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
)
}


