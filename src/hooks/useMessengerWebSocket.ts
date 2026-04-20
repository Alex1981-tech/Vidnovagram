import { useEffect, useRef } from 'react'
import { WS_BASE } from '../constants'
import { showNotification } from '../utils/notifications'
import { resolveContactDisplay, getMediaPreviewLabel } from '../utils/contactDisplay'
import type {
  Account,
  Contact,
  ChatMessage,
  WsReactionEvent,
} from '../types'
import type { VoIPCall } from '../voip'

type VoipEvent = { type: string; call?: VoIPCall; account_label?: string }
type ToastAdder = (
  clientId: string,
  accountId: string,
  sender: string,
  account: string,
  text: string,
  hasMedia: boolean,
  mediaType: string,
) => void

export interface MessengerWebSocketOptions {
  token: string | undefined
  authorized: boolean

  // Refs supplied by App — hook reads `.current` inside the WS callback so the
  // same WebSocket instance can survive renders while still seeing fresh state.
  selectedClientRef: React.RefObject<string | null>
  contactsRef: React.RefObject<Contact[]>
  messagesRef: React.RefObject<ChatMessage[]>
  wsDedupRef: React.RefObject<Map<string, number>>
  typingClearTimersRef: React.RefObject<Record<string, ReturnType<typeof setTimeout>>>
  loadContactsRef: React.RefObject<() => void>

  // Setters for cross-domain state.
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setTypingIndicators: React.Dispatch<React.SetStateAction<Record<string, number>>>
  setPeerPresence: React.Dispatch<React.SetStateAction<Record<number, { status: string; was_online: number | null }>>>
  setNewChatClient: React.Dispatch<React.SetStateAction<{ client_id: string; phone: string; full_name: string } | null>>
  setAccountUnreads: React.Dispatch<React.SetStateAction<Record<string, number>>>

  // Actions + callbacks provided by App.
  scheduleMessagesRefresh: (clientId: string, scrollToEnd?: boolean, delay?: number) => void
  scheduleContactsRefresh: (delay?: number) => void
  addToast: ToastAdder
  isPopupEnabled: (accountId: string) => boolean
  playNotifSound: (accountId: string) => void
  voipApplyWsEvent: (event: VoipEvent) => void
  /**
   * Called after a successful WS reconnect (NOT the first connect).
   * App refreshes `updates` + `contacts` + currently-open chat messages so
   * unread counters and message lists are consistent with what the server
   * knows after the disconnect window.
   */
  onReconnect?: () => void

  // Read-only data.
  accounts: Account[]
}

function resolveWsContactDisplay(
  message: {
    client_name?: string
    phone?: string
    tg_name?: string
    tg_username?: string
  } | undefined,
  contact?: Contact,
) {
  return resolveContactDisplay({
    full_name: message?.client_name || contact?.full_name,
    phone: message?.phone || contact?.phone,
    tg_name: message?.tg_name || contact?.tg_name,
    tg_username: message?.tg_username || contact?.tg_username,
    linked_phones: contact?.linked_phones,
  })
}

function buildReactionTargetPreview(event: WsReactionEvent, sender: string, localMsg?: ChatMessage) {
  const targetDirection = event.target_message_direction || localMsg?.direction || ''
  const targetText = (event.target_message_text || localMsg?.text || '').trim()
  const targetHasMedia = !!event.target_message_has_media || !!localMsg?.has_media
  const targetMediaType = event.target_message_media_type || localMsg?.media_type || ''
  const targetLabel = targetDirection === 'sent' ? 'ваше повідомлення' : `повідомлення ${sender}`
  const preview = targetText
    ? targetText.slice(0, 100)
    : targetHasMedia
      ? getMediaPreviewLabel(targetMediaType)
      : 'повідомлення'
  return { targetLabel, preview }
}

export interface MessengerWebSocketApi {
  wsRef: React.RefObject<WebSocket | null>
  /** Timestamp (ms) of the last received WS frame. Useful for gating polling. */
  wsLastActivityRef: React.RefObject<number>
}

