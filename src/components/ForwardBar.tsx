import { XIcon, ForwardIcon } from './icons'
import type { ChatMessage } from '../types'

interface Props {
  active: boolean
  selectedIds: Set<string | number>
  messages: ChatMessage[]
  onCancel: () => void
  onCopy: () => void
  onBulkDelete: () => void
  onOpenForwardModal: () => void
}

/**
 * Strip above message input shown when forward-mode is active.
 * Shows count + copy + (optional) delete-many + forward buttons.
 */
export function ForwardBar({ active, selectedIds, messages, onCancel, onCopy, onBulkDelete, onOpenForwardModal }: Props) {
  if (!active) return null

  const canDelete = messages.some(m =>
    selectedIds.has(m.id)
    && m.direction === 'sent'
    && ((!!m.tg_message_id && !!m.tg_peer_id) || m.source === 'whatsapp')
  )

  return (
    <div className="forward-bar">
      <button className="forward-bar-cancel" onClick={onCancel}><XIcon /> Скасувати</button>
      <span className="forward-bar-count">Обрано: {selectedIds.size}</span>
      <button className="forward-bar-btn" onClick={onCopy} disabled={selectedIds.size === 0} title="Копіювати">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      {canDelete && (
        <button
          className="forward-bar-btn forward-bar-btn-danger"
          onClick={onBulkDelete}
          disabled={selectedIds.size === 0}
          title="Видалити"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      )}
      <button className="forward-bar-send" onClick={onOpenForwardModal} disabled={selectedIds.size === 0}>
        <ForwardIcon /> Переслати
      </button>
    </div>
  )
}
