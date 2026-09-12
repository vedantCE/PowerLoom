import { create } from 'zustand'
import type {
  ExplainResponse,
  HealthResponse,
  Language,
  OptimizeResponse,
  PresetSummary,
  VillageConfig,
  WhatIfOverrides,
} from '../types/api'
import * as api from '../api/client'
import { logValidationWarnings } from '../api/validate'

export type AppStatus = 'idle' | 'loading' | 'success' | 'error'
export type PlaybackSpeed = 1 | 2 | 4
export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
}

// Frontend-only convenience record for the run-history panel — NOT part of the
// backend API contract (backend/app/schemas). Restoring a run replays this
// straight into the store without calling optimize() again.
export interface RunHistoryEntry {
  id: string
  createdAt: string
  villageId: string
  horizon: 24 | 48
  overrides: WhatIfOverrides
  result: OptimizeResponse
  baselineRun: OptimizeResponse | null
}

export function explanationCacheKey(runId: string, hourIndex: number, language: Language): string {
  return `${runId}:${hourIndex}:${language}`
}

const MAX_RUN_HISTORY = 10
const MAX_COMPARE_RUNS = 2
const TOAST_DURATION_MS = 4000

export interface AppState {
  presets: PresetSummary[]
  selectedVillageId: string | null
  horizon: 24 | 48
  overrides: WhatIfOverrides
  language: Language
  result: OptimizeResponse | null
  status: AppStatus
  error: string | null
  selectedHour: number | null
  health: HealthResponse | null

  // What-if simulator state
  currentPreset: VillageConfig | null
  baselineRun: OptimizeResponse | null
  activeScenarioId: string | null

  // Explain panel
  explanationCache: Record<string, ExplainResponse>

  // Run history
  runHistory: RunHistoryEntry[]
  compareRunIds: string[]

  // Presentation / UX chrome
  presentationMode: boolean
  shortcutsOverlayOpen: boolean
  toasts: ToastMessage[]

  // Energy flow playback (lifted so global keyboard shortcuts can drive it)
  playbackPlaying: boolean
  playbackSpeed: PlaybackSpeed

  // Chart toggles (Phase 4.2) — shared between EnergyMixChart and SocChart so
  // the two stay in sync with a single control.
  compareBaseline: boolean
  showCurtailed: boolean

  // Actions
  loadPresets: () => Promise<void>
  loadHealth: () => Promise<void>
  loadPreset: (id: string) => Promise<void>
  selectVillage: (id: string) => Promise<void>
  setHorizon: (horizon: 24 | 48) => Promise<void>
  setOverride: <K extends keyof WhatIfOverrides>(key: K, value: WhatIfOverrides[K]) => void
  applyScenario: (id: string, patch: WhatIfOverrides) => void
  resetOverrides: () => void
  setLanguage: (lang: Language) => void
  runOptimize: () => Promise<void>
  runBaseline: () => Promise<void>
  selectHour: (hour: number | null) => void

  cacheExplanation: (key: string, value: ExplainResponse) => void
  restoreRun: (id: string) => void
  toggleCompareRun: (id: string) => void
  clearCompareRuns: () => void

  togglePresentationMode: () => void
  setShortcutsOverlayOpen: (open: boolean) => void
  pushToast: (type: ToastType, message: string) => void
  dismissToast: (id: string) => void

  togglePlayback: () => void
  stopPlayback: () => void
  setPlaybackSpeed: (speed: PlaybackSpeed) => void

  toggleCompareBaseline: () => void
  toggleShowCurtailed: () => void
}

let activeRequestId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const OVERRIDE_DEBOUNCE_MS = 400

