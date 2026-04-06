import { useEffect, useState, useCallback, useRef } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import './App.css'

const API_BASE = 'https://cc.vidnova.app/api'
const WS_BASE = 'wss://cc.vidnova.app/ws'
const TOKEN_KEY = 'vidnovagram_token'
const AUTH_KEY = 'vidnovagram_auth'

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

/** Authenticated fetch with token header */
function authFetch(url: string, token: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      ...opts.headers as Record<string, string>,
      'Authorization': `Token ${token}`,
    },
  })
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    // Restore from localStorage
    try {
      const saved = localStorage.getItem(AUTH_KEY)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return null
  })
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

  // Persist auth to localStorage
  useEffect(() => {
    if (auth?.authorized) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
    } else {
      localStorage.removeItem(AUTH_KEY)
    }
  }, [auth])

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

  const logout = useCallback(() => {
    setAuth(null)
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(TOKEN_KEY)
    setContacts([])
    setMessages([])
    setSelectedClient(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const resp = await fetch(`${API_BASE}/vidnovagram/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await resp.json()
      if (data.status === 'ok' && data.token) {
        const authState: AuthState = {
          authorized: true,
          name: data.name || username,
          token: data.token,
          accounts: [],
        }
        setAuth(authState)
      } else {
        setAuthError(data.error || 'Невірний логін або пароль')
      }
    } catch {
      setAuthError("Помилка з'єднання з сервером")
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const loadContacts = useCallback(async () => {
    if (!auth?.token) return
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (selectedAccount) params.set('account', selectedAccount)
      params.set('per_page', '50')
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, auth.token)
      if (resp.status === 401) { logout(); return }
      if (resp.ok) {
        const data = await resp.json()
        setContacts(data.results || [])
      }
    } catch (e) { console.error('Contacts:', e) }
  }, [auth?.token, search, selectedAccount, logout])

  const loadMessages = useCallback(async (clientId: string) => {
    if (!auth?.token) return
    try {
      const params = new URLSearchParams({ per_page: '80' })
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${clientId}/messages/?${params}`, auth.token)
      if (resp.status === 401) { logout(); return }
      if (resp.ok) {
        const data = await resp.json()
        setMessages((data.results || []).reverse())
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } catch (e) { console.error('Messages:', e) }
  }, [auth?.token, selectedAccount, logout])

  const sendMessage = useCallback(async () => {
    if (!selectedClient || !messageText.trim() || !auth?.token) return
    const fd = new FormData()
    fd.append('text', messageText.trim())
    if (selectedAccount) fd.append('account_id', selectedAccount)
    try {
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
        method: 'POST', body: fd,
      })
      if (resp.ok) {
        setMessageText('')
        loadMessages(selectedClient)
      }
    } catch (e) { console.error('Send:', e) }
  }, [selectedClient, messageText, selectedAccount, auth?.token, loadMessages])

  // WebSocket
  useEffect(() => {
    if (!auth?.authorized || !auth.token) return
    const url = `${WS_BASE}/messenger/?token=${auth.token}`
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
          <div className="header-right">
            <span className="user-badge">{auth.name}</span>
            <button className="logout-btn" onClick={logout} title="Вийти">✕</button>
          </div>
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
