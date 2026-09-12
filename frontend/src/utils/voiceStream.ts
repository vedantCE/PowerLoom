// Consumes POST /api/voice/stream (Server-Sent Events) via fetch +
// ReadableStream — EventSource cannot send POST bodies, so the connection is
// driven manually here and frames are parsed with parseSSEFrames.

import { API_BASE_URL } from '../api/client'
import type {
  VoiceDoneEvent,
  VoiceErrorEvent,
  VoiceIntentEvent,
  VoiceQueryRequest,
  VoiceTokenEvent,
} from '../types/voice'
import { parseSSEFrames } from './sse'

export interface VoiceStreamHandlers {
  onIntent: (event: VoiceIntentEvent) => void
  onToken: (event: VoiceTokenEvent) => void
  onDone: (event: VoiceDoneEvent) => void
  onError?: (event: VoiceErrorEvent) => void
}

// Resolves true only if a "done" event was received with no "error" event —
// callers fall back to the non-streaming endpoint on anything else.
export async function streamVoiceQuery(
  payload: VoiceQueryRequest,
  signal: AbortSignal,
  handlers: VoiceStreamHandlers,
): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/voice/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Voice stream request failed with status ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let doneReceived = false
  let sawError = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const { frames, remainder } = parseSSEFrames(buffer)
    buffer = remainder

    for (const frame of frames) {
      let parsed: unknown
      try {
        parsed = JSON.parse(frame.data)
      } catch {
        continue
      }

      switch (frame.event) {
        case 'intent':
          handlers.onIntent(parsed as VoiceIntentEvent)
          break
        case 'token':
          handlers.onToken(parsed as VoiceTokenEvent)
          break
        case 'done':
          handlers.onDone(parsed as VoiceDoneEvent)
          doneReceived = true
          break
        case 'error':
          sawError = true
          handlers.onError?.(parsed as VoiceErrorEvent)
          break
        default:
          break
      }
    }
  }

  return doneReceived && !sawError
}
