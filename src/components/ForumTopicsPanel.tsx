import { useEffect, useState } from 'react'
import { API_BASE } from '../constants'

interface Topic {
  id: number
  title: string
  top_message: number
  unread_count: number
  closed: boolean
  pinned: boolean
}

interface Props {
  accountId: string
  peerId: number | string
  token: string
  open: boolean
  onJumpToMessage?: (messageId: number) => void
}

export function ForumTopicsPanel({ accountId, peerId, token, open, onJumpToMessage }: Props) {
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasForum, setHasForum] = useState(true)

  useEffect(() => {
    if (!open || !accountId || !peerId || !token) return
    let cancelled = false
    setLoading(true)
    const url = `${API_BASE}/api/telegram/forum-topics/?account_id=${encodeURIComponent(accountId)}&peer_id=${peerId}`
    fetch(url, { headers: { Authorization: `Token ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        if (data.forum === false) { setHasForum(false); setTopics([]); return }
        setHasForum(true)
        setTopics(data.topics || [])
      })
      .catch(() => { if (!cancelled) setHasForum(false) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, accountId, peerId, token])

  if (!open || !hasForum || (topics && topics.length === 0 && !loading)) return null

  return (
    <div className="forum-topics-panel">
      <div className="forum-topics-header">
        <span className="forum-topics-title">Теми форуму</span>
        {topics && <span className="forum-topics-count">{topics.length}</span>}
      </div>
      {loading && <div className="forum-topics-empty">Завантаження...</div>}
      {topics && topics.length > 0 && (
        <ul className="forum-topics-list">
          {topics.map(t => (
            <li
              key={t.id}
              className={`forum-topics-row${t.pinned ? ' pinned' : ''}${t.closed ? ' closed' : ''}`}
              onClick={() => onJumpToMessage?.(t.top_message)}
            >
              <span className="forum-topics-name">
                {t.pinned && <span className="forum-topics-pin">📌</span>}
                {t.title}
                {t.closed && <span className="forum-topics-badge">закрита</span>}
              </span>
              {t.unread_count > 0 && <span className="forum-topics-unread">{t.unread_count}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
