import type { Dispatch, SetStateAction } from 'react'
import type { LabPatient } from '../types'

interface Props {
  patient: LabPatient | null
  selectedIds: Set<string | number>
  setSelectedIds: Dispatch<SetStateAction<Set<string | number>>>
  sending: boolean
  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  onClose: () => void
  onSend: () => void
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
 * Modal triggered by drag-to-chat on a lab patient card. Shows a checklist of
 * the patient's results with thumbnails; user toggles which ones to attach and
 * clicks "Send". Parent's `onSend` handles the actual upload flow and clears state.
 */
export function LabSendModal({
  patient,
  selectedIds,
  setSelectedIds,
  sending,
  mediaBlobMap,
  mediaLoading,
  loadMediaBlob,
  onClose,
  onSend,
}: Props) {
  if (!patient) return null

  const withFile = patient.results.filter(r => r.media_file)
  const allSelected = withFile.length > 0 && selectedIds.size === withFile.length

  const toggleOne = (id: string | number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lab-send-modal" onClick={e => e.stopPropagation()}>
        <div className="lab-send-header">
          <h3>Надіслати аналізи</h3>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="lab-send-patient">
          <div className="lab-patient-avatar">
            <span>{(patient.name || '?')[0].toUpperCase()}</span>
          </div>
          <div className="lab-send-patient-info">
            <span className="lab-send-patient-name">{patient.name || 'Невідомий'}</span>
            {patient.phone && <span className="lab-send-patient-phone">{patient.phone}</span>}
          </div>
        </div>
        <div className="lab-send-select-all">
          <label onMouseDown={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={e => {
                if (e.target.checked) setSelectedIds(new Set(withFile.map(r => r.id)))
                else setSelectedIds(new Set())
              }}
            />
            Вибрати всі ({withFile.length})
          </label>
        </div>
        <div className="lab-send-list">
          {patient.results.map(r => {
            const hasFile = !!r.media_file
            const isChecked = selectedIds.has(r.id)
            const thumbKey = `labsend_thumb_${r.id}`
            if (r.thumbnail && !mediaBlobMap[thumbKey] && !mediaLoading[thumbKey]) {
              loadMediaBlob(thumbKey, r.thumbnail)
            }
            return (
              <div
                key={r.id}
                className={`lab-send-item${!hasFile ? ' disabled' : ''}${isChecked ? ' selected' : ''}`}
                onClick={() => { if (hasFile) toggleOne(r.id) }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!hasFile}
                  onClick={e => e.stopPropagation()}
                  onChange={() => { if (hasFile) toggleOne(r.id) }}
                />
                <div className="lab-send-item-thumb">
                  {mediaBlobMap[thumbKey] ? (
                    <img src={mediaBlobMap[thumbKey]} alt="" />
                  ) : (
                    <div className="lab-result-icon">
                      {/\.pdf/i.test(r.media_file || '') ? '📄' : '🖼️'}
                    </div>
                  )}
                </div>
                <div className="lab-send-item-info">
                  <span className="lab-send-item-type">{TYPE_LABEL[r.lab_result_type] || r.lab_result_type || 'Аналіз'}</span>
                  <span className="lab-send-item-date">{new Date(r.message_date).toLocaleDateString('uk-UA')}</span>
                </div>
                <span className="lab-result-badge">{r.source === 'telegram' ? 'TG' : '✉️'}</span>
              </div>
            )
          })}
        </div>
        <div className="lab-send-footer">
          <button className="lab-send-cancel" onClick={onClose}>Скасувати</button>
          <button
            className="lab-send-submit"
            disabled={selectedIds.size === 0 || sending}
            onClick={onSend}
          >
            {sending ? 'Надсилання...' : `Надіслати (${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
