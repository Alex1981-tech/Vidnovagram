import type { ClientNote } from '../types'

interface Props {
  note: ClientNote
  onDelete: (id: string) => void
}

/** Inline note bubble rendered inside the message timeline, with delete button. */
export function NoteItem({ note, onDelete }: Props) {
  return (
    <div data-note-id={note.id} className="msg msg-note">
      <div className="msg-bubble msg-bubble-note">
        <div className="msg-note-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
          <span className="msg-note-author">{note.author_name}</span>
          <button className="msg-note-delete" onClick={() => onDelete(note.id)} title="Видалити">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="msg-note-text">{note.text}</div>
        <div className="msg-time">
          {new Date(note.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}
