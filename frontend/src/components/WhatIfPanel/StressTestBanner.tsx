import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'

export const StressTestBanner: React.FC = () => {
  const { t } = useT()
  const dieselAvailable = useAppStore((s) => s.overrides.diesel_available)

  if (dieselAvailable !== false) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 shadow-xs"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-red-900">{t('stressTestBannerTitle')}</h3>
        <p className="mt-0.5 text-xs text-red-700 leading-relaxed">{t('stressTestBannerDesc')}</p>
      </div>
    </div>
  )
}
