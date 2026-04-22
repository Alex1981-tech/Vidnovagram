import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'

export interface PresenceViewer {
  user_id: number
  name: string
  is_typing: boolean
}

/** Key used in presenceByChat map — scopes by (account, client). */
export function presenceKey(accountId: string | null | undefined, clientId: string | null | undefined) {
  return `${accountId || ''}:${clientId || ''}`
}

/**
 * Heartbeat interval in ms. Must be strictly smaller than server TTL (30s)
 * plus jitter — 15s keeps a viewer "alive" even under laggy networks.
 */
const HEARTBEAT_MS = 15_000

/**
 * Debounce window for typing state. While actively typing, we resend
 * is_typing=true at most every TYPING_THROTTLE_MS; after TYPING_IDLE_MS
 * of no keystrokes we flip back to is_typing=false.
 */
const TYPING_THROTTLE_MS = 3_000
const TYPING_IDLE_MS = 5_000

export interface PresenceOptions {
  token: string | undefined
  /**
   * Currently open chat. Pass nulls when no chat is open — the hook
   * will cleanly stop any in-flight presence when this changes.
   */
  accountId: string | null
  clientId: string | null
  /**
   * Which backend permission bucket the account belongs to. Business
   * accounts (Viber/FB/IG/TG-bot) use "business"; TG accounts use "tg";
   * WA accounts use "wa". Anything else will fail access check.
   */
  accountType: 'tg' | 'wa' | 'business'
  /**
   * Current user's ID — used to filter self out of the viewers list
   * (the operator doesn't need to see themselves).
   */
  selfUserId: number | null
}

export interface PresenceController {
  /** Viewers for the currently-active chat, excluding self. */
  activeViewers: PresenceViewer[]
  /** Map keyed by `presenceKey(accountId, clientId)` — drives contact-list badges. */
  presenceByChat: Record<string, PresenceViewer[]>
  /**
   * Inbound WS event from server. Call this from the WebSocket handler
   * when `type === 'operator_presence'`.
   */
  applyWsUpdate: (accountId: string, clientId: string, viewers: PresenceViewer[]) => void
  /** Call on every keystroke in the message input. */
  notifyTyping: () => void
}

export function useOperatorPresence(opts: PresenceOptions): PresenceController {
  const { token, accountId, clientId, accountType, selfUserId } = opts

  const [presenceByChat, setPresenceByChat] = useState<Record<string, PresenceViewer[]>>({})
  const [activeViewers, setActiveViewers] = useState<PresenceViewer[]>([])

  // Latest values visible from async timers without adding them to deps.
  const tokenRef = useRef(token)
  const accountIdRef = useRef(accountId)
  const clientIdRef = useRef(clientId)
  const accountTypeRef = useRef(accountType)
  const isTypingRef = useRef(false)
  const typingLastSentAtRef = useRef(0)
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previousChatRef = useRef<{ accountId: string; clientId: string; accountType: string } | null>(null)

  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { accountIdRef.current = accountId }, [accountId])
  useEffect(() => { clientIdRef.current = clientId }, [clientId])
  useEffect(() => { accountTypeRef.current = accountType }, [accountType])

  // --- Active viewers derived from presenceByChat + current chat + self filter ---
  useEffect(() => {
    const key = presenceKey(accountId, clientId)
    const all = presenceByChat[key] || []
    const filtered = selfUserId
      ? all.filter(v => v.user_id !== selfUserId)
      : all
    setActiveViewers(filtered)
  }, [presenceByChat, accountId, clientId, selfUserId])

  // --- Low-level HTTP calls ---
  const post = useCallback(async (path: string, isTyping: boolean) => {
    const t = tokenRef.current
    const aid = accountIdRef.current
    const cid = clientIdRef.current
    const atype = accountTypeRef.current
    if (!t || !aid || !cid) return null
    try {
      const res = await authFetch(t, `${API_BASE}/presence/${path}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: aid,
          client_id: cid,
          account_type: atype,
          is_typing: isTyping,
        }),
      })
      if (!res.ok) return null
      const data = await res.json()
      const viewers: PresenceViewer[] = Array.isArray(data.viewers) ? data.viewers : []
      setPresenceByChat(prev => ({ ...prev, [presenceKey(aid, cid)]: viewers }))
      return viewers
    } catch {
      return null
    }
  }, [])

  // --- Chat-open/close lifecycle ---
  useEffect(() => {
    // Stop previous chat (if any).
    const prev = previousChatRef.current
    const needsStop = prev && (prev.accountId !== accountId || prev.clientId !== clientId)
    if (needsStop && prev) {
      const t = tokenRef.current
      if (t) {
        // Fire-and-forget — server also auto-expires in 30s.
        authFetch(t, `${API_BASE}/presence/stop/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: prev.accountId,
            client_id: prev.clientId,
            account_type: prev.accountType,
          }),
        }).catch(() => {})
      }
      // Locally wipe that chat's viewers so the UI doesn't show a stale "still there".
      setPresenceByChat(p => {
        const k = presenceKey(prev.accountId, prev.clientId)
        if (!(k in p)) return p
        const next = { ...p }
        delete next[k]
        return next
      })
    }

    // Reset typing state on chat switch.
    isTypingRef.current = false
    typingLastSentAtRef.current = 0
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current)
      typingIdleTimerRef.current = null
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }

    if (!token || !accountId || !clientId) {
      previousChatRef.current = null
      return
    }

    previousChatRef.current = { accountId, clientId, accountType }

    // Start + kick off heartbeat.
    post('start', false)
    heartbeatTimerRef.current = setInterval(() => {
      post('heartbeat', isTypingRef.current)
    }, HEARTBEAT_MS)

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = null
      }
    }
  }, [token, accountId, clientId, accountType, post])

  // --- On unmount / logout: stop current chat once ---
  useEffect(() => {
    return () => {
      const prev = previousChatRef.current
      const t = tokenRef.current
      if (!prev || !t) return
      authFetch(t, `${API_BASE}/presence/stop/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: prev.accountId,
          client_id: prev.clientId,
          account_type: prev.accountType,
        }),
      }).catch(() => {})
    }
  }, [])

  // --- Typing detection (called on every keystroke) ---
  const notifyTyping = useCallback(() => {
    if (!accountIdRef.current || !clientIdRef.current) return
    const now = Date.now()
    // Send typing=true at most once per TYPING_THROTTLE_MS.
    if (!isTypingRef.current || now - typingLastSentAtRef.current >= TYPING_THROTTLE_MS) {
      isTypingRef.current = true
      typingLastSentAtRef.current = now
      post('heartbeat', true)
    }
    // Restart idle timer — after TYPING_IDLE_MS without keystrokes, flip off.
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current)
    typingIdleTimerRef.current = setTimeout(() => {
      if (!isTypingRef.current) return
      isTypingRef.current = false
      post('heartbeat', false)
    }, TYPING_IDLE_MS)
  }, [post])

  // --- WS event application ---
  const applyWsUpdate = useCallback((aid: string, cid: string, viewers: PresenceViewer[]) => {
    setPresenceByChat(prev => {
      const key = presenceKey(aid, cid)
      // Empty viewers list → drop the key (keeps the map small).
      if (!viewers || viewers.length === 0) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: viewers }
    })
  }, [])

  return { activeViewers, presenceByChat, applyWsUpdate, notifyTyping }
}
