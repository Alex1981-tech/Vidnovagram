import { TelegramIcon, WhatsAppIcon } from './icons'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

/**
 * Footer line of a message bubble: source icon + "edited" badge + time + delivery status.
 * Status semantics differ between Telegram (sent/delivered/read) and WhatsApp (sent/read).
 */
export function MessageFooter({ message: m }: Props) {
  const deliveryLabel = (() => {
    if (m.local_status === 'sending') return 'Надсилання'
    if (m.local_status === 'failed') return 'Не відправлено'
    if (m.source === 'whatsapp') return m.is_read ? 'Прочитано' : 'Надіслано'
    if (m.is_read) return 'Прочитано'
    if (m.is_read === false) return 'Доставлено'
    return 'Надіслано'
  })()

  const deliveryClass = (() => {
    if (m.source === 'whatsapp') return m.is_read ? 'read' : 'sent'
    if (m.is_read) return 'read'
    if (m.is_read === false) return 'delivered'
    return 'sent'
  })()

  return (
    <div className="msg-footer">
      <span className="msg-source">
        {m.source === 'whatsapp'
          ? <WhatsAppIcon size={10} color="#25D366" />
          : <TelegramIcon size={10} color="#2AABEE" />}
      </span>
      {m.is_edited && (
        <span className="msg-edited" title={m.original_text ? `Оригінал: ${m.original_text}` : 'Редаговано'}>
          ред.
        </span>
      )}
      <span className="msg-time">
        {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
      </span>
      {m.direction === 'sent' && (
        <span className={`msg-status-text ${deliveryClass}`}>
          {deliveryLabel}
        </span>
      )}
    </div>
  )
}
