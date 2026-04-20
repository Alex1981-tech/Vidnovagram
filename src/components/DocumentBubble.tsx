import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  mediaLoading: Record<string, boolean>
  onOpen: (mediaPath: string, mediaType: string, messageId: string | number) => void
}

/** File/document card. PDFs open in browser, other types get a save-and-open flow. */
export function DocumentBubble({ message: m, mediaLoading, onOpen }: Props) {
  if (!m.media_file) return null
  const isPdf = m.media_file.toLowerCase().endsWith('.pdf')
  const fileName = m.media_file.split('/').pop() || 'Файл'
  const action = isPdf ? 'Відкрити в браузері' : 'Зберегти та відкрити'

  return (
    <div className="msg-document" onClick={() => onOpen(m.media_file, m.media_type, m.id)}>
      <span className="msg-doc-icon">{isPdf ? '📄' : '📎'}</span>
      <div className="msg-doc-info">
        <span className="msg-doc-name">{fileName}</span>
        <span className="msg-doc-action">{action}</span>
      </div>
      {mediaLoading[`doc_${m.media_file}`] && <div className="spinner-sm" />}
    </div>
  )
}
