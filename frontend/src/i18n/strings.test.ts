import { describe, it, expect } from 'vitest'
import { STRINGS } from './strings'

const LANGUAGES = ['en', 'gu', 'hi'] as const

describe('translation completeness', () => {
  const enKeys = Object.keys(STRINGS.en).sort()

  it('en has at least one key (sanity check)', () => {
    expect(enKeys.length).toBeGreaterThan(0)
  })

  for (const lang of LANGUAGES) {
    if (lang === 'en') continue

    it(`${lang} has exactly the same keys as en`, () => {
      const langKeys = Object.keys(STRINGS[lang]).sort()
      const missing = enKeys.filter((k) => !langKeys.includes(k))
      const extra = langKeys.filter((k) => !enKeys.includes(k))
      expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    })
  }

  for (const lang of LANGUAGES) {
    it(`${lang} has no empty string values`, () => {
      const dict = STRINGS[lang] as Record<string, string>
      const empty = Object.entries(dict)
        .filter(([, v]) => typeof v !== 'string' || v.trim().length === 0)
        .map(([k]) => k)
      expect(empty).toEqual([])
    })
  }
})
