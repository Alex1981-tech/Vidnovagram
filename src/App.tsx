import { useEffect, useState, useCallback, useRef } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import './App.css'

const API_BASE = 'https://cc.vidnova.app/api'
const WS_BASE = 'wss://cc.vidnova.app/ws'
const AUTH_KEY = 'vidnovagram_auth'
const THEME_KEY = 'vidnovagram_theme'
const READ_TS_KEY = 'vidnovagram_read_ts'
const LAST_VERSION_KEY = 'vidnovagram_last_version'

// Changelog — shown after update
const CHANGELOG: Record<string, string[]> = {
  '0.7.0': [
    'Відправка файлів — фото, відео, документи (кнопка 📎)',
    'Запис голосових повідомлень (мікрофон)',
    'Запис відеокружків (камера)',
    'Пересилання повідомлень — вибір декількох + контакт + акаунт',
    'Статуси прочитання — ✓ ✓✓ синій',
    'Кешування повідомлень та контактів (IndexedDB)',
  ],
  '0.6.0': [
    'Шаблони повідомлень — категорії з кольорами',
    'Шаблони — прикріплення медіа (фото, відео, документи)',
    'Попередній перегляд шаблону з кнопкою Відправити',
    'Пагінація повідомлень — завантаження старіших',
    'Кольорові бульки — синій TG, зелений WhatsApp',
    'WebSocket — реальний час в чаті',
    'Сповіщення Windows',
    'Конвертація голосових OGG→WAV',
  ],
  '0.5.1': [
    'Фото повідомлення — відображення та лайтбокс',
    'Документи/PDF — збереження на диск та відкриття',
    'Плеєр дзвінка — закривається після прослуховування (кнопка ✕)',
  ],
  '0.5.0': [
    'Акаунти перенесено на вертикальне меню зліва',
    'Жовті картки дзвінків Бінотел',
    'Плеєр дзвінків — розкривається під карткою на повну ширину',
    'Голосові повідомлення — вбудований плеєр',
    'Відеокружки — відеоплеєр',
    'Документи/PDF — кнопка скачування',
    'Кешування мініатюр та аватарок (IndexedDB)',
  ],
  '0.4.4': [
    'Виправлено сортування повідомлень (старіші зверху)',
  ],
  '0.4.3': [
    'Виправлено прослуховування дзвінків',
  ],
  '0.4.0': [
    'Картки дзвінків Бінотел у чаті',
    'Нотатки та швидкі відповіді',
    'Звукові сповіщення',
  ],
}

type Theme = 'light' | 'dark' | 'system'

interface AuthState {
  authorized: boolean
  name: string
  token: string
  isAdmin: boolean
}

interface Account {
  id: string
  label: string
  phone: string
  status: string
  type: 'telegram' | 'whatsapp'
}

interface Contact {
  client_id: string
  phone: string
  full_name: string
  message_count: number
  last_message_date: string
  last_message_text: string
  last_message_direction: string
  has_telegram?: boolean
  has_whatsapp?: boolean
}

interface ChatMessage {
  id: number | string
  type?: 'call'
  source?: 'telegram' | 'whatsapp' | 'binotel'
  direction: 'sent' | 'received' | 'incoming' | 'outgoing'
  text: string
  has_media: boolean
  media_type: string
  media_file: string
  thumbnail: string
  message_date: string
  account_label: string
  is_read?: boolean
  // Call-specific fields
  call_id?: string
  duration_seconds?: number
  disposition?: string
  operator_name?: string
}

interface ClientNote {
  id: string
  author_id: number
  author_name: string
  text: string
  created_at: string
  updated_at?: string
}

interface TemplateCategory {
  id: string
  name: string
  color: string
  sort_order: number
  templates: QuickReply[]
}

interface QuickReply {
  id: string
  category_id: string
  title: string
  text: string
  media_file: string | null
  sort_order: number
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

// ===== IndexedDB cache (media, messages, contacts) =====
const CACHE_DB_NAME = 'vidnovagram_cache'
const CACHE_DB_VERSION = 2
const THUMB_STORE = 'thumbnails'  // key: mediaPath, value: { blob: ArrayBuffer, type: string, ts: number }
const AVATAR_STORE = 'avatars'    // key: clientId, value: { blob: ArrayBuffer, type: string, ts: number }
const MSG_STORE = 'messages'      // key: clientId, value: { messages: ChatMessage[], count: number, client_name: string, client_phone: string, ts: number }
const CONTACTS_STORE = 'contacts' // key: accountId|'all', value: { contacts: Contact[], count: number, ts: number }
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days (media)
const MSG_CACHE_TTL = 24 * 60 * 60 * 1000  // 24 hours (messages)

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE)
      if (!db.objectStoreNames.contains(AVATAR_STORE)) db.createObjectStore(AVATAR_STORE)
      if (!db.objectStoreNames.contains(MSG_STORE)) db.createObjectStore(MSG_STORE)
      if (!db.objectStoreNames.contains(CONTACTS_STORE)) db.createObjectStore(CONTACTS_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getCached(store: string, key: string): Promise<string | null> {
  try {
    const db = await openCacheDB()
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => {
        const val = req.result
        if (val && (Date.now() - val.ts) < CACHE_TTL) {
          const blob = new Blob([val.blob], { type: val.type || 'image/jpeg' })
          resolve(URL.createObjectURL(blob))
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function putCache(store: string, key: string, blob: Blob): Promise<void> {
  try {
    const ab = await blob.arrayBuffer()
    const db = await openCacheDB()
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put({ blob: ab, type: blob.type, ts: Date.now() }, key)
  } catch { /* ignore */ }
}

// JSON data cache (messages, contacts)
async function getJsonCache<T>(store: string, key: string, ttl = MSG_CACHE_TTL): Promise<T | null> {
  try {
    const db = await openCacheDB()
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => {
        const val = req.result
        if (val && (Date.now() - val.ts) < ttl) {
          resolve(val as T)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function putJsonCache(store: string, key: string, data: Record<string, unknown>): Promise<void> {
  try {
    const db = await openCacheDB()
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put({ ...data, ts: Date.now() }, key)
  } catch { /* ignore */ }
}

/** Convert OGG/Opus blob to WAV for WebView2 (Edge) which lacks OGG support */
async function oggToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  const arrayBuf = await blob.arrayBuffer()
  const decoded = await ctx.decodeAudioData(arrayBuf)
  const numCh = decoded.numberOfChannels
  const sampleRate = decoded.sampleRate
  const length = decoded.length
  const wavBuf = new ArrayBuffer(44 + length * numCh * 2)
  const view = new DataView(wavBuf)
  // WAV header
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + length * numCh * 2, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numCh * 2, true); view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, length * numCh * 2, true)
  // Interleave samples
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const sample = Math.max(-1, Math.min(1, decoded.getChannelData(ch)[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
      offset += 2
    }
  }
  await ctx.close()
  return new Blob([wavBuf], { type: 'audio/wav' })
}

/** Authenticated media loader — triggers blob fetch on mount */
function AuthMedia({ mediaKey, mediaPath, type, className, token, blobMap, loadBlob, onClick }: {
  mediaKey: string; mediaPath: string; type: 'image'; className?: string;
  token: string; blobMap: Record<string, string>;
  loadBlob: (key: string, path: string) => Promise<string | null>;
  onClick?: () => void
}) {
  useEffect(() => {
    if (token && !blobMap[mediaKey]) loadBlob(mediaKey, mediaPath)
  }, [token, mediaKey, mediaPath])
  const src = blobMap[mediaKey]
  if (!src) return <div className="msg-media-placeholder">📷 ...</div>
  if (type === 'image') return <img src={src} alt="" className={className} onClick={onClick} />
  return null
}

// ===== Theme =====

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

// ===== Read timestamps (unread tracking) =====

function getReadTs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_TS_KEY) || '{}')
  } catch { return {} }
}

function setReadTs(clientId: string, ts: string) {
  const all = getReadTs()
  all[clientId] = ts
  localStorage.setItem(READ_TS_KEY, JSON.stringify(all))
}

// ===== Date formatting =====

function formatContactDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  if (msgDay.getTime() === today.getTime()) return time
  if (msgDay.getTime() === yesterday.getTime()) return `Вчора`
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (msgDay.getTime() === today.getTime()) return 'Сьогодні'
  if (msgDay.getTime() === yesterday.getTime()) return 'Вчора'
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ===== SVG Icons =====

const TelegramIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.487-.429-.008-1.252-.242-1.865-.442-.751-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.12.099.153.232.168.327.016.094.036.31.02.478z"/>
  </svg>
)

const WhatsAppIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

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
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const VolumeOnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
)
const VolumeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>
  </svg>
)

