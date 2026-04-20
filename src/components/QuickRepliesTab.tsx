import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { TemplateCategory, QuickReply } from '../types'

interface ConfirmDelete {
  type: 'category' | 'template'
  id: string
  name: string
}

interface Props {
  categories: TemplateCategory[]
  expandedCats: Set<string>
  toggleCat: (id: string) => void
  reorderCategories: (dragId: string, targetId: string) => void
  dragCatRef: MutableRefObject<string | null>
  dragTplRef: MutableRefObject<QuickReply | null>
  lastDraggedTplRef: MutableRefObject<QuickReply | null>

  // Inline category edit
  editingCatId: string | null
  setEditingCatId: Dispatch<SetStateAction<string | null>>
  editingCatName: string
  setEditingCatName: Dispatch<SetStateAction<string>>
  editingCatColor: string
  setEditingCatColor: Dispatch<SetStateAction<string>>
  saveCategory: (id: string, name: string, color: string) => void

  // Add-template modal
  setShowTplModal: Dispatch<SetStateAction<string | null>>
  setNewTplTitle: Dispatch<SetStateAction<string>>
  setNewTplText: Dispatch<SetStateAction<string>>
  setNewTplMedia: Dispatch<SetStateAction<File | null>>

  // Delete confirmation
  setConfirmDelete: Dispatch<SetStateAction<ConfirmDelete | null>>

  // Template preview (send flow)
  selectedClient: string | null
  setPreviewTpl: Dispatch<SetStateAction<QuickReply | null>>
  setTplEditText: Dispatch<SetStateAction<string>>
  setTplIncludeMedia: Dispatch<SetStateAction<boolean>>
  setTplSendExtraFiles: Dispatch<SetStateAction<File[]>>

  // Template inline edit
  setEditingTpl: Dispatch<SetStateAction<QuickReply | null>>
  setEditTplTitle: Dispatch<SetStateAction<string>>
  setEditTplText: Dispatch<SetStateAction<string>>
  setEditTplMedia: Dispatch<SetStateAction<File | null>>
  setEditTplRemoveMedia: Dispatch<SetStateAction<boolean>>

  // Category modal
  setShowCatModal: Dispatch<SetStateAction<boolean>>
  setNewCatName: Dispatch<SetStateAction<string>>
  setNewCatColor: Dispatch<SetStateAction<string>>
}

const CAT_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b']

