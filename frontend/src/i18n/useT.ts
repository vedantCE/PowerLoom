import { useAppStore } from '../store/useAppStore'
import { REASON_CODE_LABELS, UI_TRANSLATIONS } from './index'
import type { Language, ReasonCode } from '../types/api'

export function useT() {
  const language = useAppStore((s) => s.language)

  const t = (key: string, fallback?: string): string => {
    const langDict = UI_TRANSLATIONS[language] || UI_TRANSLATIONS.en
    return langDict[key] || UI_TRANSLATIONS.en[key] || fallback || key
  }

  const reasonLabel = (code: ReasonCode, langOverride?: Language): string => {
    const lang = langOverride || language
    const langDict = REASON_CODE_LABELS[lang] || REASON_CODE_LABELS.en
    return langDict[code] || REASON_CODE_LABELS.en[code] || code
  }

  return { t, reasonLabel, language }
}
