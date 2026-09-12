import React, { useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'

interface SliderControlProps {
  id: string
  icon: LucideIcon
  iconClassName: string
  accentClassName: string
  label: string
  value: number | undefined
  defaultValue: number | undefined
  min: number
  max: number
  step: number
  /** When set, the slider gains a first stop that maps to `undefined` (e.g. "Forecast"). */
  specialLabel?: string
  formatValue: (v: number) => string
  changedLabel: string
  onChange: (v: number | undefined) => void
}

export const SliderControl: React.FC<SliderControlProps> = ({
  id,
  icon: Icon,
  iconClassName,
  accentClassName,
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  specialLabel,
  formatValue,
  changedLabel,
  onChange,
}) => {
  const hasSpecial = specialLabel !== undefined
  const stepsCount = Math.round((max - min) / step) + 1
  const sliderMax = hasSpecial ? stepsCount : stepsCount - 1

  const currentIndex = useMemo(() => {
    if (value === undefined) return 0
    const realIdx = Math.round((value - min) / step)
    return hasSpecial ? realIdx + 1 : realIdx
  }, [value, min, step, hasSpecial])

  const isChanged = value !== defaultValue

  const displayText =
    value === undefined ? (specialLabel ?? formatValue(min)) : formatValue(value)

  function indexToValue(idx: number): number | undefined {
    if (hasSpecial && idx === 0) return undefined
    const realIdx = hasSpecial ? idx - 1 : idx
    return min + realIdx * step
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${iconClassName}`} />
          {label}
          {isChanged && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-indigo-600"
              title={changedLabel}
              aria-label={changedLabel}
            />
          )}
        </span>
        <span className="font-mono text-slate-600">{displayText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={sliderMax}
        step={1}
        value={currentIndex}
        aria-label={label}
        aria-valuetext={displayText}
        onChange={(e) => onChange(indexToValue(Number(e.target.value)))}
        className={`h-5 w-full min-w-0 touch-manipulation rounded-full outline-none ${accentClassName}`}
      />
    </div>
  )
}
