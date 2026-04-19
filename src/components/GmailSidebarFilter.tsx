type GmailDirection = '' | 'inbox' | 'sent'

interface Props {
  direction: GmailDirection
  onDirectionChange: (dir: GmailDirection) => void
  onCompose: () => void
}

/** Gmail sidebar toolbar: All / Inbox / Sent filter buttons + "Compose" action. */
export function GmailSidebarFilter({ direction, onDirectionChange, onCompose }: Props) {
  return (
    <div className="gmail-sidebar-filter">
      <button
        className={`gmail-filter-btn ${direction === '' ? 'active' : ''}`}
        onClick={() => onDirectionChange('')}
        title="Усі"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 4 10 8 10-8"/></svg>
      </button>
      <button
        className={`gmail-filter-btn gmail-filter-inbox ${direction === 'inbox' ? 'active' : ''}`}
        onClick={() => onDirectionChange('inbox')}
        title="Вхідні"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12l-7 7-7-7"/><path d="M12 5v14"/></svg>
      </button>
      <button
        className={`gmail-filter-btn gmail-filter-sent ${direction === 'sent' ? 'active' : ''}`}
        onClick={() => onDirectionChange('sent')}
        title="Надіслані"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12l7-7 7 7"/><path d="M12 19V5"/></svg>
      </button>
      <button className="gmail-filter-compose" onClick={onCompose} title="Написати">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
      </button>
    </div>
  )
}
