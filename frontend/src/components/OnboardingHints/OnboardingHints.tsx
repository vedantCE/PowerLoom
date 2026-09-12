import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useT } from '../../i18n/strings'
import type { StringKey } from '../../i18n/strings'

const STORAGE_KEY = 'powerloom_onboarding_dismissed'

const STEPS: { titleKey: StringKey; descKey: StringKey }[] = [
  { titleKey: 'onboardStep1Title', descKey: 'onboardStep1Desc' },
  { titleKey: 'onboardStep2Title', descKey: 'onboardStep2Desc' },
  { titleKey: 'onboardStep3Title', descKey: 'onboardStep3Desc' },
]

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // localStorage unavailable (private mode, etc.) — nothing to persist, just hide for this visit.
  }
}

export const OnboardingHints: React.FC = () => {
  const { t } = useT()
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed())

  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    persistDismissed()
  }

  function next() {
    if (step >= STEPS.length - 1) {
      dismiss()
      return
    }
    setStep((s) => s + 1)
  }

  const current = STEPS[step]
  const isLast = step >= STEPS.length - 1

  return (
    <div className="fixed bottom-4 left-4 z-40 w-72 rounded-xl border border-indigo-200 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">
          {t('onboardBadge')} {step + 1}/{STEPS.length}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('close')}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <h3 className="mt-1.5 text-sm font-bold text-slate-900">{t(current.titleKey)}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{t(current.descKey)}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <span
              key={s.titleKey}
              className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-indigo-600' : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            {t('onboardSkip')}
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            {isLast ? t('onboardDone') : t('onboardNext')}
          </button>
        </div>
      </div>
    </div>
  )
}
