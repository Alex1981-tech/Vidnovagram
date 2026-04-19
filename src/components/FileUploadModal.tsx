import type { Dispatch, SetStateAction } from 'react'
import { SendIcon } from './icons'

interface Props {
  open: boolean
  files: File[]
  previews: string[]
  caption: string
  setCaption: Dispatch<SetStateAction<string>>
  forceDocument: boolean
  setForceDocument: Dispatch<SetStateAction<boolean>>
  sending: boolean
  onSend: () => void
  onClear: () => void
  onRemoveFile: (index: number) => void
  onAddMore: () => void
  onCloseEmpty: () => void
}

/**
 * Confirmation modal before sending one or more file attachments. Shows image/video
 * previews in a grid (or single preview), the doc placeholder for other types, a
 * caption field, and an optional "send as document" switch when any image is present.
 */
export function FileUploadModal({
  open,
  files,
  previews,
  caption,
  setCaption,
  forceDocument,
  setForceDocument,
  sending,
  onSend,
  onClear,
  onRemoveFile,
  onAddMore,
  onCloseEmpty,
}: Props) {
  if (!open || files.length === 0) return null

  return (
    <div className="file-modal-overlay" onClick={onClear}>
      <div className="file-modal" onClick={e => e.stopPropagation()}>
        <div className="file-modal-header">
          <span className="file-modal-title">
            {files.length === 1 ? 'Надіслати файл' : `Надіслати ${files.length} файлів`}
          </span>
          <button className="file-modal-close" onClick={onClear}>✕</button>
        </div>
        <div className={`file-modal-preview${files.length > 1 ? ' file-modal-grid' : ''}`}>
          {files.map((f, i) => (
            <div key={i} className="file-modal-item">
              {files.length > 1 && (
                <button
                  className="file-modal-item-remove"
                  onClick={() => {
                    onRemoveFile(i)
                    if (files.length <= 1) onCloseEmpty()
                  }}
                >
                  ✕
                </button>
              )}
              {previews[i] && f.type.startsWith('image/') ? (
                <img src={previews[i]} alt="" className="file-modal-img" />
              ) : previews[i] && f.type.startsWith('video/') ? (
                <video src={previews[i]} className="file-modal-video" />
              ) : (
                <div className="file-modal-doc">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span className="file-modal-doc-name">{f.name}</span>
                  <span className="file-modal-doc-size">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              )}
            </div>
          ))}
          <button className="file-modal-add" onClick={onAddMore}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div className="file-modal-caption">
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Підпис (необов'язково)…"
            rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          />
          {files.some(f => f.type.startsWith('image/')) && (
            <label className="file-modal-checkbox">
              <input type="checkbox" checked={forceDocument} onChange={e => setForceDocument(e.target.checked)} />
              Надіслати як файл (без стиснення)
            </label>
          )}
        </div>
        <div className="file-modal-actions">
          <button className="file-modal-send" onClick={onSend} disabled={sending}>
            {sending ? <div className="spinner-sm" /> : <SendIcon />}
            Надіслати{files.length > 1 ? ` (${files.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
