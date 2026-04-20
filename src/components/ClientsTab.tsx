import type { Dispatch, SetStateAction } from 'react'
import { TelegramIcon, WhatsAppIcon } from './icons'
import { resolveContactDisplay } from '../utils/contactDisplay'
import type { ChatMessage } from '../types'

interface RpClient {
  id: string
  phone: string
  full_name: string
  calls_count: number
  has_telegram: boolean
  has_whatsapp?: boolean
}

interface RpClientInfo {
  name: string
  phone: string
  linked_phones?: { id: string; phone: string }[]
}

interface AddToAcctState {
  phone: string
  name: string
  clientId: string
}

interface RpCall {
  id: string
  call_datetime: string
  direction?: string
  disposition?: string
  duration_seconds?: number
  operator_name?: string
  has_audio?: boolean
  audio_file?: string
}

interface Props {
  selectedClientId: string | null
  setSelectedClientId: Dispatch<SetStateAction<string | null>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  clients: RpClient[]
  loading: boolean
  page: number
  total: number
  photos: Record<string, string>
  loadClients: (page: number, search: string, append?: boolean) => void
  loadClientDetail: (clientId: string) => void
  clientInfo: RpClientInfo | null
  detailLoading: boolean
  calls: RpCall[]
  messages: ChatMessage[]
  playingCall: string | null
  playCallAudio: (id: string, audioFile?: string) => Promise<void> | void
  openClientChat: (clientId: string, phone?: string, name?: string) => void
  onAddToAccount: (state: AddToAcctState) => void
}

/**
 * Right panel "Контакти" tab: client search + infinite-scroll list, or client detail
 * view with chronological timeline (calls + messages merged by date).
 */
