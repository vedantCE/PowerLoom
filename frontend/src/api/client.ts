import axios, { AxiosError } from 'axios'
import type {
  ExplainRequest,
  ExplainResponse,
  HealthResponse,
  OptimizeRequest,
  OptimizeResponse,
  PresetSummary,
  ScenarioRunSummary,
  VillageConfig,
} from '../types/api'
import * as mockApi from '../mocks/mockApi'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export function formatApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.response?.data?.detail) {
      const detail = err.response.data.detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        return detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
      }
      return JSON.stringify(detail)
    }
    if (err.response?.status === 404) {
      return 'The requested resource was not found.'
    }
    if (err.response?.status === 500) {
      return 'Optimizer service encountered an internal error. Please try again.'
    }
    if (err.code === 'ECONNABORTED') {
      return 'Request timed out waiting for the solver. Please try again.'
    }
    if (err.code === 'ERR_NETWORK') {
      return 'Cannot reach backend server. Please verify the backend is running.'
    }
    return err.message || 'An unexpected network error occurred.'
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'An unknown error occurred while communicating with the server.'
}

export async function getHealth(): Promise<HealthResponse> {
  if (USE_MOCK) {
    return mockApi.getHealth()
  }
  try {
    const response = await apiClient.get<HealthResponse>('/health')
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function getPresets(): Promise<PresetSummary[]> {
  if (USE_MOCK) {
    return mockApi.getPresets()
  }
  try {
    const response = await apiClient.get<PresetSummary[]>('/presets')
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function getPreset(id: string): Promise<VillageConfig> {
  if (USE_MOCK) {
    return mockApi.getPreset(id)
  }
  try {
    const response = await apiClient.get<VillageConfig>(`/presets/${id}`)
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
  if (USE_MOCK) {
    return mockApi.optimize(req)
  }
  try {
    const response = await apiClient.post<OptimizeResponse>('/optimize', req)
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function getRuns(villageId?: string): Promise<ScenarioRunSummary[]> {
  if (USE_MOCK) {
    return mockApi.getRuns(villageId)
  }
  try {
    const response = await apiClient.get<ScenarioRunSummary[]>('/runs', {
      params: villageId ? { village_id: villageId } : undefined,
    })
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function explain(req: ExplainRequest): Promise<ExplainResponse> {
  if (USE_MOCK) {
    return mockApi.explain(req)
  }
  try {
    const response = await apiClient.post<ExplainResponse>('/explain', req)
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}
