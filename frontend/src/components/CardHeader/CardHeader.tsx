import React, { useState } from 'react'
import { Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface CardHeaderProps {
  icon: LucideIcon
  iconClassName?: string
  title: string
  subtitle?: string
  /** One-sentence, translated explanation of what this card shows. */
  tooltip: string
  /** Extra controls (badges, toggle buttons) rendered on the right. */
  right?: React.ReactNode
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  icon: Icon,
  iconClassName = 'text-indigo-600',
  title,
  subtitle,
  tooltip,
  right,
}) => {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClassName}`} />
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            <span className="relative inline-flex">
              <button
                type="button"
                aria-label={tooltip}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onFocus={() => setShowTooltip(true)}
                onBlur={() => setShowTooltip(false)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {showTooltip && (
                <span
                  role="tooltip"
                  className="absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium leading-relaxed text-white shadow-lg"
                >
                  {tooltip}
                </span>
              )}
            </span>
          </div>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  )
}
