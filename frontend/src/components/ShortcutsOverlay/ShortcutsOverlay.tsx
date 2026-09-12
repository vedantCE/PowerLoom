import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Keyboard } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'

const SHORTCUTS: { keys: string; labelKey: 'scPlayPause' | 'scPrevNextHour' | 'scLanguage' | 'scRun' | 'scPresentation' | 'scHelp' }[] = [
  { keys: 'Space', labelKey: 'scPlayPause' },
  { keys: '← / →', labelKey: 'scPrevNextHour' },
  { keys: '1 / 2 / 3', labelKey: 'scLanguage' },
  { keys: 'R', labelKey: 'scRun' },
  { keys: 'P', labelKey: 'scPresentation' },
  { keys: '?', labelKey: 'scHelp' },
]

export const ShortcutsOverlay: React.FC = () => {
  const { t } = useT()
  const open = useAppStore((s) => s.shortcutsOverlayOpen)
  const setOpen = useAppStore((s) => s.setShortcutsOverlayOpen)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('scTitle')}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900">{t('scTitle')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('close')}
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {SHORTCUTS.map((s) => (
                <li key={s.labelKey} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{t(s.labelKey)}</span>
                  <kbd className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
