import { describe, expect, it } from 'vitest'
import { parseSSEFrames } from './sse'

describe('parseSSEFrames', () => {
  it('parses a single complete frame', () => {
    const { frames, remainder } = parseSSEFrames('event: intent\ndata: {"a":1}\n\n')
    expect(frames).toEqual([{ event: 'intent', data: '{"a":1}' }])
    expect(remainder).toBe('')
  })

  it('parses multiple frames in one buffer', () => {
    const buffer = 'event: intent\ndata: {"a":1}\n\nevent: token\ndata: {"text":"hi"}\n\n'
    const { frames, remainder } = parseSSEFrames(buffer)
    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual({ event: 'intent', data: '{"a":1}' })
    expect(frames[1]).toEqual({ event: 'token', data: '{"text":"hi"}' })
    expect(remainder).toBe('')
  })

  it('holds back a partial frame split across chunk boundaries', () => {
    const first = parseSSEFrames('event: token\ndata: {"te')
    expect(first.frames).toHaveLength(0)
    expect(first.remainder).toBe('event: token\ndata: {"te')

    const second = parseSSEFrames(first.remainder + 'xt":"hi"}\n\n')
    expect(second.frames).toEqual([{ event: 'token', data: '{"text":"hi"}' }])
    expect(second.remainder).toBe('')
  })

  it('ignores heartbeat comment lines', () => {
    const buffer = ': heartbeat\n\nevent: done\ndata: {"answer":"ok"}\n\n'
    const { frames } = parseSSEFrames(buffer)
    expect(frames).toEqual([{ event: 'done', data: '{"answer":"ok"}' }])
  })

  it('defaults to event "message" when no event line is present', () => {
    const { frames } = parseSSEFrames('data: {"x":1}\n\n')
    expect(frames).toEqual([{ event: 'message', data: '{"x":1}' }])
  })

  it('joins multi-line data fields', () => {
    const { frames } = parseSSEFrames('event: token\ndata: line1\ndata: line2\n\n')
    expect(frames).toEqual([{ event: 'token', data: 'line1\nline2' }])
  })
})
