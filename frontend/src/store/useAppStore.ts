import { create } from 'zustand'
import type { Language, OptimizeRequest, OptimizeResponse } from '../types/api'
import { optimize } from '../api/client'
import mockOptimizeResponse from '../mocks/optimize-response.json'

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

interface AppState {
  result: OptimizeResponse | null
  status: FetchStatus
  error: string | null
  selectedHour: number | null
  compareBaseline: boolean
  showCurtailed: boolean
  language: Language
  villageId: string

  // Actions
  setSelectedHour: (hour: number | null) => void
  setCompareBaseline: (val: boolean) => void
  toggleCompareBaseline: () => void
  setShowCurtailed: (val: boolean) => void
  toggleShowCurtailed: () => void
  setLanguage: (lang: Language) => void
  setVillageId: (id: string) => void
  setResult: (res: OptimizeResponse | null) => void
  setStatus: (status: FetchStatus) => void
  fetchOptimization: (req?: Partial<OptimizeRequest>) => Promise<void>
  loadMockData: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  result: mockOptimizeResponse as unknown as OptimizeResponse,
  status: 'success',
  error: null,
  selectedHour: 0,
  compareBaseline: false,
  showCurtailed: false,
  language: 'en',
  villageId: 'kutch_village',

  setSelectedHour: (selectedHour) => set({ selectedHour }),
  setCompareBaseline: (compareBaseline) => set({ compareBaseline }),
  toggleCompareBaseline: () => set((state) => ({ compareBaseline: !state.compareBaseline })),
  setShowCurtailed: (showCurtailed) => set({ showCurtailed }),
  toggleShowCurtailed: () => set((state) => ({ showCurtailed: !state.showCurtailed })),
  setLanguage: (language) => set({ language }),
  setVillageId: (villageId) => set({ villageId }),
  setResult: (result) => set({ result }),
  setStatus: (status) => set({ status }),

  loadMockData: () => {
    set({
      result: mockOptimizeResponse as unknown as OptimizeResponse,
      status: 'success',
      error: null,
    })
  },

  fetchOptimization: async (reqOverrides = {}) => {
    const { villageId } = get()
    set({ status: 'loading', error: null })
    try {
      const data = await optimize({
        village_id: villageId,
        horizon_hours: 48,
        ...reqOverrides,
      })
      set({ result: data, status: 'success' })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to fetch optimization plan',
      })
    }
  },
}))
