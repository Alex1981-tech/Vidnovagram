import type { Dispatch, SetStateAction } from 'react'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  expandedCallId: string | null
  setExpandedCallId: Dispatch<SetStateAction<string | null>>
  audioLoading: Record<string, boolean>
  audioBlobMap: Record<string, string>
  loadCallAudio: (callId: string, mediaFile: string) => Promise<void> | void
}

/**
 * Binotel call card inside the message timeline. Clicking the card loads & plays
 * the recording inline (audio element with autoplay). Direction colour-codes the
 * icon; missed calls get a badge.
 */
export function CallCardBubble({
  message: m,
  expandedCallId,
  setExpandedCallId,
  audioLoading,
  audioBlobMap,
  loadCallAudio,
}: Props) {
  const dur = m.duration_seconds || 0
  const mm = String(Math.floor(dur / 60)).padStart(2, '0')
  const ss = String(dur % 60).padStart(2, '0')
  const isIncoming = m.direction === 'incoming' || m.direction === 'received'
  const isExpanded = expandedCallId === m.call_id
  const canPlay = !!(m.has_media && m.media_file)
  const callId = m.call_id

  return (
    <div className="call-card-wrapper">
      <div
        className={`call-card${isExpanded ? ' has-audio-open' : ''}`}
        onClick={() => {
          if (canPlay && callId && m.media_file) loadCallAudio(callId, m.media_file)
        }}
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
          {canPlay && !isExpanded && callId && m.media_file && (
            <div className="call-card-audio-wrap">
              <button
                className="call-card-play-btn"
                onClick={(e) => { e.stopPropagation(); loadCallAudio(callId, m.media_file as string) }}
                disabled={audioLoading[callId]}
              >
                {audioLoading[callId] ? (
                  <div className="spinner-sm" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
                <span>Прослухати</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {isExpanded && callId && audioBlobMap[callId] && (
        <div className="call-card-audio-expanded">
          <audio
            controls
            autoPlay
            preload="auto"
            src={audioBlobMap[callId]}
            onEnded={() => setExpandedCallId(null)}
          />
          <button className="call-card-close-btn" onClick={(e) => { e.stopPropagation(); setExpandedCallId(null) }}>✕</button>
        </div>
      )}
    </div>
  )
}
