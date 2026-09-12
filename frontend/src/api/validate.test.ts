import { describe, it, expect } from 'vitest'
import mockResponse from '../mocks/optimize-response.json'
import { validateOptimizeResponse } from './validate'
import type { OptimizeResponse } from '../types/api'

const mockData = mockResponse as unknown as OptimizeResponse

describe('validateOptimizeResponse', () => {
  it('reports no issues for the clean mock fixture', () => {
    expect(validateOptimizeResponse(mockData)).toEqual([])
  })

  it('flags a length mismatch against horizon_hours', () => {
    const broken: OptimizeResponse = { ...mockData, horizon_hours: 24 }
    const issues = validateOptimizeResponse(broken)
    expect(issues.some((i) => i.includes('hourly.length'))).toBe(true)
  })

  it('flags an hour that breaks the power balance', () => {
    const hourly = [...mockData.hourly]
    hourly[0] = { ...hourly[0], diesel_kw: hourly[0].diesel_kw + 5 }
    const broken: OptimizeResponse = { ...mockData, hourly }
    const issues = validateOptimizeResponse(broken)
    expect(issues.some((i) => i.startsWith('hour 0:') && i.includes('power balance'))).toBe(true)
  })

  it('flags an out-of-range SOC', () => {
    const hourly = [...mockData.hourly]
    hourly[3] = { ...hourly[3], soc: 1.2 }
    const broken: OptimizeResponse = { ...mockData, hourly }
    const issues = validateOptimizeResponse(broken)
    expect(issues.some((i) => i.startsWith('hour 3:') && i.includes('soc'))).toBe(true)
  })
})
