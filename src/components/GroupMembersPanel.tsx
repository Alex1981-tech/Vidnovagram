import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../constants'

interface Member {
  user_id: number
  first_name: string
  last_name: string
  name: string
  username: string
  phone: string
  is_bot: boolean
  is_deleted: boolean
  role: 'creator' | 'admin' | 'member' | 'left'
}

interface Props {
  accountId: string
  peerId: number | string
  token: string
  open: boolean
}

const ROLE_LABEL: Record<Member['role'], string> = {
  creator: 'власник',
  admin: 'адмін',
  member: '',
  left: 'вийшов',
}

export function GroupMembersPanel({ accountId, peerId, token, open }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open || !accountId || !peerId || !token) return
    let cancelled = false
    setLoading(true)
    setError('')
    const url = `${API_BASE}/api/telegram/group-members/?account_id=${encodeURIComponent(accountId)}&peer_id=${peerId}&limit=200`
    fetch(url, { headers: { Authorization: `Token ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        setMembers(data.members || [])
        setCount(data.count || 0)
      })
      .catch(e => { if (!cancelled) setError(e.message || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, accountId, peerId, token])

  const filtered = useMemo(() => {
    if (!members) return []
    const q = query.trim().toLowerCase()
    const sorted = [...members].sort((a, b) => {
      const rank = (r: Member['role']) => r === 'creator' ? 0 : r === 'admin' ? 1 : r === 'member' ? 2 : 3
      const rd = rank(a.role) - rank(b.role)
      if (rd !== 0) return rd
      return (a.name || a.username).localeCompare(b.name || b.username)
    })
    if (!q) return sorted
    return sorted.filter(m =>
      (m.name || '').toLowerCase().includes(q)
      || (m.username || '').toLowerCase().includes(q)
      || (m.phone || '').includes(q)
    )
  }, [members, query])

  if (!open) return null

  return (
    <div className="group-members-panel">
      <div className="group-members-header">
        <span className="group-members-title">Учасники</span>
        <span className="group-members-count">
          {count > 0 ? count : (members?.length ?? 0)}
        </span>
      </div>
      {members && members.length > 10 && (
        <input
          className="group-members-search"
          type="text"
          placeholder="Пошук учасника..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}
      {loading && <div className="group-members-empty">Завантаження...</div>}
      {error && <div className="group-members-empty error">{error}</div>}
      {!loading && !error && members && filtered.length === 0 && (
        <div className="group-members-empty">Нікого не знайдено</div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <ul className="group-members-list">
          {filtered.map(m => {
            const display = m.name || (m.username ? `@${m.username}` : `User ${m.user_id}`)
            const initial = (display || '?')[0].toUpperCase()
            const roleLabel = ROLE_LABEL[m.role]
            return (
              <li key={m.user_id} className="group-members-row">
                <div className={`group-members-avatar role-${m.role}`}>{initial}</div>
                <div className="group-members-info">
                  <div className="group-members-name">
                    {display}
                    {m.is_bot && <span className="group-members-badge bot">bot</span>}
                    {roleLabel && <span className={`group-members-badge role-${m.role}`}>{roleLabel}</span>}
                  </div>
                  {m.username && m.name && (
                    <div className="group-members-sub">@{m.username}</div>
                  )}
                  {m.phone && (
                    <div className="group-members-sub">+{m.phone}</div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
