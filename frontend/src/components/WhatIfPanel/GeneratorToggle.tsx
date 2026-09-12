import React from 'react'
import { Power } from 'lucide-react'

interface GeneratorToggleProps {
  label: string
  onLabel: string
  offLabel: string
  changedLabel: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export const GeneratorToggle: React.FC<GeneratorToggleProps> = ({
  label,
  onLabel,
  offLabel,
  changedLabel,
  checked,
  onChange,
}) => {
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Power className="h-3.5 w-3.5 shrink-0 text-rose-500" />
        <span className="truncate">{label}</span>
        {!checked && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600"
            title={changedLabel}
            aria-label={changedLabel}
          />
        )}
      </span>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
            checked ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-8' : 'translate-x-1'
            }`}
          />
          <span className="sr-only">{checked ? onLabel : offLabel}</span>
        </button>
        <span className="text-[11px] font-mono font-semibold text-slate-600">
          {checked ? onLabel : offLabel}
        </span>
      </div>
    </div>
  )
}
