
import { AlertTriangle, RotateCw, Sparkles, Inbox } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { useT } from './i18n/strings'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Header } from './components/Header/Header'
import { SidebarNav } from './components/SidebarNav'
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
import { useEffect, useState } from 'react'

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
  // Desktop starts with the sidebar expanded (a persistent, collapsible panel);
  // mobile starts with it closed (an off-canvas drawer opened from the header)
  // so it doesn't push the dashboard content down on first load.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )

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
    <div
      className={`bg-slate-50 text-slate-900 antialiased flex flex-col ${
        operatorMode ? 'min-h-screen lg:h-screen lg:overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* Top Navigation / Control Bar */}
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />

      {/* Main Container: Desktop First, Responsive to Tablet */}
      <main
        className={`mx-auto w-full ${
          operatorMode
            ? 'flex-1 min-h-0 flex flex-col px-2 sm:px-3 lg:px-4 py-3'
            : `py-4 px-3 sm:py-6 sm:px-6 lg:px-8 ${presentationMode ? 'max-w-[1800px]' : 'max-w-7xl'}`
        }`}
      >
        <div
          className={`flex flex-col gap-6 lg:flex-row items-start w-full ${
            operatorMode ? 'flex-1 min-h-0' : ''
          }`}
        >
          {/* Left Sidebar: persistent, collapsible view-switcher nav, plus the What-if
              Simulator (Phase 4.3) which is analyst-only and hidden in presentation
              mode. On mobile it's an off-canvas drawer toggled from the header logo;
              on desktop (lg+) it's an inline, collapsible panel. */}
          {!presentationMode && (
            <>
              {/* Backdrop: mobile-only, closes the drawer on outside click */}
              {sidebarOpen && (
                <div
                  className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                  aria-hidden="true"
                />
              )}
              <div
                id="app-sidebar"
                className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs overflow-y-auto bg-slate-50 p-4 shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:w-auto lg:max-w-none lg:shrink-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:transition-[width] lg:translate-x-0 ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } ${sidebarOpen ? 'lg:w-72' : 'lg:w-14'}`}
              >
                <div className="space-y-4">
                  <SidebarNav
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onNavigate={() => {
                      if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
                        setSidebarOpen(false)
                      }
                    }}
                  />
                  {!operatorMode && sidebarOpen && (
                    <>
                      <WhatIfPanel />
                      <RunHistory />
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Main Content Area */}
          {/* min-w-0 overrides the flex item's default min-width:auto — without it,
              the 48-hour timeline strip's intrinsic width stretches this column (and
              the whole page) wider than the viewport instead of scrolling internally. */}
          <div
            className={`min-w-0 flex-1 w-full ${
              operatorMode ? 'h-full min-h-0 flex flex-col' : 'space-y-6'
            }`}
          >
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
                <div className="flex-1 min-h-0">
                  <OperatorView />
                </div>
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
                      <div id="baseline-comparison-section">
                        <BaselineComparison />
                      </div>

                      {/* 2. Energy Flow (Phase 4.4) */}
                      <div id="energy-flow-section">
                        <EnergyFlow />
                      </div>

                      {/* 3. Energy Mix Chart (Phase 4.2) */}
                      <div id="energy-mix-section">
                        <EnergyMixChart />
                      </div>

                      {/* 4. Battery SOC Chart (Phase 4.2) */}
                      <SocChart />

                      {/* 5. 24h / 48h Clickable Timeline (Real dominant colors & selection) */}
                      <div id="hour-timeline-section">
                        <HourTimeline />
                      </div>

                      {/* 6. Explain Box (Real plain-language explainer) */}
                      <div id="explain-box-section">
                        <ExplainBox />
                      </div>
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
