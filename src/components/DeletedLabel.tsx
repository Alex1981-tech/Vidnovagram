import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

/** "Deleted" banner below a deleted message bubble (visible if `is_deleted`). */
export function DeletedLabel({ message: m }: Props) {
  if (!m.is_deleted) return null

  const byLabel = m.direction === 'sent'
    ? `Видалено у співрозмовника${m.deleted_by_peer_name ? ` · ${m.deleted_by_peer_name}` : ''}`
    : `Видалено співрозмовником${m.deleted_by_peer_name ? ` (${m.deleted_by_peer_name})` : ''}`

  const deletedAt = m.deleted_at
    ? ` · ${new Date(m.deleted_at).toLocaleDateString('uk-UA')} ${new Date(m.deleted_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
    : ''

  return (
    <div className="msg-deleted-label">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <span>{byLabel}{deletedAt}</span>
    </div>
  )
}
