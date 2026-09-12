import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Global keyboard shortcuts (mounted once in App): Space play/pause, arrow
 * keys step the hour, 1/2/3 switch language, R re-runs, P toggles presentation
 * mode, ? opens the shortcuts overlay. Disabled while typing in a form field.
 */
export function useKeyboardShortcuts(): void {
  const togglePlayback = useAppStore((s) => s.togglePlayback)
  const selectHour = useAppStore((s) => s.selectHour)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const runOptimize = useAppStore((s) => s.runOptimize)
  const togglePresentationMode = useAppStore((s) => s.togglePresentationMode)
  const setShortcutsOverlayOpen = useAppStore((s) => s.setShortcutsOverlayOpen)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const { result, selectedHour, shortcutsOverlayOpen } = useAppStore.getState()
      const hourly = result?.hourly ?? []
      const currentHour = selectedHour ?? 0

      if (e.key === ' ') {
        if (hourly.length === 0) return
        e.preventDefault()
        togglePlayback()
        return
      }
      if (e.key === 'ArrowLeft') {
        if (hourly.length === 0) return
        e.preventDefault()
        selectHour(Math.max(0, currentHour - 1))
        return
      }
      if (e.key === 'ArrowRight') {
        if (hourly.length === 0) return
        e.preventDefault()
        selectHour(Math.min(hourly.length - 1, currentHour + 1))
        return
      }
      if (e.key === '?') {
        setShortcutsOverlayOpen(!shortcutsOverlayOpen)
        return
      }
      if (e.key === 'Escape' && shortcutsOverlayOpen) {
        setShortcutsOverlayOpen(false)
        return
      }

      switch (e.key.toLowerCase()) {
        case '1':
          setLanguage('en')
          break
        case '2':
          setLanguage('gu')
          break
        case '3':
          setLanguage('hi')
          break
        case 'r':
          void runOptimize()
          break
        case 'p':
          togglePresentationMode()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayback, selectHour, setLanguage, runOptimize, togglePresentationMode, setShortcutsOverlayOpen])
}
