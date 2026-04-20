import type { ClipboardEvent, Dispatch, RefObject, SetStateAction } from 'react'
import { MicIcon, PaperclipIcon, SendIcon, VideoIcon } from './icons'

const EMOJI_QUICK = [
  '😊','😂','❤️','👍','🙏','😍','🥰','😘','🤗','😎','🔥','✨','💪','👏','🎉','😢','😭','🤔','😮','😡','👋','🤝','💕','⭐','🌟','✅','❌','💯','🫶','🤩','😇','🥺','😋','🤣','😅','🫡','🙌','💐','🌹','🎂',
] as const

interface Props {
  messageText: string
  setMessageText: Dispatch<SetStateAction<string>>
  chatInputRef: RefObject<HTMLTextAreaElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  showAttachMenu: boolean
  setShowAttachMenu: Dispatch<SetStateAction<boolean>>
  showEmojiPicker: boolean
  setShowEmojiPicker: Dispatch<SetStateAction<boolean>>
  hasAttachments: boolean
  sending: boolean
  sendMessage: () => void
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  sendTypingIndicator: () => void
  onForceDocumentAttach: () => void
  onOpenTodoModal: () => void
  onOpenNoteModal: () => void
  onStartVoiceRecording: () => void
  onStartVideoRecording: () => void
}

/**
 * Bottom input bar: attach menu (media/file/todo), emoji picker, auto-growing textarea,
 * and a morphing action cluster — send button when there's text/files, otherwise quick
 * note/voice/video buttons.
 */
export function MessageInputBar({
  messageText,
  setMessageText,
  chatInputRef,
  fileInputRef,
  showAttachMenu,
  setShowAttachMenu,
  showEmojiPicker,
  setShowEmojiPicker,
  hasAttachments,
  sending,
  sendMessage,
  handlePaste,
  sendTypingIndicator,
  onForceDocumentAttach,
  onOpenTodoModal,
  onOpenNoteModal,
  onStartVoiceRecording,
  onStartVideoRecording,
}: Props) {
  const hasContent = messageText.trim() || hasAttachments

  return (
    <>
      <div className="attach-menu-wrap">
        <button
          className="chat-input-btn"
          onClick={() => { setShowAttachMenu(p => !p); setShowEmojiPicker(false) }}
          title="Вкласти"
        >
          <PaperclipIcon />
        </button>
        {showAttachMenu && (
          <div className="attach-menu-panel">
            <button
              className="attach-menu-item"
              onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click() }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Медіа
            </button>
            <button
              className="attach-menu-item"
              onClick={() => { setShowAttachMenu(false); onForceDocumentAttach() }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Файл
            </button>
            <button
              className="attach-menu-item"
              onClick={() => { setShowAttachMenu(false); onOpenTodoModal() }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Список
            </button>
          </div>
        )}
      </div>
      <div className="emoji-picker-wrap">
        <button
          className="chat-input-btn"
          onClick={() => setShowEmojiPicker(p => !p)}
          title="Емодзі"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>😊</span>
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker-panel">
            {EMOJI_QUICK.map(e => (
              <button
                key={e}
                className="emoji-picker-item"
                onClick={() => {
                  setMessageText(prev => prev + e)
                  setShowEmojiPicker(false)
                  chatInputRef.current?.focus()
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        ref={chatInputRef}
        value={messageText}
        onFocus={() => { setShowAttachMenu(false); setShowEmojiPicker(false) }}
        onChange={e => {
          setMessageText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
          sendTypingIndicator()
        }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
        onPaste={handlePaste}
        placeholder="Написати повідомлення..."
        rows={1}
      />
      {hasContent ? (
        <button className="chat-send-btn" onClick={() => sendMessage()} disabled={sending}>
          {sending ? <div className="spinner-sm" /> : <SendIcon />}
        </button>
      ) : (
        <div className="chat-input-media-btns">
          <button className="chat-input-btn" onClick={onOpenNoteModal} title="Нотатка">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
          </button>
          <button className="chat-input-btn" onClick={onStartVoiceRecording} title="Голосове повідомлення">
            <MicIcon />
          </button>
          <button className="chat-input-btn" onClick={onStartVideoRecording} title="Відеокружок">
            <VideoIcon />
          </button>
        </div>
      )}
    </>
  )
}
