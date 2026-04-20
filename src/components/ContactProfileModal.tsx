import type { Dispatch, SetStateAction } from 'react'
import { formatPresence } from '../utils/presence'
import type { ChatMessage, Contact } from '../types'

interface Presence {
  status: string
  was_online: number | null
}

interface GroupInfo {
  participants_count?: number
  username?: string
  about?: string
  [key: string]: unknown
}

interface ChatDisplay {
  name: string
  subtitle: string
}

interface LinkedPhone {
  id: string
  phone: string
}

interface Props {
  open: boolean
  onClose: () => void
  selectedClient: string | null
  chatContact: Contact | null | undefined
  chatDisplay: ChatDisplay
  clientPhone: string
  photoMap: Record<string, string>
  peerPresence: Record<string | number, Presence>
  messages: ChatMessage[]
  groupInfo: GroupInfo | null
  clientLinkedPhones: LinkedPhone[]
  chatMuted: boolean
  muteLoading: boolean
  toggleMuteChat: () => void
  setLightboxSrc: Dispatch<SetStateAction<string | null>>
  shellOpen: (url: string) => Promise<void>
  openSelectedClientCard: (clientId: string) => void
}

/**
 * Full profile card for the selected chat partner / group / channel.
 * Three layouts:
 *  - channel: subscribers/messages/media stats + mute toggle
 *  - private: phone + username + linked phones + media counts + actions
 *  - group: same as private but with optional "about" text (no phone)
 */
