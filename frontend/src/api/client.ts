import axios, { AxiosError } from 'axios'
import type {
  ChatRequest,
  ChatResponse,
  ExplainRequest,
  ExplainResponse,
  HealthResponse,
  OptimizeRequest,
  OptimizeResponse,
  PresetSummary,
  ScenarioRunSummary,
  VillageConfig,
} from '../types/api'
import type { SpeakRequest, VoiceQueryRequest, VoiceQueryResponse } from '../types/voice'
import * as mockApi from '../mocks/mockApi'

// In production (Vercel), point this at the Render backend via VITE_API_BASE_URL.
// Locally it stays '/api', which the Vite dev server proxies to localhost:8000.
// Exported so the streaming voice endpoint (raw fetch + ReadableStream, which
// can't go through the axios instance below) resolves against the same base.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// The explain endpoint targets a sub-3s response (Gemini call); fail fast and
// let ExplainBox fall back to the local template generator rather than
// leaving the shimmer up for the full 15s default request timeout.
const EXPLAIN_TIMEOUT_MS = 6000
const CHAT_TIMEOUT_MS = 25000

// The default (non-what-if) MILP solve alone is allowed up to 20s
// (gapRel=0.01, see solve_dispatch), plus forecast fetch and DB writes on
// top of that — longer than the client's 15s default timeout. Give /optimize
// enough headroom that a legitimately slow solve doesn't get killed client-side
// before the backend's own 20s solver budget does.
const OPTIMIZE_TIMEOUT_MS = 30000

// The non-streamed voice query is the fallback path when SSE fails or is
// unavailable — it still does a Gemini call, so give it explainer-like
// headroom rather than the tight EXPLAIN_TIMEOUT_MS.
const VOICE_TIMEOUT_MS = 10000

// Sarvam TTS is a cosmetic enhancement (see CLAUDE.md "Voice and streaming")
// — fail fast so a slow/unreachable TTS call doesn't delay the browser
// speechSynthesis fallback.
const SPEAK_TIMEOUT_MS = 12000

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
    const response = await apiClient.post<OptimizeResponse>('/optimize', req, {
      timeout: OPTIMIZE_TIMEOUT_MS,
    })
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
    const response = await apiClient.post<ExplainResponse>('/explain', req, {
      timeout: EXPLAIN_TIMEOUT_MS,
    })
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  if (USE_MOCK) {
    return mockApi.chat(req)
  }
  try {
    const response = await apiClient.post<ChatResponse>('/chat', req, {
      timeout: CHAT_TIMEOUT_MS,
    })
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

// Non-streaming voice query — the fallback used when SSE (voiceStream in
// PersonalizedScenarioPage.tsx) fails or is unavailable. No mock-mode branch:
// the voice feature requires a real run_id from the live backend.
export async function voiceQuery(req: VoiceQueryRequest): Promise<VoiceQueryResponse> {
  try {
    const response = await apiClient.post<VoiceQueryResponse>('/voice/query', req, {
      timeout: VOICE_TIMEOUT_MS,
    })
    return response.data
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

// Sarvam AI Bulbul TTS — reads a voice-query answer aloud. Returns an audio
// Blob (mp3) to play via an <audio> element. Callers MUST catch and fall
// back to window.speechSynthesis: this call fails whenever SARVAM_API_KEY
// isn't configured, so it is never the only way to hear an answer.
export async function speak(req: SpeakRequest): Promise<Blob> {
  const response = await apiClient.post<Blob>('/voice/speak', req, {
    timeout: SPEAK_TIMEOUT_MS,
    responseType: 'blob',
  })
  return response.data
}
