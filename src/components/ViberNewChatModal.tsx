import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import { ViberIcon } from './icons'

interface ClientRow {
  id: string
  phone: string
  full_name: string
}

interface Props {
  open: boolean
  onClose: () => void
  token: string
  accountLabel: string
  onPick: (clientId: string) => void
}

/**
 * "New Viber chat" modal: search clients in our DB and pick one to open a chat.
 * Highlights contacts that have an existing Viber conversation (known-reachable).
 * No text-compose here — after pick we close the modal and open the normal chat
 * view, where the user writes exactly like in any other conversation.
 */
export function ViberNewChatModal({ open, onClose, token, accountLabel, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientRow[]>([])
  const [hasViber, setHasViber] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setHasViber(new Set()); setSearching(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); setHasViber(new Set()); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await authFetch(`${API_BASE}/clients/?search=${encodeURIComponent(q)}&page_size=20`, token)
        if (!r.ok) { setResults([]); setSearching(false); return }
        const data = await r.json()
        const list: ClientRow[] = (data.results || []).map((c: { id: string; phone: string; full_name: string }) =>
          ({ id: c.id, phone: c.phone, full_name: c.full_name }))
        setResults(list)
        setSearching(false)

        if (list.length === 0) { setHasViber(new Set()); return }
        // Check which of these clients already have a Viber conversation.
        try {
          const chk = await authFetch(`${API_BASE}/business/client-has-viber/`, token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_ids: list.map(c => c.id) }),
          })
          if (chk.ok) {
            const d = await chk.json()
            setHasViber(new Set(d.has_viber || []))
          }
        } catch { /* ignore — badge just won't show */ }
      } catch {
        setResults([])
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, open, token])

  const pick = useCallback((clientId: string) => {
    onPick(clientId)
    onClose()
  }, [onPick, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 520 }}>
        <h3>Новий Viber-чат — {accountLabel}</h3>
        <input
          className="forward-modal-search"
          placeholder="Пошук клієнта за ПІБ або номером…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="viber-new-chat-list">
          {searching && <div className="viber-new-chat-hint">Пошук…</div>}
          {!searching && query.trim().length < 2 && (
            <div className="viber-new-chat-hint">Введіть щонайменше 2 символи</div>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="viber-new-chat-hint">Нічого не знайдено</div>
          )}
          {results.map(c => {
            const known = hasViber.has(c.id)
            const initial = (c.full_name || c.phone || '?').trim()[0]?.toUpperCase() || '?'
            return (
              <div
                key={c.id}
                className="contact viber-pick-row"
                onClick={() => pick(c.id)}
              >
                <div className="avatar">
                  <span>{initial}</span>
                </div>
                <div className="contact-body">
                  <div className="contact-row">
                    <span className="contact-name">{c.full_name || '—'}</span>
                    {known && (
                      <span className="viber-has-badge" title="Вже спілкувались у Viber">
                        <ViberIcon size={12} />
                      </span>
                    )}
                  </div>
                  <div className="contact-meta">
                    <span className="contact-phone">{c.phone}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="tpl-btn-secondary" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  )
}
