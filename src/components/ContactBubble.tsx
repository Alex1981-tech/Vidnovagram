import type { ChatMessage, Contact } from '../types'

interface AddToAcctState {
  phone: string
  name: string
  clientId: string
}

interface Props {
  message: ChatMessage
  contacts: Contact[]
  photoMap: Record<string, string>
  onAddToAccount: (state: AddToAcctState) => void
}

/**
 * "Contact shared" card. Resolves name/phone from dedicated API fields or parses
 * 👤/📞 lines in text. If phone matches a known contact, show their avatar; click
 * opens the "add contact to account" flow (pre-filled).
 */
export function ContactBubble({ message: m, contacts, photoMap, onAddToAccount }: Props) {
  let name = ''
  let phone = ''
  if (m.contact_first_name || m.contact_last_name || m.contact_phone) {
    name = [m.contact_first_name, m.contact_last_name].filter(Boolean).join(' ')
    phone = (m.contact_phone || '').replace(/\D/g, '')
  } else {
    const lines = (m.text || '').split('\n')
    for (const l of lines) {
      const lt = l.trim()
      if (lt.startsWith('👤')) name = lt.slice(2).trim()
      else if (lt.startsWith('📞')) phone = lt.slice(2).trim().replace(/\D/g, '')
    }
  }
  if (!name && !phone) name = m.text || 'Контакт'

  const normPhone = phone.startsWith('380') ? '0' + phone.slice(3) : phone
  const matchedContact = normPhone
    ? contacts.find(c => c.phone === normPhone || c.phone === phone)
    : null
  const avatarUrl = matchedContact ? photoMap[matchedContact.client_id] : null

  return (
    <div
      className="msg-contact-card"
      onClick={() => {
        if (normPhone) {
          onAddToAccount({ phone: normPhone, name, clientId: matchedContact?.client_id || '' })
        }
      }}
    >
      <div className="msg-contact-avatar">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : (name || phone || '?')[0].toUpperCase()}
      </div>
      <div className="msg-contact-info">
        {name && <div className="msg-contact-name">{name}</div>}
        {phone && <div className="msg-contact-phone">{phone.startsWith('380') ? '+' + phone : phone}</div>}
      </div>
    </div>
  )
}
