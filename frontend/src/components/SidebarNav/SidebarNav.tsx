import React from 'react'
import { LayoutDashboard, UserCog, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import type { StringKey } from '../../i18n/strings'

interface SectionLink {
  id: string
  labelKey: StringKey
}

const SECTION_LINKS: SectionLink[] = [
  { id: 'explain-box-section', labelKey: 'explainTitle' },
  { id: 'energy-flow-section', labelKey: 'energyFlowTitle' },
  { id: 'energy-mix-section', labelKey: 'energyMixTitle' },
  { id: 'hour-timeline-section', labelKey: 'timelineTitle' },
  { id: 'baseline-comparison-section', labelKey: 'baselineTitle' },
]

interface SidebarNavProps {
  open: boolean
  onToggle: () => void
  /** Called after a nav selection; App.tsx uses this to close the mobile drawer. */
  onNavigate?: () => void
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ open, onToggle, onNavigate }) => {
  const { t } = useT()
  const { operatorMode, toggleOperatorMode, presets, selectedVillageId } = useAppStore()
  const selectedVillage = presets.find((p) => p.id === selectedVillageId)

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    onNavigate?.()
  }

  return (
    <nav
      className={`flex flex-col rounded-2xl bg-slate-900 p-3 shadow-lg ring-1 ring-slate-800 transition-[width] duration-300 ease-in-out ${
        open ? 'w-full lg:w-64' : 'w-full lg:w-16'
      }`}
    >
      {/* Brand block: avatar + name/village, echoes a profile-card sidebar header */}
      <div className={`flex items-center gap-3 pb-3 ${open ? 'px-1' : 'justify-center'}`}>
        <img
          src="/logo.jpg"
          alt="Powerloom"
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-slate-700"
        />
        {open && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{t('appName')}</p>
            <p className="truncate text-xs text-slate-400">
              {selectedVillage ? `${selectedVillage.name}, ${selectedVillage.district}` : t('tagline')}
            </p>
          </div>
        )}
        {open && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={t('collapseSidebar')}
            title={t('collapseSidebar')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="border-t border-slate-800" />

      {/* Primary nav: the two view modes, styled as a pill list with an
          active-state highlight (dark sidebar, bright pill on selection). */}
      <div className="space-y-1 pt-3">
        <button
          type="button"
          id="sidebar-analyst-view-btn"
          onClick={() => {
            if (operatorMode) toggleOperatorMode()
            onNavigate?.()
          }}
          aria-pressed={!operatorMode}
          title={t('analystViewLabel')}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            open ? 'justify-start' : 'justify-center'
          } ${
            !operatorMode
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {open && <span className="truncate">{t('analystViewLabel')}</span>}
        </button>

        {open && !operatorMode && (
          <div className="ml-3 space-y-0.5 border-l border-slate-800 py-1 pl-3">
            {SECTION_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollToSection(link.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                {t(link.labelKey)}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          id="sidebar-operator-view-btn"
          onClick={() => {
            if (!operatorMode) toggleOperatorMode()
            onNavigate?.()
          }}
          aria-pressed={operatorMode}
          title={t('operatorViewLabel')}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            open ? 'justify-start' : 'justify-center'
          } ${
            operatorMode
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <UserCog className="h-4 w-4 shrink-0" />
          {open && <span className="truncate">{t('operatorViewLabel')}</span>}
        </button>
      </div>

      {/* Collapsed rail: the expand control lives here since the header row's
          toggle is hidden when the sidebar is icon-only. */}
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={t('expandSidebar')}
          title={t('expandSidebar')}
          className="mt-3 flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </nav>
  )
}
