import type { Dispatch, SetStateAction } from 'react'
import { TelegramIcon, WhatsAppIcon } from './icons'
import type { Account } from '../types'

interface AddToAcctState {
  phone: string
  name: string
  clientId: string
}

interface Props {
  state: AddToAcctState | null
  checking: boolean
  result: { telegram: boolean; whatsapp: boolean } | null
  selected: string
  setSelected: Dispatch<SetStateAction<string>>
  adding: boolean
  onClose: () => void
  onAdd: () => void
  accounts: Account[]
}

/** "Add contact to account" modal — checks TG/WA availability and lets user pick account. */
export function AddToAccountModal({
  state,
  checking,
  result,
  selected,
  setSelected,
  adding,
  onClose,
  onAdd,
  accounts,
}: Props) {
  if (!state) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-acct-modal" onClick={e => e.stopPropagation()}>
        <div className="lab-send-header">
          <h3>Додати в акаунт</h3>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="lab-send-patient">
          <div className="lab-patient-avatar">
            <span>{(state.name || state.phone || '?')[0].toUpperCase()}</span>
          </div>
          <div className="lab-send-patient-info">
            <span className="lab-send-patient-name">{state.name || 'Невідомий'}</span>
            <span className="lab-send-patient-phone">{state.phone}</span>
          </div>
        </div>
        <div className="add-acct-check">
          {checking ? (
            <div className="add-acct-checking"><div className="spinner-sm" /> Перевірка месенджерів...</div>
          ) : result ? (
            <div className="add-acct-status">
              <span className={`add-acct-badge${result.telegram ? ' found' : ''}`}>
                <TelegramIcon size={14} color={result.telegram ? '#2AABEE' : 'var(--muted-foreground)'} />
                {result.telegram ? 'Є в Telegram' : 'Немає в TG'}
              </span>
              <span className={`add-acct-badge${result.whatsapp ? ' found' : ''}`}>
                <WhatsAppIcon size={14} color={result.whatsapp ? '#25D366' : 'var(--muted-foreground)'} />
                {result.whatsapp ? 'Є в WhatsApp' : 'Немає в WA'}
              </span>
            </div>
          ) : null}
        </div>
        <div className="add-acct-list">
          <div className="rp-cd-section-title">Оберіть акаунт:</div>
          {accounts.map(a => (
            <label key={a.id} className={`add-acct-item${selected === a.id ? ' selected' : ''}`}>
              <input type="radio" name="acct" checked={selected === a.id} onChange={() => setSelected(a.id)} />
              {a.type === 'whatsapp' ? <WhatsAppIcon size={14} color="#25D366" /> : <TelegramIcon size={14} color="#2AABEE" />}
              <span>{a.label || a.phone}</span>
            </label>
          ))}
        </div>
        <div className="lab-send-footer">
          <button className="lab-send-cancel" onClick={onClose}>Скасувати</button>
          <button className="lab-send-submit" disabled={!selected || adding} onClick={onAdd}>
            {adding ? 'Додавання...' : 'Додати і відкрити чат'}
          </button>
        </div>
      </div>
    </div>
  )
}
