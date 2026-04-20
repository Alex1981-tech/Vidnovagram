import type { Dispatch, SetStateAction } from 'react'
import { SendIcon } from './icons'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  setTitle: Dispatch<SetStateAction<string>>
  items: string[]
  setItems: Dispatch<SetStateAction<string[]>>
  sending: boolean
  onSend: (text: string) => Promise<void> | void
}

/**
 * Compose a simple check-list message ("📋 Title\n☐ item1\n☐ item2..."). The
 * composed text is passed to onSend; parent handles actual send + lifecycle.
 */
export function TodoListModal({
  open,
  onClose,
  title,
  setTitle,
  items,
  setItems,
  sending,
  onSend,
}: Props) {
  if (!open) return null

  const trimmed = items.filter(i => i.trim())
  const canSend = title.trim() && trimmed.length > 0 && !sending

  return (
    <div className="file-modal-overlay" onClick={onClose}>
      <div className="file-modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        <div className="file-modal-header">
          <span className="file-modal-title">Новий список</span>
          <button className="file-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="todo-modal-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Назва списку"
            autoFocus
          />
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ opacity: 0.4, fontSize: 14 }}>☐</span>
              <input
                className="todo-modal-input"
                value={item}
                onChange={e => { const arr = [...items]; arr[i] = e.target.value; setItems(arr) }}
                placeholder={`Пункт ${i + 1}`}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); setItems(prev => [...prev, '']) }
                  if (e.key === 'Backspace' && !item && items.length > 1) { e.preventDefault(); setItems(prev => prev.filter((_, j) => j !== i)) }
                }}
              />
            </div>
          ))}
          <button
            className="attach-menu-item"
            onClick={() => setItems(prev => [...prev, ''])}
            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
          >
            + Додати пункт
          </button>
        </div>
        <div className="file-modal-actions">
          <button
            className="file-modal-send"
            disabled={!canSend}
            onClick={() => {
              if (!canSend) return
              const text = `📋 ${title.trim()}\n${trimmed.map(i => `☐ ${i.trim()}`).join('\n')}`
              onSend(text)
            }}
          >
            <SendIcon /> Надіслати
          </button>
        </div>
      </div>
    </div>
  )
}
