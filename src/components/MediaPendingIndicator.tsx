import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
}

const TYPE_LABEL: Record<string, string> = {
  photo: 'Фото',
  video: 'Відео',
  document: 'Файл',
  voice: 'Голосове',
}

/** "Медіа завантажується..." placeholder for messages whose media is still being pulled in. */
export function MediaPendingIndicator({ message: m }: Props) {
  if (!m.has_media || m.media_status !== 'pending' || m.media_file) return null
  const label = TYPE_LABEL[m.media_type || ''] || 'Медіа'
  return (
    <div className="msg-media-pending">
      <div className="spinner-sm" />
      <span>{label} завантажується...</span>
    </div>
  )
}
