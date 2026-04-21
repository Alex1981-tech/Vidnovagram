import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'

interface ClientRow {
  id: string
  phone: string
  full_name: string
}

interface Props {
  open: boolean
  onClose: () => void
  token: string
  accountId: string
  accountLabel: string
  onStarted: (clientId: string) => void
}

/** "New Viber chat" modal: search client in DB → write text → send via business_send. */
export function ViberNewChatModal({ open, onClose, token, accountId, accountLabel, onStarted }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientRow[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<ClientRow | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setPicked(null); setText(''); setError(''); setSending(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || picked) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await authFetch(`${API_BASE}/clients/?search=${encodeURIComponent(q)}&page_size=20`, token)
        if (r.ok) {
          const data = await r.json()
          setResults((data.results || []).map((c: { id: string; phone: string; full_name: string }) =>
            ({ id: c.id, phone: c.phone, full_name: c.full_name })))
        }
      } catch { /* ignore */ }
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open, picked, token])

  const send = useCallback(async () => {
    if (!picked || !text.trim() || sending) return
    setSending(true); setError('')
    try {
      const r = await authFetch(`${API_BASE}/business/send/`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, client_id: picked.id, text: text.trim() }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || `HTTP ${r.status}`)
        setSending(false)
        return
      }
      onStarted(picked.id)
      onClose()
    } catch (e) {
      setError(String(e))
      setSending(false)
    }
  }, [accountId, picked, text, sending, token, onStarted, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 420 }}>
        <h3>Новий Viber-чат — {accountLabel}</h3>
        {!picked ? (
          <>
            <input
              className="forward-modal-search"
              placeholder="Пошук клієнта за ПІБ або номером…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            <div className="add-contact-suggestions" style={{ position: 'static', maxHeight: 280, overflowY: 'auto' }}>
              {searching && <div className="add-contact-suggestion-item">Пошук…</div>}
              {!searching && results.length === 0 && query.trim().length >= 2 && (
                <div className="add-contact-suggestion-item">Нічого не знайдено</div>
              )}
              {results.map(c => (
                <div
                  key={c.id}
                  className="add-contact-suggestion-item"
                  onClick={() => setPicked(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="suggestion-name">{c.full_name || '—'}</span>
                  <span className="suggestion-phone">{c.phone}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="add-contact-result ok" style={{ marginBottom: 8 }}>
              {picked.full_name || '—'} · {picked.phone}
              <button
                className="tpl-btn-secondary"
                onClick={() => setPicked(null)}
                style={{ marginLeft: 12, padding: '2px 8px', fontSize: 12 }}
              >
                Змінити
              </button>
            </div>
            <textarea
              className="forward-modal-search"
              placeholder="Текст повідомлення…"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              style={{ resize: 'vertical' }}
              autoFocus
            />
            {error && <div className="add-contact-result warn">{error}</div>}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
          <button
            className="tpl-btn-primary"
            onClick={send}
            disabled={!picked || !text.trim() || sending}
          >
            {sending ? 'Надсилання…' : 'Надіслати'}
          </button>
        </div>
      </div>
    </div>
  )
}
