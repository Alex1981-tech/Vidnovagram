export interface Presence {
  status: string
  was_online: number | null
}

export interface PresenceDisplay {
  text: string
  isOnline: boolean
}

export function formatPresence(p: Presence | undefined): PresenceDisplay {
  if (!p) return { text: '', isOnline: false }
  if (p.status === 'online') return { text: 'онлайн', isOnline: true }
  if (p.status === 'recently') return { text: 'був(ла) нещодавно', isOnline: false }
  if (p.status === 'last_week') return { text: 'був(ла) цього тижня', isOnline: false }
  if (p.status === 'last_month') return { text: 'був(ла) цього місяця', isOnline: false }
  if (p.status === 'offline' && p.was_online) {
    const d = new Date(p.was_online * 1000)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return { text: `був(ла) о ${time}`, isOnline: false }
    if (isYesterday) return { text: `був(ла) вчора о ${time}`, isOnline: false }
    const date = d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
    return { text: `був(ла) ${date} о ${time}`, isOnline: false }
  }
  return { text: '', isOnline: false }
}
