import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ChatMessage } from '../types'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'
import { CallAudioPlayer } from './CallAudioPlayer'

interface CallTranscriptSegment {
  speaker?: string
  text?: string
  start?: number
  end?: number
}

interface CallDetail {
  id: string
  duration_seconds: number
  audio_url: string
  has_audio: boolean
  has_transcription: boolean
  transcription: {
    full_text: string
    segments: CallTranscriptSegment[]
    language: string
  } | null
  operator_name: string
  client_name: string
}

interface Props {
  message: ChatMessage
  /** Lifted "accordion" state — only one call panel can be open at a time. */
  expandedCallId: string | null
  setExpandedCallId: Dispatch<SetStateAction<string | null>>
  /** VG token — used to fetch transcription + load authed audio blob. */
  token: string | undefined
}

function formatSpeakerLabel(speaker: string | undefined) {
  const s = (speaker || '').toLowerCase()
  if (s.includes('operator') || s.includes('оператор')) return { label: 'Оператор', cls: 'operator' }
  if (s.includes('client') || s.includes('клієнт') || s.includes('customer')) return { label: 'Клієнт', cls: 'client' }
  return { label: speaker || '—', cls: '' }
}

function fmtTime(s?: number) {
  if (!Number.isFinite(s) || s == null || s < 0) return ''
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

/**
 * Binotel call card in the chat timeline.
 *
 * Collapsed: summary (direction, operator, duration). Clicking the card
 * toggles an inline expand panel that contains:
 *   - a custom CallAudioPlayer (no autoplay — user presses Play),
 *   - the transcription with Operator (blue) / Client (emerald) colour-coding,
 *   - an empty state when the call isn't processed yet.
 *
 * Transcription data is fetched from /api/messenger/calls/{call_id}/ on first
 * expand and cached in a module-level Map, so re-opening the same card is
 * instant and switching between chats doesn't refetch.
 */
const detailCache = new Map<string, CallDetail>()

export function CallCardBubble({
  message: m,
  expandedCallId,
  setExpandedCallId,
  token,
}: Props) {
  const callId = m.call_id || ''
  const isOpen = expandedCallId === callId
  const dur = m.duration_seconds || 0
  const mm = String(Math.floor(dur / 60)).padStart(2, '0')
  const ss = String(dur % 60).padStart(2, '0')
  const isIncoming = m.direction === 'incoming' || m.direction === 'received'

  const [detail, setDetail] = useState<CallDetail | null>(() =>
    callId ? detailCache.get(callId) || null : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fetchedRef = useRef(false)

  // Fetch on first expand; cache indefinitely (transcription rarely changes).
  useEffect(() => {
    if (!isOpen || !callId || !token) return
    if (fetchedRef.current) return
    const cached = detailCache.get(callId)
    if (cached) {
      setDetail(cached)
      fetchedRef.current = true
      return
    }
    fetchedRef.current = true
    setLoading(true)
    setError('')
    authFetch(`${API_BASE}/messenger/calls/${callId}/`, token)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CallDetail) => {
        detailCache.set(callId, data)
        setDetail(data)
      })
      .catch((err) => {
        console.warn('[CallCardBubble] fetch failed:', err)
        setError('Не вдалося завантажити дані дзвінка')
      })
      .finally(() => setLoading(false))
  }, [isOpen, callId, token])

  const toggle = () => {
    if (!callId) return
    setExpandedCallId(prev => (prev === callId ? null : callId))
  }

  const segments = detail?.transcription?.segments || []
  const hasTranscription = !!detail?.has_transcription && segments.length > 0
  const audioUrl = detail?.audio_url || ''
  // Duration hint: prefer server-reported, fallback to the message's own.
  const durationHint = detail?.duration_seconds || dur

  return (
    <div className="call-card-wrapper">
      <div
        className={`call-card expandable${isOpen ? ' has-audio-open' : ''}`}
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <div className="call-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isIncoming ? '#22c55e' : '#3b82f6'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
          </svg>
        </div>
        <div className="call-card-body">
          <div className="call-card-header">
            <span className="call-card-label">Бінотел</span>
            <span className="call-card-time">
              {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="call-card-details">
            <span className="call-card-direction">{isIncoming ? 'Вхідний' : 'Вихідний'}</span>
            {m.operator_name && <span className="call-card-operator">{m.operator_name}</span>}
            <span className="call-card-duration">{mm}:{ss}</span>
            {m.disposition && m.disposition !== 'ANSWER' && (
              <span className="call-card-missed">Пропущений</span>
            )}
          </div>
        </div>
        <span className={`call-card-chevron${isOpen ? ' open' : ''}`} aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </div>

      {/* Accordion-style smooth expand (grid-template-rows 0fr → 1fr) */}
      <div className={`call-card-expand-wrap${isOpen ? ' open' : ''}`}>
        <div className="call-card-expand">
          <div className="call-card-expand-inner">
            {loading && (
              <div className="call-card-loader">
                <div className="spinner-sm" />
                <span>Завантаження…</span>
              </div>
            )}
            {error && !loading && (
              <div className="call-card-empty">{error}</div>
            )}
            {!loading && !error && detail && (
              <>
                {/* Always show the player when audio exists. */}
                {audioUrl ? (
                  <CallAudioPlayer src={audioUrl} hintedDuration={durationHint} />
                ) : (
                  <div className="call-card-empty">
                    Аудіозапис недоступний
                  </div>
                )}

                {/* Transcription or empty-state — always rendered below the player. */}
                {hasTranscription ? (
                  <div className="call-card-transcript">
                    {segments.map((seg, idx) => {
                      const { label, cls } = formatSpeakerLabel(seg.speaker)
                      const tt = fmtTime(seg.start)
                      return (
                        <div key={idx} className={`call-card-transcript-segment ${cls}`}>
                          <span className="call-card-transcript-speaker">{label}</span>
                          <span className="call-card-transcript-text">{seg.text || ''}</span>
                          {tt && <span className="call-card-transcript-time">{tt}</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="call-card-empty">
                    Дзвінок ще не оброблений системою — транскрипція недоступна.{' '}
                    {audioUrl ? 'Можете прослухати запис вище.' : ''}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
