import React from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import type { NodePosition } from './positions'

interface FlowNodeProps {
  position: NodePosition
  icon: LucideIcon
  label: string
  color: string
  active: boolean
  /** Remount key (e.g. the hour index) so the pulse animation replays on every hour change. */
  pulseToken: string | number
  reducedMotion: boolean
  disabled?: boolean
  disabledLabel?: string
  subLabel?: string
  /** Subtle continuous shake, used for the diesel node while it's running. */
  vibrate?: boolean
  /** Continuous scale/opacity throb, used for an alert node (e.g. load shed). */
  alertPulse?: boolean
  children?: React.ReactNode
}

export const FlowNode: React.FC<FlowNodeProps> = ({
  position,
  icon: Icon,
  label,
  color,
  active,
  pulseToken,
  reducedMotion,
  disabled = false,
  disabledLabel,
  subLabel,
  vibrate = false,
  alertPulse = false,
  children,
}) => {
  const { x, y, r } = position
  const fillColor = disabled ? '#cbd5e1' : color
  const shouldVibrate = vibrate && !disabled && !reducedMotion
  const shouldAlertPulse = alertPulse && !reducedMotion

  const continuousAnimate = shouldVibrate
    ? { scale: 1, x: [0, -0.8, 0.8, -0.8, 0], y: [0, 0.6, -0.6, 0.6, 0], opacity: 1 }
    : shouldAlertPulse
      ? { scale: [1, 1.1, 1], opacity: [1, 0.75, 1], x: 0, y: 0 }
      : { scale: 1, x: 0, y: 0, opacity: 1 }

  const continuousTransition = shouldVibrate
    ? { x: { repeat: Infinity, duration: 0.35 }, y: { repeat: Infinity, duration: 0.35 } }
    : shouldAlertPulse
      ? { repeat: Infinity, duration: 1.1, ease: 'easeInOut' as const }
      : { type: 'spring' as const, stiffness: 260, damping: 16 }

  return (
    <g transform={`translate(${x}, ${y})`}>
      <motion.g
        key={reducedMotion ? 'static' : `${pulseToken}-${active}`}
        initial={active && !reducedMotion ? { scale: 0.88 } : { scale: 1 }}
        animate={continuousAnimate}
        transition={continuousTransition}
      >
        <circle
          r={r}
          fill={fillColor}
          fillOpacity={disabled ? 0.15 : active ? 0.16 : 0.08}
          stroke={fillColor}
          strokeWidth={active && !disabled ? 2.5 : 1.5}
        />
        <Icon
          x={-r * 0.5}
          y={-r * 0.5}
          width={r}
          height={r}
          color={disabled ? '#94a3b8' : color}
          strokeWidth={2}
        />
        {disabled && (
          <line x1={-r * 0.8} y1={-r * 0.8} x2={r * 0.8} y2={r * 0.8} stroke="#ef4444" strokeWidth={2.5} />
        )}
      </motion.g>

      <text
        y={r + 18}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="#1e293b"
      >
        {label}
      </text>
      {(subLabel || disabledLabel) && (
        <text
          y={r + 34}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={disabled ? '#dc2626' : '#64748b'}
        >
          {disabled ? disabledLabel : subLabel}
        </text>
      )}
      {children}
    </g>
  )
}
