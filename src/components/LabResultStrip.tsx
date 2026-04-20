import { XIcon } from './icons'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  onOpenLabTab: (patientKey: string) => void
  onEditLabResult: (message: ChatMessage) => void
  onUnlinkLabResult: (message: ChatMessage) => void
}

/**
 * Footer strip attached to lab-result messages. Three states:
 *  - **linked**: patient found; shows name + edit/unlink actions, clicks open lab tab
 *  - **unlinked**: message classified as lab but no patient — prompt to link
 *  - **unclassified**: received media never classified — "Додати аналіз" button
 */
export function LabResultStrip({
  message: m,
  onOpenLabTab,
  onEditLabResult,
  onUnlinkLabResult,
}: Props) {
  // Linked
  if (m.is_lab_result && (m.patient_client_id || m.patient_name)) {
    const patientKey = m.patient_client_id || m.patient_name || ''
    return (
      <div
        className="lab-strip lab-strip-linked"
        onClick={(e) => { e.stopPropagation(); onOpenLabTab(patientKey) }}
      >
        <svg className="lab-strip-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
        <span className="lab-strip-name">{m.patient_client_name || m.patient_name}</span>
        <div className="lab-strip-actions">
          <button onClick={(e) => { e.stopPropagation(); onEditLabResult(m) }} title="Змінити пацієнта">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onUnlinkLabResult(m) }} title="Відкріпити">
            <XIcon />
          </button>
        </div>
      </div>
    )
  }

  // Unlinked (detected but no patient)
  if (m.is_lab_result && !m.patient_client_id && !m.patient_name) {
    return (
      <div
        className="lab-strip lab-strip-unlinked"
        onClick={(e) => { e.stopPropagation(); onEditLabResult(m) }}
      >
        <svg className="lab-strip-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M12 11v4"/><path d="M12 17h.01"/></svg>
        <span className="lab-strip-label">Привʼязати пацієнта</span>
      </div>
    )
  }

  // Unclassified incoming media — "Add lab" affordance
  if (m.is_lab_result == null && m.direction === 'received' && m.has_media) {
    return (
      <button
        className="lab-card-assign-btn"
        onClick={(e) => { e.stopPropagation(); onEditLabResult(m) }}
        title="Додати аналіз"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        <span>Додати аналіз</span>
      </button>
    )
  }

  return null
}
