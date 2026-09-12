import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Progressively reveals `text` over `durationMs`, like a streaming AI response.
 * Each distinct string is only ever animated once per hook instance — redisplaying
 * text already shown (e.g. flipping back to a previously-viewed hour) renders it
 * instantly instead of re-typing it, so cached content truly feels instant.
 */
export function useTypewriter(text: string, durationMs = 500): { display: string; done: boolean } {
  const seenRef = useRef<Set<string>>(new Set())
  const frameRef = useRef<number | null>(null)
  const [display, setDisplay] = useState('')
  const prefersReducedMotion = Boolean(useReducedMotion())

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    if (!text) {
      // Nothing to animate — leave `display` as-is; the return below already
      // renders '' whenever `text` is empty, so no state update is needed here.
      return
    }

    if (prefersReducedMotion || seenRef.current.has(text)) {
      setDisplay(text)
      seenRef.current.add(text)
      return
    }

    let start: number | null = null
    setDisplay('')

    const step = (timestamp: number) => {
      if (start === null) start = timestamp
      const progress = Math.min(1, (timestamp - start) / durationMs)
      setDisplay(text.slice(0, Math.round(progress * text.length)))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        seenRef.current.add(text)
      }
    }
    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [text, durationMs, prefersReducedMotion])

  const effectiveDisplay = text ? display : ''
  return { display: effectiveDisplay, done: effectiveDisplay === text }
}
