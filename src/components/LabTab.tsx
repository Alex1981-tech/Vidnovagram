import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { LabPatient } from '../types'

interface Props {
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  loading: boolean
  loadingMore: boolean
  patients: LabPatient[]
  expandedPatient: string | null
  setExpandedPatient: Dispatch<SetStateAction<string | null>>
  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, url: string) => Promise<string | null>
  setLightboxSrc: Dispatch<SetStateAction<string | null>>
  openFetchedFile: (url: string, filename: string) => Promise<void>
  onLoadResults: (page: number, search: string) => void
  onDragToSend: (patient: LabPatient) => void
  bottomSentinelRef: RefObject<HTMLDivElement | null>
}

const TYPE_LABEL: Record<string, string> = {
  blood_test: 'Аналіз крові',
  ultrasound: 'УЗД',
  xray: 'Рентген',
  ct_scan: 'КТ',
  mri: 'МРТ',
  ecg: 'ЕКГ',
  dental_scan: 'Стоматологія',
  prescription: 'Рецепт',
  other_lab: 'Інше',
}

/**
 * Lab results tab: patient search + infinite-scroll list, expandable per patient,
 * drag-to-chat sends selected results via a modal that's opened by onDragToSend.
 */
export function LabTab({
  search,
  setSearch,
  loading,
  loadingMore,
  patients,
  expandedPatient,
  setExpandedPatient,
  mediaBlobMap,
  mediaLoading,
  loadMediaBlob,
  setLightboxSrc,
  openFetchedFile,
  onLoadResults,
  onDragToSend,
  bottomSentinelRef,
}: Props) {
  return (
    <div className="rp-lab">
      <div className="rp-lab-search">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onLoadResults(1, search) }}
          placeholder="Пошук за ПІБ або телефоном..."
        />
        <button onClick={() => onLoadResults(1, search)} title="Пошук">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>
      </div>
      {loading && <div className="rp-empty">Завантаження...</div>}
      {!loading && patients.length === 0 && <div className="rp-empty">Немає аналізів</div>}
      <div className="rp-lab-list">
        {patients.map(p => (
          <div
            key={p.key}
            className={`lab-patient${expandedPatient === p.key ? ' lab-patient-active' : ''}`}
            ref={expandedPatient === p.key ? el => {
              if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
            } : undefined}
          >
            <div
              className="lab-patient-header"
              onMouseDown={e => {
                if (e.button !== 0) return
                const startX = e.clientX, startY = e.clientY
                let dragging = false
                let ghost: HTMLDivElement | null = null
                const onMove = (me: MouseEvent) => {
                  if (!dragging && Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) > 8) {
                    dragging = true
                    document.body.classList.add('lab-dragging')
                    ghost = document.createElement('div')
                    ghost.className = 'lab-drag-ghost'
                    ghost.textContent = `📋 ${p.name || 'Аналізи'}`
                    document.body.appendChild(ghost)
                  }
                  if (dragging) me.preventDefault()
                  if (dragging && ghost) {
                    ghost.style.left = me.clientX + 12 + 'px'
                    ghost.style.top = me.clientY + 12 + 'px'
                    const chatEl = document.querySelector('.chat-messages')
                    if (chatEl) {
                      const r = chatEl.getBoundingClientRect()
                      const over = me.clientX >= r.left && me.clientX <= r.right && me.clientY >= r.top && me.clientY <= r.bottom
                      chatEl.classList.toggle('drop-highlight', over)
                    }
                  }
                }
                const onUp = (ue: MouseEvent) => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                  document.body.classList.remove('lab-dragging')
                  if (ghost) { ghost.remove(); ghost = null }
                  const chatEl = document.querySelector('.chat-messages')
                  if (chatEl) chatEl.classList.remove('drop-highlight')
                  if (dragging) {
                    const chatEl2 = document.querySelector('.chat-messages')
                    if (chatEl2) {
                      const r = chatEl2.getBoundingClientRect()
                      if (ue.clientX >= r.left && ue.clientX <= r.right && ue.clientY >= r.top && ue.clientY <= r.bottom) {
                        onDragToSend(p)
                      }
                    }
                  }
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
              onClick={() => setExpandedPatient(prev => prev === p.key ? null : p.key)}
            >
              <div className="lab-patient-avatar">
                {(() => {
                  if (!p.photo) return <span>{(p.name || '?')[0].toUpperCase()}</span>
                  const avatarKey = `lab_avatar_${p.key}`
                  if (!mediaBlobMap[avatarKey] && !mediaLoading[avatarKey]) loadMediaBlob(avatarKey, p.photo)
                  return mediaBlobMap[avatarKey]
                    ? <img src={mediaBlobMap[avatarKey]} alt="" />
                    : <span>{(p.name || '?')[0].toUpperCase()}</span>
                })()}
              </div>
              <div className="lab-patient-info">
                <span className="lab-patient-name">{p.name || 'Невідомий'}</span>
                {p.phone && <span className="lab-patient-phone">{p.phone}</span>}
              </div>
              <span className="lab-patient-count">{p.results.length}</span>
              <svg className={`tpl-chevron ${expandedPatient === p.key ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            {expandedPatient === p.key && (
              <div className="lab-results-list">
                {p.results.map(r => {
                  const isImg = r.media_file && /\.(jpg|jpeg|png|webp|gif)/i.test(r.media_file)
                  const isPdf = r.media_file && /\.pdf/i.test(r.media_file)
                  const thumbKey = `lab_thumb_${r.id}`
                  const fullKey = `lab_full_${r.id}`
                  if (r.thumbnail && !mediaBlobMap[thumbKey] && !mediaLoading[thumbKey]) {
                    loadMediaBlob(thumbKey, r.thumbnail)
                  }
                  return (
                    <div
                      key={r.id}
                      className="lab-result-item"
                      onClick={async () => {
                        if (!r.media_file) return
                        if (isImg) {
                          const blob = mediaBlobMap[fullKey] || await loadMediaBlob(fullKey, r.media_file)
                          if (blob) setLightboxSrc(blob)
                        } else {
                          try {
                            await openFetchedFile(
                              r.media_file,
                              `${r.lab_result_type || 'lab'}_${new Date(r.message_date).toISOString().slice(0, 10)}`
                            )
                          } catch (err) { console.error('Lab file open error:', err) }
                        }
                      }}
                    >
                      <div className="lab-result-thumb">
                        {mediaBlobMap[thumbKey] ? (
                          <img src={mediaBlobMap[thumbKey]} alt="" />
                        ) : (
                          <div className="lab-result-icon">
                            {isPdf ? '📄' : isImg ? '🖼️' : '📎'}
                          </div>
                        )}
                      </div>
                      <div className="lab-result-info">
                        <span className="lab-result-type">{TYPE_LABEL[r.lab_result_type] || r.lab_result_type}</span>
                        <span className="lab-result-date">
                          {new Date(r.message_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </span>
                        {r.is_from_lab && r.lab_name && <span className="lab-result-source">{r.lab_name}</span>}
                      </div>
                      <span className="lab-result-badge">{r.source === 'telegram' ? 'TG' : '✉️'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div ref={bottomSentinelRef} style={{ minHeight: 1 }}>
        {loadingMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <div className="spinner-sm" />
          </div>
        )}
      </div>
    </div>
  )
}
