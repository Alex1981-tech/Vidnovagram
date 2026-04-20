import type { ClientNote } from '../types'

interface Props {
  selectedClient: string | null
  notes: ClientNote[]
  onRequestDelete: (noteId: string) => void
}

/** Client notes list with scroll-to-message-in-chat behaviour on click. */
export function NotesTab({ selectedClient, notes, onRequestDelete }: Props) {
  if (!selectedClient) {
    return <div className="rp-empty">Оберіть чат для перегляду нотаток</div>
  }

  return (
    <div className="rp-notes">
      <div className="rp-notes-list">
        {notes.length === 0 && <div className="rp-empty">Немає нотаток</div>}
        {notes.map(note => (
          <div
            key={note.id}
            className="rp-note rp-note-clickable"
            onClick={() => {
              const el = document.querySelector(`[data-note-id="${note.id}"]`)
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                el.classList.add('note-highlight')
                setTimeout(() => el.classList.remove('note-highlight'), 1500)
              }
            }}
          >
            <div className="rp-note-header">
              <span className="rp-note-author">{note.author_name}</span>
              <span className="rp-note-date">
                {new Date(note.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                {' '}
                {new Date(note.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                className="rp-delete-btn"
                onClick={e => { e.stopPropagation(); onRequestDelete(note.id) }}
                title="Видалити"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
            <div className="rp-note-text">{note.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
