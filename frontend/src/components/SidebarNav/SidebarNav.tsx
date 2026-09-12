import React from 'react'
import { LayoutDashboard, UserCog, X } from 'lucide-react'
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
  onNavigate?: () => void
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ onToggle, onNavigate }) => {
  const { t } = useT()
  const { operatorMode, toggleOperatorMode, presets, selectedVillageId } = useAppStore()
  const selectedVillage = presets.find((p) => p.id === selectedVillageId)

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onNavigate?.()
  }

  return (
    <nav className="flex flex-col rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
      {/* Header: logo + name + close button */}
      <div className="flex items-center gap-3 pb-3 px-1">
        <img src="/logo_clean.png" alt="Powerloom" className="h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{t('appName')}</p>
          <p className="truncate text-xs text-slate-500">
            {selectedVillage
              ? `${selectedVillage.name}, ${selectedVillage.district}`
              : t('tagline')}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={t('collapseSidebar')}
          title={t('collapseSidebar')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-t border-slate-200" />

      <div className="space-y-1 pt-3">
        {/* Analyst View */}
        <button
          type="button"
          id="sidebar-analyst-view-btn"
          onClick={() => {
            if (operatorMode) toggleOperatorMode()
            onNavigate?.()
          }}
          aria-pressed={!operatorMode}
          title={t('analystViewLabel')}
          className={`flex w-full items-center justify-start gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            !operatorMode
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('analystViewLabel')}</span>
        </button>

        {/* Section links under Analyst View */}
        {!operatorMode && (
          <div className="ml-3 space-y-0.5 border-l border-slate-200 py-1 pl-3">
            {SECTION_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollToSection(link.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {t(link.labelKey)}
              </button>
            ))}
          </div>
        )}

        {/* Operator View */}
        <button
          type="button"
          id="sidebar-operator-view-btn"
          onClick={() => {
            if (!operatorMode) toggleOperatorMode()
            onNavigate?.()
          }}
          aria-pressed={operatorMode}
          title={t('operatorViewLabel')}
          className={`flex w-full items-center justify-start gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            operatorMode
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <UserCog className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('operatorViewLabel')}</span>
        </button>
      </div>
    </nav>
  )
}
