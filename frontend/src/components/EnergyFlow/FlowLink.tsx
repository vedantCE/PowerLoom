import React from 'react'
import { bezierPath, type NodePosition } from './positions'
import { FlowParticles } from './FlowParticles'
import { formatKw } from '../../utils/format'

interface FlowLinkProps {
  from: NodePosition
  to: NodePosition
  kw: number
  color: string
  /** Reference kW for scaling stroke width / particle density (the busiest link this hour). */
  capKw: number
  reducedMotion: boolean
  showLabel?: boolean
}

const MIN_STROKE = 2
const MAX_STROKE = 14
const EPSILON = 1e-6

export const FlowLink: React.FC<FlowLinkProps> = ({
  from,
  to,
  kw,
  color,
  capKw,
  reducedMotion,
  showLabel = true,
}) => {
  const d = bezierPath(from, to)
  const active = kw > EPSILON
  const ratio = capKw > 0 ? Math.min(1, kw / capKw) : 0
  const strokeWidth = active ? MIN_STROKE + ratio * (MAX_STROKE - MIN_STROKE) : 1.5

  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2 - 8

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={active ? color : '#cbd5e1'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={active ? undefined : '4 6'}
        opacity={active ? 0.9 : 0.5}
      />
      {active && !reducedMotion && <FlowParticles pathD={d} color={color} intensity={ratio} />}
      {active && showLabel && (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="#334155"
          stroke="#ffffff"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {formatKw(kw)}
        </text>
      )}
    </g>
  )
}
