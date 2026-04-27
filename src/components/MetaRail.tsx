// MetaRail — список Meta-акаунтів (FB Messenger + Instagram Direct)
// згрупованих за brand_group, у стилі існуючого account rail.
//
// Показує всі MetaAccount з API. IG-акаунти у status=needs_review
// мають badge "Чекає App Review" (наразі вся IG-лінійка у dev-mode).

import { useState, useMemo } from 'react'
import type { MetaAccount } from '../types'
import { FacebookIcon, InstagramIcon } from './icons'
import { groupAccountsByBrand } from '../utils/metaApi'

interface Props {
  accounts: MetaAccount[]
  selectedAccountId: string | null
  onSelectAccount: (account: MetaAccount) => void
  onRefresh?: () => void
}

const STATUS_LABEL: Record<string, string> = {
  connected: '',
  disconnected: 'Відключено',
  needs_reauth: 'Потрібна повторна авторизація',
  needs_review: 'Чекає App Review',
  error: 'Помилка',
}

export default function MetaRail({ accounts, selectedAccountId, onSelectAccount, onRefresh }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(() => groupAccountsByBrand(accounts), [accounts])

  const toggle = (brand: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  if (accounts.length === 0) {
    return (
      <div className="meta-rail meta-rail--empty">
        <div className="meta-rail__header">Meta</div>
        <div className="meta-rail__empty-text">Немає підключених FB / IG акаунтів</div>
        {onRefresh && (
          <button className="meta-rail__refresh" onClick={onRefresh} type="button">
            Оновити
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="meta-rail">
      <div className="meta-rail__header">
        <span>Meta · {accounts.length}</span>
        {onRefresh && (
          <button className="meta-rail__refresh-btn" onClick={onRefresh} type="button" title="Оновити">
            ↻
          </button>
        )}
      </div>
      {groups.map(({ brand, accounts: groupAccounts }) => {
        const isCollapsed = collapsed.has(brand)
        return (
          <div key={brand} className="meta-rail__group">
            <button
              className="meta-rail__group-header"
              onClick={() => toggle(brand)}
              type="button"
            >
              <span className="meta-rail__chevron">{isCollapsed ? '▶' : '▼'}</span>
              <span className="meta-rail__brand">{brand}</span>
              <span className="meta-rail__count">{groupAccounts.length}</span>
            </button>
            {!isCollapsed && (
              <ul className="meta-rail__accounts">
                {groupAccounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id
                  const Icon = acc.platform === 'facebook' ? FacebookIcon : InstagramIcon
                  const statusLabel = STATUS_LABEL[acc.status] || ''
                  return (
                    <li key={acc.id}>
                      <button
                        className={`meta-rail__account ${isSelected ? 'is-selected' : ''} ${
                          acc.status !== 'connected' ? 'is-inactive' : ''
                        }`}
                        onClick={() => onSelectAccount(acc)}
                        type="button"
                        title={statusLabel || acc.label}
                      >
                        <Icon size={16} />
                        <span className="meta-rail__label">{acc.username || acc.label}</span>
                        {statusLabel && (
                          <span className="meta-rail__status-badge" data-status={acc.status}>
                            {statusLabel}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
