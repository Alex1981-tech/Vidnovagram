import { useCallback, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import { MSG_STORE, getJsonCache, putJsonCache } from '../cache'
import { saveMessages as saveMessagesToDb, loadCachedMessages } from '../db'
import { setReadTs } from '../utils/readTs'
import type { ChatMessage } from '../types'

// Monotonic request id so stale responses for a previously-selected client
// don't clobber the current chat state.
let messagesReqSeq = 0

// Per-cacheKey throttle for prefetchMessages so hover-jitter doesn't
// fire 100 fetches/second across the contact list.
const prefetchTimestamps = new Map<string, number>()

export interface UseMessagesOptions {
  token: string | undefined
  account: string
  onUnauthorized: () => void
  chatContainerRef: React.RefObject<HTMLDivElement | null>
  chatEndRef: React.RefObject<HTMLDivElement | null>
  scrollPositionsRef: React.RefObject<Map<string, number>>
}

export interface MessagesController {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  msgCount: number
  msgCursor: string | null
  hasOlder: boolean
  loadingOlder: boolean
  clientName: string
  setClientName: React.Dispatch<React.SetStateAction<string>>
  clientPhone: string
  setClientPhone: React.Dispatch<React.SetStateAction<string>>
  clientLinkedPhones: { id: string; phone: string }[]
  isPlaceholder: boolean
  setIsPlaceholder: React.Dispatch<React.SetStateAction<boolean>>
  setHasOlder: React.Dispatch<React.SetStateAction<boolean>>
  setMsgCursor: React.Dispatch<React.SetStateAction<string | null>>
  loadMessages: (clientId: string, scrollToEnd?: boolean) => Promise<void>
  /**
   * Background prefetch: fetches the chat from the server and stores it
   * in the IndexedDB cache without touching React state. Wired to
   * contact-row hover so a click opens instantly from cache.
   */
  prefetchMessages: (clientId: string) => Promise<void>
  loadOlderMessages: (selectedClient: string) => Promise<void>
}

/**
 * Current-chat messages list: cache-first load, pagination through older
 * history, scroll-position restoration. Also owns the metadata that moves
 * with the open chat (clientName/Phone/LinkedPhones/isPlaceholder).
 *
 * DOM refs (chatContainer, chatEnd, scrollPositions) are supplied by App
 * because the JSX that owns them still lives there.
 */
export function useMessages(opts: UseMessagesOptions): MessagesController {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [msgCount, setMsgCount] = useState(0)
  const [msgCursor, setMsgCursor] = useState<string | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientLinkedPhones, setClientLinkedPhones] = useState<{ id: string; phone: string }[]>([])
  const [isPlaceholder, setIsPlaceholder] = useState(false)

  const { token, account, onUnauthorized, chatContainerRef, chatEndRef, scrollPositionsRef } = opts

  const loadMessages = useCallback(async (clientId: string, scrollToEnd = true) => {
    if (!token) return
    const cacheKey = `${clientId}_${account || 'all'}`
    const reqId = ++messagesReqSeq
    const requestedClient = clientId
    const requestedAccount = account

    // Phase 0: instant cache for the initial open.
    // Prefer SQLite (full history) over the legacy IndexedDB blob,
    // but fall back when SQLite is unavailable (browser preview).
    if (scrollToEnd) {
      const sqliteMsgs = await loadCachedMessages(clientId, account || '', 500)
      const cached = sqliteMsgs.length > 0
        ? { messages: sqliteMsgs, count: sqliteMsgs.length, client_name: '', client_phone: '', next_cursor: null as string | null }
        : await getJsonCache<{
            messages: ChatMessage[]
            count: number
            client_name: string
            client_phone: string
            next_cursor?: string | null
          }>(MSG_STORE, cacheKey)
      if (cached && cached.messages.length > 0 && reqId === messagesReqSeq) {
        setMessages(cached.messages)
        setMsgCount(cached.count)
        setMsgCursor(cached.next_cursor ?? null)
        setHasOlder(!!cached.next_cursor)
        setClientName(cached.client_name || '')
        setClientPhone(cached.client_phone || '')
        const savedPos = scrollPositionsRef.current?.get(clientId)
        if (savedPos !== undefined) {
          setTimeout(() => {
            if (chatContainerRef.current) chatContainerRef.current.scrollTop = savedPos
          }, 30)
        } else {
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 30)
        }
      }
    }

    try {
      const params = new URLSearchParams({ per_page: '200' })
      if (account) params.set('account', account)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${clientId}/messages/?${params}`, token)
      if (reqId !== messagesReqSeq || requestedClient !== clientId || requestedAccount !== account) return
      if (resp.status === 401) {
        onUnauthorized()
        return
      }
      if (!resp.ok) return

      const data = await resp.json()
      if (reqId !== messagesReqSeq || requestedClient !== clientId || requestedAccount !== account) return
      const msgs: ChatMessage[] = data.results || []
      setMessages(prev => {
        // Avoid an unnecessary rerender during polling when the tail ID matches.
        if (!scrollToEnd && prev.length === msgs.length && prev.length > 0
            && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id) {
          return prev
        }
        return msgs
      })
      setMsgCount(data.count || msgs.length)
      setMsgCursor(data.next_cursor ?? null)
      setHasOlder(!!data.next_cursor || !!data.has_more)
      setClientName(data.client_name || '')
      setClientPhone(data.client_phone || '')
      setClientLinkedPhones(data.linked_phones || [])
      setIsPlaceholder(data.is_placeholder || false)
      if (msgs.length > 0) {
        setReadTs(clientId, msgs[msgs.length - 1].message_date, account)
      }
      if (scrollToEnd) {
        const savedPos = scrollPositionsRef.current?.get(clientId)
        if (savedPos !== undefined) {
          scrollPositionsRef.current?.delete(clientId)
          setTimeout(() => {
            if (chatContainerRef.current) chatContainerRef.current.scrollTop = savedPos
          }, 50)
          setTimeout(() => {
            if (chatContainerRef.current) chatContainerRef.current.scrollTop = savedPos
          }, 300)
        } else {
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 300)
        }
      }
      putJsonCache(MSG_STORE, cacheKey, {
        messages: msgs,
        count: data.count || msgs.length,
        client_name: data.client_name || '',
        client_phone: data.client_phone || '',
        next_cursor: data.next_cursor ?? null,
      })
      // Persistent SQLite cache for full history + future search.
      // Channel detection — TG accounts in opts.account are the
      // default; the WS layer flags WA/Business via the message
      // payload, so we can leave 'tg' as the safe default for
      // messages produced by /telegram/contacts/{id}/messages/.
      saveMessagesToDb(clientId, account || '', 'tg', msgs)
    } catch (e) {
      console.error('Messages:', e)
    }
  }, [token, account, onUnauthorized, chatContainerRef, chatEndRef, scrollPositionsRef])

  // Module-level dedup cache: same client prefetched within last 30s
  // shouldn't refire (e.g. mouse jittering across rows).
  const prefetchMessages = useCallback(async (clientId: string) => {
    if (!token || !clientId) return
    const cacheKey = `${clientId}_${account || 'all'}`
    const last = prefetchTimestamps.get(cacheKey) || 0
    if (Date.now() - last < 30_000) return
    prefetchTimestamps.set(cacheKey, Date.now())
    try {
      const params = new URLSearchParams({ per_page: '200' })
      if (account) params.set('account', account)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${clientId}/messages/?${params}`, token)
      if (!resp.ok) return
      const data = await resp.json()
      const msgs: ChatMessage[] = data.results || []
      // Persist directly — no React state, no scroll, no readTs.
      putJsonCache(MSG_STORE, cacheKey, {
        messages: msgs,
        count: data.count || msgs.length,
        client_name: data.client_name || '',
        client_phone: data.client_phone || '',
        next_cursor: data.next_cursor ?? null,
      })
      saveMessagesToDb(clientId, account || '', 'tg', msgs)
    } catch {
      // best-effort
    }
  }, [token, account])

  const loadOlderMessages = useCallback(async (selectedClient: string) => {
    if (!token || !selectedClient || loadingOlder || !hasOlder || !msgCursor) return
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams({ per_page: '100', before: msgCursor })
      if (account) params.set('account', account)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/messages/?${params}`, token)
      if (resp.ok) {
        const data = await resp.json()
        const older: ChatMessage[] = data.results || []
        if (older.length > 0) {
          const el = chatContainerRef.current
          const prevScrollHeight = el ? el.scrollHeight : 0
          const prevScrollTop = el ? el.scrollTop : 0
          setMessages(prev => [...older, ...prev])
          setMsgCursor(data.next_cursor ?? null)
          setHasOlder(!!data.next_cursor || !!data.has_more)
          requestAnimationFrame(() => {
            if (el) {
              const newScrollHeight = el.scrollHeight
              el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight)
            }
          })
        } else {
          setHasOlder(false)
          setMsgCursor(null)
        }
      }
    } catch (e) {
      console.error('Older messages:', e)
    }
    setLoadingOlder(false)
  }, [token, account, msgCursor, loadingOlder, hasOlder, chatContainerRef])

  return {
    messages,
    setMessages,
    msgCount,
    msgCursor,
    hasOlder,
    loadingOlder,
    clientName,
    setClientName,
    clientPhone,
    setClientPhone,
    clientLinkedPhones,
    isPlaceholder,
    setIsPlaceholder,
    setHasOlder,
    setMsgCursor,
    loadMessages,
    prefetchMessages,
    loadOlderMessages,
  }
}