// Message status icons
const SingleCheckIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const DoubleCheckIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 6 7 17 2 12"/><polyline points="22 6 11 17"/>
  </svg>
)

// Attachment & media icons
const PaperclipIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
)
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
)
const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>
  </svg>
)
const ForwardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>
  </svg>
)
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
)
const StopIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
)

// Notification helper
async function showNotification(title: string, body: string) {
  try {
    let granted = await isPermissionGranted()
    if (!granted) {
      const perm = await requestPermission()
      granted = perm === 'granted'
    }
    if (granted) {
      sendNotification({ title, body })
    }
  } catch (e) {
    console.log('Notification error:', e)
  }
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const cycle = () => {
    const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
    setTheme(next[theme])
  }
  return (
    <button className="icon-btn" onClick={cycle} title={`Тема: ${theme}`}>
      {theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <MonitorIcon />}
    </button>
  )
}

// ===== Main App =====

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
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [contactCount, setContactCount] = useState(0)

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [msgCount, setMsgCount] = useState(0)
  const [msgPage, setMsgPage] = useState(1)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [sending, setSending] = useState(false)

  // Right panel
  const [rightTab, setRightTab] = useState<'notes' | 'quick'>('notes')
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([])
  const [templateCategories, setTemplateCategories] = useState<TemplateCategory[]>([])
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [newNoteText, setNewNoteText] = useState('')
  // Template modals
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#6366f1')
  const [showTplModal, setShowTplModal] = useState<string | null>(null) // category_id
  const [newTplTitle, setNewTplTitle] = useState('')
  const [newTplText, setNewTplText] = useState('')
  const [newTplMedia, setNewTplMedia] = useState<File | null>(null)
  const [previewTpl, setPreviewTpl] = useState<QuickReply | null>(null)

  // Avatar photos
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({})
  const [audioBlobMap, setAudioBlobMap] = useState<Record<string, string>>({})
  const [audioLoading, setAudioLoading] = useState<Record<string, boolean>>({})
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)
  // Generic media blobs (voice, video, documents, full-size images)
  const [mediaBlobMap, setMediaBlobMap] = useState<Record<string, string>>({})
  const [mediaLoading, setMediaLoading] = useState<Record<string, boolean>>({})

  // Sound
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('messenger-sound') !== 'false' } catch { return true }
  })

  // Unread tracking
  const [updates, setUpdates] = useState<Record<string, { last_date: string; last_received: string }>>({})

  const wsRef = useRef<WebSocket | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const selectedClientRef = useRef<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // File attachment
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Voice/video recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingType, setRecordingType] = useState<'voice' | 'video'>('voice')
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)

  // Forward mode
  const [forwardMode, setForwardMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number | string>>(new Set())
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardContacts, setForwardContacts] = useState<Contact[]>([])
  const [forwardAccount, setForwardAccount] = useState<string>('')

  // Resizable panels
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [rightPanelWidth, setRightPanelWidth] = useState(300)
  const resizingRef = useRef<'sidebar' | 'right' | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = e.clientX - startXRef.current
      if (resizingRef.current === 'sidebar') {
        setSidebarWidth(Math.max(220, Math.min(500, startWidthRef.current + dx)))
      } else {
        setRightPanelWidth(Math.max(200, Math.min(500, startWidthRef.current - dx)))
      }
    }
    const onMouseUp = () => { resizingRef.current = null; document.body.style.cursor = '' ; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [])

  const startResize = (panel: 'sidebar' | 'right', e: React.MouseEvent) => {
    resizingRef.current = panel
    startXRef.current = e.clientX
    startWidthRef.current = panel === 'sidebar' ? sidebarWidth : rightPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Persist auth
  useEffect(() => {
    if (auth?.authorized) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
    } else {
      localStorage.removeItem(AUTH_KEY)
    }
  }, [auth])

  useEffect(() => { selectedClientRef.current = selectedClient }, [selectedClient])

  // Sound toggle persist
  useEffect(() => {
    localStorage.setItem('messenger-sound', String(soundEnabled))
  }, [soundEnabled])

  // Check for updates on startup
  // Check for updates + show "What's New" after update
  useEffect(() => {
    (async () => {
      // Get current version and check if it changed
      try {
        const ver = await getVersion()
        setCurrentVersion(ver)
        const lastVer = localStorage.getItem(LAST_VERSION_KEY)
        if (lastVer && lastVer !== ver) {
          setShowWhatsNew(true)
        }
        localStorage.setItem(LAST_VERSION_KEY, ver)
      } catch { /* ignore */ }

      // Check for new updates
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
    setAccounts([])
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
          isAdmin: data.is_admin || false,
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

  // Load accounts (TG + WA)
  const loadAccounts = useCallback(async () => {
    if (!auth?.token) return
    try {
      const [tgResp, waResp] = await Promise.all([
        authFetch(`${API_BASE}/telegram/accounts/`, auth.token),
        authFetch(`${API_BASE}/whatsapp/accounts/`, auth.token),
      ])
      const tgAccounts: Account[] = []
      const waAccounts: Account[] = []

      if (tgResp.ok) {
        const tgData = await tgResp.json()
        for (const a of (Array.isArray(tgData) ? tgData : tgData.results || [])) {
          if (a.status === 'active') {
            tgAccounts.push({ id: a.id, label: a.label, phone: a.phone, status: a.status, type: 'telegram' })
          }
        }
      }
      if (waResp.ok) {
        const waData = await waResp.json()
        for (const a of (Array.isArray(waData) ? waData : waData.results || [])) {
          if (a.status === 'connected') {
            waAccounts.push({ id: a.id, label: a.label, phone: a.phone, status: a.status, type: 'whatsapp' })
          }
        }
      }

      setAccounts([...tgAccounts, ...waAccounts])
    } catch (e) { console.error('Accounts:', e) }
  }, [auth?.token])

  // Load contacts (cache-first: show from IndexedDB, then refresh from server)
  const loadContacts = useCallback(async () => {
    if (!auth?.token) return
    const cacheKey = `${selectedAccount || 'all'}_${search || ''}`

    // Phase 0: instant load from cache (only for no-search default view)
    if (!search) {
      const cached = await getJsonCache<{ contacts: Contact[]; count: number }>(CONTACTS_STORE, cacheKey)
      if (cached) {
        setContacts(cached.contacts)
        setContactCount(cached.count)
      }
    }

    try {
      const params = new URLSearchParams({ per_page: '50' })
      if (search) params.set('search', search)
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, auth.token)
      if (resp.status === 401) { logout(); return }
      if (resp.ok) {
        const data = await resp.json()
        const list = data.results || []
        setContacts(list)
        setContactCount(data.count || 0)

        // Save to cache (only default view without search)
        if (!search) {
          putJsonCache(CONTACTS_STORE, cacheKey, { contacts: list, count: data.count || 0 })
        }

        // Load avatar photos: IndexedDB cache first, then server
        const ids = list.map((c: Contact) => c.client_id).join(',')
        if (ids) {
          // Phase 1: load from local cache instantly
          for (const c of list) {
            if (photoMap[c.client_id]) continue
            getCached(AVATAR_STORE, c.client_id).then(url => {
              if (url) setPhotoMap(prev => prev[c.client_id] ? prev : { ...prev, [c.client_id]: url })
            })
          }
          // Phase 2: fetch from server, update cache
          try {
            const pr = await authFetch(`${API_BASE}/telegram/photos-map/?ids=${ids}`, auth.token)
            if (pr.ok) {
              const pm: Record<string, string> = await pr.json()
              for (const [cid, path] of Object.entries(pm)) {
                if (photoMap[cid]) continue
                authFetch(`${API_BASE.replace('/api', '')}${path}`, auth.token)
                  .then(r => r.ok ? r.blob() : null)
                  .then(blob => {
                    if (blob) {
                      putCache(AVATAR_STORE, cid, blob)
                      setPhotoMap(prev => ({ ...prev, [cid]: URL.createObjectURL(blob) }))
                    }
                  })
                  .catch(() => {})
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) { console.error('Contacts:', e) }
  }, [auth?.token, search, selectedAccount, logout])

  // Load messages (cache-first: show from IndexedDB, then refresh from server)
  const loadMessages = useCallback(async (clientId: string, scrollToEnd = true) => {
    if (!auth?.token) return
    const cacheKey = `${clientId}_${selectedAccount || 'all'}`

    // Phase 0: instant load from cache (only on first open — scrollToEnd=true)
    if (scrollToEnd) {
      const cached = await getJsonCache<{ messages: ChatMessage[]; count: number; client_name: string; client_phone: string }>(MSG_STORE, cacheKey)
      if (cached && cached.messages.length > 0) {
        setMessages(cached.messages)
        setMsgCount(cached.count)
        setMsgPage(1)
        setHasOlderMessages(Math.ceil(cached.count / 200) > 1)
        setClientName(cached.client_name || '')
        setClientPhone(cached.client_phone || '')
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 30)
      }
    }

    try {
      const params = new URLSearchParams({ per_page: '200', page: '1' })
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${clientId}/messages/?${params}`, auth.token)
      if (resp.status === 401) { logout(); return }
      if (resp.ok) {
        const data = await resp.json()
        const msgs = data.results || []
        setMessages(prev => {
          // Only update if message count changed (avoid unnecessary re-renders during poll)
          if (!scrollToEnd && prev.length === msgs.length && prev.length > 0 && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id) {
            return prev
          }
          return msgs
        })
        setMsgCount(data.count || 0)
        setMsgPage(1)
        const totalPages = Math.ceil((data.count || 0) / 200)
        setHasOlderMessages(totalPages > 1)
        setClientName(data.client_name || '')
        setClientPhone(data.client_phone || '')
        if (msgs.length > 0) {
          setReadTs(clientId, msgs[msgs.length - 1].message_date)
        }
        if (scrollToEnd) {
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
        // Save to cache
        putJsonCache(MSG_STORE, cacheKey, {
          messages: msgs,
          count: data.count || 0,
          client_name: data.client_name || '',
          client_phone: data.client_phone || '',
        })
      }
    } catch (e) { console.error('Messages:', e) }
  }, [auth?.token, selectedAccount, logout])

  const loadOlderMessages = useCallback(async () => {
    if (!auth?.token || !selectedClient || loadingOlder || !hasOlderMessages) return
    const nextPage = msgPage + 1
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams({ per_page: '200', page: String(nextPage) })
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/messages/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        const older = data.results || []
        if (older.length > 0) {
          setMessages(prev => [...older, ...prev])
          setMsgPage(nextPage)
          const totalPages = Math.ceil((data.count || 0) / 200)
          setHasOlderMessages(nextPage < totalPages)
        } else {
          setHasOlderMessages(false)
        }
      }
    } catch (e) { console.error('Older messages:', e) }
    setLoadingOlder(false)
  }, [auth?.token, selectedClient, selectedAccount, msgPage, loadingOlder, hasOlderMessages])

  // Send message (text, file, voice/video note)
  const sendMessage = useCallback(async (file?: File | Blob, mediaType?: string) => {
    if (!selectedClient || !auth?.token || sending) return
    const text = messageText.trim()
    const fileToSend = file || attachedFile
    if (!text && !fileToSend) return
    setSending(true)
    const fd = new FormData()
    if (text) fd.append('text', text)
    if (fileToSend) {
      const name = fileToSend instanceof File ? fileToSend.name : (mediaType === 'voice' ? 'voice.ogg' : 'video.webm')
      fd.append('file', fileToSend, name)
    }
    if (mediaType) fd.append('media_type', mediaType)
    if (selectedAccount) fd.append('account_id', selectedAccount)
    try {
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
        method: 'POST', body: fd,
      })
      if (resp.ok) {
        setMessageText('')
        setAttachedFile(null)
        setAttachedPreview(null)
        if (chatInputRef.current) chatInputRef.current.style.height = 'auto'
        loadMessages(selectedClient)
      }
    } catch (e) { console.error('Send:', e) }
    finally { setSending(false) }
  }, [selectedClient, messageText, selectedAccount, auth?.token, sending, loadMessages, attachedFile])

  // Handle file attachment
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachedFile(file)
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setAttachedPreview(URL.createObjectURL(file))
    } else {
      setAttachedPreview(null)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [])

  const clearAttachment = useCallback(() => {
    if (attachedPreview) URL.revokeObjectURL(attachedPreview)
    setAttachedFile(null)
    setAttachedPreview(null)
  }, [attachedPreview])

  // Voice recording
  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingType('voice')
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (e) { console.error('Mic access denied:', e) }
  }, [])

  // Video note (circle) recording
  const startVideoRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 384, height: 384, facingMode: 'user' }, audio: true })
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        videoPreviewRef.current.play()
      }
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingType('video')
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (e) { console.error('Camera access denied:', e) }
  }, [])

  const stopRecording = useCallback(async (send: boolean) => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false)
      return
    }
    return new Promise<void>((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach(t => t.stop())
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null
        if (send && recordedChunksRef.current.length > 0) {
          const mimeType = recordingType === 'voice' ? 'audio/ogg' : 'video/webm'
          const blob = new Blob(recordedChunksRef.current, { type: mimeType })
          const mediaTypeHint = recordingType === 'voice' ? 'voice' : 'video_note'
          sendMessage(blob, mediaTypeHint)
        }
        setIsRecording(false)
        setRecordingTime(0)
        resolve()
      }
      recorder.stop()
    })
  }, [recordingType, sendMessage])

  // Forward mode
  const toggleMsgSelection = useCallback((msgId: number | string) => {
    setSelectedMsgIds(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }, [])

  const exitForwardMode = useCallback(() => {
    setForwardMode(false)
    setSelectedMsgIds(new Set())
  }, [])

  const openForwardModal = useCallback(async () => {
    setShowForwardModal(true)
    setForwardSearch('')
    setForwardAccount(selectedAccount)
    // Load contacts for forward
    if (!auth?.token) return
    try {
      const params = new URLSearchParams({ per_page: '100' })
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        setForwardContacts(data.results || [])
      }
    } catch { /* ignore */ }
  }, [auth?.token, selectedAccount])

  const searchForwardContacts = useCallback(async (q: string) => {
    if (!auth?.token) return
    try {
      const params = new URLSearchParams({ per_page: '50', search: q })
      if (forwardAccount) params.set('account', forwardAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        setForwardContacts(data.results || [])
      }
    } catch { /* ignore */ }
  }, [auth?.token, forwardAccount])

  const executeForward = useCallback(async (toClientId: string) => {
    if (!auth?.token || selectedMsgIds.size === 0 || !selectedClient) return
    // Get tg_message_ids from selected messages
    const tgMsgIds = messages
      .filter(m => selectedMsgIds.has(m.id) && m.source === 'telegram')
      .map(m => m.id)
    if (tgMsgIds.length === 0) return

    try {
      const resp = await authFetch(`${API_BASE}/telegram/forward/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_ids: tgMsgIds,
          from_client_id: selectedClient,
          to_client_id: toClientId,
          account_id: forwardAccount || selectedAccount || '',
        }),
      })
      if (resp.ok) {
        setShowForwardModal(false)
        exitForwardMode()
      }
    } catch (e) { console.error('Forward:', e) }
  }, [auth?.token, selectedMsgIds, selectedClient, messages, forwardAccount, selectedAccount, exitForwardMode])

  // Fetch unread updates
  const loadUpdates = useCallback(async () => {
    if (!auth?.token) return
    try {
      const since = new Date(Date.now() - 86400000 * 7).toISOString()
      const resp = await authFetch(`${API_BASE}/telegram/messenger-updates/?since=${since}`, auth.token)
      if (resp.ok) {
        setUpdates(await resp.json())
      }
    } catch { /* ignore */ }
  }, [auth?.token])

  // Load client notes
  const loadClientNotes = useCallback(async (clientId: string) => {
    if (!auth?.token) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${clientId}/notes/`, auth.token)
      if (resp.ok) setClientNotes(await resp.json())
    } catch { /* ignore */ }
  }, [auth?.token])

  // Load template categories with templates
  const loadTemplateCategories = useCallback(async () => {
    if (!auth?.token) return
    try {
      const resp = await authFetch(`${API_BASE}/messenger/template-categories/`, auth.token)
      if (resp.ok) {
        const cats: TemplateCategory[] = await resp.json()
        setTemplateCategories(cats)
        // Auto-expand all categories on first load
        if (cats.length > 0) setExpandedCats(prev => prev.size === 0 ? new Set(cats.map(c => c.id)) : prev)
      }
    } catch { /* ignore */ }
  }, [auth?.token])

  // Add client note
  const addClientNote = useCallback(async () => {
    if (!selectedClient || !newNoteText.trim() || !auth?.token) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${selectedClient}/notes/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newNoteText.trim() }),
      })
      if (resp.ok) {
        setNewNoteText('')
        loadClientNotes(selectedClient)
      }
    } catch { /* ignore */ }
  }, [selectedClient, newNoteText, auth?.token, loadClientNotes])

  // Delete client note
  const deleteClientNote = useCallback(async (noteId: string) => {
    if (!selectedClient || !auth?.token) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${selectedClient}/notes/${noteId}/`, auth.token, {
        method: 'DELETE',
      })
      if (resp.ok || resp.status === 204) loadClientNotes(selectedClient)
    } catch { /* ignore */ }
  }, [selectedClient, auth?.token, loadClientNotes])

  // Add template category
  const addCategory = useCallback(async () => {
    if (!newCatName.trim() || !auth?.token) return
    try {
      const resp = await authFetch(`${API_BASE}/messenger/template-categories/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      })
      if (resp.ok) {
        setNewCatName('')
        setNewCatColor('#6366f1')
        setShowCatModal(false)
        loadTemplateCategories()
      }
    } catch { /* ignore */ }
  }, [newCatName, newCatColor, auth?.token, loadTemplateCategories])

  // Delete category
  const deleteCategory = useCallback(async (id: string) => {
    if (!auth?.token) return
    try {
      await authFetch(`${API_BASE}/messenger/template-categories/${id}/`, auth.token, { method: 'DELETE' })
      loadTemplateCategories()
    } catch { /* ignore */ }
  }, [auth?.token, loadTemplateCategories])

  // Add template to category
  const addTemplate = useCallback(async () => {
    if (!newTplTitle.trim() || !newTplText.trim() || !showTplModal || !auth?.token) return
    try {
      const formData = new FormData()
      formData.append('title', newTplTitle.trim())
      formData.append('text', newTplText.trim())
      formData.append('category_id', showTplModal)
      if (newTplMedia) formData.append('media_file', newTplMedia)

      const resp = await fetch(`${API_BASE}/messenger/quick-replies/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${auth.token}` },
        body: formData,
      })
      if (resp.ok) {
        setNewTplTitle('')
        setNewTplText('')
        setNewTplMedia(null)
        setShowTplModal(null)
        loadTemplateCategories()
      }
    } catch { /* ignore */ }
  }, [newTplTitle, newTplText, newTplMedia, showTplModal, auth?.token, loadTemplateCategories])

  // Delete template
  const deleteTemplate = useCallback(async (id: string) => {
    if (!auth?.token) return
    try {
      await authFetch(`${API_BASE}/messenger/quick-replies/${id}/`, auth.token, { method: 'DELETE' })
      loadTemplateCategories()
    } catch { /* ignore */ }
  }, [auth?.token, loadTemplateCategories])

  // Send template to current chat
  const sendTemplate = useCallback(async (tpl: QuickReply) => {
    if (!selectedClient || !auth?.token) return
    // Insert text into message and send
    setMessageText(tpl.text)
    setPreviewTpl(null)
    // Auto-send after a tick
    setTimeout(async () => {
      try {
        const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: tpl.text }),
        })
        if (resp.ok) {
          setMessageText('')
          loadMessages(selectedClient)
        }
      } catch { /* ignore */ }
    }, 50)
  }, [selectedClient, auth?.token, loadMessages])

  // Load call audio via auth → blob URL
  const loadCallAudio = useCallback(async (callId: string, mediaPath: string) => {
    // If already loaded, just toggle expand
    if (audioBlobMap[callId]) {
      setExpandedCallId(prev => prev === callId ? null : callId)
      return
    }
    if (!auth?.token || audioLoading[callId]) return
    setAudioLoading(prev => ({ ...prev, [callId]: true }))
    try {
      const resp = await authFetch(`${API_BASE.replace('/api', '')}${mediaPath}`, auth.token)
      if (resp.ok) {
        const blob = await resp.blob()
        setAudioBlobMap(prev => ({ ...prev, [callId]: URL.createObjectURL(blob) }))
        setExpandedCallId(callId)
      }
    } catch { /* ignore */ }
    setAudioLoading(prev => ({ ...prev, [callId]: false }))
  }, [auth?.token, audioBlobMap, audioLoading])

  // Load any media file via auth → blob URL
  // Thumbnails (key starts with "thumb_") are cached in IndexedDB
  // Full-size / other media always fetched from server
  const loadMediaBlob = useCallback(async (key: string, mediaPath: string): Promise<string | null> => {
    if (!auth?.token) return null
    if (mediaBlobMap[key]) return mediaBlobMap[key]
    if (mediaLoading[key]) return null

    const isThumb = key.startsWith('thumb_')

    // Check IndexedDB cache for thumbnails
    if (isThumb) {
      const cached = await getCached(THUMB_STORE, mediaPath)
      if (cached) {
        setMediaBlobMap(prev => ({ ...prev, [key]: cached }))
        return cached
      }
    }

    setMediaLoading(prev => ({ ...prev, [key]: true }))
    try {
      const url = mediaPath.startsWith('http') ? mediaPath : `${API_BASE.replace('/api', '')}${mediaPath}`
      const resp = await authFetch(url, auth.token)
      if (resp.ok) {
        let blob = await resp.blob()
        // Convert OGG voice messages to WAV for WebView2 compatibility
        const isVoice = key.startsWith('voice_')
        if (isVoice && (mediaPath.endsWith('.ogg') || blob.type.includes('ogg'))) {
          try { blob = await oggToWav(blob) } catch (e) { console.warn('OGG convert failed:', e) }
        }
        // Cache thumbnails locally
        if (isThumb) putCache(THUMB_STORE, mediaPath, blob)
        const blobUrl = URL.createObjectURL(blob)
        setMediaBlobMap(prev => ({ ...prev, [key]: blobUrl }))
        setMediaLoading(prev => ({ ...prev, [key]: false }))
        return blobUrl
      }
    } catch { /* ignore */ }
    setMediaLoading(prev => ({ ...prev, [key]: false }))
    return null
  }, [auth?.token, mediaBlobMap, mediaLoading])

  // Download a media file (open save dialog)
  const downloadMedia = useCallback(async (mediaPath: string, filename: string) => {
    if (!auth?.token) return
    const docKey = `doc_${mediaPath}`
    setMediaLoading(prev => ({ ...prev, [docKey]: true }))
    try {
      const url = mediaPath.startsWith('http') ? mediaPath : `${API_BASE.replace('/api', '')}${mediaPath}`
      const resp = await authFetch(url, auth.token)
      if (resp.ok) {
        const blob = await resp.blob()
        const ext = filename.includes('.') ? filename.split('.').pop() || '' : ''
        const filePath = await save({
          defaultPath: filename,
          filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
        })
        if (filePath) {
          const buf = new Uint8Array(await blob.arrayBuffer())
          await writeFile(filePath, buf)
          await shellOpen(filePath)
        }
      }
    } catch { /* ignore */ }
    setMediaLoading(prev => ({ ...prev, [docKey]: false }))
  }, [auth?.token])

  // Toggle category expand/collapse
  const toggleCat = useCallback((id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Load accounts on auth
  useEffect(() => {
    if (auth?.authorized) {
      loadAccounts()
      loadTemplateCategories()
    }
  }, [auth?.authorized, loadAccounts, loadTemplateCategories])

  // Load contacts with debounce on search change
  useEffect(() => {
    if (!auth?.authorized) return
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(loadContacts, 300)
    return () => clearTimeout(searchTimerRef.current)
  }, [search, selectedAccount, auth?.authorized, loadContacts])

  // Poll updates every 15s
  useEffect(() => {
    if (!auth?.authorized) return
    loadUpdates()
    const iv = setInterval(loadUpdates, 15000)
    return () => clearInterval(iv)
  }, [auth?.authorized, loadUpdates])

  // Refs for stable WS callbacks (avoid reconnecting WS on every state change)
  const loadContactsRef = useRef(loadContacts)
  const loadMessagesRef = useRef(loadMessages)
  const loadUpdatesRef = useRef(loadUpdates)
  const soundEnabledRef = useRef(soundEnabled)
  useEffect(() => { loadContactsRef.current = loadContacts }, [loadContacts])
  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])
  useEffect(() => { loadUpdatesRef.current = loadUpdates }, [loadUpdates])
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  // WebSocket — stable connection, only depends on auth.token
  useEffect(() => {
    if (!auth?.authorized || !auth.token) return
    const url = `${WS_BASE}/messenger/?token=${auth.token}`
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>
    let alive = true

    function connect() {
      if (!alive) return
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'new_message') {
            const msg = data.message || {}
            const clientId = data.client_id

            if (clientId === selectedClientRef.current) {
              // Current chat — reload messages, scroll to new message
              loadMessagesRef.current(clientId, true)
            }

            // Notification for received messages (Windows toast)
            if (msg.direction === 'received' || data.source) {
              const isCurrentChat = clientId === selectedClientRef.current
              if (!isCurrentChat) {
                showNotification(
                  msg.client_name || msg.account_label || 'Нове повідомлення',
                  msg.text?.slice(0, 120) || '📎 Медіа'
                )
              }
              // Play sound for new received messages
              if (soundEnabledRef.current && !isCurrentChat) {
                try { new Audio('data:audio/wav;base64,UklGRl9vT19telegramXZmb3JtYXQAAA==').play().catch(() => {}) } catch {}
              }
            }

            loadContactsRef.current()
            loadUpdatesRef.current()
          }

          if (data.type === 'contact_update') {
            loadContactsRef.current()
          }
        } catch { /* ignore */ }
      }

      ws.onerror = (e) => { console.log('[WS] error', e) }
      ws.onclose = (e) => {
        console.log('[WS] closed', e.code, e.reason)
        wsRef.current = null
        if (alive) reconnectTimer = setTimeout(connect, 3000)
      }
    }
    connect()

    // Polling fallback: refresh current chat every 10s in case WS missed events
    const pollTimer = setInterval(() => {
      if (selectedClientRef.current) {
        loadMessagesRef.current(selectedClientRef.current, false)
      }
      loadContactsRef.current()
    }, 10000)

    return () => {
      alive = false
      clearTimeout(reconnectTimer)
      clearInterval(pollTimer)
      ws?.close(1000)
    }
  }, [auth?.authorized, auth?.token])

  // Compute unread (uses updates for external change detection)
  const isUnread = useCallback((contact: Contact) => {
    if (!contact.last_message_date || contact.last_message_direction !== 'received') return false
    const readTs = getReadTs()
    const read = readTs[contact.client_id]
    // Check server updates too
    const serverUpdate = updates[contact.client_id]
    const lastReceived = serverUpdate?.last_received
    const latestDate = lastReceived && lastReceived > contact.last_message_date ? lastReceived : contact.last_message_date
    if (!read) return true
    return new Date(latestDate) > new Date(read)
  }, [updates])

  // Get selected contact info
  const selectedContact = contacts.find(c => c.client_id === selectedClient)

  // Group messages by date
  const groupedMessages: (ChatMessage | { type: 'date'; date: string })[] = []
  let lastDateStr = ''
  for (const m of messages) {
    const d = formatDateSeparator(m.message_date)
    if (d !== lastDateStr) {
      groupedMessages.push({ type: 'date', date: d })
      lastDateStr = d
    }
    groupedMessages.push(m)
  }

  // Select client handler
  const selectClient = useCallback((clientId: string) => {
    setSelectedClient(clientId)
    setAudioBlobMap({})
    setMediaBlobMap({})
    setExpandedCallId(null)
    loadMessages(clientId)
    loadClientNotes(clientId)
  }, [loadMessages, loadClientNotes])

  // Account tab click
  const handleAccountClick = useCallback((accountId: string) => {
    setSelectedAccount(prev => prev === accountId ? '' : accountId)
    setSelectedClient(null)
    setMessages([])
  }, [])

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
    return <LoginScreen onLogin={login} loading={authLoading} error={authError} theme={theme} setTheme={setTheme} />
  }

  return (
    <div className="app">
      {/* Compact Top Bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="top-bar-title">Vidnovagram</span>
          <button className="icon-btn" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук'}>
            {soundEnabled ? <VolumeOnIcon /> : <VolumeOffIcon />}
          </button>
        </div>
        <div className="top-bar-right">
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <span className="user-badge">{auth.name}</span>
          <button className="icon-btn logout" onClick={logout} title="Вийти">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {/* Account rail — icons only, flyout on hover */}
        <div className="account-rail">
          {/* "All" button */}
          <button
            className={`rail-icon ${!selectedAccount ? 'active' : ''}`}
            onClick={() => { setSelectedAccount(''); setSelectedClient(null); setMessages([]) }}
            title="Усі месенджери"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          {/* Account icons */}
          {accounts.map(acc => (
            <button
              key={acc.id}
              className={`rail-icon ${selectedAccount === acc.id ? 'active' : ''}`}
              onClick={() => handleAccountClick(acc.id)}
              title={`${acc.label} ${acc.phone}`}
            >
              {acc.type === 'telegram'
                ? <TelegramIcon size={18} color={selectedAccount === acc.id ? '#2AABEE' : 'currentColor'} />
                : <WhatsAppIcon size={18} color={selectedAccount === acc.id ? '#25D366' : 'currentColor'} />
              }
              <span className={`rail-status ${acc.status === 'active' || acc.status === 'connected' ? 'online' : ''}`} />
            </button>
          ))}
          {/* Flyout panel on hover */}
          <div className="rail-flyout">
            <button
              className={`rail-flyout-item ${!selectedAccount ? 'active' : ''}`}
              onClick={() => { setSelectedAccount(''); setSelectedClient(null); setMessages([]) }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <div className="rail-flyout-text">
                <span className="rail-flyout-name">Усі</span>
                <span className="rail-flyout-phone">Месенджер</span>
              </div>
            </button>
            {accounts.map(acc => (
              <button
                key={acc.id}
                className={`rail-flyout-item ${selectedAccount === acc.id ? 'active' : ''}`}
                onClick={() => handleAccountClick(acc.id)}
              >
                {acc.type === 'telegram'
                  ? <TelegramIcon size={16} color="#2AABEE" />
                  : <WhatsAppIcon size={16} color="#25D366" />
                }
                <div className="rail-flyout-text">
                  <span className="rail-flyout-name">{acc.label}</span>
                  <span className="rail-flyout-phone">{acc.phone}</span>
                </div>
                <span className={`status-dot ${acc.status === 'active' || acc.status === 'connected' ? 'online' : ''}`} />
              </button>
            ))}
          </div>
        </div>
        {/* Sidebar with contacts */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="resize-handle" onMouseDown={e => startResize('sidebar', e)} />
          {/* Active account card */}
          {(() => {
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
                    <span className="active-account-name">Усі месенджери</span>
                    <span className="active-account-phone">{contacts.length} контактів</span>
                  </>
                )}
              </div>
            )
          })()}
          <div className="sidebar-search">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              placeholder="Пошук контактів..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="contact-list">
            {contacts.map(c => (
              <div
                key={c.client_id}
                className={`contact ${selectedClient === c.client_id ? 'active' : ''}`}
                onClick={() => selectClient(c.client_id)}
              >
                <div className="avatar">
                  {photoMap[c.client_id]
                    ? <img src={photoMap[c.client_id]} className="avatar-img" alt="" />
                    : <UserIcon />}
                </div>
                <div className="contact-body">
                  <div className="contact-row">
                    <span className="contact-name">{c.full_name || c.phone}</span>
                    {isUnread(c) && <span className="unread-dot" />}
                    <span className="contact-time">
                      {c.last_message_date && formatContactDate(c.last_message_date)}
                    </span>
                  </div>
                  <div className="contact-row">
                    <span className="contact-preview">
                      {c.last_message_direction === 'sent' && <span className="preview-you">Ви: </span>}
                      {c.last_message_text?.slice(0, 60) || 'Медіа'}
                    </span>
                  </div>
                  <div className="contact-meta">
                    <span className="contact-phone">{c.phone}</span>
                    <span className="contact-icons">
                      {c.has_telegram !== false && <TelegramIcon size={12} color="#2AABEE" />}
                      {c.has_whatsapp && <WhatsAppIcon size={12} color="#25D366" />}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            {contactCount} контактів
          </div>
        </div>

        {/* Chat area */}
        <div className="chat">
          {selectedClient && selectedContact ? (
            <>
              <div className="chat-header">
                <div className="chat-header-avatar">
                  {selectedClient && photoMap[selectedClient]
                    ? <img src={photoMap[selectedClient]} className="avatar-img" alt="" />
                    : <UserIcon />}
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-name">
                    {clientName || selectedContact.full_name || selectedContact.phone}
                  </div>
                  <div className="chat-header-phone">{clientPhone || selectedContact.phone}</div>
                </div>
                <div className="chat-header-right">
                  <span className="msg-count-badge">{msgCount} повідомлень</span>
                </div>
              </div>
              <div className="chat-messages">
                {hasOlderMessages && (
                  <div className="load-older-wrap">
                    <button className="load-older-btn" onClick={loadOlderMessages} disabled={loadingOlder}>
                      {loadingOlder ? <div className="spinner-sm" /> : '↑ Завантажити старіші'}
                    </button>
                  </div>
                )}
                {groupedMessages.map((item, i) => {
                  if ('type' in item && item.type === 'date') {
                    return (
                      <div key={`date-${i}`} className="date-separator">
                        <span>{item.date}</span>
                      </div>
                    )
                  }
                  const m = item as ChatMessage
                  if (m.type === 'call') {
                    const dur = m.duration_seconds || 0
                    const mm = String(Math.floor(dur / 60)).padStart(2, '0')
                    const ss = String(dur % 60).padStart(2, '0')
                    const isIncoming = m.direction === 'incoming' || m.direction === 'received'
                    const isExpanded = expandedCallId === m.call_id
                    const canPlay = m.has_media && m.media_file
                    return (
                      <div key={m.id} className="call-card-wrapper">
                        <div
                          className={`call-card${isExpanded ? ' has-audio-open' : ''}`}
                          onClick={() => {
                            if (canPlay) {
                              loadCallAudio(m.call_id!, m.media_file)
                            }
                          }}
                        >
                          <div className="call-card-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isIncoming ? '#22c55e' : '#3b82f6'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                            </svg>
                          </div>
                          <div className="call-card-body">
                            <div className="call-card-header">
                              <span className="call-card-label">Бінотел</span>
                              <span className="call-card-time">
                                {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="call-card-details">
                              <span className="call-card-direction">{isIncoming ? 'Вхідний' : 'Вихідний'}</span>
                              {m.operator_name && <span className="call-card-operator">{m.operator_name}</span>}
                              <span className="call-card-duration">{mm}:{ss}</span>
                              {m.disposition && m.disposition !== 'ANSWER' && (
                                <span className="call-card-missed">Пропущений</span>
                              )}
                            </div>
                            {canPlay && !isExpanded && (
                              <div className="call-card-audio-wrap">
                                <button
                                  className="call-card-play-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    loadCallAudio(m.call_id!, m.media_file)
                                  }}
                                  disabled={audioLoading[m.call_id!]}
                                >
                                  {audioLoading[m.call_id!] ? (
                                    <div className="spinner-sm" />
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                  )}
                                  <span>Прослухати</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {isExpanded && audioBlobMap[m.call_id!] && (
                          <div className="call-card-audio-expanded">
                            <audio
                              controls
                              autoPlay
                              preload="auto"
                              src={audioBlobMap[m.call_id!]}
                              onEnded={() => setExpandedCallId(null)}
                            />
                            <button className="call-card-close-btn" onClick={(e) => { e.stopPropagation(); setExpandedCallId(null) }}>✕</button>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <div key={m.id} className={`msg ${m.direction} src-${m.source || 'telegram'}${forwardMode ? ' selectable' : ''}${selectedMsgIds.has(m.id) ? ' selected' : ''}`}
                      onClick={forwardMode ? () => toggleMsgSelection(m.id) : undefined}
                      onContextMenu={!forwardMode ? (e) => { e.preventDefault(); setForwardMode(true); toggleMsgSelection(m.id) } : undefined}
                    >
                      {forwardMode && (
                        <div className={`msg-checkbox${selectedMsgIds.has(m.id) ? ' checked' : ''}`}>
                          {selectedMsgIds.has(m.id) && <SingleCheckIcon color="white" />}
                        </div>
                      )}
                      <div className="msg-bubble">
                        {/* Photo with thumbnail → click to view full */}
                        {m.has_media && m.thumbnail && m.media_type !== 'video' && m.media_type !== 'voice' && m.media_type !== 'document' && (
                          <AuthMedia
                            mediaKey={`thumb_${m.id}`}
                            mediaPath={m.thumbnail}
                            type="image"
                            className="msg-media"
                            token={auth?.token || ''}
                            blobMap={mediaBlobMap}
                            loadBlob={loadMediaBlob}
                            onClick={async () => {
                              if (m.media_file) {
                                const blob = mediaBlobMap[`full_${m.id}`] || await loadMediaBlob(`full_${m.id}`, m.media_file)
                                if (blob) setLightboxSrc(blob)
                              } else if (mediaBlobMap[`thumb_${m.id}`]) {
                                setLightboxSrc(mediaBlobMap[`thumb_${m.id}`])
                              }
                            }}
                          />
                        )}
                        {/* Photo without thumbnail → load full image directly */}
                        {m.has_media && !m.thumbnail && m.media_type === 'photo' && m.media_file && (
                          <AuthMedia
                            mediaKey={`full_${m.id}`}
                            mediaPath={m.media_file}
                            type="image"
                            className="msg-media"
                            token={auth?.token || ''}
                            blobMap={mediaBlobMap}
                            loadBlob={loadMediaBlob}
                            onClick={() => {
                              const src = mediaBlobMap[`full_${m.id}`]
                              if (src) setLightboxSrc(src)
                            }}
                          />
                        )}
                        {/* Voice message → audio player */}
                        {m.has_media && m.media_type === 'voice' && m.media_file && (
                          <div className="msg-voice">
                            {mediaBlobMap[`voice_${m.id}`] ? (
                              <audio controls preload="auto" src={mediaBlobMap[`voice_${m.id}`]} className="msg-voice-audio" />
                            ) : (
                              <button
                                className="msg-voice-btn"
                                onClick={() => loadMediaBlob(`voice_${m.id}`, m.media_file)}
                                disabled={mediaLoading[`voice_${m.id}`]}
                              >
                                {mediaLoading[`voice_${m.id}`] ? <div className="spinner-sm" /> : '🎤'}
                                <span>Голосове</span>
                              </button>
                            )}
                          </div>
                        )}
                        {/* Video (video note / round video) → video player */}
                        {m.has_media && m.media_type === 'video' && m.media_file && (
                          <div className={`msg-video${!mediaBlobMap[`vid_${m.id}`] ? '' : ' playing'}`}>
                            {mediaBlobMap[`vid_${m.id}`] ? (
                              <video
                                controls
                                autoPlay
                                preload="auto"
                                src={mediaBlobMap[`vid_${m.id}`]}
                                className="msg-video-player"
                              />
                            ) : (
                              <button
                                className="msg-video-btn"
                                onClick={() => loadMediaBlob(`vid_${m.id}`, m.media_file)}
                                disabled={mediaLoading[`vid_${m.id}`]}
                              >
                                {mediaLoading[`vid_${m.id}`] ? <div className="spinner-sm" /> : (
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Document → download button */}
                        {m.has_media && m.media_type === 'document' && m.media_file && (
                          <div className="msg-document" onClick={() => downloadMedia(m.media_file, m.media_file.split('/').pop() || 'file')}>
                            <span className="msg-doc-icon">{(m.media_file || '').toLowerCase().endsWith('.pdf') ? '📄' : '📎'}</span>
                            <div className="msg-doc-info">
                              <span className="msg-doc-name">{m.media_file.split('/').pop() || 'Файл'}</span>
                              <span className="msg-doc-action">Зберегти та відкрити</span>
                            </div>
                            {mediaLoading[`doc_${m.media_file}`] && <div className="spinner-sm" />}
                          </div>
                        )}
                        {/* Sticker / unknown media without specific handler */}
                        {m.has_media && !m.thumbnail && m.media_type && !['voice', 'video', 'document', 'photo'].includes(m.media_type) && !m.media_file && (
                          <div className="msg-media-placeholder">
                            {m.media_type === 'sticker' ? '🏷️ Стікер' : `📎 ${m.media_type}`}
                          </div>
                        )}
                        {m.text && <div className="msg-text">{m.text}</div>}
                        <div className="msg-footer">
                          <span className="msg-source">
                            {m.source === 'whatsapp'
                              ? <WhatsAppIcon size={10} color="#25D366" />
                              : <TelegramIcon size={10} color="#2AABEE" />
                            }
                          </span>
                          <span className="msg-time">
                            {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {m.direction === 'sent' && (
                            <span className="msg-status">
                              {m.is_read
                                ? <DoubleCheckIcon color="var(--primary)" />
                                : m.is_read === false
                                  ? <DoubleCheckIcon color="var(--muted-foreground)" />
                                  : <SingleCheckIcon color="var(--muted-foreground)" />
                              }
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
              {/* Forward mode bar */}
              {forwardMode && (
                <div className="forward-bar">
                  <button className="forward-bar-cancel" onClick={exitForwardMode}><XIcon /> Скасувати</button>
                  <span className="forward-bar-count">Обрано: {selectedMsgIds.size}</span>
                  <button className="forward-bar-send" onClick={openForwardModal} disabled={selectedMsgIds.size === 0}>
                    <ForwardIcon /> Переслати
                  </button>
                </div>
              )}
              {auth.isAdmin && !forwardMode && (
                <div className="chat-input">
                  <input type="file" ref={fileInputRef} hidden
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                    onChange={handleFileSelect} />
                  {/* Attachment preview */}
                  {attachedFile && (
                    <div className="attached-preview">
                      {attachedPreview && attachedFile.type.startsWith('image/') ? (
                        <img src={attachedPreview} alt="" className="attached-thumb" />
                      ) : (
                        <span className="attached-name">{attachedFile.name}</span>
                      )}
                      <button className="attached-remove" onClick={clearAttachment}><XIcon /></button>
                    </div>
                  )}
                  {isRecording ? (
                    /* Recording UI */
                    <div className="recording-bar">
                      {recordingType === 'video' && (
                        <video ref={videoPreviewRef} className="recording-video-preview" muted playsInline />
                      )}
                      <div className="recording-indicator">
                        <span className="recording-dot" />
                        <span className="recording-time">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
                      </div>
                      <button className="recording-cancel" onClick={() => stopRecording(false)}><XIcon /></button>
                      <button className="recording-stop" onClick={() => stopRecording(true)}><StopIcon /></button>
                    </div>
                  ) : (
                    /* Normal input */
                    <>
                      <button className="chat-input-btn" onClick={() => fileInputRef.current?.click()} title="Вкласти файл">
                        <PaperclipIcon />
                      </button>
                      <textarea
                        ref={chatInputRef}
                        value={messageText}
                        onChange={e => {
                          setMessageText(e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
                        }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        placeholder="Написати повідомлення..."
                        rows={1}
                      />
                      {messageText.trim() || attachedFile ? (
                        <button onClick={() => sendMessage()} disabled={sending}>
                          {sending ? <div className="spinner-sm" /> : <SendIcon />}
                        </button>
                      ) : (
                        <div className="chat-input-media-btns">
                          <button className="chat-input-btn" onClick={startVoiceRecording} title="Голосове повідомлення">
                            <MicIcon />
                          </button>
                          <button className="chat-input-btn" onClick={startVideoRecording} title="Відеокружок">
                            <VideoIcon />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty-chat">
              <div className="empty-chat-icons">
                <TelegramIcon size={48} color="var(--muted-foreground)" />
                <WhatsAppIcon size={48} color="var(--muted-foreground)" />
              </div>
              <p>Оберіть чат для перегляду</p>
            </div>
          )}
        </div>

        {/* Right Panel: [content | vertical-tabs] */}
        <div className="right-panel" style={{ width: rightPanelWidth }}>
          <div className="resize-handle" onMouseDown={e => startResize('right', e)} />
          <div className="right-panel-body">
            {rightTab === 'notes' ? (
              selectedClient ? (
                <div className="rp-notes">
                  <div className="rp-notes-list">
                    {clientNotes.length === 0 && (
                      <div className="rp-empty">Немає нотаток</div>
                    )}
                    {clientNotes.map(note => (
                      <div key={note.id} className="rp-note">
                        <div className="rp-note-header">
                          <span className="rp-note-author">{note.author_name}</span>
                          <span className="rp-note-date">
                            {new Date(note.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            {' '}
                            {new Date(note.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button className="rp-delete-btn" onClick={() => deleteClientNote(note.id)} title="Видалити">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                        <div className="rp-note-text">{note.text}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rp-add-form">
                    <textarea
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addClientNote() } }}
                      placeholder="Додати нотатку... (Ctrl+Enter)"
                      rows={2}
                    />
                    <button onClick={addClientNote} disabled={!newNoteText.trim()}>
                      <SendIcon />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rp-empty">Оберіть чат для перегляду нотаток</div>
              )
            ) : (
              <div className="rp-quick">
                <div className="rp-quick-list">
                  {templateCategories.length === 0 && (
                    <div className="rp-empty">Немає шаблонів</div>
                  )}
                  {templateCategories.map(cat => (
                    <div key={cat.id} className="tpl-cat">
                      <div className="tpl-cat-header" style={{ borderLeftColor: cat.color }} onClick={() => toggleCat(cat.id)}>
                        <svg className={`tpl-chevron ${expandedCats.has(cat.id) ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                        <span className="tpl-cat-name" style={{ color: cat.color }}>{cat.name}</span>
                        <span className="tpl-cat-count">{cat.templates.length}</span>
                        <div className="tpl-cat-actions">
                          <button className="tpl-add-btn" onClick={e => { e.stopPropagation(); setShowTplModal(cat.id); setNewTplTitle(''); setNewTplText(''); setNewTplMedia(null) }} title="Додати шаблон">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          </button>
                          <button className="rp-delete-btn" onClick={e => { e.stopPropagation(); deleteCategory(cat.id) }} title="Видалити категорію">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                      {expandedCats.has(cat.id) && (
                        <div className="tpl-cat-body">
                          {cat.templates.map(tpl => (
                            <div key={tpl.id} className="tpl-item" onClick={() => setPreviewTpl(tpl)}>
                              <span className="tpl-item-title">{tpl.title}</span>
                              {tpl.media_file && <svg className="tpl-media-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                              <button className="rp-delete-btn tpl-del" onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id) }} title="Видалити">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="tpl-bottom-btn">
                  <button onClick={() => { setShowCatModal(true); setNewCatName(''); setNewCatColor('#6366f1') }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                    Додати категорію
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="right-panel-tabs">
            <button
              className={`rp-tab ${rightTab === 'notes' ? 'active' : ''}`}
              onClick={() => setRightTab('notes')}
              title="Нотатки"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span className="rp-tab-label">Нотатки</span>
            </button>
            <button
              className={`rp-tab ${rightTab === 'quick' ? 'active' : ''}`}
              onClick={() => setRightTab('quick')}
              title="Швидкі відповіді"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <span className="rp-tab-label">Шаблони</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Forward Modal */}
      {showForwardModal && (
        <div className="modal-overlay" onClick={() => setShowForwardModal(false)}>
          <div className="forward-modal" onClick={e => e.stopPropagation()}>
            <h3>Переслати {selectedMsgIds.size} повідомлень</h3>
            <div className="forward-modal-account">
              <label>Акаунт:</label>
              <select value={forwardAccount} onChange={e => { setForwardAccount(e.target.value); searchForwardContacts(forwardSearch) }}>
                <option value="">Той самий</option>
                {accounts.filter(a => a.type === 'telegram' && a.status === 'active').map(a => (
                  <option key={a.id} value={a.id}>{a.label || a.phone}</option>
                ))}
              </select>
            </div>
            <input
              className="forward-modal-search"
              placeholder="Пошук контакту..."
              value={forwardSearch}
              onChange={e => { setForwardSearch(e.target.value); searchForwardContacts(e.target.value) }}
              autoFocus
            />
            <div className="forward-modal-list">
              {forwardContacts.filter(c => c.client_id !== selectedClient).map(c => (
                <div key={c.client_id} className="forward-modal-contact" onClick={() => executeForward(c.client_id)}>
                  <div className="forward-modal-avatar">
                    {photoMap[c.client_id]
                      ? <img src={photoMap[c.client_id]} alt="" />
                      : <span>{(c.full_name || c.phone || '?')[0]}</span>
                    }
                  </div>
                  <div className="forward-modal-info">
                    <div className="forward-modal-name">{c.full_name || c.phone}</div>
                    <div className="forward-modal-phone">{c.phone}</div>
                  </div>
                </div>
              ))}
              {forwardContacts.length === 0 && <div className="forward-modal-empty">Контактів не знайдено</div>}
            </div>
            <button className="tpl-btn-secondary" onClick={() => setShowForwardModal(false)}>Скасувати</button>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="tpl-modal" onClick={e => e.stopPropagation()}>
            <h3>Нова категорія</h3>
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Назва категорії"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
            />
            <div className="tpl-color-row">
              <span>Колір:</span>
              <div className="tpl-colors">
                {['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b'].map(c => (
                  <button key={c} className={`tpl-color-dot ${newCatColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setNewCatColor(c)} />
                ))}
              </div>
            </div>
            <div className="tpl-modal-btns">
              <button className="tpl-btn-primary" onClick={addCategory} disabled={!newCatName.trim()}>Створити</button>
              <button className="tpl-btn-secondary" onClick={() => setShowCatModal(false)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Template Modal */}
      {showTplModal && (
        <div className="modal-overlay" onClick={() => setShowTplModal(null)}>
          <div className="tpl-modal" onClick={e => e.stopPropagation()}>
            <h3>Новий шаблон</h3>
            <input
              value={newTplTitle}
              onChange={e => setNewTplTitle(e.target.value)}
              placeholder="Коротка назва"
              autoFocus
            />
            <textarea
              value={newTplText}
              onChange={e => setNewTplText(e.target.value)}
              placeholder="Текст повідомлення..."
              rows={4}
            />
            <label className="tpl-media-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              {newTplMedia ? newTplMedia.name : 'Прикріпити медіа'}
              <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={e => setNewTplMedia(e.target.files?.[0] || null)} hidden />
            </label>
            <div className="tpl-modal-btns">
              <button className="tpl-btn-primary" onClick={addTemplate} disabled={!newTplTitle.trim() || !newTplText.trim()}>Додати</button>
              <button className="tpl-btn-secondary" onClick={() => setShowTplModal(null)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {previewTpl && (
        <div className="modal-overlay" onClick={() => setPreviewTpl(null)}>
          <div className="tpl-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="tpl-preview-header">
              <span>Попередній перегляд</span>
              <button onClick={() => setPreviewTpl(null)}>✕</button>
            </div>
            <div className="tpl-preview-body">
              <div className="tpl-preview-bubble">
                {previewTpl.media_file && (
                  <div className="tpl-preview-media">
                    {previewTpl.media_file.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                      <img src={`https://cc.vidnova.app${previewTpl.media_file}`} alt="" />
                    ) : (
                      <div className="tpl-preview-file">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                        <span>Файл</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="tpl-preview-text">{previewTpl.text}</div>
              </div>
            </div>
            <div className="tpl-preview-footer">
              <button className="tpl-btn-send" onClick={() => sendTemplate(previewTpl)} disabled={!selectedClient}>
                <SendIcon /> Відправити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What's New modal */}
      {showWhatsNew && (
        <div className="modal-overlay" onClick={() => setShowWhatsNew(false)}>
          <div className="whats-new-modal" onClick={e => e.stopPropagation()}>
            <div className="whats-new-header">
              <h2>Vidnovagram v{currentVersion}</h2>
              <button className="icon-btn" onClick={() => setShowWhatsNew(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="whats-new-body">
              {CHANGELOG[currentVersion] ? (
                <ul className="whats-new-list">
                  {CHANGELOG[currentVersion].map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Оновлено до нової версії.</p>
              )}
            </div>
            <div className="whats-new-footer">
              <button className="whats-new-btn" onClick={() => setShowWhatsNew(false)}>Зрозуміло</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Login Screen =====

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
