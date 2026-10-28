import { describe, expect, it } from 'vitest'
import { localClock } from './time'

describe('localClock', () => {
  it('formats an event timestamp in the viewer local time', () => {
    const value = '2026-10-28T00:07:22.000Z'
    const expected = new Date(value).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    expect(localClock(value)).toBe(expected)
  })

  it('preserves an invalid or missing timestamp', () => {
    expect(localClock('')).toBe('')
    expect(localClock('unknown')).toBe('unknown')
  })
})
