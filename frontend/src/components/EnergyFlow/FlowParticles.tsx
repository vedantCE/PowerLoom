import React from 'react'

interface FlowParticlesProps {
  pathD: string
  color: string
  /** 0..1, how "full" this link is relative to the diagram's busiest link. */
  intensity: number
}

// Native SVG <animateMotion> drives these, not React state, so a busy diagram
// never causes a re-render storm — the browser's own animation engine owns it.
export const FlowParticles: React.FC<FlowParticlesProps> = ({ pathD, color, intensity }) => {
  const clamped = Math.max(0, Math.min(1, intensity))
  const count = Math.max(1, Math.round(1 + clamped * 5))
  const duration = Math.max(0.6, 2.2 - clamped * 1.6)

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <circle key={i} r={3.4} fill={color} opacity={0.9}>
          <animateMotion
            path={pathD}
            dur={`${duration}s`}
            begin={`${(i * duration) / count}s`}
            repeatCount="indefinite"
            rotate="auto"
          />
        </circle>
      ))}
    </>
  )
}