export function ContactProfileModal({
  open,
  onClose,
  selectedClient,
  chatContact,
  chatDisplay,
  clientPhone,
  photoMap,
  peerPresence,
  messages,
  groupInfo,
  clientLinkedPhones,
  chatMuted,
  muteLoading,
  toggleMuteChat,
  setLightboxSrc,
  shellOpen,
  openSelectedClientCard,
}: Props) {
  if (!open || !selectedClient || !chatContact) return null

  const ct = (chatContact as unknown as { chat_type?: string }).chat_type
  const isPrivate = !ct || ct === 'private'
  const isChannel = ct === 'channel'
  const peerId = (chatContact as unknown as { tg_peer_id?: number | string }).tg_peer_id
  const pr = peerId != null ? peerPresence[peerId] : undefined
  const { text: presText, isOnline: presOnline } = formatPresence(pr)
  const phone = chatDisplay.subtitle || clientPhone || chatContact.phone || ''
  const username = (chatContact as unknown as { tg_username?: string }).tg_username || ''
  const photoCount = messages.filter(m => m.media_type === 'photo').length
  const voiceCount = messages.filter(m => m.media_type === 'voice' || m.media_type === 'video_note').length
  const docCount = messages.filter(m => m.media_type === 'document').length
  const videoCount = messages.filter(m => m.media_type === 'video').length
  const source = (chatContact as unknown as { source?: string }).source

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="contact-profile-modal" onClick={e => e.stopPropagation()}>
        <button className="contact-profile-close" onClick={onClose}>✕</button>
        <div
          className="contact-profile-avatar"
          onClick={() => { if (photoMap[selectedClient]) setLightboxSrc(photoMap[selectedClient]) }}
          style={photoMap[selectedClient] ? { cursor: 'pointer' } : undefined}
        >
          {photoMap[selectedClient]
            ? <img src={photoMap[selectedClient]} alt="" />
            : <div className="contact-profile-avatar-placeholder">
                {(chatDisplay.name || '?')[0].toUpperCase()}
              </div>}
        </div>
        <h2 className="contact-profile-name">{chatDisplay.name || 'Без імені'}</h2>
        {isPrivate && presText && (
          <p className={`contact-profile-presence${presOnline ? ' online' : ''}`}>
            {presOnline ? 'онлайн' : presText}
          </p>
        )}

        {isChannel ? (
          <>
            {groupInfo?.username && <p className="contact-profile-phone">@{groupInfo.username}</p>}
            {groupInfo?.about && <p className="contact-profile-about">{groupInfo.about}</p>}
            <div className="contact-profile-stats">
              <div className="contact-profile-stat">
                <span className="contact-profile-stat-value">{groupInfo?.participants_count ?? '—'}</span>
                <span className="contact-profile-stat-label">підписників</span>
              </div>
              <div className="contact-profile-stat">
                <span className="contact-profile-stat-value">{messages.length}</span>
                <span className="contact-profile-stat-label">повідомлень</span>
              </div>
              <div className="contact-profile-stat">
                <span className="contact-profile-stat-value">{messages.filter(m => m.has_media).length}</span>
                <span className="contact-profile-stat-label">медіа</span>
              </div>
            </div>
            <div className="contact-profile-actions">
              <button
                className={`contact-profile-mute-btn${chatMuted ? ' muted' : ''}`}
                onClick={toggleMuteChat}
                disabled={muteLoading}
              >
                {chatMuted ? '🔇 Сповіщення вимкнено' : '🔔 Сповіщення увімкнено'}
              </button>
            </div>
            {groupInfo?.username && (
              <a
                className="contact-profile-link"
                href={`https://t.me/${groupInfo.username}`}
                onClick={e => { e.preventDefault(); shellOpen(`https://t.me/${groupInfo.username}`) }}
              >
                Відкрити в Telegram
              </a>
            )}
          </>
        ) : (
          <>
            {phone && (
              <div className="contact-profile-info-section">
                <div className="contact-profile-info-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <div className="contact-profile-info-text">
                    <span className="contact-profile-info-value">
                      {phone.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, '+$1 $2 $3 $4 $5')}
                    </span>
                    <span className="contact-profile-info-label">Мобільний</span>
                  </div>
                </div>
                {username && (
                  <div className="contact-profile-info-row">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
                    <div className="contact-profile-info-text">
                      <span className="contact-profile-info-value">@{username}</span>
                      <span className="contact-profile-info-label">Ім'я користувача</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {clientLinkedPhones.length > 0 && (
              <div className="contact-profile-linked">
                {clientLinkedPhones.map(lp => (
                  <span key={lp.id} className="contact-profile-linked-phone">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    {lp.phone}
                  </span>
                ))}
              </div>
            )}
            {!isPrivate && groupInfo?.about && <p className="contact-profile-about">{groupInfo.about}</p>}
            <div className="contact-profile-media-list">
              {photoCount > 0 && (
                <div className="contact-profile-media-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                  <span>{photoCount} фото</span>
                </div>
              )}
              {videoCount > 0 && (
                <div className="contact-profile-media-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  <span>{videoCount} відео</span>
                </div>
              )}
              {docCount > 0 && (
                <div className="contact-profile-media-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span>{docCount} файлів</span>
                </div>
              )}
              {voiceCount > 0 && (
                <div className="contact-profile-media-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                  <span>{voiceCount} голосових</span>
                </div>
              )}
            </div>
            <div className="contact-profile-action-list">
              <div
                className="contact-profile-action-row"
                onClick={() => { onClose(); openSelectedClientCard(selectedClient) }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Відкрити картку клієнта</span>
              </div>
              {source === 'telegram' && peerId && (
                <div
                  className="contact-profile-action-row"
                  onClick={() => { onClose(); shellOpen(`https://t.me/+${phone.replace(/^0/, '38')}`) }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                  <span>Відкрити в Telegram</span>
                </div>
              )}
              {!isPrivate && (
                <div className="contact-profile-action-row" onClick={toggleMuteChat}>
                  {chatMuted ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 2 2 18"/><path d="M18 12H5.91a2 2 0 0 1-1.58-.77L2.2 8.56A2 2 0 0 1 3.91 5.5H18"/></svg>
                      <span>Увімкнути сповіщення</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                      <span>Не сповіщати</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
