import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ToastType } from '../../store/useAppStore'

const ICONS: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const STYLES: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
}

export const ToastContainer: React.FC = () => {
  const toasts = useAppStore((s) => s.toasts)
  const dismissToast = useAppStore((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-xs flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type]
          return (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold shadow-lg ${STYLES[toast.type]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
                className="text-current opacity-60 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
