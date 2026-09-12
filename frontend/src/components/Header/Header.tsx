import React from 'react'
import {
  RotateCw,
  MapPin,
  Clock,
  Globe2,
  Database,
  Sparkles,
  Presentation,
  Menu,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import type { Language } from '../../types/api'

interface HeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, onToggleSidebar }) => {
  const { t, lang } = useT()
  const {
    presets,
    selectedVillageId,
    selectVillage,
    horizon,
    setHorizon,
    setLanguage,
    runOptimize,
    status,
    health,
    result,
    presentationMode,
    togglePresentationMode,
    setShortcutsOverlayOpen,
  } = useAppStore()

  const isMock = import.meta.env.VITE_USE_MOCK === 'true' || result?.is_mock
  const isLoading = status === 'loading'

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'gu', label: 'ગુજરાતી' },
    { code: 'hi', label: 'हिंदी' },
  ]

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-md shadow-xs sm:gap-4 sm:px-6 sm:py-3.5">
      {/* Brand / Wordmark — also the sidebar toggle: opens the Analyst/Operator
          view drawer on mobile, collapses/expands the panel on desktop. */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
        aria-label={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
        title={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
        className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 -ml-1 transition-colors hover:bg-slate-50 sm:gap-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </span>
        <img src="/logo_clean.png" alt="Powerloom" className="h-9 w-auto shrink-0 object-contain sm:h-12" />
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-xl">
              {t('appName')}
            </h1>
          </div>
          <p className="hidden text-xs font-medium text-slate-500 sm:block">{t('tagline')}</p>
        </div>
      </button>

      {/* Controls: Village, Horizon, Lang, Run */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Village Selector */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
          <MapPin className="mr-1.5 h-4 w-4 text-slate-400 shrink-0" />
          <select
            id="village-select"
            aria-label={t('village')}
            value={selectedVillageId ?? ''}
            onChange={(e) => selectVillage(e.target.value)}
            disabled={isLoading}
            className="cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none disabled:cursor-not-allowed"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id} className="text-slate-800">
                {p.name} ({p.district}, {p.state}) &mdash; {p.solar_kw}kW PV / {p.battery_kwh}kWh
              </option>
            ))}
          </select>
        </div>

        {/* 24h / 48h Horizon Toggle */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
          <Clock className="mx-1 h-3.5 w-3.5 text-slate-500" />
          <button
            type="button"
            id="horizon-24-btn"
            onClick={() => setHorizon(24)}
            disabled={isLoading}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
              horizon === 24
                ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('h24')}
          </button>
          <button
            type="button"
            id="horizon-48-btn"
            onClick={() => setHorizon(48)}
            disabled={isLoading}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
              horizon === 48
                ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('h48')}
          </button>
        </div>

        {/* Language Switcher */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
          <Globe2 className="mx-1 h-3.5 w-3.5 text-slate-500" />
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              id={`lang-btn-${l.code}`}
              onClick={() => setLanguage(l.code)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                lang === l.code
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Run Optimization Button */}
        <button
          type="button"
          id="run-optimize-btn"
          onClick={() => runOptimize()}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <RotateCw className="h-4 w-4 animate-spin text-white" />
              <span>{t('optimizing')}</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>{t('runOptimization')}</span>
            </>
          )}
        </button>

        {/* Presentation mode + shortcuts help */}
        <div className="flex items-center gap-1">

          <button
            type="button"
            onClick={togglePresentationMode}
            aria-pressed={presentationMode}
            aria-label={t('presentationModeToggle')}
            title={t('presentationModeToggle')}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              presentationMode
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Presentation className="h-4 w-4" />
          </button>
        </div>

        {/* Backend & Environment Status Badges */}
        <div className="flex items-center gap-1.5 pl-1">
          {isMock ? (
            <span
              id="mock-badge"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
              title={t('mockDataTooltip')}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              {t('mockDataChip')}
            </span>
          ) : (
            <span
              id="backend-badge"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                health?.status === 'ok'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-800'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health?.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              {t('liveBackend')}
              {health?.database && (
                <span className="ml-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500 font-normal">
                  <Database className="h-3 w-3" />
                  {health.database}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
