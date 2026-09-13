// Mirrors backend/app/schemas/voice.py 1:1 (see CLAUDE.md API Contract).

import type { Language } from './api'

export interface VoiceQueryRequest {
  run_id: string
  query: string
  language: Language
  current_hour_index?: number | null
}

export interface VoiceQueryResponse {
  run_id: string
  language: Language
  intent: string
  answer: string
  facts_used: Record<string, unknown>
  hour_index: number | null
  confidence: 'high' | 'low'
}

// The SSE payloads sent by POST /api/voice/stream — not Pydantic models
// (there is no response body to mirror), but kept here so the frontend has
// one typed source for every event shape on that stream.
export interface VoiceIntentEvent {
  intent: string
  confidence: 'high' | 'low'
  hour_index: number | null
}

export interface VoiceTokenEvent {
  text: string
}

export interface VoiceDoneEvent {
  answer: string
  facts_used: Record<string, unknown>
  validated: boolean
}

export interface VoiceErrorEvent {
  message: string
}

// POST /api/voice/speak — Sarvam AI Bulbul TTS. The response is a raw audio
// body (not JSON), so there is no matching response interface to mirror.
export interface SpeakRequest {
  text: string
  language: Language
}
