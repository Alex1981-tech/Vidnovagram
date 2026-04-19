interface Props {
  isGmailMode: boolean
  search: string
  gmailSearch: string
  onSearchChange: (value: string) => void
  onGmailSearchChange: (value: string) => void
}

/** Sidebar search input. Placeholder + handler switch between messenger and Gmail modes. */
export function SidebarSearch({
  isGmailMode,
  search,
  gmailSearch,
  onSearchChange,
  onGmailSearchChange,
}: Props) {
  return (
    <div className="sidebar-search">
      <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
      {isGmailMode ? (
        <input
          placeholder="Пошук листів..."
          value={gmailSearch}
          onChange={e => onGmailSearchChange(e.target.value)}
        />
      ) : (
        <input
          placeholder="Пошук контактів та повідомлень..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      )}
    </div>
  )
}
