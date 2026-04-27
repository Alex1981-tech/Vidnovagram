import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { fetchMetaMessages, sendMetaMessage, uploadMetaAttachment } from '../utils/metaApi'
import { useMetaContacts } from '../hooks/useMetaContacts'
import { FacebookIcon, InstagramIcon, SendIcon } from './icons'
import type { MetaAccount, MetaMessage } from '../types'

/** Self-contained 2-pane Meta conversation panel. Renders sidebar of
 *  distinct senders + chat-window + input bar. No state leaks into the
 *  rest of App.tsx — the parent just toggles us on when a Meta account
 *  is selected.
 *
 *  Notes:
 *  - "Contact" here is keyed by `sender_id` (PSID/IGSID), not phone.
 *  - History pulled via /api/meta/messages/?account_id=&sender_id=.
 *  - Send via /api/meta/send/<account_id>/ with recipient_id=sender_id.
 *  - Real-time receive comes through useMessengerWebSocket (see Iter 2
 *    of this file in the next commit). For now, polls every 15s as a
 *    fallback when window is focused.
 */

interface Props {
  account: MetaAccount
  token: string
  onClose: () => void
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return fmtTime(iso)
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
  } catch { return '' }
}

export function MetaChatPanel({ account, token, onClose }: Props) {
  const { contacts, loading: contactsLoading, refresh: refreshContacts } = useMetaContacts(account.id, token)
  const [selectedSender, setSelectedSender] = useState<string | null>(null)
  const [messages, setMessages] = useState<MetaMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  // Reply-to: when set, the next outgoing carries reply_to_msg_id and
  // shows a quoted preview block above the textarea. ESC clears it.
  const [replyTo, setReplyTo] = useState<MetaMessage | null>(null)
  // 24h-rule message_tag dropdown — only shown when last24hOk=false on
  // FB. RESPONSE is the implicit default when this is null.
  const [messageTag, setMessageTag] = useState<
    '' | 'HUMAN_AGENT' | 'ACCOUNT_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE'
  >('HUMAN_AGENT')
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const isInactive = account.status !== 'connected'

  const PlatformIcon = account.platform === 'facebook' ? FacebookIcon : InstagramIcon
  const platformColor = account.platform === 'facebook' ? '#1877F2' : '#E4405F'

  const loadMessages = useCallback(async (senderId: string) => {
    if (!senderId) return
    setMessagesLoading(true)
    try {
      const data = await fetchMetaMessages(token, {
        account_id: account.id, sender_id: senderId, page_size: 100,
      })
      // Backend orders desc by message_date; flip to ascending for chat.
      const list = ((data.results || []) as MetaMessage[]).slice().reverse()
      setMessages(list)
    } catch {
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [account.id, token])

  // Auto-pick first contact when contacts arrive
  useEffect(() => {
    if (!selectedSender && contacts.length > 0) {
      setSelectedSender(contacts[0].sender_id)
    }
  }, [contacts, selectedSender])

  useEffect(() => {
    if (selectedSender) loadMessages(selectedSender)
    else setMessages([])
  }, [selectedSender, loadMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Real-time receive — listens for window events broadcast from the
  // shared WS connection in useMessengerWebSocket. Backend fans out the
  // same `messenger.new_message` payload it uses for TG/WA but with
  // `source: "meta"` and `meta_event` set; the WS hook detects it and
  // dispatches `vidnova:meta_event` for us.
  useEffect(() => {
    type MetaEventDetail = {
      account_id?: string
      meta_event?: 'meta.message' | 'meta.delete' | 'meta.edit' | 'meta.reaction'
      message?: MetaMessage
    }
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<MetaEventDetail>).detail
      if (!detail || detail.account_id !== account.id) return
      const m = detail.message
      const evType = detail.meta_event || 'meta.message'

      if (evType === 'meta.message' && m) {
        // If this conversation is open and the message belongs to it —
        // append; otherwise just refresh the contacts list so the
        // sidebar shows the new last_message preview + unread bump.
        if (selectedSender && m.sender_id === selectedSender) {
          setMessages(prev => {
            // Skip dupe (Meta retries OK; we may also have just appended
            // the optimistic outgoing copy ourselves).
            if (prev.some(x => x.id === m.id || x.meta_message_id === m.meta_message_id)) return prev
            return [...prev, m]
          })
        }
        refreshContacts()
        return
      }
      if (evType === 'meta.edit' && m) {
        setMessages(prev => prev.map(x => x.meta_message_id === m.meta_message_id ? { ...x, ...m } : x))
        return
      }
      if (evType === 'meta.delete' && m) {
        setMessages(prev => prev.map(x =>
          x.meta_message_id === m.meta_message_id ? { ...x, is_deleted: true } : x,
        ))
        refreshContacts()
        return
      }
      if (evType === 'meta.reaction' && m) {
        setMessages(prev => prev.map(x =>
          x.meta_message_id === m.meta_message_id
            ? { ...x, reactions: m.reactions || x.reactions }
            : x,
        ))
        return
      }
    }
    window.addEventListener('vidnova:meta_event', handler)
    return () => window.removeEventListener('vidnova:meta_event', handler)
  }, [account.id, selectedSender, refreshContacts])

  // last24hOk computed below; we read messages.last_incoming_age once
  // here too so send-effects can decide if we need a tag. Keep this
  // in sync with the useMemo lower in the file.
  const last24hOkRef = useRef(true)

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || !selectedSender || sending) return
    setSending(true)
    setSendError(null)
    try {
      const body: import('../utils/metaApi').SendMetaMessageBody = {
        recipient_id: selectedSender,
        text,
      }
      if (replyTo) body.reply_to_msg_id = replyTo.meta_message_id
      // FB only: outside the 24h window, attach the manager-chosen tag.
      if (account.platform === 'facebook' && !last24hOkRef.current && messageTag) {
        body.message_tag = messageTag
      }
      const r = await sendMetaMessage(token, account.id, body)
      // Optimistic: append the returned message
      setMessages(prev => [...prev, r.message])
      setDraft('')
      setReplyTo(null)
      refreshContacts()
    } catch (e) {
      setSendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }, [draft, selectedSender, sending, token, account.id, account.platform, refreshContacts, replyTo, messageTag])

  // Media send (FB only — IG attachment upload is unsupported by Meta).
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendMedia = useCallback(async (file: File) => {
    if (!selectedSender || sending) return
    if (account.platform === 'instagram') {
      setSendError('Instagram потребує публічного media URL — поки не підтримуємо.')
      return
    }
    const ct = (file.type || '').toLowerCase()
    let kind: 'image' | 'video' | 'audio' | 'file' = 'file'
    if (ct.startsWith('image/')) kind = 'image'
    else if (ct.startsWith('video/')) kind = 'video'
    else if (ct.startsWith('audio/')) kind = 'audio'
    setSending(true)
    setSendError(null)
    try {
      const upload = await uploadMetaAttachment(token, account.id, file, kind)
      const r = await sendMetaMessage(token, account.id, {
        recipient_id: selectedSender,
        attachment_id: upload.attachment_id,
        media_type: upload.media_type,
      })
      setMessages(prev => [...prev, r.message])
      refreshContacts()
    } catch (e) {
      setSendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }, [selectedSender, sending, token, account.id, account.platform, refreshContacts])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const selectedContact = useMemo(
    () => contacts.find(c => c.sender_id === selectedSender),
    [contacts, selectedSender],
  )

  // 24h rule for Meta DMs — outgoing messages outside the 24h window
  // since the last incoming need a message_tag (manager picks one).
  const last24hOk = useMemo(() => {
    const lastIncoming = [...messages].reverse().find(m => m.direction === 'incoming')
    if (!lastIncoming) return false
    return Date.now() - new Date(lastIncoming.message_date).getTime() < 24 * 60 * 60 * 1000
  }, [messages])
  // Mirror into a ref so send() reads the latest value without
  // becoming part of its dependency closure.
  useEffect(() => { last24hOkRef.current = last24hOk }, [last24hOk])

  // ESC clears reply-to selection.
  useEffect(() => {
    if (!replyTo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReplyTo(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replyTo])

  return (
    <div className="meta-panel">
      {/* Sidebar: contacts list */}
      <div className="meta-panel-sidebar">
        <div className="meta-panel-header">
          <PlatformIcon size={20} color={platformColor} />
          <div className="meta-panel-header-text">
            <div className="meta-panel-header-name">{account.label}</div>
            <div className="meta-panel-header-sub">{account.username || account.meta_user_id}</div>
          </div>
          <button className="meta-panel-close" onClick={onClose} title="Закрити">×</button>
        </div>
        {isInactive && (
          <div className="meta-panel-warning">
            ⚠ {account.platform === 'instagram' ? 'Instagram' : 'Facebook'}-акаунт у статусі <strong>{account.status}</strong>.
            {account.status === 'needs_review' && ' Активується після Meta App Review.'}
          </div>
        )}
        <div className="meta-contacts-list">
          {contactsLoading && contacts.length === 0 && (
            <div className="meta-empty">Завантаження…</div>
          )}
          {!contactsLoading && contacts.length === 0 && (
            <div className="meta-empty">
              Жодних діалогів. {isInactive ? 'Чекаємо активації акаунту.' : 'Поки що ніхто не писав.'}
            </div>
          )}
          {contacts.map(c => (
            <button
              key={c.sender_id}
              className={`meta-contact ${selectedSender === c.sender_id ? 'active' : ''}`}
              onClick={() => setSelectedSender(c.sender_id)}
            >
              <div className="meta-contact-avatar">
                {(c.full_name || '?')[0].toUpperCase()}
              </div>
              <div className="meta-contact-body">
                <div className="meta-contact-row">
                  <span className="meta-contact-name">{c.full_name || c.sender_id}</span>
                  <span className="meta-contact-time">{fmtDate(c.last_message_date)}</span>
                </div>
                <div className="meta-contact-row">
                  <span className="meta-contact-preview">
                    {c.last_direction === 'sent' ? '✓ ' : ''}{c.last_message || (c.media_type ? `[${c.media_type}]` : '')}
                  </span>
                  {c.unread > 0 && <span className="meta-contact-unread">{c.unread}</span>}
                </div>
                {c.is_linked && c.phone && (
                  <div className="meta-contact-phone">📞 {c.phone}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main: chat window */}
      <div className="meta-panel-chat">
        {!selectedSender ? (
          <div className="meta-chat-placeholder">
            <PlatformIcon size={48} color={platformColor} />
            <div>Виберіть діалог зліва</div>
          </div>
        ) : (
          <>
            <div className="meta-chat-header">
              <div className="meta-chat-header-name">
                {selectedContact?.full_name || selectedSender}
              </div>
              <div className="meta-chat-header-sub">
                {selectedContact?.is_linked && selectedContact?.phone
                  ? `📞 ${selectedContact.phone}`
                  : `${account.platform === 'facebook' ? 'PSID' : 'IGSID'}: ${selectedSender}`}
              </div>
            </div>
            <div className="meta-chat-messages" ref={chatScrollRef}>
              {messagesLoading && messages.length === 0 && (
                <div className="meta-empty">Завантаження…</div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div className="meta-empty">Поки що порожньо</div>
              )}
              {messages.map(m => {
                // Reactions arrive from Meta as { "<sender>": "love" | … }
                // We collapse into a list of unique emojis with counts.
                const reactionEntries = Object.values(m.reactions || {}) as string[]
                const reactionCounts: Record<string, number> = {}
                for (const r of reactionEntries) reactionCounts[r] = (reactionCounts[r] || 0) + 1
                const isStoryReply = m.media_type === 'story_reply' || m.media_type === 'story_mention'
                return (
                  <div
                    key={m.id}
                    className={`meta-msg ${m.direction === 'outgoing' ? 'sent' : 'received'}`}
                    onDoubleClick={() => setReplyTo(m)}
                    title="Подвійний клік — відповісти"
                  >
                    <div className="meta-msg-bubble">
                      {isStoryReply && (
                        <div className="meta-story-banner">
                          {m.media_type === 'story_reply' ? '↩ Відповідь на сторіс' : '@️ Згадка у сторіс'}
                        </div>
                      )}
                      {m.reply_to_text && (
                        <div className="meta-msg-quote">
                          <div className="meta-msg-quote-bar" />
                          <div className="meta-msg-quote-text">{m.reply_to_text}</div>
                        </div>
                      )}
                      {m.is_deleted ? <span className="meta-msg-deleted">Повідомлення видалено</span> : (
                        <>
                          {m.media_url && m.media_type === 'image' && (
                            <img src={m.media_url} alt="" className="meta-msg-image" />
                          )}
                          {m.media_url && m.media_type !== 'image' && !isStoryReply && (
                            <a href={m.media_url} target="_blank" rel="noreferrer" className="meta-msg-link">
                              📎 {m.media_type || 'attachment'}
                            </a>
                          )}
                          {m.text && <div className="meta-msg-text">{m.text}</div>}
                        </>
                      )}
                      <div className="meta-msg-meta">
                        {m.is_edited && <span className="meta-msg-edited">edit · </span>}
                        {fmtTime(m.message_date)}
                      </div>
                      {Object.keys(reactionCounts).length > 0 && (
                        <div className="meta-msg-reactions">
                          {Object.entries(reactionCounts).map(([emoji, count]) => (
                            <span key={emoji} className="meta-msg-reaction">
                              {emoji}{count > 1 ? ` ${count}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {!last24hOk && messages.length > 0 && account.platform === 'facebook' && (
              <div className="meta-24h-warning">
                <div className="meta-24h-warning-text">
                  ⚠ Минуло понад 24 години від останнього повідомлення клієнта. Meta вимагає <strong>message_tag</strong> для нового вихідного.
                </div>
                <div className="meta-24h-warning-row">
                  <label>Тип:</label>
                  <select
                    value={messageTag}
                    onChange={e => setMessageTag(e.target.value as typeof messageTag)}
                  >
                    <option value="HUMAN_AGENT">HUMAN_AGENT — підтримка клієнта</option>
                    <option value="ACCOUNT_UPDATE">ACCOUNT_UPDATE — оновлення картки</option>
                    <option value="CONFIRMED_EVENT_UPDATE">CONFIRMED_EVENT_UPDATE — нагадування про прийом</option>
                    <option value="POST_PURCHASE_UPDATE">POST_PURCHASE_UPDATE — після оплати/прийому</option>
                  </select>
                </div>
              </div>
            )}
            {replyTo && (
              <div className="meta-reply-preview">
                <div className="meta-reply-preview-bar" />
                <div className="meta-reply-preview-text">
                  <div className="meta-reply-preview-label">Відповідь на:</div>
                  <div className="meta-reply-preview-body">
                    {replyTo.text || (replyTo.media_type ? `[${replyTo.media_type}]` : '...')}
                  </div>
                </div>
                <button
                  className="meta-reply-preview-close"
                  onClick={() => setReplyTo(null)}
                  title="Скасувати відповідь (Esc)"
                >×</button>
              </div>
            )}
            <div className="meta-chat-input">
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                accept="image/*,video/*,audio/*,application/pdf,application/zip,.doc,.docx,.xls,.xlsx"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) sendMedia(f)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || isInactive || account.platform === 'instagram'}
                className="meta-attach-btn"
                title={account.platform === 'instagram' ? 'Instagram не підтримує attachment_upload' : 'Прикріпити файл'}
              >
                📎
              </button>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={isInactive ? 'Акаунт неактивний — відправка недоступна' : 'Напишіть повідомлення (Enter — надіслати)'}
                disabled={isInactive || sending}
                rows={2}
              />
              <button
                onClick={send}
                disabled={!draft.trim() || sending || isInactive}
                className="meta-send-btn"
                title="Надіслати"
              >
                <SendIcon />
              </button>
            </div>
            {sendError && <div className="meta-send-error">{sendError}</div>}
          </>
        )}
      </div>
    </div>
  )
}
