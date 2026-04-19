import { TelegramIcon, WhatsAppIcon, GmailIcon } from './icons'
import type { Account, Contact, GmailAccount } from '../types'

interface Props {
  selectedGmail: string | null
  gmailAccounts: GmailAccount[]
  selectedAccount: string
  accounts: Account[]
  hasMessengerAccounts: boolean
  contacts: Contact[]
}

/** Header card inside sidebar summarizing the currently selected account. */
export function ActiveAccountCard({
  selectedGmail,
  gmailAccounts,
  selectedAccount,
  accounts,
  hasMessengerAccounts,
  contacts,
}: Props) {
  if (selectedGmail) {
    const gm = gmailAccounts.find(g => g.id === selectedGmail)
    return (
      <div className="active-account-card">
        <GmailIcon size={16} color="#EA4335" />
        <span className="active-account-name">{gm?.label || 'Gmail'}</span>
        <span className="active-account-phone">{gm?.email}</span>
        <span className={`status-dot ${gm?.status === 'active' ? 'online' : ''}`} />
      </div>
    )
  }

  const acc = selectedAccount ? accounts.find(a => a.id === selectedAccount) : null
  return (
    <div className="active-account-card">
      {acc ? (
        <>
          {acc.type === 'telegram'
            ? <TelegramIcon size={16} color="#2AABEE" />
            : <WhatsAppIcon size={16} color="#25D366" />
          }
          <span className="active-account-name">{acc.label}</span>
          <span className="active-account-phone">{acc.phone}</span>
          <span className={`status-dot ${acc.status === 'active' || acc.status === 'connected' ? 'online' : ''}`} />
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="active-account-name">{hasMessengerAccounts ? 'Усі месенджери' : 'Немає доступних акаунтів'}</span>
          <span className="active-account-phone">
            {hasMessengerAccounts ? `${contacts.length} контактів` : 'Зверніться до адміністратора'}
          </span>
        </>
      )}
    </div>
  )
}
