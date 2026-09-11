import axios from 'axios'
import type {
  HealthResponse,
  OptimizeRequest,
  OptimizeResponse,
  PresetSummary,
  ScenarioRunSummary,
  VillageConfig,
} from '../types/api'
import mockOptimizeResponse from '../mocks/optimize-response.json'

export const apiClient = axios.create({
  baseURL: '/api',
})

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>('/health')
  return response.data
}

export async function getPresets(): Promise<PresetSummary[]> {
  const response = await apiClient.get<PresetSummary[]>('/presets')
  return response.data
}

export async function getPreset(id: string): Promise<VillageConfig> {
  const response = await apiClient.get<VillageConfig>(`/presets/${id}`)
  return response.data
}

export async function optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
  if (USE_MOCK) {
    return {
      ...(mockOptimizeResponse as OptimizeResponse),
      village_id: req.village_id,
    }
  }
  const response = await apiClient.post<OptimizeResponse>('/optimize', req)
  return response.data
}

export async function getRuns(villageId?: string): Promise<ScenarioRunSummary[]> {
  const response = await apiClient.get<ScenarioRunSummary[]>('/runs', {
    params: villageId ? { village_id: villageId } : undefined,
  })
  return response.data
}
