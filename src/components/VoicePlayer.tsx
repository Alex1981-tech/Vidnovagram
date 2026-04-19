import { useEffect, useRef, useState } from 'react'

/** Telegram-style voice message player with waveform. */
export function VoicePlayer({
  messageId,
  mediaFile,
  blobMap,
  loadBlob,
  loading,
  direction,
}: {
  messageId: number | string
  mediaFile: string
  blobMap: Record<string, string>
  loadBlob: (key: string, path: string) => Promise<string | null>
  loading: boolean
  direction: string
}) {
  const key = `voice_${messageId}`
  const src = blobMap[key]
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const barsRef = useRef<number[]>([])

  // Deterministic random bars keyed off message id.
  if (barsRef.current.length === 0) {
    const seed = typeof messageId === 'number'
      ? messageId
      : parseInt(String(messageId).replace(/\D/g, '').slice(0, 8)) || 42
    const bars: number[] = []
    let s = seed
    for (let i = 0; i < 32; i++) {
      s = (s * 16807 + 7) % 2147483647
      bars.push(0.15 + (s % 1000) / 1000 * 0.85)
    }
    barsRef.current = bars
  }

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => {
      setCurrentTime(a.currentTime)
      setProgress(a.duration ? a.currentTime / a.duration : 0)
    }
    const onMeta = () => setDuration(a.duration || 0)
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
      setCurrentTime(0)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [src])

  // Auto-play once the blob finishes loading.
  const pendingPlayRef = useRef(false)
  useEffect(() => {
    if (src && pendingPlayRef.current) {
      pendingPlayRef.current = false
      const a = audioRef.current
      if (a) {
        a.play().then(() => setPlaying(true)).catch(() => {})
      }
    }
  }, [src])

  const togglePlay = async () => {
    if (!src) {
      pendingPlayRef.current = true
      await loadBlob(key, mediaFile)
      return
    }
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
    } else {
      a.play()
      setPlaying(true)
    }
  }

  const seekAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = pct * a.duration
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  const isSent = direction === 'sent'

  return (
    <div className={`voice-tg ${isSent ? 'sent' : 'received'}`}>
      <button className="voice-tg-play" onClick={togglePlay} disabled={loading}>
        {loading ? (
          <div className="spinner-sm" />
        ) : playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        )}
      </button>
      <div className="voice-tg-body">
        <div className="voice-tg-wave" onClick={seekAt}>
          {barsRef.current.map((h, i) => {
            const filled = progress > 0 && i / barsRef.current.length <= progress
            return (
              <div
                key={i}
                className={`voice-tg-bar ${filled ? 'filled' : ''}`}
                style={{ height: `${h * 100}%` }}
              />
            )
          })}
        </div>
        <span className="voice-tg-time">
          {src && duration ? fmt(playing ? currentTime : duration) : '0:00'}
        </span>
      </div>
      {src && <audio ref={audioRef} src={src} preload="auto" />}
    </div>
  )
}
