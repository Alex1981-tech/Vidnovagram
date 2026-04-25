import { useEffect, useState } from 'react'
import type { ChatMessage } from '../types'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'

/** Consultation-lead card. Patient files «Запис на консультацію»
 *  from the mini-app → backend creates a 🆕 BusinessMessage + a
 *  ConsultationLead companion. We render that pair here:
 *    OPEN: live mm:ss counter + «ЛІД прийнято» button.
 *    ACCEPTED: frozen counter + who took it + how fast.
 *
 *  Card colours flag the wait state — amber by default, rose past
 *  60 s (operator's slowness), emerald once accepted. */
type Lead = NonNullable<ChatMessage['lead']>

const METHOD_DEFS: Record<string, { glyph: string; label: string }> = {
  call:    { glyph: '📞', label: 'Зателефонувати' },
  message: { glyph: '💬', label: 'Написати в чаті' },
}

function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function LeadCard({ message, token }: { message: ChatMessage; token?: string }) {
  // Local copy so the optimistic-accept render is instant — backend
  // round-trip + WS broadcast catches up shortly after.
  const [lead, setLead] = useState<Lead>(message.lead!)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Sync from props if the upstream message updates (WS push or refetch).
  useEffect(() => { setLead(message.lead!) }, [message.lead])

  // Tick the counter every second while the lead is still open.
  useEffect(() => {
    if (lead.status !== 'open') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [lead.status])

  // Server hands us the moment the response-time clock should start —
  // created_at during work hours, next 09:00 Kyiv otherwise. Until that
  // instant the card shows «Очікує робочого часу» instead of a counter
  // so operators don't get penalised for after-hours requests.
  const workStart = lead.work_started_at
    ? new Date(lead.work_started_at).getTime()
    : (lead.created_at ? new Date(lead.created_at).getTime() : Date.now())
  const isAccepted = lead.status === 'accepted'
  const isWaitingForWork = !isAccepted && now < workStart
  const elapsed = isAccepted && lead.seconds_to_accept != null
    ? lead.seconds_to_accept
    : isWaitingForWork
      ? 0
      : Math.max(0, Math.floor((now - workStart) / 1000))

  const isStale = !isAccepted && !isWaitingForWork && elapsed > 60

  const onAccept = async () => {
    if (accepting || isAccepted || !token) return
    setAccepting(true); setError(null)
    try {
      const r = await authFetch(`${API_BASE}/messenger/leads/${lead.id}/accept/`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json() as { ok: boolean; lead: Lead }
      setLead(data.lead)
    } catch (e) {
      setError('Не вдалося прийняти')
      console.warn('[LeadCard] accept failed:', e)
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="lead-card-wrapper">
      <div className={`lead-card ${isAccepted ? 'accepted' : isStale ? 'stale' : isWaitingForWork ? 'waiting' : 'open'}`}>
        <div className="lead-card-head">
          <span className="lead-card-icon" aria-hidden>✨</span>
          <span className="lead-card-title">Запит на консультацію</span>
          <span className={`lead-card-timer ${isAccepted ? 'accepted' : isStale ? 'stale' : isWaitingForWork ? 'waiting' : 'open'}`}>
            {isWaitingForWork ? '🌙 Поза робочим часом' : `⏱ ${fmtDuration(elapsed)}`}
          </span>
        </div>

        {lead.contact_methods.length > 0 && (
          <div className="lead-card-methods">
            {lead.contact_methods.map(m => {
              const def = METHOD_DEFS[m]
              if (!def) return null
              return (
                <span key={m} className="lead-card-method">
                  <span aria-hidden>{def.glyph}</span> {def.label}
                </span>
              )
            })}
          </div>
        )}

        {lead.wishes && (
          <div className="lead-card-wishes">{lead.wishes}</div>
        )}

        <div className="lead-card-foot">
          {isAccepted ? (
            <div className="lead-card-accepted">
              ✓ Прийнято{lead.accepted_by_name ? <> оператором <strong>{lead.accepted_by_name}</strong></> : null}
              {lead.seconds_to_accept != null && (
                <span className="lead-card-speed"> · за {fmtDuration(lead.seconds_to_accept)}</span>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="lead-card-accept-btn"
              onClick={onAccept}
              disabled={accepting || !token}
            >
              {accepting ? 'Приймаємо…' : 'ЛІД прийнято'}
            </button>
          )}
        </div>
        {error && <div className="lead-card-error">{error}</div>}
      </div>
    </div>
  )
}
