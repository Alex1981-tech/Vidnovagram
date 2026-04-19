import { PhoneIcon, PhoneOffIcon, MicIcon, MicOffIcon } from './icons'
import { formatCallDuration, type VoipController } from '../hooks/useVoipController'

/**
 * Three stacked pieces of VoIP UI — rendered together because they never
 * overlap state: at most one is visible at a time.
 *
 *  - `incomingCall && !activeCall`  → IncomingCallDialog
 *  - `activeCall && !callMinimized` → ActiveCallOverlay
 *  - `activeCall && callMinimized`  → MinimizedCallPill
 */
export function VoipOverlays({ voip }: { voip: VoipController }) {
  const {
    incomingCall,
    activeCall,
    callDuration,
    callMuted,
    callMinimized,
    callAudioState,
    callAudioError,
    answer,
    hangup,
    decline,
    toggleMute,
    setMinimized,
  } = voip

  return (
    <>
      {incomingCall && !activeCall && (
        <div className="voip-incoming-overlay">
          <div className="voip-incoming-card">
            <div className="voip-incoming-icon">📞</div>
            <div className="voip-incoming-info">
              <div className="voip-incoming-name">
                {incomingCall.peer_name || incomingCall.peer_phone || 'Невідомий'}
              </div>
              {incomingCall.peer_phone && (
                <div className="voip-incoming-phone">{incomingCall.peer_phone}</div>
              )}
              <div className="voip-incoming-account">{incomingCall.account_label || ''}</div>
            </div>
            <div className="voip-incoming-actions">
              <button className="voip-btn voip-btn-accept" onClick={answer} title="Прийняти">
                <PhoneIcon />
              </button>
              <button className="voip-btn voip-btn-decline" onClick={decline} title="Відхилити">
                <PhoneOffIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && !callMinimized && (
        <div className="voip-active-overlay">
          <div className="voip-active-card">
            <div className="voip-active-status">
              {activeCall.state === 'media_live'
                ? 'Аудіо підключено'
                : activeCall.state === 'media_connecting'
                  ? 'Підключення аудіо...'
                  : activeCall.state === 'media_failed'
                    ? 'Помилка аудіо'
                    : activeCall.state === 'connected'
                      ? callAudioState === 'streaming'
                        ? 'Розмова'
                        : callAudioState === 'connecting'
                          ? 'Підключення аудіо...'
                          : callAudioState === 'error'
                            ? 'Помилка аудіо'
                            : 'Розмова'
                      : activeCall.state === 'ringing'
                        ? 'Дзвонить...'
                        : activeCall.state === 'connecting'
                          ? "З'єднання..."
                          : activeCall.state}
            </div>
            <div className="voip-active-name">
              {activeCall.peer_name || activeCall.peer_phone || 'Абонент'}
            </div>
            {activeCall.peer_phone && (
              <div className="voip-active-phone">{activeCall.peer_phone}</div>
            )}
            {(callAudioError || activeCall.media_error) && (
              <div className="voip-active-phone">{callAudioError || activeCall.media_error}</div>
            )}
            <div className="voip-active-timer">{formatCallDuration(callDuration)}</div>
            <div className="voip-active-actions">
              <button
                className={`voip-btn voip-btn-mute ${callMuted ? 'voip-btn-muted' : ''}`}
                onClick={toggleMute}
                title={callMuted ? 'Увімкнути мікрофон' : 'Вимкнути мікрофон'}
              >
                {callMuted ? <MicOffIcon /> : <MicIcon />}
              </button>
              <button className="voip-btn voip-btn-hangup" onClick={hangup} title="Завершити">
                <PhoneOffIcon />
              </button>
              <button
                className="voip-btn voip-btn-minimize"
                onClick={() => setMinimized(true)}
                title="Мінімізувати"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && callMinimized && (
        <div className="voip-pill" onClick={() => setMinimized(false)}>
          <span className="voip-pill-dot" />
          <span className="voip-pill-name">
            {activeCall.peer_name || activeCall.peer_phone || 'Дзвінок'}
          </span>
          <span className="voip-pill-timer">{formatCallDuration(callDuration)}</span>
          <button
            className="voip-pill-hangup"
            onClick={e => {
              e.stopPropagation()
              hangup()
            }}
          >
            <PhoneOffIcon />
          </button>
        </div>
      )}
    </>
  )
}
