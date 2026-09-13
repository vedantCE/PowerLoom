import React, { useState } from 'react'
import {
  RotateCw,
  MapPin,
  Clock,
  Globe2,
  Sparkles,
  Presentation,
  Menu,
  X,
  FileDown,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import type { Language } from '../../types/api'
import { downloadReport } from '../../api/client'

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
    result,
    presentationMode,
    togglePresentationMode,
    pushToast,
  } = useAppStore()

  const [reportLoading, setReportLoading] = useState(false)

  const handleDownloadReport = async () => {
    if (!selectedVillageId || reportLoading) return
    setReportLoading(true)
    try {
      const blob = await downloadReport(selectedVillageId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const today = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `Microgrid_24H_Energy_Dispatch_${today}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      pushToast('success', 'Report downloaded successfully')
    } catch {
      pushToast('error', 'Unable to generate report. Please try again.')
    } finally {
      setReportLoading(false)
    }
  }

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
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 max-w-full overflow-hidden">
          <MapPin className="mr-1.5 h-4 w-4 text-slate-400 shrink-0" />
          <select
            id="village-select"
            aria-label={t('village')}
            value={selectedVillageId ?? ''}
            onChange={(e) => selectVillage(e.target.value)}
            disabled={isLoading}
            className="cursor-pointer bg-transparent text-xs sm:text-sm font-semibold text-slate-800 outline-none disabled:cursor-not-allowed max-w-[200px] xs:max-w-[260px] sm:max-w-[340px] truncate"
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

        {/* Download 24-Hour Report Button */}
        {!isMock && selectedVillageId && (
          <button
            type="button"
            id="download-report-btn"
            onClick={handleDownloadReport}
            disabled={reportLoading}
            title="Download 24-Hour Energy Dispatch Report (PDF)"
            className="flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reportLoading ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Generating Report...</span>
              </>
            ) : (
              <>
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download 24-Hour Report</span>
              </>
            )}
          </button>
        )}

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
      </div>
    </header>
  )
}
