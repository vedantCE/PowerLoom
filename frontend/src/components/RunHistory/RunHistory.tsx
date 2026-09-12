import React, { useState } from 'react'
import { History, ChevronDown, ChevronUp, GitCompareArrows } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { CardHeader } from '../CardHeader'
import { formatINR, formatHourLabel } from '../../utils/format'
import { describeOverrides } from './describeOverrides'

export const RunHistory: React.FC = () => {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const runHistory = useAppStore((s) => s.runHistory)
  const compareRunIds = useAppStore((s) => s.compareRunIds)
  const toggleCompareRun = useAppStore((s) => s.toggleCompareRun)
  const restoreRun = useAppStore((s) => s.restoreRun)

  const compareEntries = compareRunIds
    .map((id) => runHistory.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))

  if (runHistory.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <CardHeader
        icon={History}
        iconClassName="text-slate-500"
        title={t('runHistoryTitle')}
        subtitle={t('runHistorySubtitle')}
        tooltip={t('runHistoryTooltip')}
        right={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? t('historyCollapse') : t('historyExpand')}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        }
      />

      {open && (
        <div className="mt-3 space-y-1.5">
          {runHistory.map((entry) => {
            const naiveSavings =
              entry.result.savings?.find((s) => s.vs_strategy === 'naive') ?? entry.result.savings?.[0]
            const isComparing = compareRunIds.includes(entry.id)

            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  isComparing ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <label
                  className="flex shrink-0 items-center"
                  title={t('historyCompareLabel')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isComparing}
                    onChange={() => toggleCompareRun(entry.id)}
                    aria-label={t('historyCompareLabel')}
                    className="h-3.5 w-3.5 cursor-pointer rounded accent-indigo-600"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => restoreRun(entry.id)}
                  className="flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-left focus-visible:outline-none"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatHourLabel(entry.createdAt, lang)}
                      </span>
                      <span className="truncate">{describeOverrides(entry.overrides, t)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="font-mono font-semibold text-slate-700">
                      {formatINR(entry.result.summary.total_cost_inr)}
                    </span>
                    {naiveSavings && (
                      <span
                        className={`font-mono font-semibold ${
                          naiveSavings.cost_saved_inr >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {naiveSavings.cost_saved_inr >= 0 ? '-' : '+'}
                        {formatINR(Math.abs(naiveSavings.cost_saved_inr))}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {compareEntries.length === 2 && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
            <GitCompareArrows className="h-3.5 w-3.5" />
            {t('historyCompareTitle')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {compareEntries.map((entry) => (
              <div key={entry.id} className="rounded-md bg-white p-2.5 text-xs shadow-2xs">
                <p className="mb-1.5 truncate text-[11px] font-bold text-slate-700">
                  {describeOverrides(entry.overrides, t)}
                </p>
                <div className="flex justify-between text-slate-600">
                  <span>{t('impactTotalCost')}</span>
                  <span className="font-mono font-semibold">
                    {formatINR(entry.result.summary.total_cost_inr)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('impactDieselHours')}</span>
                  <span className="font-mono font-semibold">
                    {entry.result.summary.diesel_hours.toFixed(1)} h
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('impactCo2')}</span>
                  <span className="font-mono font-semibold">
                    {entry.result.summary.co2_kg.toFixed(1)} kg
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
