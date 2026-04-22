// Contact / message display helpers. Pure functions — no React, no DOM.

export interface LinkedPhone {
  phone: string
  full_name?: string
  tg_name?: string
  tg_username?: string
}

export interface ContactLike {
  full_name?: string
  phone?: string
  tg_name?: string
  tg_username?: string
  linked_phones?: LinkedPhone[]
}

export interface DisplayName {
  name: string
  subtitle: string
}

export function isPlaceholderPhone(phone?: string): boolean {
  const value = (phone || '').trim().toLowerCase()
  return value.startsWith('tg_') || value.startsWith('wa_')
}

export function isPlaceholderName(name?: string): boolean {
  const value = (name || '').trim()
  return /^TG-\d+$/i.test(value) || /^WA-\d+$/i.test(value)
}

export function resolveLinkedDisplay(linked?: LinkedPhone[]): DisplayName | null {
  if (!linked?.length) return null
  // full_name wins over tg_name — same reasoning as resolveContactDisplay.
  const preferred =
    linked.find(lp => {
      const value = (lp.full_name || '').trim()
      return !!value && !isPlaceholderName(value)
    })
    || linked.find(lp => (lp.tg_name || '').trim())
    || linked.find(lp => (lp.tg_username || '').trim())
    || linked.find(lp => (lp.phone || '').trim())
    || null
  if (!preferred) return null
  const username = (preferred.tg_username || '').trim().replace(/^@+/, '')
  const tgName = (preferred.tg_name || '').trim()
  const fullNameRaw = (preferred.full_name || '').trim()
  const fullName = isPlaceholderName(fullNameRaw) ? '' : fullNameRaw
  const phone = (preferred.phone || '').trim()
  return {
    name: fullName || tgName || (username ? `@${username}` : phone),
    subtitle: username ? `@${username}` : (phone || ''),
  }
}

export function resolveContactDisplay(contact?: ContactLike): DisplayName {
  const fullNameRaw = (contact?.full_name || '').trim()
  const phone = (contact?.phone || '').trim()
  const tgNameRaw = (contact?.tg_name || '').trim()
  const username = (contact?.tg_username || '').trim().replace(/^@+/, '')
  const linked = resolveLinkedDisplay(contact?.linked_phones)
  const fullName = isPlaceholderName(fullNameRaw) ? '' : fullNameRaw
  const tgName = isPlaceholderName(tgNameRaw) ? '' : tgNameRaw
  const placeholder = isPlaceholderPhone(phone) || isPlaceholderName(fullNameRaw) || isPlaceholderName(tgNameRaw)

  if (placeholder && linked) {
    return {
      name: linked.name,
      subtitle: linked.subtitle && linked.subtitle !== linked.name ? linked.subtitle : '',
    }
  }

  // full_name wins over tg_name: Binotel/KeyCRM is our source of truth, while
  // tg_name can carry stale contact labels imported from someone else's TG
  // addressbook (e.g. old contact under the same phone).
  const name = fullName || tgName || (username ? `@${username}` : (!isPlaceholderPhone(phone) ? phone : ''))
  let subtitle = ''
  if (username) subtitle = `@${username}`
  else if (!isPlaceholderPhone(phone) && phone && phone !== name) subtitle = phone

  return {
    name: name || tgName || fullName || phone || 'Невідомий',
    subtitle,
  }
}

export function getMediaPreviewLabel(mediaType?: string): string {
  switch ((mediaType || '').toLowerCase()) {
    case 'photo': return 'фото'
    case 'video': return 'відео'
    case 'voice': return 'голосове повідомлення'
    case 'video_note': return 'відеокружечок'
    case 'document': return 'документ'
    case 'sticker': return 'стікер'
    default: return 'медіаповідомлення'
  }
}
