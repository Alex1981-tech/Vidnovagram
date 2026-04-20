import { AuthMedia } from './AuthMedia'
import type { ChatMessage } from '../types'

const MEDIA_LABEL: Record<string, string> = {
  photo: 'Фото',
  video: 'Відео',
  video_note: 'Відеоповідомлення',
  voice: 'Голосове повідомлення',
  sticker: 'Стікер',
  document: 'Документ',
}

interface Props {
  message: ChatMessage
  messages: ChatMessage[]
  token: string
  mediaBlobMap: Record<string, string>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  onClickReply?: (msgId: number, peerId?: number) => void
}

/**
 * "Reply to" quote shown above the bubble. Resolves the quoted message's
 * thumbnail/media-type either from the message's own fields or by looking up
 * the target in the currently loaded messages. Clicking scrolls to the target.
 */
export function ReplyQuote({
  message: m,
  messages,
  token,
  mediaBlobMap,
  loadMediaBlob,
  onClickReply,
}: Props) {
  if (!m.reply_to_msg_id && !m.reply_to_text && !m.reply_to_sender) return null

  const replyThumb = (() => {
    if (m.reply_to_thumbnail) {
      return { thumb: m.reply_to_thumbnail, mediaType: m.reply_to_media_type || '' }
    }
    if (!m.reply_to_msg_id) return null
    const replied = messages.find(rm =>
      rm.tg_message_id === m.reply_to_msg_id &&
      (!m.tg_peer_id || rm.tg_peer_id === m.tg_peer_id)
    )
    if (replied?.thumbnail) {
      return { thumb: replied.thumbnail, mediaType: replied.media_type || '' }
    }
    return null
  })()

  const replyMediaType = m.reply_to_media_type || (() => {
    if (!m.reply_to_msg_id) return ''
    const replied = messages.find(rm =>
      rm.tg_message_id === m.reply_to_msg_id &&
      (!m.tg_peer_id || rm.tg_peer_id === m.tg_peer_id)
    )
    return replied?.media_type || ''
  })()

  const replyText = m.reply_to_text
    || (replyMediaType ? MEDIA_LABEL[replyMediaType] || 'Медіа' : '...')

  return (
    <div
      className="msg-reply-quote clickable"
      onClick={m.reply_to_msg_id && onClickReply
        ? (e) => { e.stopPropagation(); onClickReply(m.reply_to_msg_id!, m.tg_peer_id) }
        : undefined}
    >
      <div className="msg-reply-bar" />
      <div className="msg-reply-body">
        {m.reply_to_sender && <span className="msg-reply-sender">{m.reply_to_sender}</span>}
        <span className="msg-reply-text">{replyText}</span>
      </div>
      {replyThumb && (
        <AuthMedia
          mediaKey={`reply_thumb_${m.id}`}
          mediaPath={replyThumb.thumb}
          type="image"
          className={`msg-reply-thumb${replyThumb.mediaType === 'video_note' ? ' msg-reply-thumb-round' : ''}`}
          token={token}
          blobMap={mediaBlobMap}
          loadBlob={loadMediaBlob}
        />
      )}
    </div>
  )
}
