
import { AlertTriangle, RotateCw, Sparkles, Inbox } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { useT } from './i18n/strings'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Header } from './components/Header/Header'
import { WhatIfPanel, StressTestBanner } from './components/WhatIfPanel'
import { RunHistory } from './components/RunHistory'
import { SavingsCards } from './components/SavingsCards/SavingsCards'
import { EnergyFlow } from './components/EnergyFlow'
import { EnergyMixChart } from './components/EnergyMixChart'
import { SocChart } from './components/SocChart'
import { BaselineComparison } from './components/BaselineComparison'
import { HourTimeline } from './components/HourTimeline/HourTimeline'
import { ExplainBox } from './components/ExplainBox/ExplainBox'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import { ShortcutsOverlay } from './components/ShortcutsOverlay'
import { OnboardingHints } from './components/OnboardingHints'
import { OperatorView } from './components/OperatorView'
import { useEffect } from 'react'

const PRESENTATION_FONT_SCALE = '110%'
export const App: React.FC = () => {
  const { t, lang } = useT()
  const {
    loadPresets,
    loadHealth,
    status,
    error,
    runOptimize,
    result,
    presentationMode,
    operatorMode,
  } = useAppStore()

  useEffect(() => {
    loadHealth()
    loadPresets()
  }, [loadHealth, loadPresets])

  useKeyboardShortcuts()

  useEffect(() => {
    document.documentElement.style.fontSize = presentationMode ? PRESENTATION_FONT_SCALE : ''
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [presentationMode])

  // Keeps the `:lang()` CSS rules (Indic line-height, see index.css) and
  // assistive tech in sync with the in-app language switch.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Top Navigation / Control Bar */}
      <Header />

      {/* Main Container: Desktop First, Responsive to Tablet */}
      <main
        className={`mx-auto px-4 py-6 sm:px-6 lg:px-8 ${presentationMode ? 'max-w-[1800px]' : 'max-w-7xl'}`}
      >
        <div className="flex flex-col gap-6 lg:flex-row items-start">
          {/* Left Sidebar: What-if Simulator (Phase 4.3) — hidden in presentation mode
              and in operator view (analyst-only controls). */}
          {!presentationMode && !operatorMode && (
            <div className="w-full space-y-4 lg:w-80 shrink-0">
              <WhatIfPanel />
              <RunHistory />
            </div>
          )}

          {/* Main Content Area */}
          {/* min-w-0 overrides the flex item's default min-width:auto — without it,
              the 48-hour timeline strip's intrinsic width stretches this column (and
              the whole page) wider than the viewport instead of scrolling internally. */}
          <div className="min-w-0 flex-1 w-full space-y-6">
            {/* Stress-test banner: shown when the generator-failure override is active */}
            <StressTestBanner />

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

              {operatorMode ? (
                /* Operator view: simplified, non-technical guidance only —
                   see components/OperatorView. */
                <OperatorView />
              ) : (
                <>
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
                    <div className="relative space-y-6">
                      {status === 'loading' && result && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/40 backdrop-blur-[1px]">
                          <div className="mt-3 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                            <RotateCw className="h-3.5 w-3.5 animate-spin" />
                            {t('optimizing')}
                          </div>
                        </div>
                      )}
                      {/* 1. Savings Cards Row (Real values) */}
                      <SavingsCards />

                      {/* 1b. Baseline Comparison (Phase 4.2), directly below Savings Cards */}
                      <BaselineComparison />

                      {/* 2. Energy Flow (Phase 4.4) */}
                      <EnergyFlow />

                      {/* 3. Energy Mix Chart (Phase 4.2) */}
                      <EnergyMixChart />

                      {/* 4. Battery SOC Chart (Phase 4.2) */}
                      <SocChart />

                      {/* 5. 24h / 48h Clickable Timeline (Real dominant colors & selection) */}
                      <HourTimeline />

                      {/* 6. Explain Box (Real plain-language explainer) */}
                      <ExplainBox />
                    </div>
                  )}
                </>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </main>

      <ToastContainer />
      <ShortcutsOverlay />
      <OnboardingHints />
    </div>
  )
}

export default App
