import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatContactDate, formatDateSeparator } from '../dateFormat'

// Freeze "now" so today/yesterday comparisons are deterministic.
const NOW = new Date('2026-04-19T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatContactDate', () => {
  it('returns HH:MM for a timestamp from today', () => {
    const ts = new Date('2026-04-19T08:30:00Z').toISOString()
    // Exact formatting depends on locale/tz of the CI runner — assert shape, not value.
    expect(formatContactDate(ts)).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns "Вчора" for yesterday', () => {
    const ts = new Date('2026-04-18T10:00:00Z').toISOString()
    expect(formatContactDate(ts)).toBe('Вчора')
  })

  it('returns DD.MM for older dates', () => {
    const ts = new Date('2026-03-01T10:00:00Z').toISOString()
    expect(formatContactDate(ts)).toMatch(/^\d{2}\.\d{2}$/)
  })
})

describe('formatDateSeparator', () => {
  it('returns "Сьогодні" for today', () => {
    const ts = new Date('2026-04-19T08:30:00Z').toISOString()
    expect(formatDateSeparator(ts)).toBe('Сьогодні')
  })

  it('returns "Вчора" for yesterday', () => {
    // Use noon UTC on previous day so result is safely "yesterday" in any TZ.
    const ts = new Date('2026-04-18T12:00:00Z').toISOString()
    expect(formatDateSeparator(ts)).toBe('Вчора')
  })

  it('returns a long-form ukrainian date for older', () => {
    const ts = new Date('2026-01-01T10:00:00Z').toISOString()
    const out = formatDateSeparator(ts)
    // "1 січня 2026 р." — contain year and non-latin letters
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/[а-яіїєґ]/i)
  })
})
