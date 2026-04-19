export interface BgUpload {
  id: string
  clientId: string
  accountId: string
  accountLabel: string
  status: 'uploading' | 'done' | 'error'
  fileName: string
  fileCount: number
  errorMsg?: string
  files?: (File | Blob)[]
  mediaType?: string
  caption?: string
  forceDoc?: boolean
  replyMsgId?: string | number
  directFile?: boolean
}

/**
 * Floating indicator strip showing in-progress background uploads.
 * Success rows auto-hide; error rows wait for manual retry/dismiss.
 */
export function BgUploadsContainer({
  uploads,
  onRetry,
  onDismiss,
}: {
  uploads: BgUpload[]
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
}) {
  if (uploads.length === 0) return null
  return (
    <div className="bg-upload-container">
      {uploads.map(u => (
        <div key={u.id} className={`bg-upload-item bg-upload-${u.status}`}>
          <div className="bg-upload-icon">
            {u.status === 'uploading' && <div className="spinner-sm" />}
            {u.status === 'done' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {u.status === 'error' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </div>
          <div className="bg-upload-info">
            <span className="bg-upload-name">{u.fileName}</span>
            <span className="bg-upload-status">
              {u.status === 'uploading' && 'Надсилання…'}
              {u.status === 'done' && 'Надіслано'}
              {u.status === 'error' && (u.errorMsg || 'Помилка')}
            </span>
          </div>
          {u.status === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="ctx-menu-item"
                style={{ padding: '6px 8px', fontSize: 12 }}
                onClick={() => onRetry(u.id)}
              >
                Повторити
              </button>
              <button className="bg-upload-dismiss" onClick={() => onDismiss(u.id)}>
                ×
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
