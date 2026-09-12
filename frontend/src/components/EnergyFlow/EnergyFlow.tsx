import React, { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  Sun,
  Wind,
  Fuel,
  BatteryMedium,
  Home,
  HeartPulse,
  Zap,
  CircleSlash,
  ZapOff,
  Sparkles,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { REASON_CODE_LABELS } from '../../i18n/index'
import { ENERGY_COLORS } from '../../theme/colors'
import { formatKw, formatPct, formatDayHour } from '../../utils/format'
import { computeFlowLinks, type FlowData, type FlowLink as FlowLinkData, type FlowNodeId } from './flowLinks'
import { NODE_POSITIONS, VIEWBOX } from './positions'
import { FlowNode } from './FlowNode'
import { FlowLink } from './FlowLink'
import { PlaybackBar } from './PlaybackBar'
import { CardHeader } from '../CardHeader'

const EPSILON = 1e-6

function linkColor(link: FlowLinkData): string {
  if (link.id === 'curtailed') return ENERGY_COLORS.curtailed
  if (link.id === 'shed') return ENERGY_COLORS.loadShed
  switch (link.from) {
    case 'solar':
      return ENERGY_COLORS.solar
    case 'wind':
      return ENERGY_COLORS.wind
    case 'diesel':
      return ENERGY_COLORS.diesel
    case 'battery':
      return ENERGY_COLORS.battery
    default:
      return ENERGY_COLORS.demand
  }
}

/** Only draw the battery link matching its resolved single direction (never both). */
function shouldDrawLink(link: FlowLinkData, flow: FlowData): boolean {
  if (link.kw <= EPSILON) return false
  const isChargeLink = link.id === 'solar-battery' || link.id === 'wind-battery' || link.id === 'diesel-battery'
  if (isChargeLink) return flow.battery.mode === 'charging'
  if (link.id === 'battery-village') return flow.battery.mode === 'discharging'
  return true
}

export const EnergyFlow: React.FC = () => {
  const { t, lang } = useT()
  const result = useAppStore((s) => s.result)
  const status = useAppStore((s) => s.status)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const selectHour = useAppStore((s) => s.selectHour)
  const dieselAvailable = useAppStore((s) => s.overrides.diesel_available !== false)
  const reducedMotion = Boolean(useReducedMotion())

  const hourly = result?.hourly ?? []

  const hourIndex = useMemo(() => {
    if (hourly.length === 0) return 0
    const idx = selectedHour ?? 0
    return Math.min(Math.max(idx, 0), hourly.length - 1)
  }, [selectedHour, hourly.length])

  const hour = hourly[hourIndex]
  const flow = useMemo(() => (hour ? computeFlowLinks(hour) : null), [hour])

  const capKw = useMemo(() => {
    if (!flow) return 1
    return Math.max(1, ...flow.links.map((l) => l.kw))
  }, [flow])

  if (status === 'loading' && !result) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={Activity} iconClassName="text-amber-500" title={t('energyFlowTitle')} tooltip={t('energyFlowTooltip')} />
        <div className="mt-4 h-[360px] w-full animate-pulse rounded-lg bg-slate-100" />
      </div>
    )
  }

  if (!result || !hour || !flow) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader icon={Activity} iconClassName="text-amber-500" title={t('energyFlowTitle')} tooltip={t('energyFlowTooltip')} />
        <div className="mt-4 flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center">
          <Sparkles className="h-6 w-6 text-slate-300" />
          <p className="max-w-xs text-xs font-medium text-slate-500">{t('flowEmptyHint')}</p>
        </div>
      </div>
    )
  }

  const reasonLabels = REASON_CODE_LABELS[lang] ?? REASON_CODE_LABELS.en
  const batteryModeLabel =
    flow.battery.mode === 'charging'
      ? t('flowChargingLabel')
      : flow.battery.mode === 'discharging'
        ? t('flowDischargingLabel')
        : t('flowIdleLabel')

  const dieselColor = dieselAvailable ? (flow.dieselOn ? ENERGY_COLORS.diesel : ENERGY_COLORS.dieselSlate) : ENERGY_COLORS.dieselSlate
  const socFraction = Math.max(0, Math.min(1, flow.battery.soc))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <CardHeader
        icon={Activity}
        iconClassName="text-amber-500"
        title={t('energyFlowTitle')}
        tooltip={t('energyFlowTooltip')}
        right={
          <span className="text-xs font-semibold text-slate-600">
            {formatDayHour(hour.timestamp, hour.hour_index)}
          </span>
        }
      />

      {hour.reason_codes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hour.reason_codes.map((code) => (
            <span
              key={code}
              className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800"
            >
              {reasonLabels[code] ?? code}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3">
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${t('energyFlowTitle')}: ${formatDayHour(hour.timestamp, hour.hour_index)}`}
        >
          {flow.links.filter((l) => shouldDrawLink(l, flow)).map((link) => (
            <FlowLink
              key={link.id}
              from={NODE_POSITIONS[link.from]}
              to={NODE_POSITIONS[link.to]}
              kw={link.kw}
              color={linkColor(link)}
              capKw={capKw}
              reducedMotion={reducedMotion}
            />
          ))}
          {/* Faint placeholder links so the shape of the diagram is legible even at 0 kW */}
          {flow.links
            .filter((l) => !shouldDrawLink(l, flow) && l.id !== 'curtailed' && l.id !== 'shed')
            .map((link) => (
              <FlowLink
                key={`${link.id}-inactive`}
                from={NODE_POSITIONS[link.from]}
                to={NODE_POSITIONS[link.to]}
                kw={0}
                color="#cbd5e1"
                capKw={capKw}
                reducedMotion={reducedMotion}
                showLabel={false}
              />
            ))}

          <FlowNode
            position={NODE_POSITIONS.solar}
            icon={Sun}
            label={t('solar')}
            color={ENERGY_COLORS.solar}
            active={hour.solar_used_kw > EPSILON}
            pulseToken={hourIndex}
            reducedMotion={reducedMotion}
            subLabel={formatKw(hour.solar_used_kw)}
          />
          <FlowNode
            position={NODE_POSITIONS.wind}
            icon={Wind}
            label={t('wind')}
            color={ENERGY_COLORS.wind}
            active={hour.wind_used_kw > EPSILON}
            pulseToken={hourIndex}
            reducedMotion={reducedMotion}
            subLabel={formatKw(hour.wind_used_kw)}
          />
          <FlowNode
            position={NODE_POSITIONS.diesel}
            icon={Fuel}
            label={t('diesel')}
            color={dieselColor}
            active={flow.dieselOn && dieselAvailable}
            pulseToken={hourIndex}
            reducedMotion={reducedMotion}
            disabled={!dieselAvailable}
            disabledLabel={t('flowGeneratorOfflineLabel')}
            vibrate={flow.dieselOn && dieselAvailable}
            subLabel={formatKw(hour.diesel_kw)}
          />
          <FlowNode
            position={NODE_POSITIONS.battery}
            icon={BatteryMedium}
            label={t('battery')}
            color={ENERGY_COLORS.battery}
            active={flow.battery.mode !== 'idle'}
            pulseToken={hourIndex}
            reducedMotion={reducedMotion}
            subLabel={`${formatPct(flow.battery.soc * 100)} · ${batteryModeLabel}`}
          >
            <g transform={`translate(-26, ${NODE_POSITIONS.battery.r + 42})`}>
              <rect width={52} height={7} rx={3.5} fill="#e2e8f0" />
              <motion.rect
                height={7}
                rx={3.5}
                fill={ENERGY_COLORS.battery}
                initial={false}
                animate={{ width: 52 * socFraction }}
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
              />
            </g>
          </FlowNode>
          <FlowNode
            position={NODE_POSITIONS.village}
            icon={Home}
            label={t('flowVillageLabel')}
            color={ENERGY_COLORS.demand}
            active
            pulseToken={hourIndex}
            reducedMotion={reducedMotion}
          >
            <g transform={`translate(0, ${NODE_POSITIONS.village.r + 34})`}>
              <HeartPulse x={-46} y={-11} width={14} height={14} color={ENERGY_COLORS.demandDark} />
              <text x={-28} y={0} fontSize={11} fontWeight={700} fill="#334155">
                {t('flowCriticalLabel')}: {formatKw(flow.criticalDemandKw)}
              </text>
            </g>
            <g transform={`translate(0, ${NODE_POSITIONS.village.r + 52})`}>
              <Zap x={-46} y={-11} width={14} height={14} color="#94a3b8" />
              <text x={-28} y={0} fontSize={11} fontWeight={600} fill="#64748b">
                {t('flowNonCriticalLabel')}: {formatKw(flow.nonCriticalDemandKw)}
              </text>
            </g>
          </FlowNode>

          {flow.curtailedKw > EPSILON && (
            <FlowNode
              position={NODE_POSITIONS.curtailed}
              icon={CircleSlash}
              label={t('flowCurtailedLabel')}
              color={ENERGY_COLORS.curtailed}
              active
              pulseToken={hourIndex}
              reducedMotion={reducedMotion}
              subLabel={formatKw(flow.curtailedKw)}
            />
          )}

          {flow.loadShedKw > EPSILON && (
            <FlowNode
              position={NODE_POSITIONS.shed}
              icon={ZapOff}
              label={t('flowShedLabel')}
              color={ENERGY_COLORS.loadShed}
              active
              pulseToken={hourIndex}
              reducedMotion={reducedMotion}
              subLabel={formatKw(flow.loadShedKw)}
              alertPulse
            />
          )}
        </svg>

        {flow.loadShedKw > EPSILON && (
          <p className="mt-1 text-center text-[11px] font-semibold text-red-700">{t('flowShedCaption')}</p>
        )}
        {reducedMotion && (
          <p className="mt-1 text-center text-[10px] font-medium text-slate-400">
            {t('flowReducedMotionNote')}
          </p>
        )}
      </div>

      <div className="mt-4">
        <PlaybackBar
          hourIndex={hourIndex}
          hourCount={hourly.length}
          onScrub={selectHour}
          playLabel={t('flowPlay')}
          pauseLabel={t('flowPause')}
          speedLabel={t('flowSpeed')}
        />
      </div>
    </div>
  )
}

export type { FlowNodeId }
