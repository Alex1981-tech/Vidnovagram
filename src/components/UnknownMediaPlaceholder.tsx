import type { ChatMessage } from '../types'

const KNOWN_TYPES = new Set([
  'voice', 'video', 'video_note', 'document', 'photo',
  'contact', 'geo', 'poll', 'sticker',
])

interface Props {
  message: ChatMessage
}

/** Fallback chip for media types we don't render (e.g. `game`, `live_location`, etc.). */
export function UnknownMediaPlaceholder({ message: m }: Props) {
  if (!m.has_media || m.thumbnail || m.media_file) return null
  if (!m.media_type || KNOWN_TYPES.has(m.media_type)) return null
  if (m.media_status === 'pending') return null

  return (
    <div className="msg-media-placeholder">
      {`📎 ${m.media_type}`}
    </div>
  )
}
