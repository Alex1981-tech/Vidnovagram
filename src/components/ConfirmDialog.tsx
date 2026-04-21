interface Props {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Plain confirm dialog — replacement for window.confirm(), which is blocked
 * in Tauri v2 unless the dialog plugin is explicitly allowed via capabilities.
 * Kept minimal: opens on `open=true`, two buttons, owner owns the state.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Так',
  cancelLabel = 'Скасувати',
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 420, maxWidth: 520 }}>
        {title && <h3>{title}</h3>}
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--foreground)' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="tpl-btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className="tpl-btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
