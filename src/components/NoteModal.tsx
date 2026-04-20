import type { Dispatch, SetStateAction } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  text: string
  setText: Dispatch<SetStateAction<string>>
  onSave: () => void
}

/** Short client-note composer — Ctrl+Enter to save. */
export function NoteModal({ open, onClose, text, setText, onSave }: Props) {
  if (!open) return null

  const save = () => { onSave(); onClose() }

  return (
    <div className="note-modal-overlay" onClick={onClose}>
      <div className="note-modal" onClick={e => e.stopPropagation()}>
        <div className="note-modal-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
          <span>Нотатка</span>
          <button className="note-modal-close" onClick={onClose}>✕</button>
        </div>
        <textarea
          className="note-modal-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); save() } }}
          placeholder="Текст нотатки..."
          rows={4}
          autoFocus
        />
        <button className="note-modal-save" disabled={!text.trim()} onClick={save}>
          Зберегти
        </button>
      </div>
    </div>
  )
}
