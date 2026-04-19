import { useEffect, useRef } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import { showNotification } from '../utils/notifications'
import type { GmailAccount } from '../types'

interface GmailNewMessage {
  id: string
  account_id: string
  account_label: string
  subject: string
  sender: string
  snippet: string
  date: string
  has_attachments: boolean
}

export interface GmailNotificationsArgs {
  authorized: boolean
  token: string | undefined
  gmailAccounts: GmailAccount[]
  isPopupEnabled: (accountId: string) => boolean
  playNotifSound: (accountId: string) => void
  addToast: (clientId: string, accountId: string, sender: string, account: string, text: string, hasMedia: boolean, mediaType: string) => void
}

/**
 * Polls `/api/mail/new-messages/` every 60s for incoming Gmail. Fires
 * a desktop notification + in-app toast + sound per account setting.
 */
export function useGmailNotifications({
  authorized,
  token,
  gmailAccounts,
  isPopupEnabled,
  playNotifSound,
  addToast,
}: GmailNotificationsArgs): void {
  const gmailLastCheckRef = useRef<string>(new Date().toISOString())
  const gmailSeenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!authorized || !token || gmailAccounts.length === 0) return
    let alive = true

    const checkGmail = async () => {
      try {
        const since = gmailLastCheckRef.current
        const resp = await authFetch(
          `${API_BASE}/mail/new-messages/?since=${encodeURIComponent(since)}`,
          token,
        )
        if (!resp.ok || !alive) return
        const data: { results: GmailNewMessage[] } = await resp.json()
        if (!data.results.length) return

        gmailLastCheckRef.current = data.results[0].date

        for (const msg of data.results) {
          if (gmailSeenRef.current.has(msg.id)) continue
          gmailSeenRef.current.add(msg.id)

          const senderName = msg.sender.replace(/<[^>]+>/g, '').trim() || msg.sender
          const body = msg.subject || msg.snippet?.slice(0, 100) || ''

          if (isPopupEnabled(msg.account_id)) {
            showNotification(`📧 ${senderName}`, body)
          }
          addToast(
            msg.id,
            msg.account_id,
            senderName,
            msg.account_label || 'Gmail',
            body,
            msg.has_attachments,
            msg.has_attachments ? 'document' : '',
          )
          playNotifSound(msg.account_id)
        }

        if (gmailSeenRef.current.size > 200) {
          const arr = [...gmailSeenRef.current]
          gmailSeenRef.current = new Set(arr.slice(-100))
        }
      } catch {
        // ignore
      }
    }

    const initTimer = setTimeout(checkGmail, 5000)
    const pollTimer = setInterval(checkGmail, 60_000)

    return () => {
      alive = false
      clearTimeout(initTimer)
      clearInterval(pollTimer)
    }
  }, [authorized, token, gmailAccounts.length, isPopupEnabled, playNotifSound, addToast])
}
