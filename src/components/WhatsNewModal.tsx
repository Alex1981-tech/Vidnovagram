import { CHANGELOG } from '../changelog'

/**
 * Modal shown once after Tauri auto-updates to a new version. Reads the
 * matching list from `src/changelog.ts` so the shell stays data-free.
 */
export function WhatsNewModal({
  open,
  version,
  onClose,
}: {
  open: boolean
  version: string
  onClose: () => void
}) {
  if (!open) return null
  const items = CHANGELOG[version]
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="whats-new-modal" onClick={e => e.stopPropagation()}>
        <div className="whats-new-header">
          <h2>Vidnovagram v{version}</h2>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="whats-new-body">
          {items ? (
            <ul className="whats-new-list">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Оновлено до нової версії.</p>
          )}
        </div>
        <div className="whats-new-footer">
          <button className="whats-new-btn" onClick={onClose}>Зрозуміло</button>
        </div>
      </div>
    </div>
  )
}
