import { TelegramIcon, WhatsAppIcon, ViberIcon, FacebookIcon, InstagramIcon, TelegramBotIcon } from './icons'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  /** Currently active account id (either TG/WA selectedAccount or selectedBusiness) */
  activeAccountId: string
}

/**
 * Small badge below the bubble — shows origin of the message:
 *   - Received: messenger icon + account label (which of our accounts got it).
 *   - Sent: operator name (+ messenger icon + account label when the message
 *     belongs to a DIFFERENT account than the one currently open).
 *
 * Hidden when the message is on the currently active account AND there's no
 * operator info (typical same-chat scenario — who/where is obvious).
 */
export function BubbleOrigin({ message: m, activeAccountId }: Props) {
  const msgSource = m.source || 'telegram'
  // account_id arrives via extra server fields on history items (not typed on
  // ChatMessage to avoid duplicate declarations). Cast to grab it safely.
  const msgAccountId = (m as unknown as { account_id?: string }).account_id || ''
  const isSameAccount = !!activeAccountId && !!msgAccountId && activeAccountId === msgAccountId

  const accountLabel = m.account_label || m.account_phone || ''
  const senderName = (m.sent_by_name || '').trim()
  const isBot = m.direction === 'sent' && !senderName && msgSource === 'telegram_bot'

  // Compose parts. For sent messages with a real operator — always show the
  // operator's name, even on the active account. For received — only show
  // account info when we're NOT on the same account (otherwise it's the
  // same chat, no need to clutter).
  const showAccount = !isSameAccount && !!accountLabel
  const parts: Array<'operator' | 'account'> = []
  if (m.direction === 'sent') {
    if (isBot) {
      parts.push('operator')
    } else if (senderName) {
      parts.push('operator')
    }
    if (showAccount) parts.push('account')
  } else {
    if (showAccount) parts.push('account')
  }
  if (parts.length === 0) return null

  const Icon = () => {
    switch (msgSource) {
      case 'whatsapp':
      case 'whatsapp_cloud':
        return <WhatsAppIcon size={10} color="#25D366" />
      case 'viber':
      case 'viber_turbosms':
        return <ViberIcon size={10} />
      case 'telegram_bot':
        return <TelegramBotIcon size={10} />
      case 'facebook_messenger':
        return <FacebookIcon size={10} />
      case 'instagram_direct':
        return <InstagramIcon size={10} />
      case 'binotel':
        return null
      default:
        return <TelegramIcon size={10} color="#2AABEE" />
    }
  }

  return (
    <div className="msg-bubble-origin">
      {parts.includes('operator') && (
        <span className="origin-chip origin-operator">
          {isBot ? <>🤖 <span>Bot</span></> : <span>{senderName}</span>}
        </span>
      )}
      {parts.includes('account') && (
        <span className="origin-chip origin-account" title={m.account_phone || ''}>
          <Icon />
          <span>{accountLabel}</span>
        </span>
      )}
    </div>
  )
}
