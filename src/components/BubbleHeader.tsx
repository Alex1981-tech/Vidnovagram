import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

/**
 * Top-of-bubble meta lines:
 *  - group-sender label (non-private chat, received direction)
 *  - forwarded-from banner with "↗" icon
 */
export function BubbleHeader({ message: m }: Props) {
  const showGroupSender = m.chat_type && m.chat_type !== 'private' && m.direction === 'received' && m.sender_name
  const showForward = !!m.fwd_from_name

  if (!showGroupSender && !showForward) return null

  return (
    <>
      {showGroupSender && <div className="msg-group-sender">{m.sender_name}</div>}
      {showForward && (
        <div className="msg-forward-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
          <span>Переслано від <strong>{m.fwd_from_name}</strong></span>
        </div>
      )}
    </>
  )
}
