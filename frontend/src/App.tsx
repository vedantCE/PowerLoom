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
      </main>
    </div>
  )
}

export default App
