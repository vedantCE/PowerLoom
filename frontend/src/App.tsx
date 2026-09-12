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
import { PersonalizedScenarioPage } from './pages/PersonalizedScenarioPage'
import { useEffect, useState } from 'react'

const PRESENTATION_FONT_SCALE = '110%'

// Single easing curve for every drawer/backdrop transition so open and
// close feel like one continuous motion instead of two different tweens.
const DRAWER_EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)]'

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

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [page, setPage] = useState<'dashboard' | 'scenario'>('dashboard')

  useEffect(() => {
    loadHealth()
    loadPresets()
  }, [loadHealth, loadPresets])

  useKeyboardShortcuts()

  useEffect(() => {
    document.documentElement.style.fontSize = presentationMode
      ? PRESENTATION_FONT_SCALE
      : ''

    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [presentationMode])

  // Keep document language synchronized with the selected app language.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div
      className={`bg-slate-50 text-slate-900 antialiased flex flex-col overflow-x-hidden ${
        operatorMode
          ? 'min-h-screen lg:h-screen lg:overflow-hidden'
          : 'min-h-screen'
      }`}
    >
      {/* =========================================================
          TOP NAVIGATION / CONTROL BAR
          ========================================================= */}
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      {/* =========================================================
          MAIN CONTAINER
          ========================================================= */}
      <main
        className={`mx-auto w-full min-w-0 overflow-x-hidden ${
          operatorMode
            ? 'flex-1 min-h-0 flex flex-col px-2 sm:px-3 lg:px-4 py-3'
            : `py-4 px-3 sm:py-6 sm:px-6 lg:px-8 ${
                presentationMode ? 'max-w-[1800px]' : 'max-w-7xl'
              }`
        }`}
      >
        <div
          className={`flex flex-col gap-6 lg:flex-row items-start w-full min-w-0 ${
            operatorMode ? 'flex-1 min-h-0' : ''
          }`}
        >
          {/* =====================================================
              NAV DRAWER — Analyst view / Operator view ONLY
              - This is the ONLY part of the UI controlled by the
                Header toggle button. It never auto-opens and it
                never contains the What-if Simulator or Run History.
              - Rendered as a fixed overlay at every breakpoint (not
                just mobile) so opening/closing it never pushes or
                overlaps the dashboard underneath.
              ===================================================== */}
          {!presentationMode && (
            <>
              {/* Backdrop — click outside to close, all breakpoints */}
              <div
                aria-hidden="true"
                onClick={() => setSidebarOpen(false)}
                className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-300 ${DRAWER_EASE} ${
                  sidebarOpen
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none'
                }`}
              />

              <aside
                id="app-sidebar"
                inert={!sidebarOpen || undefined}
                className={`
                  fixed inset-y-0 left-0 z-50
                  w-[85vw] max-w-xs
                  overflow-y-auto overflow-x-hidden
                  bg-white
                  shadow-2xl
                  transition-transform duration-300 ${DRAWER_EASE}
                  ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
              >
                <div className="p-4" aria-hidden={!sidebarOpen}>
                  <SidebarNav
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen(false)}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                </div>
              </aside>
            </>
          )}

          {/* =====================================================
              PERSISTENT CONTROL COLUMN — always visible
              - NOT tied to sidebarOpen. Renders inline in normal
                flow, so it can never overlap the dashboard content;
                on mobile it stacks above the dashboard, on desktop
                it sits as a sticky left column.
              ===================================================== */}
          {!presentationMode && !operatorMode && (
            <div className="w-full lg:w-80 lg:shrink-0 lg:sticky lg:top-4 lg:self-start space-y-4">
              <WhatIfPanel onNavigateToScenario={() => setPage('scenario')} />
              <RunHistory />
            </div>
          )}

          {/* =====================================================
              MAIN CONTENT AREA
              ===================================================== */}
          <div
            className={`min-w-0 flex-1 w-full ${
              operatorMode
                ? 'h-full min-h-0 flex flex-col'
                : 'space-y-6'
            }`}
          >
            {/* Stress-test banner */}
            <StressTestBanner />

            {/* ── Scenario page swap ── */}
            {page === 'scenario' ? (
              <PersonalizedScenarioPage onBack={() => setPage('dashboard')} />
            ) : (
              <ErrorBoundary>
                {/* =================================================
                    GLOBAL ERROR BANNER
                    ================================================= */}
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
                        <h3 className="text-sm font-bold text-red-900">
                          {t('errorTitle')}
                        </h3>

                        <p className="mt-1 text-xs text-red-700 leading-relaxed">
                          {error ||
                            'An error occurred while computing the dispatch plan.'}
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

                {/* =================================================
                    OPERATOR VIEW
                    ================================================= */}
                {operatorMode ? (
                  <div className="flex-1 min-h-0">
                    <OperatorView />
                  </div>
                ) : (
                  <>
                    {/* =================================================
                        EMPTY STATE BEFORE FIRST OPTIMIZATION
                        ================================================= */}
                    {status === 'idle' && !result && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Inbox className="h-6 w-6" />
                        </div>

                        <h3 className="mt-3 text-base font-bold text-slate-800">
                          {t('emptyTitle')}
                        </h3>

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

                    {/* =================================================
                        MAIN DASHBOARD
                        ================================================= */}
                    {(status !== 'idle' || result) && (
                      <div className="relative space-y-6 min-w-0">
                        {/* Loading overlay */}
                        {status === 'loading' && result && (
                          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/40 backdrop-blur-[1px]">
                            <div className="mt-3 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                              <RotateCw className="h-3.5 w-3.5 animate-spin" />
                              {t('optimizing')}
                            </div>
                          </div>
                        )}

                        <SavingsCards />

                        <div id="explain-box-section">
                          <ExplainBox />
                        </div>

                        <div id="baseline-comparison-section" className="min-w-0 overflow-x-auto">
                          <BaselineComparison />
                        </div>

                        <div id="energy-flow-section" className="min-w-0 overflow-x-auto">
                          <EnergyFlow />
                        </div>

                        <div id="energy-mix-section" className="min-w-0 overflow-x-auto">
                          <EnergyMixChart />
                        </div>

                        <SocChart />

                        <div id="hour-timeline-section" className="min-w-0 overflow-x-auto">
                          <HourTimeline />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </ErrorBoundary>
            )}
          </div>
        </div>
      </main>

      {/* =========================================================
          GLOBAL UI COMPONENTS
          ========================================================= */}
      <ToastContainer />
      <ShortcutsOverlay />
      <OnboardingHints />
    </div>
  )
}

export default App