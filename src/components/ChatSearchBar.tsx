import type { Dispatch, RefObject, SetStateAction } from 'react'

interface Props {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  setQuery: Dispatch<SetStateAction<string>>
  results: (string | number)[]
  idx: number
  setIdx: Dispatch<SetStateAction<number>>
  onClose: () => void
}

/** In-chat message search bar with up/down navigation and scroll-into-view. */
export function ChatSearchBar({ inputRef, query, setQuery, results, idx, setIdx, onClose }: Props) {
  const scrollTo = (i: number) => {
    setIdx(i)
    const msgEl = document.querySelector(`[data-msg-id="${results[i]}"]`)
    if (msgEl) msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="chat-search-panel">
      <input
        ref={inputRef}
        type="text"
        className="chat-search-input"
        placeholder="Пошук у чаті..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && results.length > 0) {
            scrollTo((idx + 1) % results.length)
          }
          if (e.key === 'Escape') onClose()
        }}
        autoFocus
      />
      {results.length > 0 && (
        <div className="chat-search-nav">
          <span className="chat-search-count">{idx + 1}/{results.length}</span>
          <button
            className="chat-search-nav-btn"
            onClick={() => scrollTo((idx - 1 + results.length) % results.length)}
          >
            ▲
          </button>
          <button
            className="chat-search-nav-btn"
            onClick={() => scrollTo((idx + 1) % results.length)}
          >
            ▼
          </button>
        </div>
      )}
      {query && results.length === 0 && (
        <span className="chat-search-count">0 результатів</span>
      )}
      <button className="chat-search-close" onClick={onClose}>✕</button>
    </div>
  )
}