/** Right panel "Шаблони" tab: nested categories + templates with drag-reorder and CRUD. */
export function QuickRepliesTab({
  categories,
  expandedCats,
  toggleCat,
  reorderCategories,
  dragCatRef,
  dragTplRef,
  lastDraggedTplRef,
  editingCatId,
  setEditingCatId,
  editingCatName,
  setEditingCatName,
  editingCatColor,
  setEditingCatColor,
  saveCategory,
  setShowTplModal,
  setNewTplTitle,
  setNewTplText,
  setNewTplMedia,
  setConfirmDelete,
  selectedClient,
  setPreviewTpl,
  setTplEditText,
  setTplIncludeMedia,
  setTplSendExtraFiles,
  setEditingTpl,
  setEditTplTitle,
  setEditTplText,
  setEditTplMedia,
  setEditTplRemoveMedia,
  setShowCatModal,
  setNewCatName,
  setNewCatColor,
}: Props) {
  return (
    <div className="rp-quick">
      <div className="rp-quick-list">
        {categories.length === 0 && <div className="rp-empty">Немає шаблонів</div>}
        {categories.map(cat => (
          <div
            key={cat.id}
            className="tpl-cat"
            draggable
            onDragStart={e => { dragCatRef.current = cat.id; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('dragging') }}
            onDragEnd={e => { dragCatRef.current = null; (e.currentTarget as HTMLElement).classList.remove('dragging') }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; (e.currentTarget as HTMLElement).classList.add('drag-over') }}
            onDragLeave={e => (e.currentTarget as HTMLElement).classList.remove('drag-over')}
            onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove('drag-over'); if (dragCatRef.current) reorderCategories(dragCatRef.current, cat.id) }}
          >
            <div className="tpl-cat-header" style={{ borderLeftColor: cat.color }} onClick={() => toggleCat(cat.id)}>
              <svg className="tpl-drag-handle" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
              <svg className={`tpl-chevron ${expandedCats.has(cat.id) ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              {editingCatId === cat.id ? (
                <div className="tpl-cat-inline-edit" onClick={e => e.stopPropagation()}>
                  <input
                    className="tpl-cat-name-edit"
                    value={editingCatName}
                    onChange={e => setEditingCatName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveCategory(cat.id, editingCatName, editingCatColor)
                      if (e.key === 'Escape') setEditingCatId(null)
                    }}
                    autoFocus
                    style={{ color: editingCatColor }}
                  />
                  <div className="tpl-cat-inline-colors">
                    {CAT_COLORS.map(c => (
                      <button key={c} className={`tpl-color-dot-sm ${editingCatColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setEditingCatColor(c)} />
                    ))}
                  </div>
                  <button className="tpl-cat-save-btn" onClick={() => saveCategory(cat.id, editingCatName, editingCatColor)} title="Зберегти">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
              ) : (
                <span
                  className="tpl-cat-name"
                  style={{ color: cat.color }}
                  onDoubleClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatColor(cat.color) }}
                >
                  {cat.name}
                </span>
              )}
              <span className="tpl-cat-count">{cat.templates.length}</span>
              <div className="tpl-cat-actions">
                <button
                  className="tpl-edit-global-btn"
                  onClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatColor(cat.color) }}
                  title="Редагувати категорію"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button
                  className="tpl-add-btn"
                  onClick={e => { e.stopPropagation(); setShowTplModal(cat.id); setNewTplTitle(''); setNewTplText(''); setNewTplMedia(null) }}
                  title="Додати шаблон"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button
                  className="rp-delete-btn"
                  onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'category', id: cat.id, name: cat.name }) }}
                  title="Видалити категорію"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>
            </div>
            {expandedCats.has(cat.id) && (
              <div className="tpl-cat-body">
                {cat.templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className="tpl-item"
                    draggable
                    onDragStart={e => { dragTplRef.current = tpl; lastDraggedTplRef.current = tpl; e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', tpl.title) }}
                    onDragEnd={() => { dragTplRef.current = null }}
                    onClick={() => {
                      if (selectedClient) {
                        setPreviewTpl(tpl)
                        setTplEditText(tpl.text)
                        setTplIncludeMedia(!!tpl.media_file)
                        setTplSendExtraFiles([])
                      }
                    }}
                  >
                    <span className="tpl-item-title">{tpl.title}</span>
                    {tpl.media_file && <svg className="tpl-media-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                    <button
                      className="tpl-send-btn"
                      onClick={e => {
                        e.stopPropagation()
                        if (selectedClient) {
                          setPreviewTpl(tpl)
                          setTplEditText(tpl.text)
                          setTplIncludeMedia(!!tpl.media_file)
                          setTplSendExtraFiles([])
                        }
                      }}
                      title="Надіслати"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                    </button>
                    <button
                      className="tpl-edit-global-btn"
                      onClick={e => {
                        e.stopPropagation()
                        setEditingTpl(tpl)
                        setEditTplTitle(tpl.title)
                        setEditTplText(tpl.text)
                        setEditTplMedia(null)
                        setEditTplRemoveMedia(false)
                      }}
                      title="Редагувати шаблон"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button
                      className="rp-delete-btn tpl-del"
                      onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.title }) }}
                      title="Видалити"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="tpl-bottom-btn">
        <button onClick={() => { setShowCatModal(true); setNewCatName(''); setNewCatColor('#6366f1') }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Додати категорію
        </button>
      </div>
    </div>
  )
}
