import { describe, it, expect } from 'vitest'
import {
  isPlaceholderPhone,
  isPlaceholderName,
  resolveLinkedDisplay,
  resolveContactDisplay,
  getMediaPreviewLabel,
} from '../contactDisplay'

describe('isPlaceholderPhone', () => {
  it('detects tg_* and wa_* placeholders', () => {
    expect(isPlaceholderPhone('tg_123')).toBe(true)
    expect(isPlaceholderPhone('wa_456')).toBe(true)
    expect(isPlaceholderPhone('TG_789')).toBe(true)
  })

  it('leaves real phones alone', () => {
    expect(isPlaceholderPhone('+380971886225')).toBe(false)
    expect(isPlaceholderPhone('0971886225')).toBe(false)
    expect(isPlaceholderPhone('')).toBe(false)
    expect(isPlaceholderPhone(undefined)).toBe(false)
  })
})

describe('isPlaceholderName', () => {
  it('detects TG-123 / WA-456 placeholders', () => {
    expect(isPlaceholderName('TG-123')).toBe(true)
    expect(isPlaceholderName('wa-789')).toBe(true)
  })

  it('leaves real names alone', () => {
    expect(isPlaceholderName('Іван Петренко')).toBe(false)
    expect(isPlaceholderName('')).toBe(false)
  })
})

describe('resolveLinkedDisplay', () => {
  it('returns null for empty or undefined', () => {
    expect(resolveLinkedDisplay()).toBeNull()
    expect(resolveLinkedDisplay([])).toBeNull()
  })

  it('prefers tg_name over full_name', () => {
    const out = resolveLinkedDisplay([
      { phone: '0971886225', full_name: 'Real Name', tg_name: 'Тг Ім\'я' },
    ])
    expect(out?.name).toBe('Тг Ім\'я')
  })

  it('falls back to full_name when no tg_name', () => {
    const out = resolveLinkedDisplay([
      { phone: '0971886225', full_name: 'Real Name' },
    ])
    expect(out?.name).toBe('Real Name')
  })

  it('skips placeholder full_name', () => {
    const out = resolveLinkedDisplay([
      { phone: '0971886225', full_name: 'TG-12345', tg_username: 'user' },
    ])
    expect(out?.name).toBe('@user')
  })

  it('uses phone as last resort', () => {
    const out = resolveLinkedDisplay([{ phone: '0971886225' }])
    expect(out?.name).toBe('0971886225')
  })
})

describe('resolveContactDisplay', () => {
  it('returns "Невідомий" when nothing is known', () => {
    expect(resolveContactDisplay()).toEqual({ name: 'Невідомий', subtitle: '' })
    expect(resolveContactDisplay({})).toEqual({ name: 'Невідомий', subtitle: '' })
  })

  it('uses tg_name as primary name', () => {
    const out = resolveContactDisplay({
      tg_name: 'Телеграм',
      full_name: 'Паспорт',
      phone: '0971886225',
    })
    expect(out.name).toBe('Телеграм')
  })

  it('uses phone as subtitle when username is missing', () => {
    const out = resolveContactDisplay({
      full_name: 'Іван',
      phone: '0971886225',
    })
    expect(out).toEqual({ name: 'Іван', subtitle: '0971886225' })
  })

  it('uses @username as subtitle when available', () => {
    const out = resolveContactDisplay({
      full_name: 'Іван',
      phone: '0971886225',
      tg_username: 'ivan',
    })
    expect(out.subtitle).toBe('@ivan')
  })

  it('hides placeholder phones from output', () => {
    const out = resolveContactDisplay({
      full_name: 'Іван',
      phone: 'tg_12345',
    })
    expect(out.subtitle).toBe('')
  })

  it('falls back to linked phone when main phone is placeholder', () => {
    const out = resolveContactDisplay({
      phone: 'tg_12345',
      full_name: 'TG-12345',
      linked_phones: [{ phone: '0971886225', full_name: 'Справжній Іван' }],
    })
    expect(out.name).toBe('Справжній Іван')
  })

  it('prefixes bare username with @ in the name when nothing else available', () => {
    const out = resolveContactDisplay({ tg_username: 'ivan' })
    expect(out.name).toBe('@ivan')
  })

  it('strips @ prefix from input username', () => {
    const out = resolveContactDisplay({ tg_username: '@@ivan' })
    expect(out.subtitle).toBe('@ivan')
  })
})

describe('getMediaPreviewLabel', () => {
  it('maps known media types', () => {
    expect(getMediaPreviewLabel('photo')).toBe('фото')
    expect(getMediaPreviewLabel('video')).toBe('відео')
    expect(getMediaPreviewLabel('voice')).toBe('голосове повідомлення')
    expect(getMediaPreviewLabel('video_note')).toBe('відеокружечок')
    expect(getMediaPreviewLabel('document')).toBe('документ')
    expect(getMediaPreviewLabel('sticker')).toBe('стікер')
  })

  it('falls back for unknown / missing', () => {
    expect(getMediaPreviewLabel('gif')).toBe('медіаповідомлення')
    expect(getMediaPreviewLabel('')).toBe('медіаповідомлення')
    expect(getMediaPreviewLabel(undefined)).toBe('медіаповідомлення')
  })

  it('is case-insensitive', () => {
    expect(getMediaPreviewLabel('PHOTO')).toBe('фото')
  })
})