export function ClientsTab({
  selectedClientId,
  setSelectedClientId: _setSelectedClientId,
  search,
  setSearch,
  clients,
  loading,
  page,
  total,
  photos,
  loadClients,
  loadClientDetail,
  clientInfo,
  detailLoading,
  calls,
  messages,
  playingCall,
  playCallAudio,
  openClientChat,
  onAddToAccount,
}: Props) {
  return (
    <div className="rp-clients">
      {!selectedClientId ? (
        <>
          <div className="rp-lab-search">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadClients(1, search) }}
              placeholder="Пошук за ПІБ або телефоном..."
            />
            {search && (
              <button onClick={() => { setSearch(''); loadClients(1, '') }} title="Очистити" className="rp-search-clear">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
            <button onClick={() => loadClients(1, search)} title="Пошук">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
          </div>
          {loading && <div className="rp-empty">Завантаження...</div>}
          {!loading && clients.length === 0 && <div className="rp-empty">Немає контактів</div>}
          <div
            className="rp-client-list"
            onScroll={e => {
              const el = e.currentTarget
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && !loading && clients.length < total) {
                loadClients(page + 1, search, true)
              }
            }}
          >
            {clients.map(c => {
              const display = resolveContactDisplay({ full_name: c.full_name, phone: c.phone })
              return (
                <div key={c.id} className="rp-client-item" onClick={() => loadClientDetail(c.id)}>
                  <div className="rp-client-avatar">
                    {photos[c.id]
                      ? <img src={photos[c.id]} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : <span>{(display.name || '?')[0].toUpperCase()}</span>}
                  </div>
                  <div className="rp-client-info">
                    <div className="rp-client-name-row">
                      <span className="rp-client-name">{display.name}</span>
                      <span className="rp-client-icons">
                        {c.has_telegram && <TelegramIcon size={12} color="#2AABEE" />}
                        {c.has_whatsapp && <WhatsAppIcon size={12} color="#25D366" />}
                      </span>
                    </div>
                    <div className="rp-client-meta">
                      {display.subtitle && <span className="rp-client-phone">{display.subtitle}</span>}
                      <span className="rp-client-calls">{c.calls_count} дзв.</span>
                    </div>
                  </div>
                  <button
                    className="rp-client-add-btn"
                    title="Додати в акаунт і відкрити чат"
                    onClick={e => {
                      e.stopPropagation()
                      onAddToAccount({ phone: c.phone, name: c.full_name, clientId: c.id })
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  </button>
                </div>
              )
            })}
            {loading && clients.length > 0 && <div className="rp-empty" style={{ padding: '8px' }}>Завантаження...</div>}
          </div>
        </>
      ) : (
        <div className="rp-client-detail">
          {detailLoading && <div className="rp-empty">Завантаження...</div>}
          {!detailLoading && (
            <>
              <div className="rp-cd-card">
                {photos[selectedClientId] && (
                  <img src={photos[selectedClientId]} alt="" className="rp-cd-photo" />
                )}
                <div className="rp-cd-name">{clientInfo?.name || 'Невідомий'}</div>
                <div className="rp-cd-phone">{clientInfo?.phone}</div>
                {(clientInfo?.linked_phones?.length ?? 0) > 0 && (
                  <div className="rp-cd-linked-phones">
                    {clientInfo!.linked_phones!.map(lp => (
                      <div key={lp.id} className="rp-cd-linked-phone">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        {lp.phone}
                      </div>
                    ))}
                  </div>
                )}
                <div className="rp-cd-actions">
                  <button onClick={() => openClientChat(selectedClientId, clientInfo?.phone, clientInfo?.name)} title="Відкрити чат">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Чат
                  </button>
                  <button
                    onClick={() => onAddToAccount({ phone: clientInfo?.phone || '', name: clientInfo?.name || '', clientId: selectedClientId })}
                    title="Додати в акаунт"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  </button>
                </div>
              </div>
              {(() => {
                const timeline: { type: 'call' | 'msg'; date: string; data: RpCall | ChatMessage }[] = []
                calls.forEach(c => timeline.push({ type: 'call', date: c.call_datetime, data: c }))
                messages.filter(m => m.source !== 'binotel' && (m as unknown as { type?: string }).type !== 'call')
                  .forEach(m => timeline.push({ type: 'msg', date: m.message_date, data: m }))
                timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                const shown = timeline.slice(0, 50)
                if (shown.length === 0) return <div className="rp-empty">Немає історії</div>
                return (
                  <div className="rp-cd-section">
                    <div className="rp-cd-section-title">
                      Хронологія ({timeline.length})
                      <button className="rp-cd-chat-link" onClick={() => openClientChat(selectedClientId, clientInfo?.phone, clientInfo?.name)}>
                        Відкрити чат →
                      </button>
                    </div>
                    {shown.map(item => item.type === 'call' ? (
                      <div key={`c-${(item.data as RpCall).id}`} className={`rp-cd-call ${((item.data as RpCall).disposition || '').toLowerCase() === 'answer' ? 'answered' : ((item.data as RpCall).disposition || '').toLowerCase()}`}>
                        <div className="rp-cd-call-icon">
                          {(item.data as RpCall).direction === 'incoming'
                            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 2 16 8 22 8"/><line x1="22" y1="2" x2="16" y2="8"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/></svg>
                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 8 22 2 16 2"/><line x1="16" y1="8" x2="22" y2="2"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/></svg>
                          }
                        </div>
                        <div className="rp-cd-call-info">
                          <span className="rp-cd-call-date">{new Date((item.data as RpCall).call_datetime).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="rp-cd-call-dur">{(item.data as RpCall).duration_seconds ? `${Math.floor(((item.data as RpCall).duration_seconds as number) / 60)}:${String(((item.data as RpCall).duration_seconds as number) % 60).padStart(2, '0')}` : '—'}</span>
                          {(item.data as RpCall).operator_name && <span className="rp-cd-call-op">{(item.data as RpCall).operator_name}</span>}
                        </div>
                        {(item.data as RpCall).has_audio && (
                          <button
                            className={`rp-cd-play${playingCall === (item.data as RpCall).id ? ' playing' : ''}`}
                            onClick={() => playCallAudio((item.data as RpCall).id, (item.data as RpCall).audio_file)}
                          >
                            {playingCall === (item.data as RpCall).id ? '⏸' : '▶'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        key={`m-${(item.data as ChatMessage).id}`}
                        className={`rp-cd-msg ${(item.data as ChatMessage).direction}`}
                        onClick={() => openClientChat(selectedClientId, clientInfo?.phone, clientInfo?.name)}
                      >
                        <span className="rp-cd-msg-source">
                          {(item.data as ChatMessage).source === 'whatsapp'
                            ? <WhatsAppIcon size={10} color="#25D366" />
                            : <TelegramIcon size={10} color="#2AABEE" />}
                        </span>
                        <span className="rp-cd-msg-text">{(item.data as ChatMessage).text?.slice(0, 60) || ((item.data as ChatMessage).has_media ? `📎 ${(item.data as ChatMessage).media_type || 'медіа'}` : '...')}</span>
                        <span className="rp-cd-msg-date">{new Date((item.data as ChatMessage).message_date).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}
