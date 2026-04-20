import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { UserIcon } from './icons'
import { resolveContactDisplay } from '../utils/contactDisplay'

interface LinkCandidate {
  id: string
  phone: string
  full_name: string
  calls_count: number
}

interface Props {
  open: boolean
  onClose: () => void
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  results: LinkCandidate[]
  loading: boolean
  onPickClient: (clientId: string) => void
  debounceTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined>
  runSearch: (q: string) => void
}

/**
 * "Link to patient" modal. Placeholder (Telegram hides the phone) gets linked
 * to an actual Client row so subsequent messages inherit correct name/phone.
 */
export function LinkClientModal({
  open,
  onClose,
  search,
  setSearch,
  results,
  loading,
  onPickClient,
  debounceTimerRef,
  runSearch,
}: Props) {
  if (!open) return null

  return (
    <div className="link-modal-overlay" onClick={onClose}>
      <div className="link-modal" onClick={e => e.stopPropagation()}>
        <div className="link-modal-header">
          <h3>Прив'язати до пацієнта</h3>
          <button className="link-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="link-modal-search">
          <input
            type="text"
            placeholder="Пошук за ім'ям або телефоном..."
            value={search}
            onChange={e => {
              const v = e.target.value
              setSearch(v)
              clearTimeout(debounceTimerRef.current)
              debounceTimerRef.current = setTimeout(() => runSearch(v), 300)
            }}
            autoFocus
          />
        </div>
        <div className="link-modal-results">
          {results.map(c => {
            const display = resolveContactDisplay({ full_name: c.full_name, phone: c.phone })
            return (
              <button
                key={c.id}
                className="link-modal-item"
                onClick={() => onPickClient(c.id)}
                disabled={loading}
              >
                <div className="link-modal-item-avatar"><UserIcon /></div>
                <div className="link-modal-item-info">
                  <div className="link-modal-item-name">{display.name}</div>
                  <div className="link-modal-item-phone">
                    {c.phone}{c.calls_count > 0 ? ` · ${c.calls_count} дзвінків` : ''}
                  </div>
                </div>
              </button>
            )
          })}
          {search.length >= 2 && results.length === 0 && (
            <div className="link-modal-empty">Не знайдено</div>
          )}
          {search.length < 2 && (
            <div className="link-modal-empty">Введіть ім'я або телефон</div>
          )}
        </div>
      </div>
    </div>
  )
}
