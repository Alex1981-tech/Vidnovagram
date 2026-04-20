import { AuthMedia } from './AuthMedia'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  token: string
  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
}

/** Regular video bubble: thumbnail + play button, swaps to a controlled <video> once blob is loaded. */
export function VideoBubble({ message: m, token, mediaBlobMap, mediaLoading, loadMediaBlob }: Props) {
  if (!m.media_file) return null
  const blobKey = `vid_${m.id}`
  const blobUrl = mediaBlobMap[blobKey]

  return (
    <div className={`msg-video${blobUrl ? ' playing' : ''}`}>
      {blobUrl ? (
        <video
          controls
          autoPlay
          preload="auto"
          src={blobUrl}
          className="msg-video-player"
        />
      ) : (
        <>
          {m.thumbnail && (
            <AuthMedia
              mediaKey={`vthumb_${m.id}`}
              mediaPath={m.thumbnail}
              type="image"
              className="msg-video-thumb"
              token={token}
              blobMap={mediaBlobMap}
              loadBlob={loadMediaBlob}
            />
          )}
          <button
            className={`msg-video-btn${!m.thumbnail ? ' msg-video-btn-static' : ''}`}
            onClick={() => loadMediaBlob(blobKey, m.media_file)}
            disabled={mediaLoading[blobKey]}
          >
            {mediaLoading[blobKey] ? <div className="spinner-sm" /> : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>
        </>
      )}
    </div>
  )
}
