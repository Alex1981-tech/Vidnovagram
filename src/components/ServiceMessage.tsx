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
    case 'phone_call': text = '📞 Дзвінок'; break
    case 'group_call': text = '📞 Груповий дзвінок'; break
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
