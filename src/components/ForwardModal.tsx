import { resolveContactDisplay } from '../utils/contactDisplay'
import type { Account, Contact } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  count: number
  selectedClient: string | null
  forwardAccount: string
  setForwardAccount: (v: string) => void
  forwardSearch: string
  setForwardSearch: (v: string) => void
  searchForwardContacts: (q: string) => void
  forwardContacts: Contact[]
  accounts: Account[]
  photoMap: Record<string, string>
  executeForward: (targetClientId: string) => void
}

/** "Forward messages to..." contact picker modal. */
export function ForwardModal({
  open,
  onClose,
  count,
  selectedClient,
  forwardAccount,
  setForwardAccount,
  forwardSearch,
  setForwardSearch,
  searchForwardContacts,
  forwardContacts,
  accounts,
  photoMap,
  executeForward,
}: Props) {
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={e => e.stopPropagation()}>
        <h3>Переслати {count} повідомлень</h3>
        <div className="forward-modal-account">
          <label>Акаунт:</label>
          <select
            value={forwardAccount}
            onChange={e => { setForwardAccount(e.target.value); searchForwardContacts(forwardSearch) }}
          >
            <option value="">Той самий</option>
            {accounts.filter(a => a.status === 'active').map(a => (
              <option key={a.id} value={a.id}>{a.label || a.phone}</option>
            ))}
          </select>
        </div>
        <input
          className="forward-modal-search"
          placeholder="Пошук контакту..."
          value={forwardSearch}
          onChange={e => { setForwardSearch(e.target.value); searchForwardContacts(e.target.value) }}
          autoFocus
        />
        <div className="forward-modal-list">
          {forwardContacts.filter(c => c.client_id !== selectedClient).map(c => {
            const display = resolveContactDisplay(c)
            return (
              <div key={c.client_id} className="forward-modal-contact" onClick={() => executeForward(c.client_id)}>
                <div className="forward-modal-avatar">
                  {photoMap[c.client_id]
                    ? <img src={photoMap[c.client_id]} alt="" />
                    : <span>{(display.name || '?')[0]}</span>
                  }
                </div>
                <div className="forward-modal-info">
                  <div className="forward-modal-name">{display.name}</div>
                  <div className="forward-modal-phone">{display.subtitle || c.phone}</div>
                </div>
              </div>
            )
          })}
          {forwardContacts.length === 0 && <div className="forward-modal-empty">Контактів не знайдено</div>}
        </div>
        <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
      </div>
    </div>
  )
}
