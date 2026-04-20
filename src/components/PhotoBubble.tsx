import type { Dispatch, SetStateAction } from 'react'
import { AuthMedia } from './AuthMedia'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  token: string
  mediaBlobMap: Record<string, string>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  setLightboxSrc: Dispatch<SetStateAction<string | null>>
}

/**
 * Photo (or any other image-like media with a thumbnail). Two variants merged:
 *  - has thumbnail → use it; load full image on click (or use it as-is if only thumbnail is available)
 *  - no thumbnail but `media_file` is a photo → load full directly
 * Lightbox receives the best blob available.
 */
export function PhotoBubble({
  message: m,
  token,
  mediaBlobMap,
  loadMediaBlob,
  setLightboxSrc,
}: Props) {
  if (!m.has_media) return null

  // Variant A: thumbnail present (not video/voice/document/sticker — those have dedicated bubbles)
  if (m.thumbnail && m.media_type !== 'video' && m.media_type !== 'voice' && m.media_type !== 'document' && m.media_type !== 'sticker') {
    const preferFullImage = m.media_type === 'photo' && !!m.media_file
    const isWaWithFull = m.source === 'whatsapp' && !!m.media_file
    const mediaKey = `${preferFullImage || isWaWithFull ? 'full' : 'thumb'}_${m.id}`
    const mediaPath = preferFullImage
      ? m.media_file
      : (isWaWithFull ? m.media_file : m.thumbnail)
    const fallbackPath = preferFullImage
      ? (m.thumbnail || undefined)
      : (m.source === 'whatsapp' ? undefined : (m.media_file || undefined))

    return (
      <AuthMedia
        mediaKey={mediaKey}
        mediaPath={mediaPath}
        type="image"
        className={`msg-media${m.source === 'whatsapp' ? ' msg-media-wa' : ''}`}
        token={token}
        blobMap={mediaBlobMap}
        loadBlob={loadMediaBlob}
        fallbackPath={fallbackPath}
        onClick={async () => {
          if (m.media_file) {
            const blob = mediaBlobMap[`full_${m.id}`] || await loadMediaBlob(`full_${m.id}`, m.media_file)
            if (blob) setLightboxSrc(blob)
          } else if (mediaBlobMap[`thumb_${m.id}`]) {
            setLightboxSrc(mediaBlobMap[`thumb_${m.id}`])
          }
        }}
      />
    )
  }

  // Variant B: no thumbnail but photo with full file → load full directly
  if (!m.thumbnail && m.media_type === 'photo' && m.media_file) {
    return (
      <AuthMedia
        mediaKey={`full_${m.id}`}
        mediaPath={m.media_file}
        type="image"
        className={`msg-media${m.source === 'whatsapp' ? ' msg-media-wa' : ''}`}
        token={token}
        blobMap={mediaBlobMap}
        loadBlob={loadMediaBlob}
        onClick={() => {
          const src = mediaBlobMap[`full_${m.id}`]
          if (src) setLightboxSrc(src)
        }}
      />
    )
  }

  return null
}
