import { useEffect, useState, useCallback, useRef } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import './App.css'

const API_BASE = 'https://cc.vidnova.app/api'
const WS_BASE = 'wss://cc.vidnova.app/ws'

interface AuthState {
  authorized: boolean
  name: string
  token: string
  accounts: { id: string; label: string; phone: string; type: string; name: string }[]
  operatorId?: number
}

interface Contact {
  client_id: string
  phone: string
  full_name: string
  message_count: number
  last_message_date: string
  last_message_text: string
  last_message_direction: string
}

interface ChatMessage {
  id: number | string
  source?: string
  direction: 'sent' | 'received'
  text: string
  has_media: boolean
  media_type: string
  media_file: string
  thumbnail: string
  message_date: string
  account_label: string
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [search, setSearch] = useState('')
  const [selectedAccount, _setSelectedAccount] = useState<string>('')
  void _setSelectedAccount // will be used for account picker UI
  const wsRef = useRef<WebSocket | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const selectedClientRef = useRef<string | null>(null)

  // Keep ref in sync
  useEffect(() => { selectedClientRef.current = selectedClient }, [selectedClient])

  // Check for updates on startup
  useEffect(() => {
    (async () => {
      try {
        const update = await check()
        if (update) {
          setUpdateAvailable(true)
          setUpdating(true)
          await update.downloadAndInstall()
          await relaunch()
        }
      } catch (e) {
        console.log('Update check:', e)
      }
    })()
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const resp = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })
      const data = await resp.json()
      if (data.status === 'ok') {
        setAuth({ authorized: true, name: username, token: '', accounts: [] })
      } else {
        setAuthError(data.error || 'Login failed')
      }
    } catch {
      setAuthError("Помилка з'єднання")
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const loadContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (selectedAccount) params.set('account', selectedAccount)
      params.set('per_page', '50')
      const resp = await fetch(`${API_BASE}/telegram/contacts/?${params}`, { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setContacts(data.results || [])
      }
    } catch (e) { console.error('Contacts:', e) }
  }, [search, selectedAccount])

  const loadMessages = useCallback(async (clientId: string) => {
    try {
      const params = new URLSearchParams({ per_page: '80' })
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await fetch(`${API_BASE}/telegram/contacts/${clientId}/messages/?${params}`, { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setMessages((data.results || []).reverse())
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } catch (e) { console.error('Messages:', e) }
  }, [selectedAccount])

  const sendMessage = useCallback(async () => {
    if (!selectedClient || !messageText.trim()) return
    const fd = new FormData()
    fd.append('text', messageText.trim())
    if (selectedAccount) fd.append('account_id', selectedAccount)
    try {
      const resp = await fetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, {
        method: 'POST', body: fd, credentials: 'include',
      })
      if (resp.ok) {
        setMessageText('')
        loadMessages(selectedClient)
      }
    } catch (e) { console.error('Send:', e) }
  }, [selectedClient, messageText, selectedAccount, loadMessages])

  // WebSocket
  useEffect(() => {
    if (!auth?.authorized) return
    const url = auth.token ? `${WS_BASE}/messenger/?token=${auth.token}` : `${WS_BASE}/messenger/`
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(url)
      wsRef.current = ws
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'new_message' && data.client_id === selectedClientRef.current) {
            loadMessages(data.client_id)
          }
          if (data.type === 'contact_update' || data.type === 'new_message') {
            loadContacts()
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000) }
    }
    connect()

    return () => {
      clearTimeout(reconnectTimer)
      ws?.close(1000)
    }
  }, [auth, loadContacts, loadMessages])

  // Reload contacts on search/account change
  useEffect(() => {
    if (!auth?.authorized) return
    const t = setTimeout(loadContacts, 300)
    return () => clearTimeout(t)
  }, [search, selectedAccount, auth, loadContacts])

  // Update screen
  if (updateAvailable && updating) {
    return (
      <div className="center-screen">
        <h2>Оновлення Vidnovagram...</h2>
        <p>Завантаження нової версії</p>
        <div className="spinner" />
      </div>
    )
  }

  if (!auth?.authorized) {
    return <LoginScreen onLogin={login} loading={authLoading} error={authError} />
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Vidnovagram</h1>
          <span className="user-badge">{auth.name}</span>
        </div>
        <input
          className="search-box"
          placeholder="Пошук..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="contact-list">
          {contacts.map(c => (
            <div
              key={c.client_id}
              className={`contact ${selectedClient === c.client_id ? 'active' : ''}`}
              onClick={() => { setSelectedClient(c.client_id); loadMessages(c.client_id) }}
            >
              <div className="avatar">{(c.full_name || c.phone).charAt(0).toUpperCase()}</div>
              <div className="contact-body">
                <div className="contact-name">{c.full_name || c.phone}</div>
                <div className="contact-preview">{c.last_message_text?.slice(0, 50)}</div>
              </div>
              <div className="contact-time">
                {c.last_message_date && new Date(c.last_message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat">
        {selectedClient ? (
          <>
            <div className="chat-messages">
              {messages.map(m => (
                <div key={m.id} className={`msg ${m.direction}`}>
                  <div className="msg-bubble">
                    {m.text}
                    {m.has_media && m.thumbnail && (
                      <img src={`https://cc.vidnova.app/media/${m.thumbnail}`} alt="" className="msg-img" />
                    )}
                    <span className="msg-time">
                      {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input">
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Повідомлення..."
              />
              <button onClick={sendMessage} disabled={!messageText.trim()}>➤</button>
            </div>
          </>
        ) : (
          <div className="center-screen">
            <div style={{ fontSize: 64, opacity: 0.2 }}>💬</div>
            <p style={{ opacity: 0.5 }}>Виберіть чат</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, loading, error }: {
  onLogin: (u: string, p: string) => void; loading: boolean; error: string
}) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const submit = () => onLogin(u, p)
  return (
    <div className="center-screen">
      <div className="login-card">
        <h1>Vidnovagram</h1>
        <p>Месенджер клініки Віднова</p>
        {error && <div className="error">{error}</div>}
        <input placeholder="Логін" value={u} onChange={e => setU(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <input type="password" placeholder="Пароль" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={submit} disabled={loading}>{loading ? 'Вхід...' : 'Увійти'}</button>
      </div>
    </div>
  )
}

export default App
