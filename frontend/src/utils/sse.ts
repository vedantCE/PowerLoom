// Minimal Server-Sent Events frame parser for the voice streaming endpoint.
// EventSource can't send POST bodies, so /api/voice/stream is consumed via
// fetch + ReadableStream and frames are parsed manually here. Frames are
// separated by a blank line ("\n\n"); a chunk boundary can land mid-frame, so
// callers accumulate `remainder` into their buffer and re-parse on the next
// chunk rather than assuming one read() maps to one frame.

export interface SSEFrame {
  event: string
  data: string
}

export function parseSSEFrames(buffer: string): { frames: SSEFrame[]; remainder: string } {
  const frames: SSEFrame[] = []
  let rest = buffer
  let sepIndex = rest.indexOf('\n\n')

  while (sepIndex !== -1) {
    const rawFrame = rest.slice(0, sepIndex)
    rest = rest.slice(sepIndex + 2)

    if (rawFrame.trim() && !rawFrame.startsWith(':')) {
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of rawFrame.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trim())
        }
      }
      const data = dataLines.join('\n')
      if (data) {
        frames.push({ event: eventName, data })
      }
    }

    sepIndex = rest.indexOf('\n\n')
  }

  return { frames, remainder: rest }
}
