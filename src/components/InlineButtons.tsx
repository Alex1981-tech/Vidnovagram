import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import type { ChatMessage } from '../types'

interface InlineButton {
  type?: string
  text: string
  url?: string
  data?: string
}

interface Props {
  message: ChatMessage
  selectedAccount: string
  token: string
  shellOpen: (url: string) => Promise<void>
}

/**
 * Bot inline keyboard below a message. Three button types:
 *  - `url` / `web_app` — opens external URL via shellOpen
 *  - `callback` — POSTs `account_id + peer_id + msg_id + data` to backend;
 *    backend relays to Telegram and returns optional `message` (with `alert`) or `url`
 */
export function InlineButtons({ message: m, selectedAccount, token, shellOpen }: Props) {
  const rows = m.reply_markup as unknown as InlineButton[][] | undefined
  if (!Array.isArray(rows) || rows.length === 0) return null
  if (!rows.every(Array.isArray)) return null

  return (
    <div className="msg-inline-keyboard">
      {rows.map((row, ri) => (
        <div key={ri} className="msg-inline-row">
          {row.map((btn, bi) => (
            <button
              key={bi}
              className={`msg-inline-btn${btn.type === 'url' || btn.type === 'web_app' ? ' msg-inline-btn-url' : ''}`}
              onClick={async () => {
                if ((btn.type === 'url' || btn.type === 'web_app') && btn.url) {
                  shellOpen(btn.url)
                } else if (btn.type === 'callback' && selectedAccount) {
                  try {
                    const res = await authFetch(`${API_BASE}/telegram/click-inline-button/`, token, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        account_id: selectedAccount,
                        peer_id: m.tg_peer_id,
                        msg_id: m.tg_message_id,
                        data: btn.data,
                      }),
                    })
                    if (res.ok) {
                      const result = await res.json()
                      if (result.message && result.alert) alert(result.message)
                      if (result.url) shellOpen(result.url)
                    }
                  } catch (e) { console.error('Inline button click failed:', e) }
                }
              }}
            >
              {(btn.type === 'url' || btn.type === 'web_app') && <span className="inline-btn-icon">↗</span>}
              {btn.text}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
