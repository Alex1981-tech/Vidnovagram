import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  /** Total duration in seconds — used before `<audio>` reports metadata. */
  hintedDuration?: number
}

/**
 * Audio player styled to match Vidnovagram's glass/oklch palette.
 *
 * Design intent:
 * - No autoplay. First Play click actually loads the audio (preload="none").
 * - Thin progress bar with click-to-seek + drag.
 * - Current / total time in mm:ss.
 * - Spinner while the first chunk buffers.
 */
export function CallAudioPlayer({ src, hintedDuration = 0 }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(hintedDuration)
  const [isDragging, setIsDragging] = useState(false)

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      return
    }
    setIsLoading(true)
    try {
      await audio.play()
    } catch (err) {
      console.warn('[CallAudioPlayer] play failed:', err)
      setIsLoading(false)
    }
  }

  // --- Seek helpers ---
  const seekTo = (clientX: number) => {
    const audio = audioRef.current
    const track = trackRef.current
    if (!audio || !track) return
    const rect = track.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const total = duration || audio.duration || hintedDuration
    if (total > 0) {
      audio.currentTime = pct * total
      setCurrentTime(pct * total)
    }
  }

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => seekTo(e.clientX)
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, duration])

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const total = duration || hintedDuration
  const progressPct = total > 0 ? (currentTime / total) * 100 : 0

  return (
    <div className="call-audio-player">
      <button
        type="button"
        className={`call-audio-btn${isPlaying ? ' playing' : ''}`}
        onClick={togglePlay}
        disabled={!src}
        aria-label={isPlaying ? 'Пауза' : 'Прослухати'}
        title={isPlaying ? 'Пауза' : 'Прослухати'}
      >
        {isLoading && !isPlaying ? (
          <div className="call-audio-spinner" />
        ) : isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z"/>
          </svg>
        )}
      </button>
      <div
        ref={trackRef}
        className="call-audio-track"
        onMouseDown={e => {
          setIsDragging(true)
          seekTo(e.clientX)
        }}
      >
        <div className="call-audio-track-fill" style={{ width: `${progressPct}%` }} />
        <div className="call-audio-track-knob" style={{ left: `${progressPct}%` }} />
      </div>
      <div className="call-audio-time">
        <span>{fmt(currentTime)}</span>
        <span className="call-audio-time-sep">/</span>
        <span>{fmt(total)}</span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onLoadedMetadata={e => {
          const d = (e.currentTarget as HTMLAudioElement).duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }}
        onPlay={() => { setIsPlaying(true); setIsLoading(false) }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
        onTimeUpdate={e => setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime)}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
      />
    </div>
  )
}
