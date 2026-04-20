import type { Dispatch, SetStateAction } from 'react'
import { ForwardIcon } from './icons'
import type { ChatMessage } from '../types'

interface CtxMenuState {
  x: number
  y: number
  mediaPath?: string
  mediaType?: string
  messageId: string | number
}

interface DeleteConfirmState {
  msgId: string | number
  source: 'telegram' | 'whatsapp'
  tgMsgId?: number
  peerId?: number
}

interface Props {
  ctxMenu: CtxMenuState
  setCtxMenu: Dispatch<SetStateAction<CtxMenuState | null>>
  messages: ChatMessage[]
  selectedAccount: string
  onOpenMedia: () => void
  onSaveMedia: () => void
  onSendReaction: (messageId: string | number, emoji: string) => void
  onReply: () => void
  onCopy: () => void
  onForward: () => void
  onSelect: () => void
  onLabAssign: () => void
  onEdit: () => void
  onPin: () => void
  onRetry: (messageId: string | number) => void
  setDeleteConfirm: Dispatch<SetStateAction<DeleteConfirmState | null>>
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👎'] as const

/** Right-click / long-press menu on a message bubble. Positions itself with viewport clamping. */
export function MessageContextMenu({
  ctxMenu,
  setCtxMenu,
  messages,
  selectedAccount,
  onOpenMedia,
  onSaveMedia,
  onSendReaction,
  onReply,
  onCopy,
  onForward,
  onSelect,
  onLabAssign,
  onEdit,
  onPin,
  onRetry,
  setDeleteConfirm,
}: Props) {
  const msg = messages.find(m => m.id === ctxMenu.messageId)
  const canEdit = msg?.direction === 'sent' && msg?.source !== 'whatsapp'
  const canPin = !!selectedAccount && msg?.source !== 'whatsapp'
  const canDelete = msg?.direction === 'sent'
  const failed = msg?.local_status === 'failed'

  return (
    <div
      className="ctx-menu-overlay"
      onClick={() => setCtxMenu(null)}
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}
    >
      <div
        className="ctx-menu"
        ref={el => {
          if (el) {
            const rect = el.getBoundingClientRect()
            const maxY = window.innerHeight - rect.height - 8
            const maxX = window.innerWidth - rect.width - 8
            if (rect.top > maxY || rect.left > maxX) {
              el.style.top = `${Math.max(8, Math.min(ctxMenu.y, maxY))}px`
              el.style.left = `${Math.max(8, Math.min(ctxMenu.x, maxX))}px`
            }
          }
        }}
        style={{ top: ctxMenu.y, left: ctxMenu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {ctxMenu.mediaPath && (
          <>
            <button className="ctx-menu-item" onClick={onOpenMedia}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
              Відкрити
            </button>
            <button className="ctx-menu-item" onClick={onSaveMedia}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Зберегти на комп'ютер
            </button>
          </>
        )}
        <div className="ctx-menu-reactions">
          {QUICK_REACTIONS.map(emoji => (
            <button key={emoji} className="ctx-reaction-btn" onClick={() => onSendReaction(ctxMenu.messageId, emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        <button className="ctx-menu-item" onClick={onReply}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          Відповісти
        </button>
        <button className="ctx-menu-item" onClick={onCopy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Копіювати
        </button>
        {failed && (
          <button className="ctx-menu-item" onClick={() => { onRetry(ctxMenu.messageId); setCtxMenu(null) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/></svg>
            Повторити
          </button>
        )}
        {canEdit && (
          <button className="ctx-menu-item" onClick={onEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Редагувати
          </button>
        )}
        <button className="ctx-menu-item" onClick={onForward}>
          <ForwardIcon />
          Переслати
        </button>
        <button className="ctx-menu-item" onClick={onSelect}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Виділити
        </button>
        <button className="ctx-menu-item" onClick={onLabAssign}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
          Додати аналіз
        </button>
        {canPin && (
          <button className="ctx-menu-item" onClick={onPin}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
            {msg?.is_pinned ? 'Відкріпити' : 'Закріпити'}
          </button>
        )}
        {canDelete && (
          <button
            className="ctx-menu-item ctx-menu-item-danger"
            onClick={() => {
              if (msg) {
                setDeleteConfirm({
                  msgId: msg.id,
                  source: (msg.source || 'telegram') as 'telegram' | 'whatsapp',
                  tgMsgId: msg.tg_message_id,
                  peerId: msg.tg_peer_id,
                })
              }
              setCtxMenu(null)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Видалити
          </button>
        )}
      </div>
    </div>
  )
}
