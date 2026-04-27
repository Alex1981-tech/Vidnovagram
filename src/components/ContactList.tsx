import type { MutableRefObject } from 'react'
import { TelegramIcon, WhatsAppIcon, UserIcon } from './icons'
import { ContactName } from './ContactName'
import { formatContactDate } from '../utils/dateFormat'
import { resolveContactDisplay } from '../utils/contactDisplay'
import type { Contact, GlobalSearchResult } from '../types'

interface PeerPresenceEntry {
  status?: 'online' | 'offline' | string
  [key: string]: unknown
}

interface DraftEntry {
  text: string
  replyTo?: unknown
}

interface UsernameSearchResult {
  peer_id?: number | string
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

interface OperatorPresenceViewer {
  user_id: number
  name: string
  is_typing: boolean
}

interface Props {
  hasMessengerAccounts: boolean
  contacts: Contact[]
  selectedClient: string | null
  selectedAccount: string
  isUnread: (contact: Contact) => boolean
  photoMap: Record<string, string>
  peerPresence: Record<string | number, PeerPresenceEntry>
  /** Viewers per chat keyed by `"{accountId}:{clientId}"`. */
  operatorPresenceByChat?: Record<string, OperatorPresenceViewer[]>
  /** Currently-active account ID used to scope the presence lookup for each row. */
  operatorPresenceAccountId?: string | null
  /** Self user_id — filtered out of presence display. */
  selfUserId?: number | null
  draftsRef: MutableRefObject<Map<string, DraftEntry>>
  loadMoreContacts: () => void
  loadingMoreContacts: boolean
  contactCount: number
  usernameSearchResult: UsernameSearchResult | null
  globalSearchResults: GlobalSearchResult[]
  onSelectClient: (clientId: string, opts?: { accountId?: string; jumpToMessageId?: string | number }) => void
  onUsernameSelect: (result: UsernameSearchResult) => void
  onClearSearch: () => void
}

/** Messenger sidebar body: contacts + global search + username search + empty state + footer. */
export function ContactList({
  hasMessengerAccounts,
  contacts,
  selectedClient,
  selectedAccount: _selectedAccount,
  isUnread,
  photoMap,
  peerPresence,
  operatorPresenceByChat,
  operatorPresenceAccountId,
  selfUserId,
  draftsRef,
  loadMoreContacts,
  loadingMoreContacts,
  contactCount,
  usernameSearchResult,
  globalSearchResults,
  onSelectClient,
  onUsernameSelect,
  onClearSearch: _onClearSearch,
}: Props) {
  return (
    <>
      <div
        className="contact-list"
        onScroll={e => {
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
            loadMoreContacts()
          }
        }}
      >
        {hasMessengerAccounts ? (
          <>
            {contacts.map(c => {
              const display = resolveContactDisplay(c)
              const peerId = c.tg_peer_id
              const isOnline = peerId != null && peerPresence[peerId]?.status === 'online'
              // Presence from other operators — drives the pulsing dot
              // next to the avatar. Lookup uses the current active account
              // because the backend keys presence by (account, client).
              const opKey = operatorPresenceAccountId
                ? `${operatorPresenceAccountId}:${c.client_id}`
                : null
              const rawViewers = opKey ? operatorPresenceByChat?.[opKey] : undefined
              const otherViewers = (rawViewers || []).filter(v =>
                selfUserId ? v.user_id !== selfUserId : true
              )
              const hasOtherViewer = otherViewers.length > 0
              const hasOtherTyping = otherViewers.some(v => v.is_typing)
              const viewersLabel = hasOtherViewer
                ? otherViewers.map(v => v.name || '—').join(', ') +
                  (hasOtherTyping ? ' набирає' : ' дивиться в чаті')
                : ''
              return (
                <div
                  key={c.client_id}
                  className={`contact ${selectedClient === c.client_id ? 'active' : ''}${isUnread(c) ? ' unread' : ''}${c.has_whatsapp && !c.has_telegram ? ' wa-contact' : ''}`}
                  onClick={() => onSelectClient(c.client_id)}
                >
                  <div className={`avatar${c.has_whatsapp && !c.has_telegram ? ' wa-avatar' : ''}`}>
                    {photoMap[c.client_id]
                      ? <img src={photoMap[c.client_id]} className="avatar-img" alt="" />
                      : <UserIcon />}
                    {isOnline && <span className="online-dot" />}
                    {hasOtherViewer && (
                      <span
                        className={`contact-presence-dot${hasOtherTyping ? ' typing' : ''}`}
                        title={viewersLabel}
                      />
                    )}
                  </div>
                  <div className="contact-body">
                    <div className="contact-row">
                      <span className={`contact-name${c.is_employee ? ' employee' : ''}`}>
                        <ContactName name={display.name} isEmployee={c.is_employee} />
                        {c.is_new_patient && (
                          <span className="badge-new-patient" title="Новий клієнт">🆕</span>
                        )}
                        {c.is_linked === false && (
                          <span
                            className="badge-unlinked"
                            title="Не привʼязаний — пацієнт не поділився номером"
                            style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 6,
                              background: 'rgba(139,115,184,0.15)',
                              color: '#8B73B8', marginLeft: 6, fontWeight: 500,
                            }}
                          >не привʼязаний</span>
                        )}
                      </span>
                      {isUnread(c) && <span className="unread-dot" />}
                      <span className="contact-time">
                        {c.last_message_date && formatContactDate(c.last_message_date)}
                      </span>
                    </div>
                    <div className="contact-row">
                      <span className="contact-preview">
                        {draftsRef.current.has(c.client_id) ? (
                          <><span className="preview-draft">Чернетка: </span>{draftsRef.current.get(c.client_id)!.text.slice(0, 50)}</>
                        ) : (
                          <>
                            {c.last_message_direction === 'sent' && <span className="preview-you">Ви: </span>}
                            {c.last_message_text?.slice(0, 60) || 'Медіа'}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="contact-meta">
                      <span className="contact-phone">{display.subtitle}</span>
                      <span className="contact-icons">
                        {c.has_telegram === true && <TelegramIcon size={12} color="#2AABEE" />}
                        {c.has_whatsapp && <WhatsAppIcon size={12} color="#25D366" />}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {loadingMoreContacts && <div className="loading-more">Завантаження...</div>}
            {/* Username search result (@bot / @user) */}
            {usernameSearchResult && (
              <>
                <div className="search-section-header">
                  {usernameSearchResult.is_bot ? '🤖 Бот' : '👤 Користувач'}
                </div>
                <div className="contact search-result username-result" onClick={() => onUsernameSelect(usernameSearchResult)}>
                  <div className="avatar">{usernameSearchResult.is_bot ? <span>🤖</span> : <UserIcon />}</div>
                  <div className="contact-body">
                    <div className="contact-row">
                      <span className="contact-name">{usernameSearchResult.first_name} {usernameSearchResult.last_name || ''}</span>
                    </div>
                    <div className="contact-row">
                      <span className="contact-preview">@{usernameSearchResult.username}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
            {/* Global message search results */}
            {globalSearchResults.length > 0 && (
              <>
                <div className="search-section-header">Повідомлення ({globalSearchResults.length})</div>
                {globalSearchResults.map((r, i) => (
                  <div
                    key={`sr-${i}`}
                    className="contact search-result"
                    onClick={() => {
                      if (r.client_id) {
                        onSelectClient(r.client_id, { accountId: r.account_id || undefined, jumpToMessageId: r.id })
                      }
                    }}
                  >
                    <div className="avatar"><UserIcon /></div>
                    <div className="contact-body">
                      <div className="contact-row">
                        <span className="contact-name">{r.client_name || r.client_phone || 'Невідомий'}</span>
                        <span className="contact-time">{r.message_date && formatContactDate(r.message_date)}</span>
                      </div>
                      <div className="contact-row">
                        <span className="contact-preview search-preview">
                          {r.direction === 'sent' && <span className="preview-you">Ви: </span>}
                          {r.text?.slice(0, 80)}
                        </span>
                      </div>
                      <div className="contact-meta">
                        <span className="contact-phone">{r.account_label || '—'}</span>
                        <span className="contact-icons">
                          {r.source === 'telegram'
                            ? <TelegramIcon size={12} color="#2AABEE" />
                            : <WhatsAppIcon size={12} color="#25D366" />}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div className="sidebar-empty-state">
            <div className="sidebar-empty-state-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div className="sidebar-empty-state-title">Немає доступних акаунтів</div>
            <div className="sidebar-empty-state-text">
              У налаштуваннях користувача не видано жодного Telegram або WhatsApp акаунта.
            </div>
          </div>
        )}
      </div>
      <div className="sidebar-footer">
        {hasMessengerAccounts ? `${contacts.length} / ${contactCount} контактів` : 'Попросіть адміністратора надати доступ до акаунтів'}
      </div>
    </>
  )
}
