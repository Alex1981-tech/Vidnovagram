import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

/** "Не вдалося відправити" label under a message with `local_status === 'failed'`. */
export function FailedStatusLabel({ message: m }: Props) {
  if (m.local_status !== 'failed') return null
  return (
    <div className="msg-deleted-label">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <span>Не вдалося відправити{m.local_error ? ` · ${m.local_error}` : ''}</span>
    </div>
  )
}
