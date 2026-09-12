import type { FlowNodeId } from './flowLinks'

export interface NodePosition {
  x: number
  y: number
  /** Visual radius, used to trim link paths so they meet the node's edge, not its center. */
  r: number
}

export const VIEWBOX = { width: 900, height: 420 }

export const NODE_POSITIONS: Record<FlowNodeId, NodePosition> = {
  solar: { x: 120, y: 90, r: 30 },
  wind: { x: 120, y: 220, r: 30 },
  diesel: { x: 120, y: 350, r: 30 },
  battery: { x: 460, y: 220, r: 34 },
  village: { x: 780, y: 150, r: 42 },
  curtailed: { x: 330, y: 30, r: 18 },
  shed: { x: 780, y: 350, r: 22 },
}

/** Smooth horizontal S-curve between two node edges (not centers). */
export function bezierPath(from: NodePosition, to: NodePosition): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist

  const x1 = from.x + ux * from.r
  const y1 = from.y + uy * from.r
  const x2 = to.x - ux * to.r
  const y2 = to.y - uy * to.r

  const c1x = x1 + (x2 - x1) * 0.4
  const c2x = x1 + (x2 - x1) * 0.6

  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`
}
