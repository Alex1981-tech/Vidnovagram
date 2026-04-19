import { describe, it, expect, beforeEach } from 'vitest'
import { makeReadTsKey, getReadTs, setReadTs } from '../readTs'

beforeEach(() => {
  localStorage.clear()
})

describe('makeReadTsKey', () => {
  it('joins clientId and accountId with a "::" separator', () => {
    expect(makeReadTsKey('abc', 'acc-1')).toBe('abc::acc-1')
  })

  it('falls back to "all" when accountId is missing', () => {
    expect(makeReadTsKey('abc')).toBe('abc::all')
    expect(makeReadTsKey('abc', '')).toBe('abc::all')
    expect(makeReadTsKey('abc', '   ')).toBe('abc::all')
  })

  it('strips surrounding whitespace from accountId', () => {
    expect(makeReadTsKey('abc', '  acc-1  ')).toBe('abc::acc-1')
  })
})

describe('getReadTs / setReadTs', () => {
  it('returns empty object when nothing stored', () => {
    expect(getReadTs()).toEqual({})
  })

  it('persists and reads back a value', () => {
    setReadTs('client-1', '2026-04-19T07:00:00Z', 'acc-1')
    expect(getReadTs()).toEqual({ 'client-1::acc-1': '2026-04-19T07:00:00Z' })
  })

  it('merges multiple entries for the same client across accounts', () => {
    setReadTs('client-1', '2026-04-19T07:00:00Z', 'acc-1')
    setReadTs('client-1', '2026-04-19T08:00:00Z', 'acc-2')
    expect(getReadTs()).toEqual({
      'client-1::acc-1': '2026-04-19T07:00:00Z',
      'client-1::acc-2': '2026-04-19T08:00:00Z',
    })
  })

  it('overwrites the same key on repeat writes', () => {
    setReadTs('client-1', 'first')
    setReadTs('client-1', 'second')
    expect(getReadTs()).toEqual({ 'client-1::all': 'second' })
  })

  it('tolerates garbage in localStorage and returns {}', () => {
    localStorage.setItem('vidnovagram_read_ts', '{not-json')
    expect(getReadTs()).toEqual({})
  })
})
