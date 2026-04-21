import type { Account, GmailAccount, GmailEmail } from '../types'
import type { ToastController } from '../hooks/useToasts'

export interface ToastsContainerProps {
  toasts: ToastController['toasts']
  expandedToastGroup: string | null
  setExpandedToastGroup: (v: string | null) => void
  dismissAll: () => void
  dismissToast: (id: number) => void

  // Cross-domain state needed to decorate/route the toast.
  accounts: Account[]
  gmailAccounts: GmailAccount[]
  businessAccounts?: { id: string; provider: string }[]
  photoMap: Record<string, string>

  // Gmail routing when a Gmail toast is clicked.
  selectedGmail: string | null
  gmailEmails: GmailEmail[]
  pendingGmailMsgRef: React.RefObject<string | null>
  setGmailSelectedMsg: (e: GmailEmail | null) => void
  loadGmailEmails: (accountId?: string, page?: number, search?: string, direction?: string) => Promise<void>
  handleGmailAccountClick: (accountId: string) => void

  // Messenger routing when a TG/WA toast is clicked.
  openToastChat: (clientId: string, accountId: string, sender: string) => void
}

/**
 * Bottom-right toast stack grouped by clientId+accountId. Single-toast
 * groups render flat; multi-toast groups collapse into a stack with a
 * count badge, and expand into a vertical list on click.
 */
export function ToastsContainer(props: ToastsContainerProps) {
  const {
    toasts, expandedToastGroup, setExpandedToastGroup, dismissAll, dismissToast,
    accounts, gmailAccounts, businessAccounts, photoMap,
    selectedGmail, gmailEmails, pendingGmailMsgRef, setGmailSelectedMsg,
    loadGmailEmails, handleGmailAccountClick,
    openToastChat,
  } = props

  if (toasts.length === 0) return null

  // Group toasts by clientId+accountId, preserving insertion order.
  const groupMap = new Map<string, typeof toasts>()
  const groupOrder: string[] = []
  for (const t of toasts) {
    const gk = `${t.clientId}:${t.accountId}`
    if (!groupMap.has(gk)) {
      groupMap.set(gk, [])
      groupOrder.push(gk)
    }
    groupMap.get(gk)!.push(t)
  }

  return (
    <div className="toast-container">
      {toasts.length > 2 && (
        <button className="toast-dismiss-all" onClick={dismissAll}>
          Приховати всі
        </button>
      )}
      {groupOrder.map((gk) => {
        const group = groupMap.get(gk)!
        const latest = group[group.length - 1]
        const isExpanded = expandedToastGroup === gk
        const acctType = accounts.find(a => a.id === latest.accountId)?.type
        const isGmail = gmailAccounts.some(g => g.id === latest.accountId)
        const biz = businessAccounts?.find(b => b.id === latest.accountId)
        let toastTypeClass: string
        if (isGmail) toastTypeClass = 'toast-gmail'
        else if (biz?.provider === 'viber_turbosms') toastTypeClass = 'toast-viber'
        else if (biz?.provider === 'telegram_bot') toastTypeClass = 'toast-tg-bot'
        else if (biz?.provider === 'facebook_messenger') toastTypeClass = 'toast-fb'
        else if (biz?.provider === 'instagram_direct') toastTypeClass = 'toast-ig'
        else if (acctType === 'whatsapp') toastTypeClass = 'toast-wa'
        else toastTypeClass = 'toast-tg'
        const avatarUrl = photoMap[latest.clientId]
        const stackCount = group.length

        const renderToast = (t: typeof latest, idx: number, isStack = false) => (
          <div
            key={t.id}
            className={`toast-item ${toastTypeClass}${isStack ? ' toast-stack' : ''}`}
            style={isStack ? ({ '--stack-i': idx } as React.CSSProperties) : undefined}
            onClick={() => {
              if (!isExpanded && stackCount > 1) {
                setExpandedToastGroup(gk)
              } else if (isGmail) {
                if (selectedGmail === t.accountId) {
                  const email = gmailEmails.find(e => e.id === t.clientId)
                  if (email) setGmailSelectedMsg(email)
                  else {
                    pendingGmailMsgRef.current = t.clientId
                    loadGmailEmails(t.accountId, 1, '', '')
                  }
                } else {
                  pendingGmailMsgRef.current = t.clientId
                  handleGmailAccountClick(t.accountId)
                }
                dismissToast(t.id)
                setExpandedToastGroup(null)
              } else {
                openToastChat(t.clientId, t.accountId, t.sender)
                dismissToast(t.id)
                setExpandedToastGroup(null)
              }
            }}
          >
            <div className="toast-avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt="" />
                : <span>{(t.sender || '?')[0].toUpperCase()}</span>}
            </div>
            <div className="toast-content">
              <div className="toast-header">
                <span className="toast-sender">{t.sender}</span>
                {t.account && (
                  <>
                    <span className="toast-arrow">→</span>
                    <span className="toast-account">{t.account}</span>
                  </>
                )}
                <span className="toast-time">
                  {new Date(t.time).toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="toast-body">
                {t.hasMedia && !t.text && (
                  <span className="toast-media">
                    {t.mediaType === 'photo' ? '🖼 Фото'
                      : t.mediaType === 'video' ? '🎬 Відео'
                      : t.mediaType === 'voice' ? '🎤 Голосове'
                      : t.mediaType === 'sticker' ? '🏷 Стікер'
                      : t.mediaType === 'document' ? '📄 Документ'
                      : '📎 Медіа'}
                  </span>
                )}
                {t.hasMedia && t.text && (
                  <span className="toast-media-icon">
                    {t.mediaType === 'photo' ? '🖼'
                      : t.mediaType === 'video' ? '🎬'
                      : t.mediaType === 'voice' ? '🎤'
                      : '📎'}
                    {' '}
                  </span>
                )}
                {t.text && <span className="toast-text">{t.text.slice(0, 120)}</span>}
              </div>
            </div>
            <button
              className="toast-close"
              onClick={e => {
                e.stopPropagation()
                // Close top = close entire group
                group.forEach(x => dismissToast(x.id))
                if (expandedToastGroup === gk) setExpandedToastGroup(null)
              }}
            >×</button>
            {!isStack && stackCount > 1 && !isExpanded && (
              <span className="toast-badge">{stackCount}</span>
            )}
          </div>
        )

        if (stackCount === 1) {
          return <div key={gk}>{renderToast(latest, 0)}</div>
        }
        if (isExpanded) {
          return (
            <div key={gk} className="toast-group expanded">
              {group.map((t, i) => renderToast(t, i))}
            </div>
          )
        }
        return (
          <div key={gk} className="toast-group collapsed">
            {group.slice(-3).reverse().map((t, i) =>
              i === 0 ? renderToast(t, 0) : renderToast(t, i, true),
            )}
          </div>
        )
      })}
    </div>
  )
}
