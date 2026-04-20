import type { Dispatch, RefObject, SetStateAction } from 'react'

interface VnoteState {
  src: string
  id: string | number
}

interface Props {
  state: VnoteState | null
  videoRef: RefObject<HTMLVideoElement | null>
  playing: boolean
  setPlaying: Dispatch<SetStateAction<boolean>>
  progress: number
  setProgress: Dispatch<SetStateAction<number>>
  onClose: () => void
}

/**
 * Fullscreen-ish video-note (кружок) viewer with seek bar and play/mute controls.
 */
export function VnoteModal({ state, videoRef, playing, setPlaying, progress, setProgress, onClose }: Props) {
  if (!state) return null

  const handleClose = () => { onClose(); setPlaying(false) }

  return (
    <div className="vnote-modal-overlay" onClick={handleClose}>
      <div className="vnote-modal" onClick={e => e.stopPropagation()}>
        <button className="vnote-modal-close" onClick={handleClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="vnote-modal-video">
          <video
            ref={videoRef}
            src={state.src}
            autoPlay
            className="vnote-modal-player"
            onTimeUpdate={e => {
              const v = e.target as HTMLVideoElement
              setProgress(v.duration ? v.currentTime / v.duration : 0)
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setProgress(1) }}
          />
        </div>
        <div
          className="vnote-modal-seek"
          onClick={e => {
            const v = videoRef.current
            if (!v || !v.duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            v.currentTime = pct * v.duration
          }}
        >
          <div className="vnote-modal-seek-fill" style={{ width: `${progress * 100}%` }} />
          <div className="vnote-modal-seek-thumb" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="vnote-modal-controls">
          <button
            className="vnote-modal-btn"
            onClick={() => {
              const v = videoRef.current
              if (!v) return
              v.paused ? v.play() : v.pause()
            }}
          >
            {playing ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            )}
          </button>
          <button
            className="vnote-modal-btn"
            onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
