import type { Dispatch, SetStateAction } from 'react'
import { SendIcon } from './icons'
import { API_BASE } from '../constants'
import type { QuickReply } from '../types'

const CAT_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b'] as const

// ───────────── Category Add ─────────────

interface CategoryAddProps {
  open: boolean
  onClose: () => void
  name: string
  setName: Dispatch<SetStateAction<string>>
  color: string
  setColor: Dispatch<SetStateAction<string>>
  onAdd: () => void
}

/** "Нова категорія" modal — name + color picker. */
export function CategoryAddModal({ open, onClose, name, setName, color, setColor, onAdd }: CategoryAddProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tpl-modal" onClick={e => e.stopPropagation()}>
        <h3>Нова категорія</h3>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Назва категорії"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
        />
        <div className="tpl-color-row">
          <span>Колір:</span>
          <div className="tpl-colors">
            {CAT_COLORS.map(c => (
              <button
                key={c}
                className={`tpl-color-dot ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="tpl-modal-btns">
          <button className="tpl-btn-primary" onClick={onAdd} disabled={!name.trim()}>Створити</button>
          <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  )
}

// ───────────── Template Add ─────────────

interface TemplateAddProps {
  open: boolean
  onClose: () => void
  title: string
  setTitle: Dispatch<SetStateAction<string>>
  text: string
  setText: Dispatch<SetStateAction<string>>
  media: File | null
  setMedia: Dispatch<SetStateAction<File | null>>
  onAdd: () => void
}

/** "Новий шаблон" modal — title + text + optional media attachment. */
export function TemplateAddModal({ open, onClose, title, setTitle, text, setText, media, setMedia, onAdd }: TemplateAddProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tpl-modal" onClick={e => e.stopPropagation()}>
        <h3>Новий шаблон</h3>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Коротка назва" autoFocus />
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Текст повідомлення..." rows={12} />
        <label className="tpl-media-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          {media ? media.name : 'Прикріпити медіа'}
          <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={e => setMedia(e.target.files?.[0] || null)} hidden />
        </label>
        <div className="tpl-modal-btns">
          <button className="tpl-btn-primary" onClick={onAdd} disabled={!title.trim() || !text.trim()}>Додати</button>
          <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  )
}

// ───────────── Template Preview (send) ─────────────

interface TemplatePreviewProps {
  tpl: QuickReply | null
  onClose: () => void
  selectedClient: string | null
  includeMedia: boolean
  setIncludeMedia: Dispatch<SetStateAction<boolean>>
  extraFiles: File[]
  setExtraFiles: Dispatch<SetStateAction<File[]>>
  editText: string
  setEditText: Dispatch<SetStateAction<string>>
  chatSubtitle: string
  onSend: (text: string, mediaFile: string | null, extraFiles: File[]) => void
  pickExtraFiles: () => Promise<void>
}

/** Preview a template before sending — shows media with remove/re-add, extra-files picker, editable text. */
export function TemplatePreviewModal({
  tpl,
  onClose,
  selectedClient,
  includeMedia,
  setIncludeMedia,
  extraFiles,
  setExtraFiles,
  editText,
  setEditText,
  chatSubtitle,
  onSend,
  pickExtraFiles,
}: TemplatePreviewProps) {
  if (!tpl) return null

  const mediaIsImage = !!tpl.media_file && !!tpl.media_file.match(/\.(jpg|jpeg|png|gif|webp)/i)
  const mediaIsVideo = !!tpl.media_file && !!tpl.media_file.match(/\.(mp4|webm|mov)/i)

  const canSend = !!selectedClient && (editText.trim() || (includeMedia && tpl.media_file) || extraFiles.length > 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tpl-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="tpl-edit-header">
          <span>{tpl.title}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="tpl-edit-body">
          {tpl.media_file && includeMedia && (
            <div className="tpl-edit-media">
              {mediaIsImage ? (
                <img src={`https://cc.vidnova.app${tpl.media_file}`} alt="" />
              ) : mediaIsVideo ? (
                <div className="tpl-edit-file-tag">🎬 Відео</div>
              ) : (
                <div className="tpl-edit-file-tag">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                  {tpl.media_file.split('/').pop()}
                </div>
              )}
              <button className="tpl-edit-media-remove" onClick={() => setIncludeMedia(false)} title="Видалити вкладення">✕</button>
            </div>
          )}
          {tpl.media_file && !includeMedia && (
            <button className="tpl-reinclude-media" onClick={() => setIncludeMedia(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              Повернути вкладення шаблону
            </button>
          )}
          {extraFiles.length > 0 && (
            <div className="tpl-extra-files">
              {extraFiles.map((f, i) => (
                <div className="tpl-extra-file" key={i}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <span>{f.name}</span>
                  <button onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))} title="Видалити">✕</button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="tpl-attach-extra" onClick={pickExtraFiles}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            Додати файл{extraFiles.length > 0 ? ` (${extraFiles.length})` : ''}
          </button>
          <textarea
            className="tpl-edit-textarea"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={Math.max(4, editText.split('\n').length + 1)}
          />
        </div>
        <div className="tpl-edit-footer">
          <span className="tpl-edit-hint">{chatSubtitle}</span>
          <button
            className="tpl-btn-send"
            onClick={() => onSend(editText, includeMedia ? tpl.media_file : null, extraFiles)}
            disabled={!canSend}
          >
            <SendIcon /> Відправити
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────── Template Edit (CRUD) ─────────────

interface TemplateEditProps {
  tpl: QuickReply | null
  onClose: () => void
  title: string
  setTitle: Dispatch<SetStateAction<string>>
  text: string
  setText: Dispatch<SetStateAction<string>>
  media: File | null
  setMedia: Dispatch<SetStateAction<File | null>>
  removeMedia: boolean
  setRemoveMedia: Dispatch<SetStateAction<boolean>>
  onSave: (tpl: QuickReply) => void
}

/** Global edit for an existing template — swap media, remove it, or add new file. */
export function TemplateEditModal({
  tpl,
  onClose,
  title,
  setTitle,
  text,
  setText,
  media,
  setMedia,
  removeMedia,
  setRemoveMedia,
  onSave,
}: TemplateEditProps) {
  if (!tpl) return null

  const mediaIsImage = !!tpl.media_file && !!tpl.media_file.match(/\.(jpg|jpeg|png|gif|webp)/i)
  const showExistingMedia = !!tpl.media_file && !removeMedia && !media
  const showUploadSlot = !media && (removeMedia || !tpl.media_file)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tpl-modal tpl-global-edit-modal" onClick={e => e.stopPropagation()}>
        <h3>Редагувати шаблон</h3>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Коротка назва" autoFocus />
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Текст повідомлення..." rows={4} />
        {showExistingMedia && (
          <div className="tpl-edit-media">
            {mediaIsImage ? (
              <img src={`${API_BASE.replace('/api', '')}${tpl.media_file}`} alt="" />
            ) : (
              <div className="tpl-edit-file-tag">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                {tpl.media_file!.split('/').pop()}
              </div>
            )}
            <button className="tpl-edit-media-remove" onClick={() => setRemoveMedia(true)} title="Видалити вкладення">✕</button>
          </div>
        )}
        {media && (
          <div className="tpl-extra-file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <span>{media.name}</span>
            <button onClick={() => setMedia(null)} title="Видалити">✕</button>
          </div>
        )}
        {showUploadSlot && (
          <label className="tpl-media-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            Прикріпити медіа
            <input
              type="file"
              accept="image/*,video/*,application/pdf,.doc,.docx"
              onChange={e => { setMedia(e.target.files?.[0] || null); setRemoveMedia(false) }}
              hidden
            />
          </label>
        )}
        <div className="tpl-modal-btns">
          <button className="tpl-btn-primary" onClick={() => onSave(tpl)} disabled={!title.trim() || !text.trim()}>Зберегти</button>
          <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  )
}
