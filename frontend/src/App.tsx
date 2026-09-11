import React, { useEffect } from 'react'
import { AlertTriangle, RotateCw, Sparkles, Inbox } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { useT } from './i18n/strings'
import { Header } from './components/Header/Header'
import { WhatIfPlaceholder } from './components/Sidebar/WhatIfPlaceholder'
import { SavingsCards } from './components/SavingsCards/SavingsCards'
import { EnergyFlowPlaceholder } from './components/EnergyFlow/EnergyFlowPlaceholder'
import { EnergyMixPlaceholder } from './components/EnergyMix/EnergyMixPlaceholder'
import { SocChartPlaceholder } from './components/SocChart/SocChartPlaceholder'
import { HourTimeline } from './components/HourTimeline/HourTimeline'
import { ExplainBox } from './components/ExplainBox/ExplainBox'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'

export const App: React.FC = () => {
  const { t } = useT()
  const { loadPresets, loadHealth, status, error, runOptimize, result } = useAppStore()

  useEffect(() => {
    loadHealth()
    loadPresets()
  }, [loadHealth, loadPresets])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Top Navigation / Control Bar */}
      <Header />

      {/* Main Container: Desktop First, Responsive to Tablet */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row items-start">
          {/* Left Sidebar: What-if Simulator Placeholder (Phase 4.3) */}
          <WhatIfPlaceholder />

          {/* Main Content Area */}
          <div className="flex-1 w-full space-y-6">
            <ErrorBoundary>
              {/* Global Error Banner / Card */}
              {status === 'error' && (
                <div
                  id="error-card"
                  className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-red-900">{t('errorTitle')}</h3>
                      <p className="mt-1 text-xs text-red-700 leading-relaxed">
                        {error || 'An error occurred while computing the dispatch plan.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => runOptimize()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700 active:scale-98"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        {t('retry')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State before first run */}
              {status === 'idle' && !result && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <Inbox className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-800">{t('emptyTitle')}</h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    {t('emptyDesc')}
                  </p>
                  <button
                    type="button"
                    onClick={() => runOptimize()}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <Sparkles className="h-4 w-4" />
                    {t('runOptimization')}
                  </button>
                </div>
              )}

              {/* Main Dashboard Cards in specified order */}
              {(status !== 'idle' || result) && (
                <>
                  {/* 1. Savings Cards Row (Real values) */}
                  <SavingsCards />

                  {/* 2. Energy Flow (Phase 4.4 Placeholder) */}
                  <EnergyFlowPlaceholder />

                  {/* 3. Energy Mix Chart (Phase 4.2 Placeholder) */}
                  <EnergyMixPlaceholder />

                  {/* 4. Battery SOC Chart (Phase 4.2 Placeholder) */}
                  <SocChartPlaceholder />

                  {/* 5. 24h / 48h Clickable Timeline (Real dominant colors & selection) */}
                  <HourTimeline />

                  {/* 6. Explain Box (Real plain-language explainer) */}
                  <ExplainBox />
                </>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
