interface ReplyTarget {
  sender?: string
  text?: string
}

interface EditTarget {
  text?: string
}

interface Props {
  editingMsg: EditTarget | null
  replyTo: ReplyTarget | null
  onClose: () => void
}

/** Banner above the textarea showing reply target or edit target. Rendered only when one is set. */
export function ReplyEditBar({ editingMsg, replyTo, onClose }: Props) {
  if (!editingMsg && !replyTo) return null

  return (
    <div className="reply-edit-bar">
      <div className="reply-edit-bar-accent" />
      <div className="reply-edit-bar-content">
        <span className="reply-edit-bar-title">
          {editingMsg ? '✏️ Редагування' : `↩️ ${replyTo?.sender || ''}`}
        </span>
        <span className="reply-edit-bar-text">
          {editingMsg ? editingMsg.text?.slice(0, 80) : replyTo?.text}
        </span>
      </div>
      <button className="reply-edit-bar-close" onClick={onClose}>✕</button>
    </div>
  )
}
