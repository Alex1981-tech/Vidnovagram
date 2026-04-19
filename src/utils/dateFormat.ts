// Date formatting helpers used by contact list and chat date separators.

export function formatContactDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  if (msgDay.getTime() === today.getTime()) return time
  if (msgDay.getTime() === yesterday.getTime()) return `Вчора`
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
}

export function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (msgDay.getTime() === today.getTime()) return 'Сьогодні'
  if (msgDay.getTime() === yesterday.getTime()) return 'Вчора'
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}
