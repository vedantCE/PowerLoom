import { create } from 'zustand'
import type {
  HealthResponse,
  Language,
  OptimizeResponse,
  PresetSummary,
  WhatIfOverrides,
} from '../types/api'
import * as api from '../api/client'

export type AppStatus = 'idle' | 'loading' | 'success' | 'error'

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

  // Actions
  loadPresets: () => Promise<void>
  loadHealth: () => Promise<void>
  selectVillage: (id: string) => Promise<void>
  setHorizon: (horizon: 24 | 48) => Promise<void>
  setOverride: <K extends keyof WhatIfOverrides>(key: K, value: WhatIfOverrides[K]) => void
  resetOverrides: () => void
  setLanguage: (lang: Language) => void
  runOptimize: () => Promise<void>
  selectHour: (hour: number | null) => void
}

let activeRequestId = 0

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

  selectVillage: async (id: string) => {
    set({ selectedVillageId: id })
    await get().runOptimize()
  },

  setHorizon: async (horizon: 24 | 48) => {
    set({ horizon })
    if (get().selectedVillageId) {
      await get().runOptimize()
    }
  },

  setOverride: (key, value) => {
    set((state) => ({
      overrides: {
        ...state.overrides,
        [key]: value,
      },
    }))
  },

  resetOverrides: () => {
    set({ overrides: {} })
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
      const response = await api.optimize({
        village_id: villageId,
        horizon_hours: get().horizon,
        overrides: Object.keys(get().overrides).length > 0 ? get().overrides : undefined,
      })

      // Race condition protection: discard if another request was initiated
      if (requestId !== activeRequestId) {
        return
      }

      const currentSelectedHour = get().selectedHour
      const nextSelectedHour =
        currentSelectedHour !== null && currentSelectedHour < response.hourly.length
          ? currentSelectedHour
          : 0

      set({
        result: response,
        status: 'success',
        selectedHour: nextSelectedHour,
        error: null,
      })
    } catch (err) {
      if (requestId !== activeRequestId) {
        return
      }
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to compute optimization plan',
      })
    }
  },

  selectHour: (hour: number | null) => {
    set({ selectedHour: hour })
  },
}))
