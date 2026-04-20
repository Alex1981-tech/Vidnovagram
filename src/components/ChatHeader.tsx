import { PhoneIcon, UserIcon, VideoIcon } from './icons'
import { formatPresence, type Presence } from '../utils/presence'

// Shape is intentionally loose — callers pass either full Contact, partial new-chat stub, or null
type ChatContactLike = Record<string, unknown> | null | undefined

interface GroupInfo {
  participants_count?: number
  online_count?: number
  [key: string]: unknown
}

interface ChatDisplay {
  name: string
  subtitle: string
}

interface Props {
  selectedClient: string | null
  chatContact: ChatContactLike
  chatDisplay: ChatDisplay
  photoMap: Record<string, string>
  peerPresence: Record<string | number, Presence>
  typingIndicators: Record<string, unknown>
  groupInfo: GroupInfo | null
  selectedAccount: string
  activeCall: boolean
  chatMuted: boolean
  muteLoading: boolean
  msgCount: number
  onOpenProfile: () => void
  onOpenCard: (clientId: string) => void
  onVoipCall: (accountId: string, peerId: string | number) => void | Promise<void>
  onToggleMute: () => void
  onToggleSearch: () => void
}

/**
 * Chat window header: avatar + name + presence/typing/group info + action buttons
 * (client card, voip call, video call, mute for groups, search, msg count badge).
 */
export function ChatHeader({
  selectedClient,
  chatContact,
  chatDisplay,
  photoMap,
  peerPresence,
  typingIndicators,
  groupInfo,
  selectedAccount,
  activeCall,
  chatMuted,
  muteLoading,
  msgCount,
  onOpenProfile,
  onOpenCard,
  onVoipCall,
  onToggleMute,
  onToggleSearch,
}: Props) {
  const ct = chatContact?.chat_type as string | undefined
  const peerId = chatContact?.tg_peer_id as string | number | undefined
  const isPrivate = !ct || ct === 'private'
  const showOnlineDot = peerId != null && isPrivate && peerPresence[peerId]?.status === 'online'

  const renderSubtitle = () => {
    if (selectedClient && typingIndicators[selectedClient]) {
      return (
        <span className="typing-indicator">
          набирає повідомлення
          <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
        </span>
      )
    }

    if (ct && ct !== 'private' && groupInfo) {
      const parts: string[] = []
      if (groupInfo.participants_count != null) {
        parts.push(`${groupInfo.participants_count} ${ct === 'channel' ? 'підписників' : 'учасників'}`)
      }
      if (groupInfo.online_count != null && groupInfo.online_count > 0) {
        parts.push(`${groupInfo.online_count} онлайн`)
      }
      if (ct === 'channel' && !parts.length) parts.push('канал')
      if (parts.length) return <span className="presence-offline">{parts.join(', ')}</span>
    }

    const pr = peerId != null ? peerPresence[peerId] : undefined
    const { text: presText, isOnline } = formatPresence(pr)
    if (presText) {
      return (
        <span className={isOnline ? 'presence-online' : 'presence-offline'}>
          {presText}
        </span>
      )
    }
    return chatDisplay.subtitle
  }

  return (
    <div className="chat-header">
      <div className="chat-header-avatar" onClick={onOpenProfile} style={{ cursor: 'pointer' }}>
        {selectedClient && photoMap[selectedClient]
          ? <img src={photoMap[selectedClient]} className="avatar-img" alt="" />
          : <UserIcon />}
        {showOnlineDot && <span className="online-dot online-dot-header" />}
      </div>
      <div className="chat-header-info" onClick={onOpenProfile} style={{ cursor: 'pointer' }}>
        <div className="chat-header-name">{chatDisplay.name}</div>
        <div className="chat-header-phone">{renderSubtitle()}</div>
      </div>
      <div className="chat-header-right">
        <button
          className="chat-mute-btn"
          onClick={() => selectedClient && onOpenCard(selectedClient)}
          title="Картка клієнта"
        >
          <UserIcon />
        </button>
        {peerId != null && selectedAccount && !activeCall && isPrivate && (
          <>
            <button
              className="voip-call-btn"
              onClick={() => onVoipCall(selectedAccount, peerId)}
              title="Голосовий дзвінок"
            >
              <PhoneIcon />
            </button>
            <button
              className="voip-call-btn voip-call-btn-disabled"
              title="Відеодзвінок (незабаром)"
              disabled
            >
              <VideoIcon />
            </button>
          </>
        )}
        {ct && ct !== 'private' && selectedAccount && (
          <button
            className={`chat-mute-btn${chatMuted ? ' muted' : ''}`}
            onClick={onToggleMute}
            disabled={muteLoading}
            title={chatMuted ? 'Увімкнути сповіщення' : 'Вимкнути сповіщення'}
          >
            {chatMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.8 8A6 6 0 0 1 20 12"/><path d="m2 2 20 20"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M8.54 5A6 6 0 0 1 18 8c0 1-.3 2.08-.78 3.1"/><path d="M6 6a8.11 8.11 0 0 0-1.56 3.85c-.42 2.15.07 3.75.56 5.15H18"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            )}
          </button>
        )}
        <button className="chat-search-btn" onClick={onToggleSearch} title="Пошук у чаті">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span className="msg-count-badge">{msgCount} повідомлень</span>
      </div>
    </div>
  )
}
