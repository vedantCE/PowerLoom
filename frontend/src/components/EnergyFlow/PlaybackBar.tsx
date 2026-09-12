import React, { useEffect, useRef } from 'react'
import { Play, Pause } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { PlaybackSpeed } from '../../store/useAppStore'

interface PlaybackBarProps {
  hourIndex: number
  hourCount: number
  onScrub: (hourIndex: number) => void
  playLabel: string
  pauseLabel: string
  speedLabel: string
}

const BASE_MS_PER_HOUR = 800
const SPEEDS: PlaybackSpeed[] = [1, 2, 4]

// Playback state (playing/speed) lives in the store, not local state, so the
// global Space-bar shortcut (useKeyboardShortcuts) can drive it even though
// this bar renders the buttons.
export const PlaybackBar: React.FC<PlaybackBarProps> = ({
  hourIndex,
  hourCount,
  onScrub,
  playLabel,
  pauseLabel,
  speedLabel,
}) => {
  const playing = useAppStore((s) => s.playbackPlaying)
  const speed = useAppStore((s) => s.playbackSpeed)
  const togglePlayback = useAppStore((s) => s.togglePlayback)
  const stopPlayback = useAppStore((s) => s.stopPlayback)
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed)

  // Keep the latest onScrub/hourIndex reachable from the interval callback
  // without needing them in the effect's dependency array (they'd otherwise
  // tear down and recreate the interval on every single tick).
  const onScrubRef = useRef(onScrub)
  const hourIndexRef = useRef(hourIndex)
  useEffect(() => {
    onScrubRef.current = onScrub
    hourIndexRef.current = hourIndex
  }, [onScrub, hourIndex])

  useEffect(() => {
    if (!playing) return

    const timer = setInterval(() => {
      const next = hourIndexRef.current + 1
      if (next >= hourCount) {
        stopPlayback()
        return
      }
      onScrubRef.current(next)
    }, BASE_MS_PER_HOUR / speed)

    return () => clearInterval(timer)
  }, [playing, speed, hourCount, stopPlayback])

  function handleTogglePlay() {
    if (!playing && hourIndex >= hourCount - 1) {
      onScrub(0)
    }
    togglePlayback()
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <button
        type="button"
        onClick={handleTogglePlay}
        aria-label={playing ? pauseLabel : playLabel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition-transform hover:bg-indigo-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
      </button>

      <input
        type="range"
        min={0}
        max={hourCount - 1}
        step={1}
        value={hourIndex}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Hour scrubber"
        className="h-2 min-w-[120px] flex-1 cursor-pointer touch-manipulation rounded-full accent-indigo-600 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
      />

      <span className="w-14 shrink-0 text-right font-mono text-xs font-semibold text-slate-600">
        H{hourIndex}
      </span>

      <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
        <span className="text-[11px] font-semibold text-slate-500">{speedLabel}</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPlaybackSpeed(s)}
            aria-pressed={speed === s}
            className={`rounded-md px-2 py-1 text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              speed === s
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