function scheduleOptimize(get: () => AppState) {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void get().runOptimize()
  }, OVERRIDE_DEBOUNCE_MS)
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useAppStore = create<AppState>((set, get) => ({
  presets: [],
  selectedVillageId: null,
  horizon: 48,
  overrides: {},
  language: 'en',
  result: null,
  status: 'idle',
  error: null,
  selectedHour: 0,
  health: null,

  currentPreset: null,
  baselineRun: null,
  activeScenarioId: null,

  explanationCache: {},

  runHistory: [],
  compareRunIds: [],

  presentationMode: false,
  shortcutsOverlayOpen: false,
  toasts: [],

  playbackPlaying: false,
  playbackSpeed: 1,

  compareBaseline: false,
  showCurtailed: false,

  loadPresets: async () => {
    try {
      const presets = await api.getPresets()
      set({ presets })
      const currentSelected = get().selectedVillageId
      if (!currentSelected && presets.length > 0) {
        const defaultPreset = presets.find((p) => p.id === 'kutch_village') ?? presets[0]
        await get().selectVillage(defaultPreset.id)
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load village presets',
      })
    }
  },

  loadHealth: async () => {
    try {
      const health = await api.getHealth()
      set({ health })
    } catch {
      set({
        health: {
          status: 'error',
          app: 'powerloom',
          version: '0.1.0',
          solver_available: false,
          database: 'sqlite',
          database_ok: false,
        },
      })
    }
  },

  loadPreset: async (id: string) => {
    try {
      const preset = await api.getPreset(id)
      if (get().selectedVillageId === id) {
        set({ currentPreset: preset })
      }
    } catch {
      set({ currentPreset: null })
    }
  },

  selectVillage: async (id: string) => {
    set({ selectedVillageId: id, overrides: {}, activeScenarioId: null, playbackPlaying: false })
    await get().loadPreset(id)
    await Promise.all([get().runOptimize(), get().runBaseline()])
  },

  setHorizon: async (horizon: 24 | 48) => {
    set({ horizon, playbackPlaying: false })
    if (get().selectedVillageId) {
      await Promise.all([get().runOptimize(), get().runBaseline()])
    }
  },

  setOverride: (key, value) => {
    set((state) => {
      const next = { ...state.overrides }
      if (value === undefined || value === null) {
        delete next[key]
      } else {
        next[key] = value
      }
      return { overrides: next, activeScenarioId: null }
    })
    scheduleOptimize(get)
  },

  applyScenario: (id, patch) => {
    set((state) => ({
      overrides: { ...state.overrides, ...patch },
      activeScenarioId: id,
    }))
    scheduleOptimize(get)
  },

  resetOverrides: () => {
    set({ overrides: {}, activeScenarioId: null })
    scheduleOptimize(get)
  },

  setLanguage: (language: Language) => {
    set({ language })
  },

  runOptimize: async () => {
    const villageId = get().selectedVillageId
    if (!villageId) return

    const requestId = ++activeRequestId
    set({ status: 'loading', error: null })

    try {
      const horizon = get().horizon
      const overrides = get().overrides
      const response = await api.optimize({
        village_id: villageId,
        horizon_hours: horizon,
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      })

      // Race condition protection: discard if another request was initiated
      if (requestId !== activeRequestId) {
        return
      }

      logValidationWarnings(response)

      const currentSelectedHour = get().selectedHour
      const nextSelectedHour =
        currentSelectedHour !== null && currentSelectedHour < response.hourly.length
          ? currentSelectedHour
          : 0

      set((state) => {
        const entry: RunHistoryEntry = {
          id: response.run_id,
          createdAt: response.created_at,
          villageId,
          horizon,
          overrides,
          result: response,
          baselineRun: state.baselineRun,
        }
        const runHistory = [entry, ...state.runHistory].slice(0, MAX_RUN_HISTORY)
        return {
          result: response,
          status: 'success',
          selectedHour: nextSelectedHour,
          error: null,
          runHistory,
        }
      })
      get().pushToast('success', 'Plan updated')
    } catch (err) {
      if (requestId !== activeRequestId) {
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to compute optimization plan'
      set({ status: 'error', error: message })
      get().pushToast('error', message)
    }
  },

  runBaseline: async () => {
    const villageId = get().selectedVillageId
    if (!villageId) return

    try {
      const response = await api.optimize({
        village_id: villageId,
        horizon_hours: get().horizon,
      })
      // Ignore stale responses if the village changed while this was in flight
      if (get().selectedVillageId === villageId) {
        set({ baselineRun: response })
      }
    } catch {
      // Baseline is informational only (used for the impact summary) — never
      // block or error the main dashboard if it fails to load.
    }
  },

  selectHour: (hour: number | null) => {
    set({ selectedHour: hour })
  },

  cacheExplanation: (key, value) => {
    set((state) => ({ explanationCache: { ...state.explanationCache, [key]: value } }))
  },

  restoreRun: (id: string) => {
    const entry = get().runHistory.find((e) => e.id === id)
    if (!entry) return

    set({
      selectedVillageId: entry.villageId,
      horizon: entry.horizon,
      overrides: entry.overrides,
      result: entry.result,
      baselineRun: entry.baselineRun,
      status: 'success',
      error: null,
      activeScenarioId: null,
      selectedHour: 0,
      playbackPlaying: false,
    })
    if (get().currentPreset?.id !== entry.villageId) {
      void get().loadPreset(entry.villageId)
    }
    get().pushToast('info', 'Restored run from history')
  },

  toggleCompareRun: (id: string) => {
    set((state) => {
      if (state.compareRunIds.includes(id)) {
        return { compareRunIds: state.compareRunIds.filter((r) => r !== id) }
      }
      if (state.compareRunIds.length >= MAX_COMPARE_RUNS) {
        return { compareRunIds: [state.compareRunIds[1], id] }
      }
      return { compareRunIds: [...state.compareRunIds, id] }
    })
  },

  clearCompareRuns: () => set({ compareRunIds: [] }),

  togglePresentationMode: () => set((state) => ({ presentationMode: !state.presentationMode })),

  setShortcutsOverlayOpen: (open: boolean) => set({ shortcutsOverlayOpen: open }),

  pushToast: (type, message) => {
    const id = newId()
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, TOAST_DURATION_MS)
  },

  dismissToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },

  togglePlayback: () => set((state) => ({ playbackPlaying: !state.playbackPlaying })),
  stopPlayback: () => set({ playbackPlaying: false }),
  setPlaybackSpeed: (speed: PlaybackSpeed) => set({ playbackSpeed: speed }),

  toggleCompareBaseline: () => set((state) => ({ compareBaseline: !state.compareBaseline })),
  toggleShowCurtailed: () => set((state) => ({ showCurtailed: !state.showCurtailed })),
}))