/**
 * Single messenger WebSocket owner. Connects on authorized login and
 * dispatches `onmessage` events into the right setters/callbacks. Uses a
 * latest-ref snapshot of options so that App re-renders do not retrigger
 * the connect effect — only `token` and `authorized` changes do.
 *
 * Fallback polling lives here too: every 10s, if no WS frame arrived in the
 * last 30s we re-poll contacts + current chat.
 */
export function useMessengerWebSocket(opts: MessengerWebSocketOptions): MessengerWebSocketApi {
  const wsRef = useRef<WebSocket | null>(null)
  const wsLastActivityRef = useRef<number>(0)
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })

  useEffect(() => {
    const { authorized, token } = opts
    if (!authorized || !token) return
    const url = `${WS_BASE}/messenger/?token=${token}`
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>
    let alive = true
    // Track whether this is the first connect or a reconnect — App's initial
    // mount already fetches updates/contacts, so we only fire onReconnect for
    // subsequent connects after a close.
    let hasConnectedBefore = false

    function connect() {
      if (!alive) return
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] connected')
        wsLastActivityRef.current = Date.now()
        ws.send(JSON.stringify({ type: 'subscribe_all' }))
        if (hasConnectedBefore) {
          // Reconnect — tell App to re-fetch state that may have drifted
          // during the disconnect window (unread counters, new contacts,
          // chat messages).
          try { optsRef.current.onReconnect?.() } catch (e) { console.warn('[WS] onReconnect failed', e) }
        }
        hasConnectedBefore = true
      }

      ws.onmessage = (event) => {
        wsLastActivityRef.current = Date.now()
        try {
          const data: WsReactionEvent = JSON.parse(event.data)
          const o = optsRef.current

          if (data.type === 'new_message') {
            const msg = data.message || {}
            const clientId = data.client_id
            const accountId = data.account_id
            const isMediaUpdate = !!msg._media_update
            const selectedClientId = o.selectedClientRef.current
            const selectedContact = selectedClientId
              ? o.contactsRef.current?.find((c) => c.client_id === selectedClientId)
              : undefined
            const selectedLinkedIds = new Set((selectedContact?.linked_phones || []).map((lp) => lp.id))
            const isCurrentChat = !!clientId && (
              clientId === selectedClientId ||
              selectedLinkedIds.has(clientId)
            )

            // Dedup: same group message arrives via multiple accounts — notify once.
            const dedupKey = msg.tg_message_id && msg.tg_peer_id ? `msg:${msg.tg_message_id}:${msg.tg_peer_id}` : ''
            const dedup = o.wsDedupRef.current
            const isDupe = !!(dedupKey && dedup?.has(dedupKey))
            if (dedupKey && !isDupe && dedup) {
              dedup.set(dedupKey, Date.now())
              if (dedup.size > 200) {
                const cutoff = Date.now() - 30_000
                for (const [k, t] of dedup) {
                  if (t < cutoff) dedup.delete(k)
                }
              }
            }

            if (isCurrentChat) {
              o.scheduleMessagesRefresh(selectedClientId || clientId!, !isMediaUpdate)
            }

            if (msg.direction === 'received' && !isMediaUpdate && !isDupe) {
              if (!isCurrentChat) {
                const matchedContact = clientId ? o.contactsRef.current?.find((c) => c.client_id === clientId) : undefined
                const senderDisplay = resolveWsContactDisplay(msg, matchedContact)
                const sender = senderDisplay.name || 'Новий контакт'
                const account = msg.account_label || ''
                const body = msg.text?.slice(0, 120) || ''
                if (accountId && o.isPopupEnabled(accountId)) {
                  showNotification(`${sender} → ${account}`, body || '📎 Медіа')
                }
                o.addToast(clientId || '', accountId || '', sender, account, body, !!msg.has_media, msg.media_type || '')

                if (clientId && !matchedContact) {
                  o.setNewChatClient((prev) =>
                    prev?.client_id === clientId
                      ? prev
                      : {
                        client_id: clientId,
                        phone: senderDisplay.subtitle || msg.phone || '',
                        full_name: sender,
                      },
                  )
                }

                if (accountId) {
                  o.setAccountUnreads((prev) => ({ ...prev, [accountId]: (prev[accountId] || 0) + 1 }))
                }
              }
              if (!isCurrentChat && accountId) {
                o.playNotifSound(accountId)
              }
            }

            o.scheduleContactsRefresh()
          }

          if (data.type === 'contact_update') {
            o.scheduleContactsRefresh()
          }

          if (data.type === 'edit_message') {
            o.setMessages((prev) => prev.map((m) => {
              if (m.tg_message_id !== data.tg_message_id) return m
              const upd: Partial<ChatMessage> = {
                text: data.new_text,
                is_edited: true,
                edited_at: data.edit_date,
                original_text: data.original_text || m.text,
              }
              if (data.poll_options) upd.poll_options = data.poll_options
              if (data.poll_question) upd.poll_question = data.poll_question
              return { ...m, ...upd }
            }))
          }

          if (data.type === 'delete_message') {
            const isWhatsappDelete = data.source === 'whatsapp'
            const waMessageId = String(data.message_id || '')
            const rawWaMessageId = waMessageId.startsWith('wa_') ? waMessageId.slice(3) : waMessageId
            o.setMessages((prev) => prev.map((m) =>
              (
                isWhatsappDelete
                  ? (String(m.id) === waMessageId || String(m.id) === rawWaMessageId || `wa_${String(m.id)}` === waMessageId)
                  : m.tg_message_id === data.tg_message_id
              )
                ? { ...m, is_deleted: true, deleted_at: data.deleted_at, deleted_by_peer_name: data.deleted_by || '' }
                : m,
            ))
          }

          if (data.type === 'reaction_update' || data.type === 'messenger_reaction_update') {
            const isWhatsappReaction = data.source === 'whatsapp'
            const waMessageId = String(data.message_id || '')
            const rawWaMessageId = waMessageId.startsWith('wa_') ? waMessageId.slice(3) : waMessageId
            const matchesReactionTarget = (m: ChatMessage) => {
              if (isWhatsappReaction) {
                return (
                  String(m.id) === waMessageId ||
                  String(m.id) === rawWaMessageId ||
                  `wa_${String(m.id)}` === waMessageId
                )
              }
              return m.tg_message_id === data.tg_message_id
            }
            o.setMessages((prev) => prev.map((m) =>
              matchesReactionTarget(m) ? { ...m, reactions: data.reactions || [] } : m,
            ))
            const dedup = o.wsDedupRef.current
            const reactDedupKey = !isWhatsappReaction && data.tg_message_id && data.tg_peer_id
              ? `react:${data.tg_message_id}:${data.tg_peer_id}` : ''
            const isReactDupe = !!(reactDedupKey && dedup?.has(reactDedupKey))
            if (reactDedupKey && !isReactDupe && dedup) {
              dedup.set(reactDedupKey, Date.now())
            }
            if (data.actor === 'peer' && data.client_id && !isReactDupe) {
              const clientId = data.client_id
              const isCurrentChat = clientId === o.selectedClientRef.current
              if (!isCurrentChat) {
                const peerReactions = (data.reactions || []).filter((r) => !r.chosen)
                const emoji = peerReactions.length > 0
                  ? peerReactions.map((r) => r.emoji).join(' ')
                  : data.reactions?.[0]?.emoji || '👍'
                const contact = o.contactsRef.current?.find((c) => c.client_id === clientId)
                const senderDisplay = resolveContactDisplay(contact || {
                  full_name: data.client_name,
                  phone: data.phone,
                })
                const sender = senderDisplay.name || 'Клієнт'
                const reactedMsg = o.messagesRef.current?.find(matchesReactionTarget)
                const { targetLabel, preview } = buildReactionTargetPreview(data, sender, reactedMsg)
                const acctLabel = data.account_label || o.accounts.find((a) => a.id === data.account_id)?.label || ''
                if (data.account_id && o.isPopupEnabled(data.account_id)) {
                  showNotification(`${sender} → ${acctLabel} відреагував(ла) ${emoji}`, `На ${targetLabel}: ${preview}`)
                }
                o.addToast(
                  clientId,
                  data.account_id || '',
                  sender,
                  acctLabel,
                  `Відреагував(ла) ${emoji} · На ${targetLabel}: ${preview}`,
                  false,
                  '',
                )
                if (data.account_id) {
                  o.playNotifSound(data.account_id)
                }
              }
            }
          }

          if (data.type === 'pin_update') {
            // Peer pinned/unpinned a message. Flip is_pinned for matching message
            // in the currently loaded list. If `action === 'pin'` also clear
            // any previous pin in the same chat (Telegram single-pin semantics).
            const tgMsgId = data.tg_message_id
            const peerId = data.tg_peer_id
            const action = data.action
            if (tgMsgId && peerId && (action === 'pin' || action === 'unpin')) {
              o.setMessages((prev) => prev.map((m) => {
                if (m.tg_peer_id !== peerId) return m
                if (action === 'pin') {
                  // Only target message becomes pinned; others in same chat get unpinned
                  return { ...m, is_pinned: m.tg_message_id === tgMsgId }
                }
                // unpin: just clear is_pinned on the target
                if (m.tg_message_id === tgMsgId) return { ...m, is_pinned: false }
                return m
              }))
            }
          }

          if (data.type === 'read_outbox') {
            const maxId = data.max_id
            if (maxId) {
              o.setMessages((prev) => prev.map((m) =>
                m.direction === 'sent' && m.tg_message_id && m.tg_message_id <= maxId && !m.is_read
                  ? { ...m, is_read: true }
                  : m,
              ))
            }
          }

          if (data.type === 'tg_typing' || data.type === 'typing') {
            const clientId = data.client_id
            if (clientId) {
              o.setTypingIndicators((prev) => ({ ...prev, [clientId]: Date.now() }))
              const timers = o.typingClearTimersRef.current
              if (timers && timers[clientId]) {
                clearTimeout(timers[clientId])
              }
              const timer = setTimeout(() => {
                o.setTypingIndicators((prev) => {
                  if (prev[clientId] && Date.now() - prev[clientId] > 5500) {
                    const next = { ...prev }
                    delete next[clientId]
                    return next
                  }
                  return prev
                })
                if (timers) delete timers[clientId]
              }, 6000)
              if (timers) timers[clientId] = timer
            }
          }

          if (data.type === 'presence_update') {
            const peerId = data.tg_peer_id
            if (peerId) {
              o.setPeerPresence((prev) => ({
                ...prev,
                [peerId]: { status: data.status || 'unknown', was_online: data.was_online || null },
              }))
            }
          }

          if (data.type === 'voip_incoming' || data.type === 'voip_state_change' || data.type === 'voip_ended') {
            o.voipApplyWsEvent(data as VoipEvent)
          }
        } catch {
          // malformed frame — ignore
        }
      }

      ws.onerror = (e) => { console.log('[WS] error', e) }
      ws.onclose = (e) => {
        console.log('[WS] closed', e.code, e.reason)
        wsRef.current = null
        if (alive) reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    const pollTimer = setInterval(() => {
      const wsAlive = Date.now() - wsLastActivityRef.current < 30000
      if (wsAlive) return
      const o = optsRef.current
      if (o.selectedClientRef.current) {
        o.scheduleMessagesRefresh(o.selectedClientRef.current, false, 0)
      }
      o.loadContactsRef.current?.()
    }, 10000)

    return () => {
      alive = false
      clearTimeout(reconnectTimer)
      clearInterval(pollTimer)
      ws?.close(1000)
    }
  }, [opts.token, opts.authorized])

  return { wsRef, wsLastActivityRef }
}
