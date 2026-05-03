interface ConfirmDeleteTemplateState {
  type: 'category' | 'template'
  id: string
  name: string
}

interface ConfirmDeleteTemplateProps {
  state: ConfirmDeleteTemplateState | null
  onClose: () => void
  onDeleteCategory: (id: string) => void
  onDeleteTemplate: (id: string) => void
}

/** "Delete category / template?" confirm. */
export function ConfirmDeleteTemplate({ state, onClose, onDeleteCategory, onDeleteTemplate }: ConfirmDeleteTemplateProps) {
  if (!state) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-delete-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-delete-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </div>
        <h3>Видалити {state.type === 'category' ? 'категорію' : 'шаблон'}?</h3>
        <p>«{state.name}» буде видалено назавжди{state.type === 'category' ? ' разом з усіма шаблонами' : ''}.</p>
        <div className="confirm-delete-actions">
          <button onClick={onClose}>Скасувати</button>
          <button
            className="danger"
            onClick={() => {
              if (state.type === 'category') onDeleteCategory(state.id)
              else onDeleteTemplate(state.id)
              onClose()
            }}
          >
            Видалити
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────

interface SelectAccountHintProps {
  open: boolean
  onClose: () => void
}

/** Info prompt shown when the user tries to send without selecting an account. */
export function SelectAccountHint({ open, onClose }: SelectAccountHintProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="select-account-hint-modal" onClick={e => e.stopPropagation()}>
        <div className="select-account-hint-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
        </div>
        <h3 className="select-account-hint-title">Виберіть акаунт</h3>
        <p className="select-account-hint-text">
          Для відправки повідомлень та реакцій потрібно вибрати конкретний акаунт у лівій панелі.
        </p>
        <button className="select-account-hint-btn" onClick={onClose}>Зрозуміло</button>
      </div>
    </div>
  )
}

// ─────────────

interface DeleteMessageState {
  msgId: string | number
  source: 'telegram' | 'whatsapp' | 'telegram_bot'
  tgMsgId?: number
  peerId?: number
}

interface DeleteMessageConfirmProps {
  state: DeleteMessageState | null
  onClose: () => void
  onDelete: (state: DeleteMessageState) => void
}

/** "Delete message?" confirm — revoke (for peer) button + cancel. */
export function DeleteMessageConfirm({ state, onClose, onDelete }: DeleteMessageConfirmProps) {
  if (!state) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
        <h3 className="delete-confirm-title">Видалити повідомлення?</h3>
        <p className="delete-confirm-text">Повідомлення буде видалено у співрозмовника, але залишиться у вас з позначкою.</p>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-btn delete-btn-revoke" onClick={() => onDelete(state)}>
            Видалити у співрозмовника
          </button>
          <button className="delete-confirm-btn delete-btn-cancel" onClick={onClose}>
            Скасувати
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────

interface DeleteNoteConfirmProps {
  noteId: string | null
  onClose: () => void
  onDelete: (noteId: string) => void
}

/** Delete note confirm (soft-delete semantics — hidden here but visible on server). */
export function DeleteNoteConfirm({ noteId, onClose, onDelete }: DeleteNoteConfirmProps) {
  if (!noteId) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Видалити нотатку?</h3>
        </div>
        <div className="modal-body">
          <p>Нотатку буде позначено як видалену. Вона залишиться видимою в картці клієнта на сайті.</p>
        </div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Скасувати</button>
          <button className="modal-btn modal-btn-danger" onClick={() => onDelete(noteId)}>Видалити</button>
        </div>
      </div>
    </div>
  )
}
