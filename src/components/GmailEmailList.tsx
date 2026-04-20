import type { Dispatch, SetStateAction } from 'react'
import { GmailIcon } from './icons'
import { formatContactDate } from '../utils/dateFormat'
import type { GmailEmail } from '../types'

type GmailDirection = '' | 'inbox' | 'sent'

interface Props {
  selectedGmail: string
  emails: GmailEmail[]
  setEmails: Dispatch<SetStateAction<GmailEmail[]>>
  loading: boolean
  direction: GmailDirection
  search: string
  page: number
  total: number
  selected: GmailEmail | null
  onSelect: (email: GmailEmail) => void
  onPageChange: (account: string, page: number, search: string, direction: GmailDirection) => void
}

/** Gmail sidebar body: email list + pagination + footer count. */
export function GmailEmailList({
  selectedGmail,
  emails,
  setEmails,
  loading,
  direction,
  search,
  page,
  total,
  selected,
  onSelect,
  onPageChange,
}: Props) {
  return (
    <>
      <div className="contact-list">
        {loading && <div className="loading-more">Завантаження...</div>}
        {!loading && emails.length === 0 && (
          <div className="loading-more" style={{ color: 'var(--muted-foreground)' }}>Немає листів</div>
        )}
        {emails.map(email => {
          const emailIsSent = direction === 'sent' || (direction === '' && email.labels?.includes('SENT') && !email.labels?.includes('INBOX'))
          const displayName = emailIsSent ? (email.recipients[0] || '—') : email.sender.replace(/<[^>]+>/, '').trim()
          const initial = displayName[0]?.toUpperCase() || '?'
          return (
            <div
              key={email.id}
              className={`contact gmail-contact ${selected?.id === email.id ? 'active' : ''}${!email.is_read ? ' unread' : ''}`}
              onClick={() => {
                if (!email.is_read) {
                  email.is_read = true
                  setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
                }
                onSelect(email)
              }}
            >
              <div className="avatar gmail-avatar">
                <span>{initial}</span>
              </div>
              <div className="contact-body">
                <div className="contact-row">
                  <span className="contact-name">{displayName}</span>
                  <span className="contact-time">{formatContactDate(email.date)}</span>
                </div>
                <div className="contact-row">
                  <span className="contact-preview gmail-subject">{email.subject || '(без теми)'}</span>
                </div>
                <div className="contact-meta">
                  <span className="contact-preview gmail-snippet">{email.snippet?.slice(0, 50)}</span>
                  <span className="contact-icons">
                    {email.has_attachments && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                    {direction === '' && (
                      emailIsSent
                        ? <svg className="gmail-dir-icon gmail-dir-sent" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                        : <svg className="gmail-dir-icon gmail-dir-inbox" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                    )}
                    <GmailIcon size={11} color="#EA4335" />
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {total > 50 && (
        <div className="gmail-pagination sidebar-footer">
          <button disabled={page <= 1} onClick={() => onPageChange(selectedGmail, page - 1, search, direction)}>←</button>
          <span>{page} / {Math.ceil(total / 50)}</span>
          <button disabled={page * 50 >= total} onClick={() => onPageChange(selectedGmail, page + 1, search, direction)}>→</button>
        </div>
      )}
      {total <= 50 && (
        <div className="sidebar-footer">{emails.length} листів</div>
      )}
    </>
  )
}
