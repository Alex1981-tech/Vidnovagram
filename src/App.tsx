import { useEffect, useState, useCallback, useRef } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import './App.css'

const API_BASE = 'https://cc.vidnova.app/api'
const WS_BASE = 'wss://cc.vidnova.app/ws'
const AUTH_KEY = 'vidnovagram_auth'
const THEME_KEY = 'vidnovagram_theme'

type Theme = 'light' | 'dark' | 'system'

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

/** Theme management */
function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

function getSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch { /* ignore */ }
  return 'system'
}

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getSavedTheme)

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem(THEME_KEY, t)
    applyTheme(t)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return { theme, setTheme }
}

// SVG icons
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>
)
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
  </svg>
)
const MonitorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>
  </svg>
)
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
  </svg>
)

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const cycle = () => {
    const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
    setTheme(next[theme])
  }
  return (
    <button className="theme-toggle" onClick={cycle} title={`Тема: ${theme}`}>
      {theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <MonitorIcon />}
    </button>
  )
}

function App() {
  const { theme, setTheme } = useTheme()
  const [auth, setAuth] = useState<AuthState | null>(() => {
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
  void _setSelectedAccount
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
        setAuth({
          authorized: true,
          name: data.name || username,
          token: data.token,
          accounts: [],
        })
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

  useEffect(() => {
    if (!auth?.authorized) return
    const t = setTimeout(loadContacts, 300)
    return () => clearTimeout(t)
  }, [search, selectedAccount, auth, loadContacts])

  // Get selected contact info
  const selectedContact = contacts.find(c => c.client_id === selectedClient)

  // Group messages by date for date separators
  const groupedMessages = messages.reduce<(ChatMessage | { type: 'date'; date: string })[]>((acc, m) => {
    const d = new Date(m.message_date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
    if (acc.length === 0 || (acc[acc.length - 1] as ChatMessage).message_date === undefined ||
      new Date((acc.filter(x => 'message_date' in x).pop() as ChatMessage)?.message_date || '').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) !== d) {
      // Check if last non-date entry has different date
      const lastMsg = [...acc].reverse().find(x => 'message_date' in x) as ChatMessage | undefined
      const lastDate = lastMsg ? new Date(lastMsg.message_date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : null
      if (lastDate !== d) {
        acc.push({ type: 'date', date: d })
      }
    }
    acc.push(m)
    return acc
  }, [])

  // Update screen
  if (updateAvailable && updating) {
    return (
      <div className="update-screen">
        <h2>Оновлення Vidnovagram...</h2>
        <p>Завантаження нової версії</p>
        <div className="spinner" />
      </div>
    )
  }

  if (!auth?.authorized) {
    return <LoginScreen onLogin={login} loading={authLoading} error={authError} theme={theme} setTheme={setTheme} />
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Vidnovagram</h1>
          <div className="header-right">
            <ThemeToggle theme={theme} setTheme={setTheme} />
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
        {selectedClient && selectedContact ? (
          <>
            <div className="chat-header">
              <div className="chat-header-avatar">
                {(selectedContact.full_name || selectedContact.phone).charAt(0).toUpperCase()}
              </div>
              <div className="chat-header-name">
                {selectedContact.full_name || selectedContact.phone}
              </div>
            </div>
            <div className="chat-messages">
              {groupedMessages.map((item, i) => {
                if ('type' in item && item.type === 'date') {
                  return (
                    <div key={`date-${i}`} className="date-separator">
                      <span>{item.date}</span>
                    </div>
                  )
                }
                const m = item as ChatMessage
                return (
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
                )
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input">
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Повідомлення..."
              />
              <button onClick={sendMessage} disabled={!messageText.trim()}>
                <SendIcon />
              </button>
            </div>
          </>
        ) : (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <p>Виберіть чат</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, loading, error, theme, setTheme }: {
  onLogin: (u: string, p: string) => void
  loading: boolean
  error: string
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const submit = () => { if (u && p) onLogin(u, p) }

  return (
    <div className="login-wrapper">
      <div className="login-bg" />
      <div className="login-bg-overlay" />
      <div className="login-card">
        <div className="login-card-header">
          <img src="/logo.png" alt="Vidnovagram" className="login-logo" />
          <h1>Vidnovagram</h1>
          <p>Месенджер клініки Віднова</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label>Логін</label>
          <input
            type="text"
            placeholder="Ім'я користувача"
            value={u}
            onChange={e => setU(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>

        <div className="login-field">
          <label>Пароль</label>
          <input
            type="password"
            placeholder="Введіть пароль"
            value={p}
            onChange={e => setP(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        <button className="login-btn" onClick={submit} disabled={loading || !u || !p}>
          {loading ? 'Вхід...' : 'Увійти'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.25rem' }}>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </div>
  )
}

export default App
