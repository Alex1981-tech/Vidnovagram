import { AuthMedia } from './AuthMedia'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  token: string
  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  onOpenVnote: (src: string, id: string | number) => void
}

/**
 * Round "video note" (кружок) — shows thumbnail + play; once loaded, plays inline
 * muted+looping like Telegram. Click opens full-size modal via onOpenVnote.
 */
export function VideoNoteBubble({
  message: m,
  token,
  mediaBlobMap,
  mediaLoading,
  loadMediaBlob,
  onOpenVnote,
}: Props) {
  if (!m.media_file) return null
  const blobKey = `vid_${m.id}`
  const blobUrl = mediaBlobMap[blobKey]

  return (
    <div className={`msg-vnote-wrap ${m.direction}`}>
      <div
        className="msg-vnote"
        onClick={async () => {
          let src = blobUrl
          if (!src) src = (await loadMediaBlob(blobKey, m.media_file)) || ''
          if (src) onOpenVnote(src, m.id)
        }}
      >
        {blobUrl ? (
          <video
            src={blobUrl}
            className="msg-vnote-player"
            autoPlay muted loop playsInline
          />
        ) : (
          <>
            {m.thumbnail ? (
              <AuthMedia
                mediaKey={`vnthumb_${m.id}`}
                mediaPath={m.thumbnail}
                type="image"
                className="msg-vnote-thumb"
                token={token}
                blobMap={mediaBlobMap}
                loadBlob={loadMediaBlob}
              />
            ) : (
              <div className="msg-vnote-thumb" style={{ background: 'var(--muted)' }} />
            )}
            <div
              className="msg-vnote-play"
              onClick={async (e) => {
                e.stopPropagation()
                if (!mediaBlobMap[blobKey]) await loadMediaBlob(blobKey, m.media_file)
              }}
            >
              {mediaLoading[blobKey] ? <div className="spinner-sm" /> : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))' }}>
                  <polygon points="6 3 20 12 6 21 6 3"/>
                </svg>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
