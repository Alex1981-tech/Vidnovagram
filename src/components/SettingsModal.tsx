import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { SOUND_OPTIONS } from '../constants'
import {
  type AccountSettings,
  type AppSettings,
  DEFAULT_ACCOUNT_SETTINGS,
} from '../settings'
import { WhatsAppIcon, GmailIcon } from './icons'
import type { Account, GmailAccount, Wallpaper } from '../types'
import type { WaSettingsController } from '../hooks/useWaSettings'

type SettingsTab = 'notifications' | 'background' | 'whatsapp'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  settingsTab: SettingsTab
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>
  soundDropdownOpen: string | null
  setSoundDropdownOpen: Dispatch<SetStateAction<string | null>>
  accounts: Account[]
  gmailAccounts: GmailAccount[]
  appSettings: AppSettings
  setAppSettings: Dispatch<SetStateAction<AppSettings>>
  previewSound: string | null
  setPreviewSound: Dispatch<SetStateAction<string | null>>
  previewAudioRef: MutableRefObject<HTMLAudioElement | null>
  waSettings: WaSettingsController
  wallpapers: Wallpaper[]
  currentVersion: string
}

export function SettingsModal({
  open,
  onClose,
  settingsTab,
  setSettingsTab,
  soundDropdownOpen,
  setSoundDropdownOpen,
  accounts,
  gmailAccounts,
  appSettings,
  setAppSettings,
  previewSound,
  setPreviewSound,
  previewAudioRef,
  waSettings,
  wallpapers,
  currentVersion,
}: SettingsModalProps) {
  if (!open) return null

  const {
    accounts: waAccounts,
    qrAccountId: waQrAccountId,
    qrImage: waQrImage,
    qrStatus: waQrStatus,
    creating: waCreating,
    newLabel: waNewLabel,
    setNewLabel: setWaNewLabel,
    create: waCreateAccount,
    remove: waDeleteAccount,
    startQr: waStartQr,
    stopQr: waStopQr,
  } = waSettings

  const previewSoundFor = (soundId: string, src: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current.currentTime = 0
    }
    const a = new Audio(src)
    a.volume = 0.5
    a.play().catch(() => {})
    previewAudioRef.current = a
    setPreviewSound(soundId)
    setTimeout(() => setPreviewSound(null), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => { e.stopPropagation(); setSoundDropdownOpen(null) }}>
        <div className="settings-modal-header">
          <h2>Налаштування</h2>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="settings-tabs">
          <button className={`settings-tab${settingsTab === 'notifications' ? ' active' : ''}`} onClick={() => setSettingsTab('notifications')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Сповіщення
          </button>
          <button className={`settings-tab${settingsTab === 'whatsapp' ? ' active' : ''}`} onClick={() => setSettingsTab('whatsapp')}>
            <WhatsAppIcon size={16} color={settingsTab === 'whatsapp' ? '#25D366' : 'currentColor'} />
            WhatsApp
          </button>
          <button className={`settings-tab${settingsTab === 'background' ? ' active' : ''}`} onClick={() => setSettingsTab('background')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Фон чату
          </button>
        </div>
        <div className="settings-modal-body">
          {settingsTab === 'notifications' && (
            <div className="settings-section">
              <div className="settings-notif-list">
                {accounts.map(acct => {
                  const as = appSettings.accounts[acct.id] || DEFAULT_ACCOUNT_SETTINGS
                  const updateAcct = (patch: Partial<AccountSettings>) => {
                    setAppSettings(prev => ({
                      ...prev,
                      accounts: { ...prev.accounts, [acct.id]: { ...as, ...patch } },
                    }))
                  }
                  const currentSound = SOUND_OPTIONS.find(s => s.id === as.soundId) || SOUND_OPTIONS[0]
                  return (
                    <div key={acct.id} className="settings-notif-row">
                      <div className="settings-notif-acct">
                        {acct.type === 'telegram' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.5"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M20.52 3.449A11.94 11.94 0 0 0 12.003.002C5.376.002.003 5.376.003 12c0 2.119.553 4.187 1.602 6.012L0 24l6.176-1.62A11.96 11.96 0 0 0 12.003 24C18.628 24 24 18.624 24 12c0-3.205-1.248-6.219-3.48-8.551zM12.003 21.785a9.74 9.74 0 0 1-5.212-1.51l-.373-.222-3.866 1.014 1.032-3.77-.244-.387A9.765 9.765 0 0 1 2.218 12c0-5.39 4.39-9.78 9.783-9.78a9.725 9.725 0 0 1 6.918 2.868 9.727 9.727 0 0 1 2.864 6.919c-.002 5.388-4.39 9.778-9.78 9.778z"/></svg>
                        )}
                        <span className="settings-notif-name">{acct.label || acct.phone}</span>
                      </div>
                      <div className="settings-notif-controls">
                        <button
                          className={`settings-notif-icon-btn${as.popupEnabled ? ' on' : ''}`}
                          onClick={() => updateAcct({ popupEnabled: !as.popupEnabled })}
                          title={as.popupEnabled ? 'Сповіщення увімкнено' : 'Сповіщення вимкнено'}
                        >
                          {as.popupEnabled ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          )}
                        </button>
                        <button
                          className={`settings-notif-icon-btn${as.soundEnabled ? ' on' : ''}`}
                          onClick={() => updateAcct({ soundEnabled: !as.soundEnabled })}
                          title={as.soundEnabled ? 'Звук увімкнено' : 'Звук вимкнено'}
                        >
                          {as.soundEnabled ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                          )}
                        </button>
                        {as.soundEnabled && (
                          <div className="settings-sound-dropdown-wrap">
                            <button
                              className="settings-sound-select"
                              onClick={e => { e.stopPropagation(); setSoundDropdownOpen(prev => prev === acct.id ? null : acct.id) }}
                            >
                              <span>{currentSound.label}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            {soundDropdownOpen === acct.id && (
                              <div className="settings-sound-dropdown" onClick={e => e.stopPropagation()}>
                                {SOUND_OPTIONS.map(s => (
                                  <div
                                    key={s.id}
                                    className={`settings-sound-item${as.soundId === s.id ? ' active' : ''}`}
                                    onClick={() => {
                                      updateAcct({ soundId: s.id })
                                      setSoundDropdownOpen(null)
                                    }}
                                  >
                                    <span className="settings-sound-item-label">{s.label}</span>
                                    <button
                                      className={`settings-sound-play${previewSound === s.id ? ' playing' : ''}`}
                                      onClick={e => { e.stopPropagation(); previewSoundFor(s.id, s.src) }}
                                      title="Прослухати"
                                    >
                                      {previewSound === s.id ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                      ) : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                      )}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {gmailAccounts.map(gm => {
                  const as = appSettings.accounts[gm.id] || DEFAULT_ACCOUNT_SETTINGS
                  const updateAcct = (patch: Partial<AccountSettings>) => {
                    setAppSettings(prev => ({
                      ...prev,
                      accounts: { ...prev.accounts, [gm.id]: { ...as, ...patch } },
                    }))
                  }
                  const currentSound = SOUND_OPTIONS.find(s => s.id === as.soundId) || SOUND_OPTIONS[0]
                  return (
                    <div key={gm.id} className="settings-notif-row">
                      <div className="settings-notif-acct">
                        <GmailIcon size={14} />
                        <span className="settings-notif-name">{gm.label || gm.email}</span>
                      </div>
                      <div className="settings-notif-controls">
                        <button
                          className={`settings-notif-icon-btn${as.popupEnabled ? ' on' : ''}`}
                          onClick={() => updateAcct({ popupEnabled: !as.popupEnabled })}
                          title={as.popupEnabled ? 'Сповіщення увімкнено' : 'Сповіщення вимкнено'}
                        >
                          {as.popupEnabled ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          )}
                        </button>
                        <button
                          className={`settings-notif-icon-btn${as.soundEnabled ? ' on' : ''}`}
                          onClick={() => updateAcct({ soundEnabled: !as.soundEnabled })}
                          title={as.soundEnabled ? 'Звук увімкнено' : 'Звук вимкнено'}
                        >
                          {as.soundEnabled ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                          )}
                        </button>
                        {as.soundEnabled && (
                          <div className="settings-sound-dropdown-wrap">
                            <button
                              className="settings-sound-select"
                              onClick={e => { e.stopPropagation(); setSoundDropdownOpen(prev => prev === gm.id ? null : gm.id) }}
                            >
                              <span>{currentSound.label}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            {soundDropdownOpen === gm.id && (
                              <div className="settings-sound-dropdown" onClick={e => e.stopPropagation()}>
                                {SOUND_OPTIONS.map(s => (
                                  <div
                                    key={s.id}
                                    className={`settings-sound-item${as.soundId === s.id ? ' active' : ''}`}
                                    onClick={() => {
                                      updateAcct({ soundId: s.id })
                                      setSoundDropdownOpen(null)
                                    }}
                                  >
                                    <span className="settings-sound-item-label">{s.label}</span>
                                    <button
                                      className={`settings-sound-play${previewSound === s.id ? ' playing' : ''}`}
                                      onClick={e => { e.stopPropagation(); previewSoundFor(s.id, s.src) }}
                                      title="Прослухати"
                                    >
                                      {previewSound === s.id ? (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                      ) : (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                      )}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {settingsTab === 'whatsapp' && (
            <div className="settings-section">
              <div className="wa-settings">
                <h3 className="wa-settings-title">WhatsApp акаунти</h3>
                <p className="wa-settings-desc">Підключіть WhatsApp акаунт через QR-код для обміну повідомленнями.</p>

                <div className="wa-acct-list">
                  {waAccounts.length === 0 && (
                    <div className="wa-acct-empty">Немає акаунтів. Створіть новий для підключення.</div>
                  )}
                  {waAccounts.map(wa => (
                    <div key={wa.id} className={`wa-acct-card wa-status-${wa.status}`}>
                      <div className="wa-acct-info">
                        <WhatsAppIcon size={20} color="#25D366" />
                        <div className="wa-acct-details">
                          <span className="wa-acct-label">{wa.label || 'Без назви'}</span>
                          <span className="wa-acct-phone">{wa.phone || wa.wa_name || '—'}</span>
                        </div>
                        <span className={`wa-acct-status-badge wa-badge-${wa.status}`}>
                          {wa.status === 'connected' ? 'Підключено' : wa.status === 'pending' ? 'Очікує' : wa.status === 'error' ? 'Помилка' : 'Відключено'}
                        </span>
                      </div>
                      <div className="wa-acct-actions">
                        {wa.status !== 'connected' && (
                          <button
                            className="wa-acct-btn wa-btn-qr"
                            onClick={() => waStartQr(wa.id)}
                            disabled={waQrAccountId === wa.id}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg>
                            QR-код
                          </button>
                        )}
                        <button
                          className="wa-acct-btn wa-btn-delete"
                          onClick={() => { if (confirm(`Видалити акаунт "${wa.label}"?`)) waDeleteAccount(wa.id) }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                      {wa.error_message && <div className="wa-acct-error">{wa.error_message}</div>}
                    </div>
                  ))}
                </div>

                {waQrAccountId && (
                  <div className="wa-qr-section">
                    <div className="wa-qr-header">
                      <h4>Скануйте QR-код в WhatsApp</h4>
                      <button className="icon-btn" onClick={waStopQr}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="wa-qr-body">
                      {waQrImage ? (
                        <img src={waQrImage} alt="WhatsApp QR" className="wa-qr-image" />
                      ) : (
                        <div className="wa-qr-loading">
                          <div className="spinner-sm" />
                          <span>{waQrStatus === 'starting' ? 'Запуск...' : 'Очікування QR-коду...'}</span>
                        </div>
                      )}
                      <div className="wa-qr-instructions">
                        <p>1. Відкрийте WhatsApp на телефоні</p>
                        <p>2. Перейдіть в <b>Налаштування → Пов'язані пристрої</b></p>
                        <p>3. Натисніть <b>Під'єднати пристрій</b></p>
                        <p>4. Наведіть камеру на цей QR-код</p>
                      </div>
                    </div>
                    {waQrStatus === 'connected' && (
                      <div className="wa-qr-success">Підключено!</div>
                    )}
                  </div>
                )}

                {!waQrAccountId && (
                  <div className="wa-create-section">
                    <div className="wa-create-row">
                      <input
                        className="wa-create-input"
                        placeholder="Назва акаунту (напр. Рецепція)"
                        value={waNewLabel}
                        onChange={e => setWaNewLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') waCreateAccount() }}
                      />
                      <button
                        className="wa-acct-btn wa-btn-create"
                        onClick={waCreateAccount}
                        disabled={waCreating || !waNewLabel.trim()}
                      >
                        {waCreating ? <div className="spinner-sm" /> : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        )}
                        Додати
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {settingsTab === 'background' && (
            <div className="settings-section">
              <div className="settings-bg-options">
                <button
                  className={`settings-bg-option${appSettings.chatBackground.type === 'default' ? ' active' : ''}`}
                  onClick={() => setAppSettings(prev => ({ ...prev, chatBackground: { type: 'default', value: '' } }))}
                >
                  <div className="settings-bg-preview settings-bg-default" />
                  <span>Стандартний</span>
                </button>
                <button
                  className={`settings-bg-option${appSettings.chatBackground.type === 'color' ? ' active' : ''}`}
                  onClick={() => setAppSettings(prev => ({ ...prev, chatBackground: { type: 'color', value: prev.chatBackground.type === 'color' ? prev.chatBackground.value : '#1a1a2e' } }))}
                >
                  <div className="settings-bg-preview" style={{ background: appSettings.chatBackground.type === 'color' ? appSettings.chatBackground.value : '#1a1a2e' }} />
                  <span>Колір</span>
                </button>
                <button
                  className={`settings-bg-option${appSettings.chatBackground.type === 'wallpaper' ? ' active' : ''}`}
                  onClick={() => setAppSettings(prev => ({ ...prev, chatBackground: { type: 'wallpaper', value: prev.chatBackground.type === 'wallpaper' ? prev.chatBackground.value : (wallpapers[0]?.full || '') } }))}
                >
                  <div className="settings-bg-preview settings-bg-wallpaper-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <span>Шпалери</span>
                </button>
              </div>

              {appSettings.chatBackground.type === 'color' && (
                <div className="settings-color-section">
                  <div className="settings-color-palette">
                    {[
                      '#0f0f23', '#1a1a2e', '#16213e', '#0f3460', '#1b262c',
                      '#222831', '#2d3436', '#353b48', '#2c3e50', '#34495e',
                      '#1e3a5f', '#1a472a', '#2d4a3e', '#3b341f', '#4a3728',
                      '#3d1f3d', '#2e1a47', '#1a1a3e', '#0d1b2a', '#1b2838',
                      '#e8d5b7', '#f5e6cc', '#faf3e0', '#f0f0f0', '#d5e5d5',
                    ].map(color => (
                      <button
                        key={color}
                        className={`settings-color-swatch${appSettings.chatBackground.value === color ? ' active' : ''}`}
                        style={{ background: color }}
                        onClick={() => setAppSettings(prev => ({ ...prev, chatBackground: { type: 'color', value: color } }))}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="settings-color-custom">
                    <input
                      type="color"
                      value={appSettings.chatBackground.value || '#1a1a2e'}
                      onChange={e => setAppSettings(prev => ({ ...prev, chatBackground: { type: 'color', value: e.target.value } }))}
                    />
                    <span className="settings-label-small">Свій колір</span>
                  </div>
                </div>
              )}

              {appSettings.chatBackground.type === 'wallpaper' && (
                <div className="settings-wallpaper-grid">
                  {wallpapers.map(wp => (
                    <button
                      key={wp.id}
                      className={`settings-wallpaper-thumb${appSettings.chatBackground.value === wp.full ? ' active' : ''}`}
                      onClick={() => setAppSettings(prev => ({ ...prev, chatBackground: { type: 'wallpaper', value: wp.full } }))}
                    >
                      {wp._thumbBlob ? <img src={wp._thumbBlob} alt="" /> : <div className="settings-wallpaper-loading" />}
                    </button>
                  ))}
                  {wallpapers.length === 0 && <p className="settings-no-wallpapers">Шпалери не знайдено</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="settings-modal-footer">
          <span className="settings-version">Vidnovagram v{currentVersion}</span>
        </div>
      </div>
    </div>
  )
}
