import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

const FALLBACK_NAME = 'Хтось'

/** Centered service-line in group chats (joins/leaves, pins, title/photo changes, etc). */
export function ServiceMessage({ message: m }: Props) {
  const sd = m.service_data || {}
  const sender = m.sender_name || FALLBACK_NAME
  const names = Array.isArray(sd.user_names) ? sd.user_names.join(', ') : ''

  // Phone / group calls get a dedicated bubble-style card: icon + direction + label + time.
  // We use `m.direction` (sent/received) to infer incoming vs outgoing; backend already
  // sets direction based on from_id (self vs peer).
  if (m.service_type === 'phone_call' || m.service_type === 'group_call') {
    const isGroup = m.service_type === 'group_call'
    const isOutgoing = m.direction === 'sent'
    const label = isGroup
      ? 'Груповий дзвінок'
      : (isOutgoing ? 'Вихідний дзвінок' : 'Вхідний дзвінок')
    const iconColor = isGroup ? '#8b5cf6' : (isOutgoing ? '#3b82f6' : '#22c55e')
    const duration = typeof sd.duration === 'number' ? sd.duration as number : null
    const mm = duration != null ? String(Math.floor(duration / 60)).padStart(2, '0') : null
    const ss = duration != null ? String(duration % 60).padStart(2, '0') : null
    const reason = typeof sd.reason === 'string' ? sd.reason as string : null
    const missed = reason === 'missed' || reason === 'busy'
    const isVideo = sd.video === true

    return (
      <div className={`msg ${m.direction} src-telegram`}>
        <div className="msg-bubble tg-call-bubble">
          <div className="tg-call-row">
            <div className="tg-call-icon" style={{ color: iconColor }}>
              {isVideo ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              )}
            </div>
            <div className="tg-call-info">
              <span className="tg-call-label">
                {isVideo ? 'Відео' : label}
                {missed && !isGroup && <span className="tg-call-missed">· пропущений</span>}
              </span>
              <span className="tg-call-meta">
                {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                {mm != null && ss != null && duration! > 0 && <> · {mm}:{ss}</>}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  let text: string
  switch (m.service_type) {
    case 'chat_add_user': text = `${sender} додав ${names || 'учасника'}`; break
    case 'chat_delete_user': text = `${sender} видалив ${names || 'учасника'}`; break
    case 'chat_joined_by_link': text = `${sender} приєднався за посиланням`; break
    case 'chat_joined_by_request': text = `${sender} приєднався за запитом`; break
    case 'chat_edit_title': text = `${sender} змінив назву на «${sd.title || ''}»`; break
    case 'chat_edit_photo': text = `${sender} змінив фото групи`; break
    case 'chat_delete_photo': text = `${sender} видалив фото групи`; break
    case 'chat_create': text = `${sender} створив групу`; break
    case 'channel_create': text = 'Канал створено'; break
    case 'pin_message': text = `${sender} закріпив повідомлення`; break
    case 'set_ttl': text = 'Встановлено автовидалення повідомлень'; break
    case 'topic_create': text = `Тему створено: ${sd.title || ''}`; break
    case 'topic_edit': text = 'Тему змінено'; break
    default: text = m.service_type || 'Сервісне повідомлення'
  }

  return (
    <div className="msg-service">
      <span className="msg-service-text">{text}</span>
    </div>
  )
}
