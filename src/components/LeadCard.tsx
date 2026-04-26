import { useEffect, useRef, useState } from 'react'
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

/** Compact human-readable resume label — «о 09:00» if today, «завтра 09:00»
 *  if next day, otherwise full date so the operator immediately sees how
 *  long the clock will stay frozen (e.g. holiday spanning a week). */
function fmtResume(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
    const isTomorrow = d.toDateString() === tomorrow.toDateString()
    const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    if (sameDay)    return `о ${time}`
    if (isTomorrow) return `завтра ${time}`
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }) + ` ${time}`
  } catch {
    return ''
  }
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

  // Tick the counter every second while the lead is open AND the clinic
  // is currently within working hours. Outside hours the timer is frozen
  // server-side, no need to re-render.
  useEffect(() => {
    if (lead.status !== 'open' || !lead.in_work_hours_now) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [lead.status, lead.in_work_hours_now])

  // Server-driven work-time math: it's already counted only the seconds
  // that fell inside the clinic's open windows. While `in_work_hours_now`
  // is true the front ticks +1/sec on top of `work_seconds_elapsed`;
  // otherwise the timer freezes and we surface `next_work_resume_at`
  // («Очікує робочого часу до hh:mm»).
  const isAccepted = lead.status === 'accepted'
  const inHoursNow = !!lead.in_work_hours_now
  const baseSeconds = lead.work_seconds_elapsed ?? 0
  // Snapshot the wall-clock moment we received `baseSeconds` so we can
  // compute the live tick locally without re-fetching every second.
  const baseAtRef = useRef<number>(Date.now())
  useEffect(() => { baseAtRef.current = Date.now() }, [baseSeconds])
  const tickedSeconds = inHoursNow
    ? Math.max(0, Math.floor((now - baseAtRef.current) / 1000))
    : 0

  const elapsed = isAccepted && lead.seconds_to_accept != null
    ? lead.seconds_to_accept
    : baseSeconds + tickedSeconds
  const isWaitingForWork = !isAccepted && !inHoursNow
  const isStale = !isAccepted && inHoursNow && elapsed > 60

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
            {isWaitingForWork
              ? `🌙 ${lead.next_work_resume_at ? `Старт ${fmtResume(lead.next_work_resume_at)}` : 'Поза робочим часом'}`
              : `⏱ ${fmtDuration(elapsed)}`}
          </span>
        </div>

        {lead.source && (
          <div className="lead-card-source" title={lead.source}>
            <span aria-hidden>📄</span> Джерело: <strong>{lead.source}</strong>
          </div>
        )}

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
