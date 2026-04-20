import { AuthMedia } from './AuthMedia'
import { LottieSticker } from './LottieSticker'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  token: string
  mediaBlobMap: Record<string, string>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
}

/**
 * Sticker variants:
 *  - **animated (TGS/Lottie)**: lazy-load blob, then render via LottieSticker;
 *    placeholder emoji while blob loads
 *  - **static/video sticker with image**: AuthMedia
 *  - **emoji-only**: text fallback
 */
export function StickerBubble({ message: m, token, mediaBlobMap, loadMediaBlob }: Props) {
  const title = m.sticker_set_name || m.sticker_emoji || 'Стікер'

  // Animated sticker (TGS/Lottie)
  if (m.is_animated_sticker && (m.media_file || m.thumbnail)) {
    const stickerKey = `sticker_${m.id}`
    const blobUrl = mediaBlobMap[stickerKey]
    if (!blobUrl) {
      const src = m.media_file || m.thumbnail
      if (src) loadMediaBlob(stickerKey, src)
      return (
        <div className="msg-sticker-img" title={title}>
          {m.sticker_emoji || '🏷️'}
        </div>
      )
    }
    return (
      <div className="msg-sticker-img" title={title}>
        <LottieSticker blobUrl={blobUrl} size={200} />
      </div>
    )
  }

  // Static/video sticker with image
  if (m.thumbnail || m.media_file) {
    return (
      <div className="msg-sticker-img" title={title}>
        <AuthMedia
          mediaKey={`sticker_${m.id}`}
          mediaPath={m.thumbnail || m.media_file}
          type="image"
          className="sticker-image"
          token={token}
          blobMap={mediaBlobMap}
          loadBlob={loadMediaBlob}
        />
      </div>
    )
  }

  // Emoji-only fallback
  return (
    <div className="msg-sticker" title={m.sticker_set_name || 'Стікер'}>
      {m.sticker_emoji ? <span className="msg-sticker-emoji">{m.sticker_emoji}</span> : '🏷️ Стікер'}
    </div>
  )
}
