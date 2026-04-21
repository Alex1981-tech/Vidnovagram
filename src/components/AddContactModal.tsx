import type { Dispatch, SetStateAction } from 'react'
import type { Account } from '../types'

interface Suggestion {
  client_id: string
  phone: string
  full_name: string
}

interface AvailResult {
  whatsapp?: boolean
  telegram?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  accounts: Account[]
  selectedAccount: string
  addContactAccount: string
  setAddContactAccount: Dispatch<SetStateAction<string>>
  addContactName: string
  setAddContactName: Dispatch<SetStateAction<string>>
  addContactPhone: string
  setAddContactPhone: Dispatch<SetStateAction<string>>
  addContactLoading: boolean
  addContactResult: string
  addContactAvail: AvailResult | null
  setAddContactAvail: Dispatch<SetStateAction<AvailResult | null>>
  addContactSuggestions: Suggestion[]
  setAddContactSuggestions: Dispatch<SetStateAction<Suggestion[]>>
  addContactShowSuggestions: boolean
  setAddContactShowSuggestions: Dispatch<SetStateAction<boolean>>
  searchAddContactSuggestions: (q: string) => void
  checkPhoneAvail: (phone: string) => void
  startNewChat: () => void
  addContact: () => void
}

/** "New chat" modal: pick account + search existing / enter phone + start-chat or add-to-account. */
export function AddContactModal({
  open,
  onClose,
  accounts,
  selectedAccount,
  addContactAccount,
  setAddContactAccount,
  addContactName,
  setAddContactName,
  addContactPhone,
  setAddContactPhone,
  addContactLoading,
  addContactResult,
  addContactAvail,
  setAddContactAvail,
  addContactSuggestions,
  setAddContactSuggestions,
  addContactShowSuggestions,
  setAddContactShowSuggestions,
  searchAddContactSuggestions,
  checkPhoneAvail,
  startNewChat,
  addContact,
}: Props) {
  if (!open) return null

  // When a specific account is already selected in the sidebar, initiate the new
  // chat directly on that account (no picker). Picker only appears in "All accounts"
  // mode where `selectedAccount` is empty.
  const needsPicker = !selectedAccount
  const pickedAccount = accounts.find(a => a.id === selectedAccount)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h3>Новий чат {pickedAccount ? `— ${pickedAccount.type === 'telegram' ? 'TG' : 'WA'} ${pickedAccount.label}` : ''}</h3>
        {needsPicker && (
          <select
            className="forward-modal-search"
            value={addContactAccount}
            onChange={e => setAddContactAccount(e.target.value)}
            style={{ marginBottom: 8 }}
          >
            <option value="">-- Оберіть акаунт --</option>
            {accounts.filter(a => a.status === 'active' || a.status === 'connected').map(a => (
              <option key={a.id} value={a.id}>{a.type === 'telegram' ? 'TG' : 'WA'} {a.label}</option>
            ))}
          </select>
        )}
        <div style={{ position: 'relative' }}>
          <input
            className="forward-modal-search"
            placeholder="Пошук за ім'ям або телефоном..."
            value={addContactName}
            onChange={e => {
              setAddContactName(e.target.value)
              searchAddContactSuggestions(e.target.value)
            }}
            onFocus={() => addContactSuggestions.length > 0 && setAddContactShowSuggestions(true)}
            onBlur={() => setTimeout(() => setAddContactShowSuggestions(false), 200)}
            autoFocus
          />
          <div style={{ position: 'relative' }}>
            <input
              className="forward-modal-search"
              placeholder="Номер телефону"
              value={addContactPhone}
              onChange={e => {
                setAddContactPhone(e.target.value)
                setAddContactAvail(null)
                checkPhoneAvail(e.target.value)
                if (e.target.value.length >= 2) searchAddContactSuggestions(e.target.value)
              }}
              onFocus={() => addContactSuggestions.length > 0 && setAddContactShowSuggestions(true)}
              onBlur={() => setTimeout(() => setAddContactShowSuggestions(false), 200)}
              style={{ marginTop: 8, paddingRight: 60 }}
            />
            {addContactAvail && (
              <div className="phone-avail-badges">
                {addContactAvail.telegram && <span className="avail-badge tg" title="Telegram">TG</span>}
                {addContactAvail.whatsapp && <span className="avail-badge wa" title="WhatsApp">WA</span>}
                {!addContactAvail.telegram && !addContactAvail.whatsapp && <span className="avail-badge none" title="Не знайдено">—</span>}
              </div>
            )}
          </div>
          {addContactShowSuggestions && addContactSuggestions.length > 0 && (
            <div className="add-contact-suggestions">
              {addContactSuggestions.map(s => (
                <div
                  key={s.client_id}
                  className="add-contact-suggestion-item"
                  onMouseDown={() => {
                    setAddContactName(s.full_name)
                    setAddContactPhone(s.phone)
                    setAddContactShowSuggestions(false)
                    setAddContactSuggestions([])
                    checkPhoneAvail(s.phone)
                  }}
                >
                  <span className="suggestion-name">{s.full_name || '—'}</span>
                  <span className="suggestion-phone">{s.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {addContactResult && (
          <div className={`add-contact-result ${addContactResult.includes('Помилка') ? 'warn' : 'ok'}`}>
            {addContactResult}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="tpl-btn-primary"
            onClick={startNewChat}
            disabled={addContactLoading || !addContactPhone.trim() || !(addContactAccount || selectedAccount)}
          >
            {addContactLoading ? 'Зачекайте...' : 'Написати'}
          </button>
          <button
            className="tpl-btn-secondary"
            onClick={addContact}
            disabled={addContactLoading || !addContactPhone.trim() || !(addContactAccount || selectedAccount)}
          >
            Додати в акаунт
          </button>
          <button className="tpl-btn-secondary" onClick={onClose}>
            Скасувати
          </button>
        </div>
      </div>
    </div>
  )
}
