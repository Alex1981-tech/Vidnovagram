import type { Dispatch, RefObject, SetStateAction } from 'react'
import { GmailIcon } from './icons'
import type { GmailAccount } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  selectedGmail: string | null
  gmailAccounts: GmailAccount[]
  composeTo: string
  setComposeTo: Dispatch<SetStateAction<string>>
  composeSubject: string
  setComposeSubject: Dispatch<SetStateAction<string>>
  composeBody: string
  setComposeBody: Dispatch<SetStateAction<string>>
  composeFiles: File[]
  setComposeFiles: Dispatch<SetStateAction<File[]>>
  composeFileRef: RefObject<HTMLInputElement | null>
  composeSending: boolean
  sendEmail: () => void
}

/** Gmail compose-new-email modal. */
export function ComposeModal({
  open,
  onClose,
  selectedGmail,
  gmailAccounts,
  composeTo,
  setComposeTo,
  composeSubject,
  setComposeSubject,
  composeBody,
  setComposeBody,
  composeFiles,
  setComposeFiles,
  composeFileRef,
  composeSending,
  sendEmail,
}: Props) {
  if (!open || !selectedGmail) return null
  const from = gmailAccounts.find(g => g.id === selectedGmail)?.email

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="gmail-compose-modal" onClick={e => e.stopPropagation()}>
        <div className="gmail-compose-header">
          <h3>Новий лист</h3>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="gmail-compose-from">
          <GmailIcon size={14} color="#EA4335" />
          <span>{from}</span>
        </div>
        <div className="gmail-compose-fields">
          <input
            placeholder="Кому"
            value={composeTo}
            onChange={e => setComposeTo(e.target.value)}
            className="gmail-compose-input"
          />
          <input
            placeholder="Тема"
            value={composeSubject}
            onChange={e => setComposeSubject(e.target.value)}
            className="gmail-compose-input"
          />
          <textarea
            placeholder="Текст листа..."
            value={composeBody}
            onChange={e => setComposeBody(e.target.value)}
            className="gmail-compose-body"
            rows={10}
          />
        </div>
        {composeFiles.length > 0 && (
          <div className="gmail-compose-files">
            {composeFiles.map((f, i) => (
              <div key={i} className="gmail-compose-file">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                <span>{f.name}</span>
                <button onClick={() => setComposeFiles(prev => prev.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div className="gmail-compose-actions">
          <div className="gmail-compose-actions-left">
            <button className="gmail-attach-btn" onClick={() => composeFileRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              Вкласти
            </button>
            <input
              ref={composeFileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files) setComposeFiles(prev => [...prev, ...Array.from(e.target.files!)])
                e.target.value = ''
              }}
            />
          </div>
          <button className="gmail-send-btn" onClick={sendEmail} disabled={composeSending || !composeTo.trim()}>
            {composeSending ? 'Надсилаю...' : 'Надіслати'}
          </button>
        </div>
      </div>
    </div>
  )
}
