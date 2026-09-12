import React, { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHealth } from './api/client'
import { SavingsCards } from './components/SavingsCards/SavingsCards'
import { BaselineComparison } from './components/BaselineComparison'
import { EnergyMixChart } from './components/EnergyMixChart'
import { SocChart } from './components/SocChart'
import { HourTimeline } from './components/HourTimeline/HourTimeline'
import { ExplainBox } from './components/ExplainBox/ExplainBox'
import { Globe, RefreshCw, Cpu } from 'lucide-react'
import type { Language } from './types/api'

export const App: React.FC = () => {
  const status = useAppStore((s) => s.status)
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const fetchOptimization = useAppStore((s) => s.fetchOptimization)

  const [backendOnline, setBackendOnline] = React.useState<boolean | null>(null)

  useEffect(() => {
    getHealth()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false))
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 font-bold text-slate-950 shadow-lg shadow-sky-500/20">
                <Cpu className="h-6 w-6 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-slate-100">
                    Powerloom
                  </h1>
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    Phase 4.2
                  </span>
                </div>
                <p className="hidden sm:block text-xs text-slate-400">
                  Forecast-driven energy mix optimizer &middot; Asia/Kolkata
                </p>
              </div>
            </div>

            {/* Actions & Language */}
            <div className="flex items-center gap-3">
              {/* Backend indicator */}
              <div
                className={`hidden md:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  backendOnline
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : backendOnline === false
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    backendOnline
                      ? 'bg-emerald-400 animate-pulse'
                      : backendOnline === false
                        ? 'bg-amber-400'
                        : 'bg-slate-400'
                  }`}
                />
                {backendOnline
                  ? 'Backend Live'
                  : backendOnline === false
                    ? 'Mock Mode'
                    : 'Connecting...'}
              </div>

              {/* Language Switcher */}
              <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                <Globe className="h-3.5 w-3.5 text-slate-400 ml-2 mr-1" />
                {(['en', 'gu', 'hi'] as Language[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                      language === lang
                        ? 'bg-sky-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lang === 'en' ? 'EN' : lang === 'gu' ? 'ગુજ' : 'हिं'}
                  </button>
                ))}
              </div>

              {/* Reload / Re-optimize Button */}
              <button
                type="button"
                onClick={() => fetchOptimization()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-all active:scale-95"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-sky-400 ${status === 'loading' ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">Re-optimize</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* 1. Savings Overview Row */}
        <SavingsCards />

        {/* 2. Baseline Comparison directly below savings cards */}
        <BaselineComparison />

        {/* 3. Energy Mix Chart */}
        <EnergyMixChart />

        {/* 4. Battery SOC Chart */}
        <SocChart />

        {/* 5. 48-Hour Dominant Source Timeline */}
        <HourTimeline />

        {/* 6. Explain Box for selected hour */}
        <ExplainBox />
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

export const App: React.FC = () => {
  const { t } = useT()
  const { loadPresets, loadHealth, status, error, runOptimize, result, presentationMode } =
    useAppStore()

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Top Navigation / Control Bar */}
      <Header />

      {/* Main Container: Desktop First, Responsive to Tablet */}
      <main
        className={`mx-auto px-4 py-6 sm:px-6 lg:px-8 ${presentationMode ? 'max-w-[1800px]' : 'max-w-7xl'}`}
      >
        <div className="flex flex-col gap-6 lg:flex-row items-start">
          {/* Left Sidebar: What-if Simulator (Phase 4.3) — hidden in presentation mode */}
          {!presentationMode && (
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
