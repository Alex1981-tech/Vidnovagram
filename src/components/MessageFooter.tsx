import { TelegramIcon, WhatsAppIcon, ViberIcon, FacebookIcon, InstagramIcon, TelegramBotIcon } from './icons'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

/**
 * Footer line of a message bubble: source icon + "edited" badge + time + delivery status.
 * Status semantics differ per channel:
 *   - Telegram: sent → delivered (is_read === false) → read (is_read === true)
 *   - WhatsApp: sent → read (is_read === true; Astra ack≥3)
 *   - Business (Viber/FB/IG/TG-bot/WA Cloud): pending → delivered → read,
 *     or failed / expired, driven by provider DLR via `m.status`
 */
const BUSINESS_SOURCES = new Set(['viber', 'viber_turbosms', 'telegram_bot', 'facebook_messenger', 'instagram_direct', 'whatsapp_cloud'])

export function MessageFooter({ message: m }: Props) {
  const isBusiness = BUSINESS_SOURCES.has(m.source || '')

  const deliveryLabel = (() => {
    if (m.local_status === 'sending') return 'Надсилання'
    if (m.local_status === 'failed') return 'Не відправлено'
    if (isBusiness) {
      switch (m.status) {
        case 'read': return 'Прочитано'
        case 'delivered': return 'Доставлено'
        case 'failed': return m.error_code ? `Помилка (${m.error_code})` : 'Помилка'
        case 'expired': return 'Прострочено'
        default: return 'Надіслано'
      }
    }
    if (m.source === 'whatsapp') return m.is_read ? 'Прочитано' : 'Надіслано'
    if (m.is_read) return 'Прочитано'
    if (m.is_read === false) return 'Доставлено'
    return 'Надіслано'
  })()

  const deliveryClass = (() => {
    if (isBusiness) {
      if (m.status === 'read') return 'read'
      if (m.status === 'delivered') return 'delivered'
      if (m.status === 'failed' || m.status === 'expired') return 'failed'
      return 'sent'
    }
    if (m.source === 'whatsapp') return m.is_read ? 'read' : 'sent'
    if (m.is_read) return 'read'
    if (m.is_read === false) return 'delivered'
    return 'sent'
  })()

  const sourceIcon = (() => {
    switch (m.source) {
      case 'whatsapp': return <WhatsAppIcon size={10} color="#25D366" />
      case 'viber':
      case 'viber_turbosms': return <ViberIcon size={10} />
      case 'telegram_bot': return <TelegramBotIcon size={10} />
      case 'facebook_messenger': return <FacebookIcon size={10} />
      case 'instagram_direct': return <InstagramIcon size={10} />
      default: return <TelegramIcon size={10} color="#2AABEE" />
    }
  })()

  // Scheduled TG messages — `is_scheduled` is set by backend when
  // message_date > now (operator queued the message in TG to be
  // delivered at a future time). Render the planned delivery time
  // with a 📅 prefix and override the delivery label so the bubble
  // doesn't claim it was already «Надіслано».
  const isScheduled = !!(m.is_scheduled)
  const scheduledLabel = isScheduled
    ? new Date(m.message_date).toLocaleString('uk-UA', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <div className="msg-footer">
      <span className="msg-source">{sourceIcon}</span>
      {m.is_edited && (
        <span className="msg-edited" title={m.original_text ? `Оригінал: ${m.original_text}` : 'Редаговано'}>
          ред.
        </span>
      )}
      <span className="msg-time" title={isScheduled ? `Заплановано на ${scheduledLabel}` : ''}>
        {isScheduled ? `📅 ${scheduledLabel}` : new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
      </span>
      {m.direction === 'sent' && (
        <span className={`msg-status-text ${isScheduled ? 'scheduled' : deliveryClass}`}>
          {isScheduled ? 'Заплановано' : deliveryLabel}
        </span>
      )}
    </div>
  )
}
