import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
  '0.10.3': [
    'Кольорові заголовки правої панелі (Аналізи / Нотатки / Шаблони)',
    'Gmail: фільтр Усі/Вхідні/Надіслані — мінімалістичні іконки',
    'Gmail: значки напрямку (синій вх / зелений вих) у режимі «Усі»',
  ],
  '0.10.1': [
    'Виправлено перетягування шаблонів та вкладок (drag & drop)',
    'Gmail інтегровано в месенджер — листи як контакти, відповідь з чату',
    'Прив\'язка аналізів з чату — правий клік → «Додати аналіз» → пацієнт',
    'Підсвітка непрочитаних контактів (голуба TG / зелена WA)',
    'Контекстне меню на всіх повідомленнях (не лише медіа)',
  ],
  '0.9.0': [
    'Панель «Аналізи» — перегляд лабораторних результатів пацієнтів (фото у додатку, PDF у браузері)',
    'Пошук аналізів за ПІБ або телефоном, згруповані по пацієнтах з тамбнейлами',
    'Нові сповіщення — аватар відправника, матове скло (блакитне TG / зелене WA)',
    'Сповіщення не ховаються автоматично — кнопка «Приховати всі» та хрестик на кожній картці',
    'Перетягування категорій шаблонів та вкладок правої панелі (drag & drop)',
    'Два режими редагування шаблонів — перед відправкою та глобальне',
    'Прикріплення додаткового файлу при відправці шаблону',
    'Виправлено відправку медіа з шаблонів',
  ],
  '0.7.3': [
    'Сповіщення — бейдж непрочитаних на лівій панелі',
    'Спливаючі тости нових повідомлень (клік → перехід у чат)',
    'Звук сповіщення для нових повідомлень',
    'Новий чат — написати будь-кому за номером телефону (TG/WA)',
    'Додавання контакту в конкретний акаунт (TG/WA)',
    'Автодоповнення з бази при введенні імені або телефону',
    'Виправлено відправку голосових та відеоповідомлень (помилка 500)',
  ],
  '0.7.2': [
    'Виправлено запис та відправку голосових повідомлень',
    'Виправлено запис відеокружків — превʼю камери працює',
    'Ширший плеєр голосових повідомлень',
    'Виправлено пересилання повідомлень',
    'Додавання контакту — кнопка + перевірка Telegram',
    'ПІБ співробітників — фіолетовий колір',
  ],
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
  is_employee?: boolean
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
  account_id?: string
  is_read?: boolean
  tg_message_id?: number
  // Call-specific fields
  call_id?: string
  duration_seconds?: number
  disposition?: string
  operator_name?: string
  // Lab result fields
  is_lab_result?: boolean
  lab_result_type?: string
  patient_name?: string
  patient_phone?: string
  patient_client_id?: string
  patient_client_name?: string
}

interface LinkPreview {
  url: string
  title: string
  description: string
  image: string
  site_name: string
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

interface LabResult {
  id: string | number
  source: 'telegram' | 'gmail'
  text: string
  media_type: string
  media_file: string
  thumbnail: string
  lab_result_type: string
  message_date: string
  client_id: string
  client_name: string
  client_phone: string
  patient_name: string
  patient_dob: string
  patient_client_id: string
  patient_client_name: string
  is_from_lab: boolean
  lab_name: string
  attachments?: { filename: string; mime_type: string; url?: string; is_lab_result?: boolean }[]
  drive_links?: string[]
}

interface LabPatient {
  key: string
  name: string
  phone: string
  dob: string
  photo: string | null
  results: LabResult[]
}

interface GmailAccount {
  id: string
  label: string
  email: string
  status: string
  messages_count: number
}

interface GmailEmail {
  id: string
  gmail_id: string
  subject: string
  sender: string
  recipients: string[]
  snippet: string
  body_text: string
  date: string
  is_read: boolean
  has_attachments: boolean
  attachments: { filename: string; mime_type: string; size: number; attachment_id: string }[]
  labels: string[]
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

// ===== URL detection & linkify =====

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi

function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX)
  return m ? m[0] : null
}

function Linkify({ text, onLinkClick }: { text: string; onLinkClick: (url: string) => void }) {
  const parts = text.split(URL_REGEX)
  const urls = text.match(URL_REGEX) || []
  const result: React.ReactNode[] = []
  parts.forEach((part, i) => {
    if (part) result.push(part)
    if (urls[i]) {
      result.push(
        <a key={i} className="msg-link" onClick={e => { e.preventDefault(); e.stopPropagation(); onLinkClick(urls[i]) }}>
          {urls[i].length > 60 ? urls[i].slice(0, 57) + '...' : urls[i]}
        </a>
      )
    }
  })
  return <>{result}</>
}

function LinkPreviewCard({ url, token, onClick }: { url: string; token: string; onClick: (u: string) => void }) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!url || loaded) return
    setLoaded(true)
    const cached = linkPreviewCacheRef.current.get(url)
    if (cached !== undefined) { setPreview(cached); return }
    authFetch(`${API_BASE}/messenger/link-preview/?url=${encodeURIComponent(url)}`, token)
      .then(r => r.ok ? r.json() : null)
      .then((data: LinkPreview | null) => {
        if (data && data.title) {
          linkPreviewCacheRef.current.set(url, data)
          setPreview(data)
        } else {
          linkPreviewCacheRef.current.set(url, null)
        }
      })
      .catch(() => { linkPreviewCacheRef.current.set(url, null) })
  }, [url, token, loaded])

  if (!preview) return null

  return (
    <div className="link-preview" onClick={e => { e.stopPropagation(); onClick(url) }}>
      {preview.image && (
        <img src={preview.image} alt="" className="link-preview-img" onError={e => (e.currentTarget.style.display = 'none')} />
      )}
      <div className="link-preview-body">
        {preview.site_name && <span className="link-preview-site">{preview.site_name}</span>}
        <span className="link-preview-title">{preview.title}</span>
        {preview.description && <span className="link-preview-desc">{preview.description}</span>}
      </div>
    </div>
  )
}

// Shared cache ref (set inside App component, used by LinkPreviewCard)
let linkPreviewCacheRef: React.MutableRefObject<Map<string, LinkPreview | null>> = { current: new Map() }

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

/** Render contact name: full name in violet for employees */
function ContactName({ name, isEmployee }: { name: string; isEmployee?: boolean }) {
  if (!isEmployee || !name.trim()) return <>{name}</>
  return <span className="employee-name">{name}</span>
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

const GmailIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" />
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
  const [contactPage, setContactPage] = useState(1)
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false)
  const [hasMoreContacts, setHasMoreContacts] = useState(false)

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [msgCount, setMsgCount] = useState(0)
  const [msgPage, setMsgPage] = useState(1)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [isPlaceholder, setIsPlaceholder] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<{id: string; phone: string; full_name: string; calls_count: number}[]>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [sending, setSending] = useState(false)

  // Right panel
  type RpTab = 'notes' | 'quick' | 'lab' | 'clients'
  const [rightTabs, setRightTabs] = useState<RpTab[]>(() => {
    try { const s = localStorage.getItem('rp-tab-order'); if (s) { const a = JSON.parse(s); if (!a.includes('lab')) a.push('lab'); if (!a.includes('clients')) a.push('clients'); return a } } catch {}
    return ['notes', 'quick', 'lab', 'clients']
  })
  const [rightTab, setRightTab] = useState<RpTab>('notes')
  // Contacts tab state
  const [rpClients, setRpClients] = useState<{ id: string; phone: string; full_name: string; calls_count: number; has_telegram: boolean; has_whatsapp?: boolean }[]>([])
  const [rpClientSearch, setRpClientSearch] = useState('')
  const [rpClientLoading, setRpClientLoading] = useState(false)
  const [rpClientPage, setRpClientPage] = useState(1)
  const [rpClientTotal, setRpClientTotal] = useState(0)
  const [rpSelectedClient, setRpSelectedClient] = useState<string | null>(null)
  const [rpClientCalls, setRpClientCalls] = useState<any[]>([])
  const [rpClientMsgs, setRpClientMsgs] = useState<ChatMessage[]>([])
  const [rpClientInfo, setRpClientInfo] = useState<{ name: string; phone: string } | null>(null)
  const [rpClientDetailLoading, setRpClientDetailLoading] = useState(false)
  // Add-to-account modal
  const [addToAcctModal, setAddToAcctModal] = useState<{ phone: string; name: string; clientId: string } | null>(null)
  const [addToAcctChecking, setAddToAcctChecking] = useState(false)
  const [addToAcctResult, setAddToAcctResult] = useState<{ telegram: boolean; whatsapp: boolean } | null>(null)
  const [addToAcctSelected, setAddToAcctSelected] = useState<string>('')
  const [addToAcctAdding, setAddToAcctAdding] = useState(false)
  // Audio playback for calls in contacts panel
  const [rpPlayingCall, setRpPlayingCall] = useState<string | null>(null)
  const rpAudioRef = useRef<HTMLAudioElement | null>(null)
  const dragCatRef = useRef<string | null>(null)
  const dragTabRef = useRef<string | null>(null)
  const dragLabPatientRef = useRef<LabPatient | null>(null)
  const [chatDropHighlight, setChatDropHighlight] = useState(false)
  const [labSendModal, setLabSendModal] = useState<LabPatient | null>(null)
  const [labSendSelected, setLabSendSelected] = useState<Set<string | number>>(new Set())
  const [labSending, setLabSending] = useState(false)
  // Lab results
  const [labPatients, setLabPatients] = useState<LabPatient[]>([])
  const [labSearch, setLabSearch] = useState('')
  const [labLoading, setLabLoading] = useState(false)
  const [labPage, setLabPage] = useState(1)
  const [labTotal, setLabTotal] = useState(0)
  const [expandedLabPatient, setExpandedLabPatient] = useState<string | null>(null)
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
  const [tplEditText, setTplEditText] = useState('')
  const [tplIncludeMedia, setTplIncludeMedia] = useState(true)
  const [tplSendExtraFile, setTplSendExtraFile] = useState<File | null>(null) // extra attachment for send
  // Global edit mode
  const [editingTpl, setEditingTpl] = useState<QuickReply | null>(null)
  const [editTplTitle, setEditTplTitle] = useState('')
  const [editTplText, setEditTplText] = useState('')
  const [editTplMedia, setEditTplMedia] = useState<File | null>(null)
  const [editTplRemoveMedia, setEditTplRemoveMedia] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'template' | 'category'; id: string; name: string } | null>(null)

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

  // In-app toast notifications
  const [toasts, setToasts] = useState<{ id: number; clientId: string; accountId: string; sender: string; account: string; text: string; hasMedia: boolean; mediaType: string; time: number }[]>([])
  const toastIdRef = useRef(0)
  const [expandedToastGroup, setExpandedToastGroup] = useState<string | null>(null)

  // Per-account unread counts (from WS events)
  const [accountUnreads, setAccountUnreads] = useState<Record<string, number>>({})

  const wsRef = useRef<WebSocket | null>(null)
  const notifAudioRef = useRef<HTMLAudioElement | null>(null)
  const _linkPreviewCache = useRef<Map<string, LinkPreview | null>>(new Map())
  linkPreviewCacheRef = _linkPreviewCache
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const selectedClientRef = useRef<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const linkSearchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

  // Context menu for media
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; mediaPath?: string; mediaType?: string; messageId: number | string
  } | null>(null)

  // Lab assign modal
  const [labAssignMsg, setLabAssignMsg] = useState<ChatMessage | null>(null) // message to assign as lab result
  const [labAssignSearch, setLabAssignSearch] = useState('')
  const [labAssignResults, setLabAssignResults] = useState<{id: string; phone: string; full_name: string}[]>([])
  const [labAssignLoading, setLabAssignLoading] = useState(false)

  // Forward mode
  const [forwardMode, setForwardMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number | string>>(new Set())
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardContacts, setForwardContacts] = useState<Contact[]>([])
  const [forwardAccount, setForwardAccount] = useState<string>('')

  // New chat client info (for contacts not yet in messenger list)
  const [newChatClient, setNewChatClient] = useState<{ client_id: string; phone: string; full_name: string } | null>(null)

  // Add contact modal
  const [showAddContact, setShowAddContact] = useState(false)
  const [addContactName, setAddContactName] = useState('')
  const [addContactPhone, setAddContactPhone] = useState('')
  const [addContactLoading, setAddContactLoading] = useState(false)
  const [addContactResult, setAddContactResult] = useState<string>('')
  const [addContactAccount, setAddContactAccount] = useState('')
  const [addContactSuggestions, setAddContactSuggestions] = useState<{ client_id: string; phone: string; full_name: string }[]>([])
  const [addContactShowSuggestions, setAddContactShowSuggestions] = useState(false)
  const [addContactAvail, setAddContactAvail] = useState<{ whatsapp?: boolean; telegram?: boolean } | null>(null)
  const addContactSugTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const addContactCheckTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Gmail
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([])
  const [selectedGmail, setSelectedGmail] = useState<string | null>(null) // gmail account id
  const [gmailEmails, setGmailEmails] = useState<GmailEmail[]>([])
  const [gmailTotal, setGmailTotal] = useState(0)
  const [gmailPage, setGmailPage] = useState(1)
  const [gmailSearch, setGmailSearch] = useState('')
  const [gmailDirection, setGmailDirection] = useState<'' | 'inbox' | 'sent'>('inbox')
  const [gmailLoading, setGmailLoading] = useState(false)
  const [gmailSelectedMsg, setGmailSelectedMsg] = useState<GmailEmail | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeFiles, setComposeFiles] = useState<File[]>([])
  const [composeSending, setComposeSending] = useState(false)
  const composeFileRef = useRef<HTMLInputElement>(null)
  const gmailSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

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

  // Initialize notification sound
  useEffect(() => {
    const audio = new Audio('/notification.mp3')
    audio.volume = 0.5
    notifAudioRef.current = audio
  }, [])

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

  // Load accounts (TG + WA + Gmail)
  const loadAccounts = useCallback(async () => {
    if (!auth?.token) return
    try {
      const [tgResp, waResp, gmResp] = await Promise.all([
        authFetch(`${API_BASE}/telegram/accounts/`, auth.token),
        authFetch(`${API_BASE}/whatsapp/accounts/`, auth.token),
        authFetch(`${API_BASE}/mail/accounts/`, auth.token),
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

      // Gmail accounts
      if (gmResp.ok) {
        const gmData = await gmResp.json()
        const gms: GmailAccount[] = []
        for (const a of (Array.isArray(gmData) ? gmData : gmData.results || [])) {
          if (a.status === 'active') {
            gms.push({ id: a.id, label: a.label, email: a.email, status: a.status, messages_count: a.messages_count || 0 })
          }
        }
        setGmailAccounts(gms)
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
        setContactPage(1)
        setHasMoreContacts(list.length >= (data.per_page || 50) && list.length < (data.count || 0))

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

  // Load more contacts (infinite scroll)
  const loadMoreContacts = useCallback(async () => {
    if (!auth?.token || loadingMoreContacts || !hasMoreContacts) return
    const nextPage = contactPage + 1
    setLoadingMoreContacts(true)
    try {
      const params = new URLSearchParams({ per_page: '50', page: String(nextPage) })
      if (search) params.set('search', search)
      if (selectedAccount) params.set('account', selectedAccount)
      const resp = await authFetch(`${API_BASE}/telegram/contacts/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        const list = data.results || []
        setContacts(prev => [...prev, ...list])
        setContactPage(nextPage)
        setHasMoreContacts(list.length >= (data.per_page || 50))

        // Load avatars for new contacts
        const ids = list.map((c: Contact) => c.client_id).join(',')
        if (ids) {
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
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) { console.error('Load more contacts:', e) }
    finally { setLoadingMoreContacts(false) }
  }, [auth?.token, loadingMoreContacts, hasMoreContacts, contactPage, search, selectedAccount, photoMap])

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
        setIsPlaceholder(data.is_placeholder || false)
        if (msgs.length > 0) {
          setReadTs(clientId, msgs[msgs.length - 1].message_date)
        }
        if (scrollToEnd) {
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 300)
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

  // Link placeholder to real client
  const searchClientsForLink = useCallback(async (q: string) => {
    if (!auth?.token || q.length < 2) { setLinkResults([]); return }
    try {
      const res = await fetch(`${API_BASE}/clients/?search=${encodeURIComponent(q)}&page_size=20`, {
        headers: { Authorization: `Token ${auth.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setLinkResults(data.results || [])
      }
    } catch (e) { console.error('Search clients:', e) }
  }, [auth?.token])

  const handleLinkClient = useCallback(async (targetId: string) => {
    if (!auth?.token || !selectedClient) return
    setLinkLoading(true)
    try {
      const res = await fetch(`${API_BASE}/telegram/link-client/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Token ${auth.token}` },
        body: JSON.stringify({ placeholder_id: selectedClient, target_id: targetId }),
      })
      if (res.ok) {
        const data = await res.json()
        setShowLinkModal(false)
        setLinkSearch('')
        setSelectedClient(data.target_id)
        setIsPlaceholder(false)
        loadMessages(data.target_id)
        // Reload contacts
        loadContacts()
      }
    } catch (e) { console.error('Link client:', e) }
    setLinkLoading(false)
  }, [auth?.token, selectedClient, loadMessages])

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
      const name = fileToSend instanceof File ? fileToSend.name : (mediaType === 'voice' ? 'voice.webm' : 'video.webm')
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
      } else {
        const err = await resp.text().catch(() => '')
        console.error('Send failed:', resp.status, err)
        alert(`Помилка відправки: ${resp.status}`)
      }
    } catch (e) { console.error('Send:', e) }
    finally { setSending(false) }
  }, [selectedClient, messageText, selectedAccount, auth?.token, sending, loadMessages, attachedFile])

  // Send lab results to current chat: text header + files sequentially
  const sendLabResults = useCallback(async () => {
    if (!selectedClient || !auth?.token || !labSendModal || labSendSelected.size === 0) return
    setLabSending(true)
    const patient = labSendModal
    const results = patient.results.filter(r => labSendSelected.has(r.id))
    try {
      // 1. Send text message with patient info
      const header = `${patient.name || 'Невідомий пацієнт'}${patient.phone ? `\n${patient.phone}` : ''}${patient.dob ? `\nДата народження: ${patient.dob}` : ''}\nАналізів: ${results.length}`
      const fd = new FormData()
      fd.append('text', header)
      if (selectedAccount) fd.append('account_id', selectedAccount)
      await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
        method: 'POST', body: fd,
      })
      // 2. Send each file sequentially
      for (const r of results) {
        if (!r.media_file) continue
        const url = r.media_file.startsWith('http') ? r.media_file : `${API_BASE.replace('/api', '')}${r.media_file}`
        const resp = await authFetch(url, auth.token)
        if (!resp.ok) continue
        const blob = await resp.blob()
        const ext = r.media_file.split('.').pop() || 'jpg'
        const filename = `${r.lab_result_type || 'lab'}_${new Date(r.message_date).toLocaleDateString('uk-UA').replace(/\./g, '-')}.${ext}`
        const fileFd = new FormData()
        fileFd.append('file', blob, filename)
        if (selectedAccount) fileFd.append('account_id', selectedAccount)
        await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
          method: 'POST', body: fileFd,
        })
      }
      setLabSendModal(null)
      setLabSendSelected(new Set())
      loadMessages(selectedClient)
    } catch (e) { console.error('Send lab results:', e) }
    finally { setLabSending(false) }
  }, [selectedClient, auth?.token, labSendModal, labSendSelected, selectedAccount, loadMessages])

  // === Right panel Contacts functions ===
  const loadRpClients = useCallback(async (page = 1, search = '') => {
    if (!auth?.token) return
    setRpClientLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '30' })
      if (search) params.set('search', search)
      const resp = await authFetch(`${API_BASE}/clients/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        setRpClients(data.results || [])
        setRpClientTotal(data.count || 0)
        setRpClientPage(page)
      }
    } catch (e) { console.error('Load clients:', e) }
    finally { setRpClientLoading(false) }
  }, [auth?.token])

  const loadRpClientDetail = useCallback(async (clientId: string) => {
    if (!auth?.token) return
    setRpSelectedClient(clientId)
    setRpClientDetailLoading(true)
    setRpClientCalls([])
    setRpClientMsgs([])
    try {
      // Load calls and messages in parallel
      const [callsResp, msgsResp] = await Promise.all([
        authFetch(`${API_BASE}/clients/${clientId}/calls/?page_size=50&ordering=-call_datetime`, auth.token),
        authFetch(`${API_BASE}/telegram/contacts/${clientId}/messages/?per_page=100`, auth.token),
      ])
      if (callsResp.ok) {
        const cd = await callsResp.json()
        setRpClientCalls(cd.results || [])
      }
      if (msgsResp.ok) {
        const md = await msgsResp.json()
        setRpClientMsgs(md.results || [])
        setRpClientInfo({ name: md.client_name || '', phone: md.client_phone || '' })
      }
    } catch (e) { console.error('Client detail:', e) }
    finally { setRpClientDetailLoading(false) }
  }, [auth?.token])

  const checkPhoneMessengers = useCallback(async (phone: string) => {
    if (!auth?.token) return
    setAddToAcctChecking(true)
    setAddToAcctResult(null)
    try {
      const resp = await authFetch(`${API_BASE}/telegram/check-phone/?phone=${encodeURIComponent(phone)}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        setAddToAcctResult({ telegram: data.telegram, whatsapp: data.whatsapp })
      }
    } catch (e) { console.error('Check phone:', e) }
    finally { setAddToAcctChecking(false) }
  }, [auth?.token])


  const playCallAudio = useCallback(async (callId: string) => {
    if (!auth?.token) return
    if (rpPlayingCall === callId) {
      rpAudioRef.current?.pause()
      setRpPlayingCall(null)
      return
    }
    try {
      const resp = await authFetch(`${API_BASE.replace('/api', '')}/media/binotel/${callId}.mp3`, auth.token)
      if (!resp.ok) { alert('Аудіо недоступне'); return }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      if (rpAudioRef.current) { rpAudioRef.current.pause(); URL.revokeObjectURL(rpAudioRef.current.src) }
      const audio = new Audio(url)
      rpAudioRef.current = audio
      audio.onended = () => setRpPlayingCall(null)
      audio.play()
      setRpPlayingCall(callId)
    } catch { /* ignore */ }
  }, [auth?.token, rpPlayingCall])

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

  // Audio analyser for visualizer
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(20).fill(0))
  const streamRef = useRef<MediaStream | null>(null)

  // Voice recording
  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      // Setup analyser for visualizer
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser
      // Animate levels
      const updateLevels = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const bars = Array.from({ length: 20 }, (_, i) => {
          const idx = Math.floor(i * data.length / 20)
          return data[idx] / 255
        })
        setAudioLevels(bars)
        animFrameRef.current = requestAnimationFrame(updateLevels)
      }
      updateLevels()

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      })
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.start(200) // collect data every 200ms
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingType('voice')
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (e) {
      console.error('Mic access denied:', e)
      alert('Не вдалося отримати доступ до мікрофону')
    }
  }, [])

  // Video note (circle) recording
  const startVideoRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 384, height: 384, facingMode: 'user' }, audio: true })
      streamRef.current = stream
      setRecordingType('video')
      setRecordingTime(0)
      setIsRecording(true) // triggers modal render, then useEffect attaches stream to video element

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm'
      })
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.start(200)
      mediaRecorderRef.current = recorder
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (e) {
      console.error('Camera access denied:', e)
      alert('Не вдалося отримати доступ до камери')
    }
  }, [])

  const stopRecording = useCallback((send: boolean) => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    analyserRef.current = null
    setAudioLevels(new Array(20).fill(0))

    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      // Cleanup stream
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null
      setIsRecording(false)
      setRecordingTime(0)
      return
    }

    // Use onstop to collect final data and send
    const origOnStop = recorder.onstop
    recorder.onstop = () => {
      if (typeof origOnStop === 'function') origOnStop.call(recorder, new Event('stop'))
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null

      if (send && recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: recordedChunksRef.current[0]?.type || (recordingType === 'voice' ? 'audio/webm' : 'video/webm') })
        const mediaTypeHint = recordingType === 'voice' ? 'voice' : 'video_note'
        sendMessage(blob, mediaTypeHint)
      }
      setIsRecording(false)
      setRecordingTime(0)
    }
    recorder.stop()
  }, [recordingType, sendMessage])

  // Attach video stream to preview element when recording modal mounts
  useEffect(() => {
    if (isRecording && recordingType === 'video' && streamRef.current) {
      // Retry a few times until the ref is attached (modal rendering delay)
      let attempts = 0
      const tryAttach = () => {
        if (videoPreviewRef.current && streamRef.current?.active) {
          videoPreviewRef.current.srcObject = streamRef.current
          videoPreviewRef.current.play().catch(() => {})
        } else if (attempts < 10) {
          attempts++
          setTimeout(tryAttach, 50)
        }
      }
      tryAttach()
    }
  }, [isRecording, recordingType])

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
    // Get tg_message_ids from selected TG messages
    const selectedTgMsgs = messages.filter(m => selectedMsgIds.has(m.id) && m.source === 'telegram' && m.tg_message_id)
    const tgMsgIds = selectedTgMsgs.map(m => m.tg_message_id!)
    if (tgMsgIds.length === 0) {
      alert('Вибрані повідомлення не можна переслати (тільки Telegram)')
      return
    }
    // Use the account from the first selected message, or the selected forward account
    const sourceAccountId = forwardAccount || selectedTgMsgs[0]?.account_id || selectedAccount || ''

    try {
      const resp = await authFetch(`${API_BASE}/telegram/forward/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_ids: tgMsgIds,
          from_client_id: selectedClient,
          to_client_id: toClientId,
          account_id: sourceAccountId,
        }),
      })
      if (resp.ok) {
        setShowForwardModal(false)
        exitForwardMode()
      } else {
        const err = await resp.json().catch(() => ({}))
        alert(err.error || 'Помилка пересилання')
      }
    } catch (e) { console.error('Forward:', e) }
  }, [auth?.token, selectedMsgIds, selectedClient, messages, forwardAccount, selectedAccount, exitForwardMode])

  // Add contact
  const searchAddContactSuggestions = useCallback((q: string) => {
    if (!auth?.token || q.length < 2) { setAddContactSuggestions([]); setAddContactShowSuggestions(false); return }
    clearTimeout(addContactSugTimer.current)
    addContactSugTimer.current = setTimeout(async () => {
      try {
        const resp = await authFetch(`${API_BASE}/telegram/new-chat/?q=${encodeURIComponent(q)}`, auth.token)
        if (resp.ok) {
          const data = await resp.json()
          setAddContactSuggestions(data)
          setAddContactShowSuggestions(data.length > 0)
        }
      } catch { /* ignore */ }
    }, 300)
  }, [auth?.token])

  // Check phone availability in messengers (debounced)
  const checkPhoneAvail = useCallback((phone: string) => {
    if (!auth?.token) return
    const clean = phone.replace(/[\s\-\(\)\+]/g, '')
    if (clean.length < 10) { setAddContactAvail(null); return }
    clearTimeout(addContactCheckTimer.current)
    addContactCheckTimer.current = setTimeout(async () => {
      try {
        const resp = await authFetch(`${API_BASE}/telegram/check-phone/?phone=${encodeURIComponent(clean)}`, auth.token)
        if (resp.ok) setAddContactAvail(await resp.json())
      } catch { /* ignore */ }
    }, 500)
  }, [auth?.token])

  // Start new chat: find/create client by phone, then open chat
  const startNewChat = useCallback(async () => {
    if (!auth?.token || !addContactPhone.trim()) return
    const acctId = addContactAccount || selectedAccount
    if (!acctId) { setAddContactResult('Оберіть акаунт'); return }
    setAddContactLoading(true)
    setAddContactResult('')
    try {
      // Create/find client via new-chat POST
      const resp = await authFetch(`${API_BASE}/telegram/new-chat/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: addContactPhone.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok) { setAddContactResult(data.error || 'Помилка'); return }

      // Update client name if provided and client is new or has no name
      if (addContactName.trim() && (data.is_new || !data.full_name)) {
        // Name will be set when we add contact to TG account below
      }

      const clientId = data.client_id

      // For TG accounts — also add contact in Telegram
      const acct = accounts.find(a => a.id === acctId)
      if (acct?.type === 'telegram') {
        try {
          await authFetch(`${API_BASE}/telegram/add-contact/`, auth.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: addContactPhone.trim(), name: addContactName.trim(), account_id: acctId }),
          })
        } catch { /* non-critical */ }
      }

      // Save new chat client info so chat renders even without messages
      setNewChatClient({ client_id: clientId, phone: data.phone, full_name: addContactName.trim() || data.full_name || '' })

      // Close modal and open chat
      setShowAddContact(false)
      setAddContactName(''); setAddContactPhone(''); setAddContactResult('')
      setAddContactSuggestions([]); setAddContactShowSuggestions(false); setAddContactAvail(null)

      // Select the account and client
      if (acctId !== selectedAccount) setSelectedAccount(acctId)
      setSelectedClient(clientId)
      loadMessages(clientId)
      loadContacts()

    } catch {
      setAddContactResult('Помилка зʼєднання')
    } finally {
      setAddContactLoading(false)
    }
  }, [auth?.token, addContactPhone, addContactName, addContactAccount, selectedAccount, accounts, loadMessages, loadContacts])

  // Add contact to specific messenger account, then open the chat
  const addContact = useCallback(async () => {
    if (!auth?.token || !addContactPhone.trim()) return
    const acctId = addContactAccount || selectedAccount
    if (!acctId) { setAddContactResult('Оберіть акаунт'); return }
    setAddContactLoading(true)
    setAddContactResult('')
    try {
      const resp = await authFetch(`${API_BASE}/telegram/add-contact/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: addContactPhone.trim(), name: addContactName.trim(), account_id: acctId }),
      })
      const data = await resp.json()
      if (resp.ok) {
        const acct = accounts.find(a => a.id === acctId)
        const acctLabel = acct ? acct.label : ''
        const m = data.messenger || {}
        let statusText = ''
        if (m.error) {
          statusText = `Помилка: ${m.error}`
          setAddContactResult(statusText)
        } else {
          if (m.already) statusText = `Контакт вже є в ${acctLabel}`
          else if (m.added) statusText = `Контакт додано в ${acctLabel}`
          if (data.created) statusText += ' (новий в базі)'
          // Save new chat client info so chat renders even without messages
          setNewChatClient({ client_id: data.client_id, phone: data.phone, full_name: addContactName.trim() || data.full_name || '' })
          // Close modal and open chat with this contact
          setShowAddContact(false)
          setAddContactName(''); setAddContactPhone(''); setAddContactResult('')
          setAddContactSuggestions([]); setAddContactShowSuggestions(false); setAddContactAvail(null)
          if (acctId !== selectedAccount) setSelectedAccount(acctId)
          setSelectedClient(data.client_id)
          loadMessages(data.client_id)
          loadContacts()
        }
      } else {
        setAddContactResult(data.error || 'Помилка')
      }
    } catch {
      setAddContactResult('Помилка зʼєднання')
    } finally {
      setAddContactLoading(false)
    }
  }, [auth?.token, addContactPhone, addContactName, addContactAccount, selectedAccount, accounts, loadContacts, loadMessages])

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

  // Load lab results grouped by patient
  const loadLabResults = useCallback(async (page = 1, search = '') => {
    if (!auth?.token) return
    setLabLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      const resp = await authFetch(`${API_BASE}/telegram/lab-results/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        const results: LabResult[] = data.results || []
        setLabTotal(data.total || results.length)
        // Group by patient: patient_client_id > patient_name > client_id
        const map = new Map<string, LabPatient>()
        for (const r of results) {
          const key = r.patient_client_id || (r.patient_name ? `n:${r.patient_name.toLowerCase()}` : r.client_id || `u:${r.id}`)
          if (!map.has(key)) {
            map.set(key, {
              key,
              name: r.patient_client_name || r.patient_name || r.client_name || r.client_phone || '',
              phone: r.client_phone || '',
              dob: r.patient_dob || '',
              photo: null,
              results: [],
            })
          }
          map.get(key)!.results.push(r)
        }
        setLabPatients(Array.from(map.values()))
        setLabPage(page)
        // Fetch photos for patients that have client_id
        const clientIds = [...new Set(results.map(r => r.patient_client_id || r.client_id).filter(Boolean))]
        if (clientIds.length > 0) {
          const photoResp = await authFetch(`${API_BASE}/telegram/photos-map/?ids=${clientIds.join(',')}`, auth.token)
          if (photoResp.ok) {
            const pm: Record<string, string> = await photoResp.json()
            // Store media path (not full URL) — will be loaded via loadMediaBlob with auth
            setLabPatients(prev => prev.map(p => {
              const cid = p.results[0]?.patient_client_id || p.results[0]?.client_id || ''
              return pm[cid] ? { ...p, photo: pm[cid] } : p
            }))
          }
        }
      }
    } catch { /* ignore */ }
    setLabLoading(false)
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

  // Save template (global edit)
  const saveTemplate = useCallback(async (tpl: QuickReply) => {
    if (!auth?.token) return
    try {
      const formData = new FormData()
      formData.append('title', editTplTitle.trim())
      formData.append('text', editTplText.trim())
      if (editTplMedia) {
        formData.append('media_file', editTplMedia)
      } else if (editTplRemoveMedia) {
        formData.append('remove_media', 'true')
      }
      const resp = await fetch(`${API_BASE}/messenger/quick-replies/${tpl.id}/`, {
        method: 'PATCH',
        headers: { 'Authorization': `Token ${auth.token}` },
        body: formData,
      })
      if (resp.ok) {
        setEditingTpl(null)
        setEditTplMedia(null)
        setEditTplRemoveMedia(false)
        loadTemplateCategories()
      }
    } catch { /* ignore */ }
  }, [auth?.token, editTplTitle, editTplText, editTplMedia, editTplRemoveMedia, loadTemplateCategories])

  // Reorder categories via drag-and-drop
  const reorderCategories = useCallback(async (fromId: string, toId: string) => {
    if (fromId === toId || !auth?.token) return
    setTemplateCategories(prev => {
      const arr = [...prev]
      const fi = arr.findIndex(c => c.id === fromId)
      const ti = arr.findIndex(c => c.id === toId)
      if (fi < 0 || ti < 0) return prev
      const [moved] = arr.splice(fi, 1)
      arr.splice(ti, 0, moved)
      // Persist sort_order to backend
      arr.forEach((cat, i) => {
        if (cat.sort_order !== i) {
          authFetch(`${API_BASE}/messenger/template-categories/${cat.id}/`, auth.token!, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: i }),
          }).catch(() => {})
        }
        cat.sort_order = i
      })
      return arr
    })
  }, [auth?.token])

  // Send template to current chat
  const sendTemplate = useCallback(async (text: string, mediaUrl: string | null, extraFile: File | null) => {
    if (!selectedClient || !auth?.token) return
    setPreviewTpl(null)
    setTplSendExtraFile(null)
    try {
      const acctId = selectedAccount || ''

      // Determine the file to send: extraFile (user-added) takes priority, else download media from template
      let fileToSend: Blob | null = null
      let fileName = ''

      if (extraFile) {
        fileToSend = extraFile
        fileName = extraFile.name
      } else if (mediaUrl) {
        try {
          const mediaResp = await authFetch(`${API_BASE.replace('/api', '')}${mediaUrl}`, auth.token)
          if (mediaResp.ok) {
            fileToSend = await mediaResp.blob()
            fileName = `template.${mediaUrl.split('.').pop() || 'bin'}`
          }
        } catch (e) { console.error('sendTemplate media download error:', e) }
      }

      if (fileToSend) {
        const fd = new FormData()
        fd.append('text', text)
        fd.append('account_id', acctId)
        fd.append('file', fileToSend, fileName)
        const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
          method: 'POST',
          body: fd,
        })
        if (resp.ok) { loadMessages(selectedClient); return }
        const err = await resp.json().catch(() => ({}))
        console.error('sendTemplate media error:', resp.status, err)
        return
      }

      // Text only
      const resp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, account_id: acctId }),
      })
      if (resp.ok) {
        loadMessages(selectedClient)
      } else {
        const err = await resp.json().catch(() => ({}))
        console.error('sendTemplate error:', resp.status, err)
      }
    } catch (e) {
      console.error('sendTemplate network error:', e)
    }
  }, [selectedClient, selectedAccount, auth?.token, loadMessages])

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

  // Open media in default app (PDF → browser, images → lightbox)
  const openMedia = useCallback(async (mediaPath: string, mediaType: string, messageId: number | string) => {
    if (!auth?.token) return
    const isPdf = mediaPath.toLowerCase().endsWith('.pdf')
    const isImage = mediaType === 'photo' || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(mediaPath)

    if (isPdf) {
      // Open PDF URL in default browser
      const url = mediaPath.startsWith('http') ? mediaPath : `${API_BASE.replace('/api', '')}${mediaPath}`
      await shellOpen(url)
    } else if (isImage) {
      // Open in lightbox
      const blobKey = `full_${messageId}`
      const existing = mediaBlobMap[blobKey]
      if (existing) {
        setLightboxSrc(existing)
      } else {
        const blob = await loadMediaBlob(blobKey, mediaPath)
        if (blob) setLightboxSrc(blob)
      }
    } else {
      // Other files — save and open
      await downloadMedia(mediaPath, mediaPath.split('/').pop() || 'file')
    }
  }, [auth?.token, mediaBlobMap, loadMediaBlob, downloadMedia])

  const ctxMenuOpen = useCallback(() => {
    if (!ctxMenu?.mediaPath) return
    openMedia(ctxMenu.mediaPath, ctxMenu.mediaType || '', ctxMenu.messageId)
    setCtxMenu(null)
  }, [ctxMenu, openMedia])

  const ctxMenuSave = useCallback(() => {
    if (!ctxMenu?.mediaPath) return
    downloadMedia(ctxMenu.mediaPath, ctxMenu.mediaPath.split('/').pop() || 'file')
    setCtxMenu(null)
  }, [ctxMenu, downloadMedia])

  const ctxMenuForward = useCallback(() => {
    if (!ctxMenu) return
    setForwardMode(true)
    toggleMsgSelection(ctxMenu.messageId)
    setCtxMenu(null)
  }, [ctxMenu, toggleMsgSelection])

  // Lab assign: open modal from context menu
  const ctxMenuLabAssign = useCallback(() => {
    if (!ctxMenu) return
    const msg = messages.find(m => m.id === ctxMenu.messageId)
    if (msg) { setLabAssignMsg(msg); setLabAssignSearch(''); setLabAssignResults([]) }
    setCtxMenu(null)
  }, [ctxMenu, messages])

  const searchLabPatients = useCallback(async (q: string) => {
    if (!auth?.token || q.length < 2) { setLabAssignResults([]); return }
    setLabAssignLoading(true)
    try {
      const resp = await authFetch(`${API_BASE}/clients/?search=${encodeURIComponent(q)}&page_size=20`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        setLabAssignResults((data.results || []).map((c: any) => ({ id: c.id, phone: c.phone, full_name: c.full_name })))
      }
    } catch { /* ignore */ }
    setLabAssignLoading(false)
  }, [auth?.token])

  const assignLabResult = useCallback(async (clientId: string, clientPhone: string, clientName: string) => {
    if (!auth?.token || !labAssignMsg) return
    // Extract numeric id from "tg_123"
    const rawId = String(labAssignMsg.id).replace(/^tg_/, '')
    try {
      const resp = await authFetch(`${API_BASE}/telegram/link-lab-patient/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: rawId, phone: clientPhone, source: labAssignMsg.source || 'telegram' }),
      })
      if (resp.ok) {
        // Update message in local state
        setMessages(prev => prev.map(m => m.id === labAssignMsg.id ? {
          ...m, is_lab_result: true, patient_client_id: clientId, patient_client_name: clientName, patient_phone: clientPhone,
        } : m))
        setLabAssignMsg(null)
      }
    } catch { /* ignore */ }
  }, [auth?.token, labAssignMsg])

  const unlinkLabResult = useCallback(async (msg: ChatMessage) => {
    if (!auth?.token) return
    const rawId = String(msg.id).replace(/^tg_/, '')
    try {
      const resp = await authFetch(`${API_BASE}/telegram/unlink-lab-patient/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: rawId, source: msg.source || 'telegram' }),
      })
      if (resp.ok) {
        setMessages(prev => prev.map(m => m.id === msg.id ? {
          ...m, is_lab_result: false, patient_client_id: '', patient_client_name: '', patient_phone: '', patient_name: '',
        } : m))
      }
    } catch { /* ignore */ }
  }, [auth?.token])

  const editLabResult = useCallback((msg: ChatMessage) => {
    setLabAssignMsg(msg)
    setLabAssignSearch('')
    setLabAssignResults([])
  }, [])

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
  const addToastRef = useRef<(clientId: string, accountId: string, sender: string, account: string, text: string, hasMedia: boolean, mediaType: string) => void>(() => {})
  useEffect(() => { loadContactsRef.current = loadContacts }, [loadContacts])
  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])
  useEffect(() => { loadUpdatesRef.current = loadUpdates }, [loadUpdates])
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])
  // addToastRef updated below after addToast is defined

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
            const accountId = data.account_id

            if (clientId === selectedClientRef.current) {
              // Current chat — reload messages, scroll to new message
              loadMessagesRef.current(clientId, true)
            }

            // Notification for received messages only (not our own sent)
            if (msg.direction === 'received') {
              const isCurrentChat = clientId === selectedClientRef.current
              if (!isCurrentChat) {
                const sender = msg.client_name || msg.phone || 'Новий контакт'
                const account = msg.account_label || ''
                const body = msg.text?.slice(0, 120) || ''
                // Windows notification
                showNotification(`${sender} → ${account}`, body || '📎 Медіа')
                // In-app toast
                addToastRef.current(clientId, accountId || '', sender, account, body, !!msg.has_media, msg.media_type || '')

                // Track per-account unread
                if (accountId) {
                  setAccountUnreads(prev => ({ ...prev, [accountId]: (prev[accountId] || 0) + 1 }))
                }
              }
              // Play notification sound
              if (soundEnabledRef.current && !isCurrentChat) {
                try { notifAudioRef.current?.play().catch(() => {}) } catch {}
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

  // Total unread count
  const unreadCount = useMemo(() => contacts.filter(c => isUnread(c)).length, [contacts, isUnread])

  // Add in-app toast
  const addToast = useCallback((clientId: string, accountId: string, sender: string, account: string, text: string, hasMedia: boolean, mediaType: string) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev.slice(-8), { id, clientId, accountId, sender, account, text, hasMedia, mediaType, time: Date.now() }])
  }, [])
  useEffect(() => { addToastRef.current = addToast }, [addToast])

  // Get selected contact info (fallback to newChatClient for contacts without messages)
  const selectedContact = contacts.find(c => c.client_id === selectedClient)
  const chatContact = selectedContact || (selectedClient && newChatClient?.client_id === selectedClient ? {
    client_id: newChatClient.client_id,
    phone: newChatClient.phone,
    full_name: newChatClient.full_name,
    last_message_date: '',
    last_message_text: '',
    last_direction: '' as const,
    msg_count: 0,
    source: '' as const,
    account_label: '',
    account_phone: '',
  } : null)
  // Clear newChatClient when contact appears in the real list
  useEffect(() => {
    if (newChatClient && contacts.some(c => c.client_id === newChatClient.client_id)) {
      setNewChatClient(null)
    }
  }, [contacts, newChatClient])

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
    setSelectedGmail(null)
    setGmailSelectedMsg(null)
    setAudioBlobMap({})
    setMediaBlobMap({})
    setExpandedCallId(null)
    // Mark as read immediately
    setReadTs(clientId, new Date().toISOString())
    loadMessages(clientId)
    loadClientNotes(clientId)
  }, [loadMessages, loadClientNotes])

  const addContactToAccount = useCallback(async () => {
    if (!auth?.token || !addToAcctModal || !addToAcctSelected) return
    setAddToAcctAdding(true)
    try {
      const resp = await authFetch(`${API_BASE}/telegram/add-contact/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: addToAcctModal.phone,
          name: addToAcctModal.name,
          account_id: addToAcctSelected,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setAddToAcctModal(null)
        setSelectedAccount('')
        selectClient(data.client_id || addToAcctModal.clientId)
      } else {
        const err = await resp.json().catch(() => ({}))
        alert(err.error || 'Помилка додавання')
      }
    } catch (e) { console.error('Add contact:', e) }
    finally { setAddToAcctAdding(false) }
  }, [auth?.token, addToAcctModal, addToAcctSelected, selectClient])

  // === Gmail functions ===
  const loadGmailEmails = useCallback(async (accountId?: string, page = 1, searchQ = '', direction = '') => {
    if (!auth?.token) return
    const accId = accountId || selectedGmail
    if (!accId) return
    setGmailLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (searchQ) params.set('search', searchQ)
      if (direction) params.set('direction', direction)
      const resp = await authFetch(`${API_BASE}/mail/accounts/${accId}/messages/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        setGmailEmails(data.results || [])
        setGmailTotal(data.count || 0)
        setGmailPage(page)
      }
    } catch (e) { console.error('Gmail load:', e) }
    finally { setGmailLoading(false) }
  }, [auth?.token, selectedGmail])

  const sendGmailEmail = useCallback(async () => {
    if (!auth?.token || !selectedGmail || !composeTo.trim()) return
    setComposeSending(true)
    try {
      const fd = new FormData()
      fd.append('to', composeTo.trim())
      fd.append('subject', composeSubject)
      fd.append('body', composeBody)
      for (const f of composeFiles) fd.append('attachments', f)
      const resp = await authFetch(`${API_BASE}/mail/accounts/${selectedGmail}/send/`, auth.token, { method: 'POST', body: fd })
      if (resp.ok) {
        setShowCompose(false)
        setComposeTo(''); setComposeSubject(''); setComposeBody(''); setComposeFiles([])
        // Refresh emails
        loadGmailEmails(selectedGmail, 1, gmailSearch, gmailDirection)
      } else {
        const err = await resp.json().catch(() => ({ error: 'Помилка відправки' }))
        alert(err.error || 'Помилка відправки')
      }
    } catch (e) { console.error('Gmail send:', e); alert('Помилка відправки') }
    finally { setComposeSending(false) }
  }, [auth?.token, selectedGmail, composeTo, composeSubject, composeBody, composeFiles, loadGmailEmails, gmailSearch, gmailDirection])

  const downloadGmailAttachment = useCallback(async (msgId: string, attachmentId: string, filename: string) => {
    if (!auth?.token || !selectedGmail) return
    try {
      const resp = await authFetch(`${API_BASE}/mail/accounts/${selectedGmail}/messages/${msgId}/attachment/?id=${attachmentId}`, auth.token)
      if (!resp.ok) return
      const blob = await resp.blob()
      const ct = resp.headers.get('content-type') || ''
      // PDF — open in browser
      if (ct.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
        const url = URL.createObjectURL(blob)
        shellOpen(url)
        return
      }
      // Image — lightbox
      if (ct.startsWith('image/')) {
        setLightboxSrc(URL.createObjectURL(blob))
        return
      }
      // Other — save dialog
      const filePath = await save({ defaultPath: filename })
      if (filePath) {
        const ab = await blob.arrayBuffer()
        await writeFile(filePath, new Uint8Array(ab))
      }
    } catch (e) { console.error('Attachment download:', e) }
  }, [auth?.token, selectedGmail])

  const handleGmailAccountClick = useCallback((accId: string) => {
    if (selectedGmail === accId) {
      setSelectedGmail(null)
      setGmailEmails([]); setGmailSelectedMsg(null)
    } else {
      setSelectedGmail(accId)
      setSelectedAccount(''); setSelectedClient(null); setMessages([])
      setGmailSelectedMsg(null)
      loadGmailEmails(accId, 1, '', '')
      setGmailDirection(''); setGmailSearch('')
    }
  }, [selectedGmail, loadGmailEmails])

  // Account tab click
  const handleAccountClick = useCallback((accountId: string) => {
    setSelectedAccount(prev => prev === accountId ? '' : accountId)
    setSelectedClient(null)
    setMessages([])
    setSelectedGmail(null); setGmailEmails([]); setGmailSelectedMsg(null)
    // Clear unread badge for this account
    setAccountUnreads(prev => { const n = { ...prev }; delete n[accountId]; return n })
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
            {unreadCount > 0 && <span className="rail-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
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
              {accountUnreads[acc.id] > 0 && <span className="rail-badge">{accountUnreads[acc.id] > 99 ? '99+' : accountUnreads[acc.id]}</span>}
              <span className={`rail-status ${acc.status === 'active' || acc.status === 'connected' ? 'online' : ''}`} />
            </button>
          ))}
          {/* Gmail account icons */}
          {gmailAccounts.length > 0 && <div className="rail-divider" />}
          {gmailAccounts.map(gm => (
            <button
              key={gm.id}
              className={`rail-icon ${selectedGmail === gm.id ? 'active' : ''}`}
              onClick={() => handleGmailAccountClick(gm.id)}
              title={`${gm.label} — ${gm.email}`}
            >
              <GmailIcon size={18} color={selectedGmail === gm.id ? '#EA4335' : 'currentColor'} />
              <span className={`rail-status ${gm.status === 'active' ? 'online' : ''}`} />
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
            {gmailAccounts.map(gm => (
              <button
                key={gm.id}
                className={`rail-flyout-item ${selectedGmail === gm.id ? 'active' : ''}`}
                onClick={() => handleGmailAccountClick(gm.id)}
              >
                <GmailIcon size={16} color="#EA4335" />
                <div className="rail-flyout-text">
                  <span className="rail-flyout-name">{gm.label}</span>
                  <span className="rail-flyout-phone">{gm.email}</span>
                </div>
                <span className={`status-dot ${gm.status === 'active' ? 'online' : ''}`} />
              </button>
            ))}
          </div>
        </div>
        {/* Sidebar with contacts */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="resize-handle" onMouseDown={e => startResize('sidebar', e)} />
          {/* Active account card */}
          {(() => {
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
                    <span className="active-account-name">Усі месенджери</span>
                    <span className="active-account-phone">{contacts.length} контактів</span>
                  </>
                )}
              </div>
            )
          })()}
          {/* Search */}
          <div className="sidebar-search">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            {selectedGmail ? (
              <input
                placeholder="Пошук листів..."
                value={gmailSearch}
                onChange={e => {
                  setGmailSearch(e.target.value)
                  clearTimeout(gmailSearchTimer.current)
                  gmailSearchTimer.current = setTimeout(() => {
                    setGmailSelectedMsg(null)
                    loadGmailEmails(selectedGmail, 1, e.target.value, gmailDirection)
                  }, 400)
                }}
              />
            ) : (
              <input
                placeholder="Пошук контактів..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            )}
          </div>
          {/* Gmail filter / New chat */}
          {selectedGmail ? (
            <div className="gmail-sidebar-filter">
              <button className={`gmail-filter-btn ${gmailDirection === '' ? 'active' : ''}`} onClick={() => { setGmailDirection(''); setGmailSelectedMsg(null); loadGmailEmails(selectedGmail, 1, gmailSearch, '') }} title="Усі">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 4 10 8 10-8"/></svg>
              </button>
              <button className={`gmail-filter-btn gmail-filter-inbox ${gmailDirection === 'inbox' ? 'active' : ''}`} onClick={() => { setGmailDirection('inbox'); setGmailSelectedMsg(null); loadGmailEmails(selectedGmail, 1, gmailSearch, 'inbox') }} title="Вхідні">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12l-7 7-7-7"/><path d="M12 5v14"/></svg>
              </button>
              <button className={`gmail-filter-btn gmail-filter-sent ${gmailDirection === 'sent' ? 'active' : ''}`} onClick={() => { setGmailDirection('sent'); setGmailSelectedMsg(null); loadGmailEmails(selectedGmail, 1, gmailSearch, 'sent') }} title="Надіслані">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12l7-7 7 7"/><path d="M12 19V5"/></svg>
              </button>
              <button className="gmail-filter-compose" onClick={() => { setShowCompose(true); setComposeTo(''); setComposeSubject(''); setComposeBody(''); setComposeFiles([]) }} title="Написати">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
              </button>
            </div>
          ) : (
            <button className="add-contact-btn" onClick={() => { setShowAddContact(true); setAddContactAccount(selectedAccount) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
              Новий чат
            </button>
          )}
          {/* Contact list / Gmail email list */}
          {selectedGmail ? (
            <>
              <div className="contact-list">
                {gmailLoading && <div className="loading-more">Завантаження...</div>}
                {!gmailLoading && gmailEmails.length === 0 && <div className="loading-more" style={{ color: 'var(--muted-foreground)' }}>Немає листів</div>}
                {gmailEmails.map(email => {
                  const emailIsSent = gmailDirection === 'sent' || (gmailDirection === '' && email.labels?.includes('SENT') && !email.labels?.includes('INBOX'))
                  const displayName = emailIsSent ? (email.recipients[0] || '—') : email.sender.replace(/<[^>]+>/, '').trim()
                  const initial = displayName[0]?.toUpperCase() || '?'
                  return (
                    <div
                      key={email.id}
                      className={`contact gmail-contact ${gmailSelectedMsg?.id === email.id ? 'active' : ''}${!email.is_read ? ' unread' : ''}`}
                      onClick={() => {
                        if (!email.is_read) {
                          email.is_read = true
                          setGmailEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
                        }
                        setGmailSelectedMsg(email)
                      }}
                    >
                      <div className="avatar gmail-avatar">
                        <span>{initial}</span>
                      </div>
                      <div className="contact-body">
                        <div className="contact-row">
                          <span className="contact-name">{displayName}</span>
                          <span className="contact-time">{formatContactDate(email.date)}</span>
                        </div>
                        <div className="contact-row">
                          <span className="contact-preview gmail-subject">{email.subject || '(без теми)'}</span>
                        </div>
                        <div className="contact-meta">
                          <span className="contact-preview gmail-snippet">{email.snippet?.slice(0, 50)}</span>
                          <span className="contact-icons">
                            {email.has_attachments && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                            {gmailDirection === '' && (
                              emailIsSent
                                ? <svg className="gmail-dir-icon gmail-dir-sent" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                                : <svg className="gmail-dir-icon gmail-dir-inbox" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                            )}
                            <GmailIcon size={11} color="#EA4335" />
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Pagination */}
              {gmailTotal > 50 && (
                <div className="gmail-pagination sidebar-footer">
                  <button disabled={gmailPage <= 1} onClick={() => loadGmailEmails(selectedGmail, gmailPage - 1, gmailSearch, gmailDirection)}>←</button>
                  <span>{gmailPage} / {Math.ceil(gmailTotal / 50)}</span>
                  <button disabled={gmailPage * 50 >= gmailTotal} onClick={() => loadGmailEmails(selectedGmail, gmailPage + 1, gmailSearch, gmailDirection)}>→</button>
                </div>
              )}
              {gmailTotal <= 50 && (
                <div className="sidebar-footer">{gmailEmails.length} листів</div>
              )}
            </>
          ) : (
            <>
              <div className="contact-list" onScroll={e => {
                const el = e.currentTarget
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
                  loadMoreContacts()
                }
              }}>
                {contacts.map(c => (
                  <div
                    key={c.client_id}
                    className={`contact ${selectedClient === c.client_id ? 'active' : ''}${isUnread(c) ? ' unread' : ''}${c.has_whatsapp && !c.has_telegram ? ' wa-contact' : ''}`}
                    onClick={() => selectClient(c.client_id)}
                  >
                    <div className={`avatar${c.has_whatsapp && !c.has_telegram ? ' wa-avatar' : ''}`}>
                      {photoMap[c.client_id]
                        ? <img src={photoMap[c.client_id]} className="avatar-img" alt="" />
                        : <UserIcon />}
                    </div>
                    <div className="contact-body">
                      <div className="contact-row">
                        <span className={`contact-name${c.is_employee ? ' employee' : ''}`}>
                          <ContactName name={c.full_name || c.phone} isEmployee={c.is_employee} />
                        </span>
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
                {loadingMoreContacts && (
                  <div className="loading-more">Завантаження...</div>
                )}
              </div>
              <div className="sidebar-footer">
                {contacts.length} / {contactCount} контактів
              </div>
            </>
          )}
        </div>

        {/* Chat area */}
        {selectedGmail && gmailSelectedMsg ? (
        <div className="chat gmail-chat-view">
          {/* Gmail chat header */}
          <div className="chat-header">
            <div className="chat-header-avatar">
              <div className="avatar gmail-avatar" style={{ width: 36, height: 36 }}>
                <span>{(gmailSelectedMsg.sender.replace(/<[^>]+>/, '').trim()[0] || '?').toUpperCase()}</span>
              </div>
            </div>
            <div className="chat-header-info">
              <div className="chat-header-name">{gmailSelectedMsg.subject || '(без теми)'}</div>
              <div className="chat-header-phone">{gmailSelectedMsg.sender}</div>
            </div>
            <div className="chat-header-right">
              <GmailIcon size={16} color="#EA4335" />
              <span className="msg-count-badge">{new Date(gmailSelectedMsg.date).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          {/* Email body */}
          <div className="chat-messages gmail-body-area">
            <div className="gmail-email-card">
              <div className="gmail-email-meta">
                <div className="gmail-email-from">
                  <strong>Від:</strong> {gmailSelectedMsg.sender}
                </div>
                {gmailSelectedMsg.recipients.length > 0 && (
                  <div className="gmail-email-to">
                    <strong>Кому:</strong> {gmailSelectedMsg.recipients.join(', ')}
                  </div>
                )}
                <div className="gmail-email-date">
                  {new Date(gmailSelectedMsg.date).toLocaleString('uk-UA', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="gmail-email-body-text">{gmailSelectedMsg.body_text || gmailSelectedMsg.snippet}</div>
              {gmailSelectedMsg.attachments.length > 0 && (
                <div className="gmail-attachments">
                  <div className="gmail-attachments-title">Вкладення ({gmailSelectedMsg.attachments.length})</div>
                  {gmailSelectedMsg.attachments.map((att, i) => (
                    <button key={i} className="gmail-attachment-item" onClick={() => downloadGmailAttachment(gmailSelectedMsg!.id, att.attachment_id, att.filename)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      <span className="gmail-att-name">{att.filename}</span>
                      <span className="gmail-att-size">{att.size > 1024*1024 ? `${(att.size/1024/1024).toFixed(1)} MB` : `${Math.round(att.size/1024)} KB`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Reply input */}
          <div className="gmail-reply-bar">
            <div className="gmail-reply-to">
              <GmailIcon size={12} color="#EA4335" />
              <span>Відповідь → {gmailSelectedMsg.sender.replace(/<[^>]+>/, '').trim()}</span>
            </div>
            {composeFiles.length > 0 && (
              <div className="gmail-reply-files">
                {composeFiles.map((f, i) => (
                  <div key={i} className="gmail-reply-file">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    <span>{f.name}</span>
                    <button onClick={() => setComposeFiles(prev => prev.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="gmail-reply-row">
              <button className="gmail-reply-attach" onClick={() => composeFileRef.current?.click()} title="Вкласти файл">
                <PaperclipIcon />
              </button>
              <input
                ref={composeFileRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) setComposeFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
              />
              <textarea
                className="gmail-reply-input"
                placeholder="Написати відповідь..."
                value={composeBody}
                onChange={e => {
                  setComposeBody(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (composeBody.trim()) {
                      // Reply: set to = sender, subject = Re: subject
                      const replyTo = gmailSelectedMsg!.sender.match(/<([^>]+)>/)?.[1] || gmailSelectedMsg!.sender
                      const replySubject = gmailSelectedMsg!.subject?.startsWith('Re:') ? gmailSelectedMsg!.subject : `Re: ${gmailSelectedMsg!.subject || ''}`
                      setComposeTo(replyTo)
                      setComposeSubject(replySubject)
                      // sendGmailEmail relies on composeTo, so we set then trigger
                      setTimeout(() => {
                        const fd = new FormData()
                        fd.append('to', replyTo.trim())
                        fd.append('subject', replySubject)
                        fd.append('body', composeBody)
                        for (const f of composeFiles) fd.append('attachments', f)
                        authFetch(`${API_BASE}/mail/accounts/${selectedGmail}/send/`, auth!.token, { method: 'POST', body: fd })
                          .then(r => {
                            if (r.ok) {
                              setComposeBody(''); setComposeFiles([])
                              loadGmailEmails(selectedGmail!, 1, gmailSearch, gmailDirection)
                            } else { r.json().then(d => alert(d.error || 'Помилка')).catch(() => alert('Помилка')) }
                          }).catch(() => alert('Помилка відправки'))
                      }, 0)
                    }
                  }
                }}
                rows={1}
              />
              <button
                className="gmail-reply-send"
                disabled={!composeBody.trim() && composeFiles.length === 0}
                onClick={() => {
                  if (!composeBody.trim() && composeFiles.length === 0) return
                  const replyTo = gmailSelectedMsg!.sender.match(/<([^>]+)>/)?.[1] || gmailSelectedMsg!.sender
                  const replySubject = gmailSelectedMsg!.subject?.startsWith('Re:') ? gmailSelectedMsg!.subject : `Re: ${gmailSelectedMsg!.subject || ''}`
                  const fd = new FormData()
                  fd.append('to', replyTo.trim())
                  fd.append('subject', replySubject)
                  fd.append('body', composeBody)
                  for (const f of composeFiles) fd.append('attachments', f)
                  authFetch(`${API_BASE}/mail/accounts/${selectedGmail}/send/`, auth!.token, { method: 'POST', body: fd })
                    .then(r => {
                      if (r.ok) {
                        setComposeBody(''); setComposeFiles([])
                        loadGmailEmails(selectedGmail!, 1, gmailSearch, gmailDirection)
                      } else { r.json().then(d => alert(d.error || 'Помилка')).catch(() => alert('Помилка')) }
                    }).catch(() => alert('Помилка відправки'))
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </button>
            </div>
          </div>
        </div>
        ) : selectedGmail ? (
        <div className="chat gmail-empty-state">
          <div className="no-chat">
            <GmailIcon size={48} color="#EA4335" />
            <p>Оберіть лист зі списку зліва</p>
          </div>
        </div>
        ) : (
        <div className="chat">
          {selectedClient && chatContact ? (
            <>
              <div className="chat-header">
                <div className="chat-header-avatar">
                  {selectedClient && photoMap[selectedClient]
                    ? <img src={photoMap[selectedClient]} className="avatar-img" alt="" />
                    : <UserIcon />}
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-name">
                    {clientName || chatContact?.full_name || chatContact?.phone}
                  </div>
                  <div className="chat-header-phone">{clientPhone || chatContact?.phone}</div>
                </div>
                <div className="chat-header-right">
                  <span className="msg-count-badge">{msgCount} повідомлень</span>
                </div>
              </div>

              {/* Placeholder banner */}
              {isPlaceholder && (
                <div className="placeholder-banner">
                  <span>Номер прихований у пацієнта в Telegram</span>
                  <button className="placeholder-link-btn" onClick={() => { setShowLinkModal(true); setLinkSearch(''); setLinkResults([]) }}>
                    Прив'язати
                  </button>
                </div>
              )}

              {/* Link client modal */}
              {showLinkModal && (
                <div className="link-modal-overlay" onClick={() => setShowLinkModal(false)}>
                  <div className="link-modal" onClick={e => e.stopPropagation()}>
                    <div className="link-modal-header">
                      <h3>Прив'язати до пацієнта</h3>
                      <button className="link-modal-close" onClick={() => setShowLinkModal(false)}>✕</button>
                    </div>
                    <div className="link-modal-search">
                      <input
                        type="text"
                        placeholder="Пошук за ім'ям або телефоном..."
                        value={linkSearch}
                        onChange={e => {
                          const v = e.target.value
                          setLinkSearch(v)
                          clearTimeout(linkSearchTimerRef.current)
                          linkSearchTimerRef.current = setTimeout(() => searchClientsForLink(v), 300)
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="link-modal-results">
                      {linkResults.map(c => (
                        <button
                          key={c.id}
                          className="link-modal-item"
                          onClick={() => handleLinkClient(c.id)}
                          disabled={linkLoading}
                        >
                          <div className="link-modal-item-avatar"><UserIcon /></div>
                          <div className="link-modal-item-info">
                            <div className="link-modal-item-name">{c.full_name || c.phone}</div>
                            <div className="link-modal-item-phone">{c.phone}{c.calls_count > 0 ? ` · ${c.calls_count} дзвінків` : ''}</div>
                          </div>
                        </button>
                      ))}
                      {linkSearch.length >= 2 && linkResults.length === 0 && (
                        <div className="link-modal-empty">Не знайдено</div>
                      )}
                      {linkSearch.length < 2 && (
                        <div className="link-modal-empty">Введіть ім'я або телефон</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className={`chat-messages${chatDropHighlight ? ' drop-highlight' : ''}`}
                onDragOver={e => {
                  if (dragLabPatientRef.current && selectedClient) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setChatDropHighlight(true)
                  }
                }}
                onDragLeave={() => setChatDropHighlight(false)}
                onDrop={e => {
                  e.preventDefault()
                  setChatDropHighlight(false)
                  if (dragLabPatientRef.current && selectedClient) {
                    const p = dragLabPatientRef.current
                    dragLabPatientRef.current = null
                    setLabSendModal(p)
                    setLabSendSelected(new Set(p.results.filter(r => r.media_file).map(r => r.id)))
                  }
                }}
              >
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
                      onContextMenu={!forwardMode ? (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (m.has_media && m.media_file) {
                          setCtxMenu({ x: e.clientX, y: e.clientY, mediaPath: m.media_file, mediaType: m.media_type, messageId: m.id })
                        } else {
                          setCtxMenu({ x: e.clientX, y: e.clientY, messageId: m.id })
                        }
                      } : undefined}
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
                        {/* Document → PDF opens in browser, others save+open */}
                        {m.has_media && m.media_type === 'document' && m.media_file && (
                          <div className="msg-document" onClick={() => openMedia(m.media_file, m.media_type, m.id)}>
                            <span className="msg-doc-icon">{(m.media_file || '').toLowerCase().endsWith('.pdf') ? '📄' : '📎'}</span>
                            <div className="msg-doc-info">
                              <span className="msg-doc-name">{m.media_file.split('/').pop() || 'Файл'}</span>
                              <span className="msg-doc-action">{(m.media_file || '').toLowerCase().endsWith('.pdf') ? 'Відкрити в браузері' : 'Зберегти та відкрити'}</span>
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
                        {m.text && <div className="msg-text"><Linkify text={m.text} onLinkClick={u => shellOpen(u)} /></div>}
                        {m.text && (() => { const u = extractFirstUrl(m.text); return u ? <LinkPreviewCard url={u} token={auth!.token} onClick={u => shellOpen(u)} /> : null })()}
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
                      {/* Lab result card: linked */}
                      {m.is_lab_result && (m.patient_client_id || m.patient_name) && (
                        <div className="lab-card lab-card-linked">
                          <svg className="lab-card-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
                          <div className="lab-card-info">
                            <span className="lab-card-name">{m.patient_client_name || m.patient_name}</span>
                            {m.patient_phone && <span className="lab-card-phone">{m.patient_phone}</span>}
                          </div>
                          <button className="lab-card-edit" onClick={(e) => { e.stopPropagation(); editLabResult(m) }} title="Змінити пацієнта">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                          <button className="lab-card-unlink" onClick={(e) => { e.stopPropagation(); unlinkLabResult(m) }} title="Відкріпити">
                            <XIcon />
                          </button>
                        </div>
                      )}
                      {/* Lab result card: unlinked (detected but no patient) */}
                      {m.is_lab_result && !m.patient_client_id && !m.patient_name && (
                        <div className="lab-card lab-card-unlinked">
                          <svg className="lab-card-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M12 11v4"/><path d="M12 17h.01"/></svg>
                          <span className="lab-card-label">Аналіз</span>
                          <button className="lab-card-edit" onClick={(e) => { e.stopPropagation(); editLabResult(m) }} title="Привʼязати пацієнта">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                          </button>
                        </div>
                      )}
                      {/* Incoming media, not yet classified — manual assign button */}
                      {m.is_lab_result == null && m.direction === 'received' && m.has_media && (
                        <button className="lab-card-assign-btn" onClick={(e) => { e.stopPropagation(); editLabResult(m) }} title="Додати аналіз">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                          <span>Додати аналіз</span>
                        </button>
                      )}
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
                    /* Recording active — show minimal indicator, modal handles the rest */
                    <div className="recording-bar">
                      <div className="recording-indicator">
                        <span className="recording-dot" />
                        <span className="recording-time">
                          {recordingType === 'voice' ? 'Запис голосу...' : 'Запис відео...'} {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                        </span>
                      </div>
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
        )}

        {/* Right Panel: [content + header | vertical-tabs] */}
        <div className="right-panel" style={{ width: rightPanelWidth }}>
          <div className="resize-handle" onMouseDown={e => startResize('right', e)} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div className="rp-content-header" data-tab={rightTab}>
              {rightTab === 'notes' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              ) : rightTab === 'quick' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              ) : rightTab === 'clients' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 2v6a2 2 0 002 2h10M3 8v12a2 2 0 002 2h14a2 2 0 002-2V8"/><path d="M10 12h4M10 16h4"/></svg>
              )}
              {rightTab === 'notes' ? 'Нотатки' : rightTab === 'quick' ? 'Шаблони' : rightTab === 'clients' ? (rpSelectedClient ? (
                <><button className="rp-back-btn" onClick={() => { setRpSelectedClient(null); rpAudioRef.current?.pause(); setRpPlayingCall(null) }}>←</button>{rpClientInfo?.name || 'Контакт'}</>
              ) : 'Контакти') : 'Аналізи пацієнтів'}
            </div>
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
            ) : rightTab === 'lab' ? (
              <div className="rp-lab">
                <div className="rp-lab-search">
                  <input
                    value={labSearch}
                    onChange={e => setLabSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadLabResults(1, labSearch) }}
                    placeholder="Пошук за ПІБ або телефоном..."
                  />
                  <button onClick={() => loadLabResults(1, labSearch)} title="Пошук">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  </button>
                </div>
                {labLoading && <div className="rp-empty">Завантаження...</div>}
                {!labLoading && labPatients.length === 0 && <div className="rp-empty">Немає аналізів</div>}
                <div className="rp-lab-list">
                  {labPatients.map(p => (
                    <div key={p.key} className="lab-patient"
                      draggable
                      onDragStart={e => {
                        dragLabPatientRef.current = p
                        e.dataTransfer.effectAllowed = 'copy'
                        e.dataTransfer.setData('text/plain', p.name || '')
                        ;(e.currentTarget as HTMLElement).classList.add('dragging')
                      }}
                      onDragEnd={e => {
                        dragLabPatientRef.current = null
                        ;(e.currentTarget as HTMLElement).classList.remove('dragging')
                      }}
                    >
                      <div className="lab-patient-header" onClick={() => setExpandedLabPatient(prev => prev === p.key ? null : p.key)}>
                        <div className="lab-patient-avatar">
                          {(() => {
                            if (!p.photo) return <span>{(p.name || '?')[0].toUpperCase()}</span>
                            const avatarKey = `lab_avatar_${p.key}`
                            if (!mediaBlobMap[avatarKey] && !mediaLoading[avatarKey]) loadMediaBlob(avatarKey, p.photo)
                            return mediaBlobMap[avatarKey]
                              ? <img src={mediaBlobMap[avatarKey]} alt="" />
                              : <span>{(p.name || '?')[0].toUpperCase()}</span>
                          })()}
                        </div>
                        <div className="lab-patient-info">
                          <span className="lab-patient-name">{p.name || 'Невідомий'}</span>
                          {p.phone && <span className="lab-patient-phone">{p.phone}</span>}
                        </div>
                        <span className="lab-patient-count">{p.results.length}</span>
                        <svg className={`tpl-chevron ${expandedLabPatient === p.key ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </div>
                      {expandedLabPatient === p.key && (
                        <div className="lab-results-list">
                          {p.results.map(r => {
                            const isImg = r.media_file && /\.(jpg|jpeg|png|webp|gif)/i.test(r.media_file)
                            const isPdf = r.media_file && /\.pdf/i.test(r.media_file)
                            const typeLabel: Record<string, string> = {
                              blood_test: 'Аналіз крові', ultrasound: 'УЗД', xray: 'Рентген',
                              ct_scan: 'КТ', mri: 'МРТ', ecg: 'ЕКГ', dental_scan: 'Стоматологія',
                              prescription: 'Рецепт', other_lab: 'Інше',
                            }
                            const thumbKey = `lab_thumb_${r.id}`
                            const fullKey = `lab_full_${r.id}`
                            // Auto-load thumbnail
                            if (r.thumbnail && !mediaBlobMap[thumbKey] && !mediaLoading[thumbKey]) {
                              loadMediaBlob(thumbKey, r.thumbnail)
                            }
                            return (
                              <div
                                key={r.id}
                                className="lab-result-item"
                                onClick={async () => {
                                  if (!r.media_file) return
                                  if (isPdf) {
                                    shellOpen(`${API_BASE.replace('/api', '')}${r.media_file}`)
                                  } else if (isImg) {
                                    const blob = mediaBlobMap[fullKey] || await loadMediaBlob(fullKey, r.media_file)
                                    if (blob) setLightboxSrc(blob)
                                  } else {
                                    shellOpen(`${API_BASE.replace('/api', '')}${r.media_file}`)
                                  }
                                }}
                              >
                                <div className="lab-result-thumb">
                                  {mediaBlobMap[thumbKey] ? <img src={mediaBlobMap[thumbKey]} alt="" /> : (
                                    <div className="lab-result-icon">
                                      {isPdf ? '📄' : isImg ? '🖼️' : '📎'}
                                    </div>
                                  )}
                                </div>
                                <div className="lab-result-info">
                                  <span className="lab-result-type">{typeLabel[r.lab_result_type] || r.lab_result_type}</span>
                                  <span className="lab-result-date">
                                    {new Date(r.message_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                  </span>
                                  {r.is_from_lab && r.lab_name && <span className="lab-result-source">{r.lab_name}</span>}
                                </div>
                                <span className="lab-result-badge">{r.source === 'telegram' ? 'TG' : '✉️'}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {labTotal > 50 && (
                  <div className="lab-pagination">
                    <button disabled={labPage <= 1} onClick={() => loadLabResults(labPage - 1, labSearch)}>←</button>
                    <span>{labPage}</span>
                    <button disabled={labPatients.length < 50} onClick={() => loadLabResults(labPage + 1, labSearch)}>→</button>
                  </div>
                )}
              </div>
            ) : rightTab === 'quick' ? (
              <div className="rp-quick">
                <div className="rp-quick-list">
                  {templateCategories.length === 0 && (
                    <div className="rp-empty">Немає шаблонів</div>
                  )}
                  {templateCategories.map(cat => (
                    <div
                      key={cat.id}
                      className="tpl-cat"
                      draggable
                      onDragStart={e => { dragCatRef.current = cat.id; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('dragging') }}
                      onDragEnd={e => { dragCatRef.current = null; (e.currentTarget as HTMLElement).classList.remove('dragging') }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; (e.currentTarget as HTMLElement).classList.add('drag-over') }}
                      onDragLeave={e => (e.currentTarget as HTMLElement).classList.remove('drag-over')}
                      onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove('drag-over'); if (dragCatRef.current) reorderCategories(dragCatRef.current, cat.id) }}
                    >
                      <div className="tpl-cat-header" style={{ borderLeftColor: cat.color }} onClick={() => toggleCat(cat.id)}>
                        <svg className="tpl-drag-handle" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
                        <svg className={`tpl-chevron ${expandedCats.has(cat.id) ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                        <span className="tpl-cat-name" style={{ color: cat.color }}>{cat.name}</span>
                        <span className="tpl-cat-count">{cat.templates.length}</span>
                        <div className="tpl-cat-actions">
                          <button className="tpl-add-btn" onClick={e => { e.stopPropagation(); setShowTplModal(cat.id); setNewTplTitle(''); setNewTplText(''); setNewTplMedia(null) }} title="Додати шаблон">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          </button>
                          <button className="rp-delete-btn" onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'category', id: cat.id, name: cat.name }) }} title="Видалити категорію">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                      {expandedCats.has(cat.id) && (
                        <div className="tpl-cat-body">
                          {cat.templates.map(tpl => (
                            <div key={tpl.id} className="tpl-item" onClick={() => { setPreviewTpl(tpl); setTplEditText(tpl.text); setTplIncludeMedia(!!tpl.media_file); setTplSendExtraFile(null) }}>
                              <span className="tpl-item-title">{tpl.title}</span>
                              {tpl.media_file && <svg className="tpl-media-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                              <button className="tpl-edit-global-btn" onClick={e => { e.stopPropagation(); setEditingTpl(tpl); setEditTplTitle(tpl.title); setEditTplText(tpl.text); setEditTplMedia(null); setEditTplRemoveMedia(false) }} title="Редагувати шаблон">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                              </button>
                              <button className="rp-delete-btn tpl-del" onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.title }) }} title="Видалити">
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
            ) : rightTab === 'clients' ? (
              <div className="rp-clients">
                {!rpSelectedClient ? (
                  <>
                    <div className="rp-lab-search">
                      <input
                        value={rpClientSearch}
                        onChange={e => setRpClientSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') loadRpClients(1, rpClientSearch) }}
                        placeholder="Пошук за ПІБ або телефоном..."
                      />
                      <button onClick={() => loadRpClients(1, rpClientSearch)} title="Пошук">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      </button>
                    </div>
                    {rpClientLoading && <div className="rp-empty">Завантаження...</div>}
                    {!rpClientLoading && rpClients.length === 0 && <div className="rp-empty">Немає контактів</div>}
                    <div className="rp-client-list">
                      {rpClients.map(c => (
                        <div key={c.id} className="rp-client-item" onClick={() => loadRpClientDetail(c.id)}>
                          <div className="rp-client-avatar">
                            <span>{(c.full_name || c.phone || '?')[0].toUpperCase()}</span>
                          </div>
                          <div className="rp-client-info">
                            <div className="rp-client-name-row">
                              <span className="rp-client-name">{c.full_name || c.phone}</span>
                              <span className="rp-client-icons">
                                {c.has_telegram && <TelegramIcon size={12} color="#2AABEE" />}
                                {c.has_whatsapp && <WhatsAppIcon size={12} color="#25D366" />}
                              </span>
                            </div>
                            <div className="rp-client-meta">
                              {c.full_name && <span className="rp-client-phone">{c.phone}</span>}
                              <span className="rp-client-calls">{c.calls_count} дзв.</span>
                            </div>
                          </div>
                          <button className="rp-client-add-btn" title="Додати в акаунт і відкрити чат" onClick={e => {
                            e.stopPropagation()
                            setAddToAcctModal({ phone: c.phone, name: c.full_name, clientId: c.id })
                            setAddToAcctResult(null)
                            setAddToAcctSelected('')
                            checkPhoneMessengers(c.phone)
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    {rpClientTotal > 30 && (
                      <div className="lab-pagination">
                        <button disabled={rpClientPage <= 1} onClick={() => loadRpClients(rpClientPage - 1, rpClientSearch)}>←</button>
                        <span>{rpClientPage} / {Math.ceil(rpClientTotal / 30)}</span>
                        <button disabled={rpClientPage * 30 >= rpClientTotal} onClick={() => loadRpClients(rpClientPage + 1, rpClientSearch)}>→</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rp-client-detail">
                    {rpClientDetailLoading && <div className="rp-empty">Завантаження...</div>}
                    {!rpClientDetailLoading && (
                      <>
                        {/* Client info card */}
                        <div className="rp-cd-card">
                          <div className="rp-cd-name">{rpClientInfo?.name || 'Невідомий'}</div>
                          <div className="rp-cd-phone">{rpClientInfo?.phone}</div>
                          <div className="rp-cd-actions">
                            <button onClick={() => { setSelectedAccount(''); selectClient(rpSelectedClient!) }} title="Відкрити чат">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              Чат
                            </button>
                            <button onClick={() => {
                              setAddToAcctModal({ phone: rpClientInfo?.phone || '', name: rpClientInfo?.name || '', clientId: rpSelectedClient! })
                              setAddToAcctResult(null); setAddToAcctSelected('')
                              checkPhoneMessengers(rpClientInfo?.phone || '')
                            }} title="Додати в акаунт">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                            </button>
                          </div>
                        </div>
                        {/* Calls */}
                        {rpClientCalls.length > 0 && (
                          <div className="rp-cd-section">
                            <div className="rp-cd-section-title">Дзвінки ({rpClientCalls.length})</div>
                            {rpClientCalls.slice(0, 20).map((call: any) => (
                              <div key={call.id} className={`rp-cd-call ${call.disposition}`}>
                                <div className="rp-cd-call-icon">
                                  {call.direction === 'incoming'
                                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 2 16 8 22 8"/><line x1="22" y1="2" x2="16" y2="8"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/></svg>
                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 8 22 2 16 2"/><line x1="16" y1="8" x2="22" y2="2"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/></svg>
                                  }
                                </div>
                                <div className="rp-cd-call-info">
                                  <span className="rp-cd-call-date">{new Date(call.call_datetime).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                  <span className="rp-cd-call-dur">{call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '—'}</span>
                                  {call.operator_name && <span className="rp-cd-call-op">{call.operator_name}</span>}
                                </div>
                                {call.has_audio && (
                                  <button className={`rp-cd-play${rpPlayingCall === call.id ? ' playing' : ''}`} onClick={() => playCallAudio(call.id)}>
                                    {rpPlayingCall === call.id ? '⏸' : '▶'}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Messages */}
                        {rpClientMsgs.length > 0 && (
                          <div className="rp-cd-section">
                            <div className="rp-cd-section-title">
                              Переписка ({rpClientMsgs.length})
                              <button className="rp-cd-chat-link" onClick={() => { setSelectedAccount(''); selectClient(rpSelectedClient!) }}>
                                Відкрити чат →
                              </button>
                            </div>
                            {rpClientMsgs.slice(0, 30).map(m => (
                              <div key={m.id} className={`rp-cd-msg ${m.direction}`} onClick={() => { setSelectedAccount(''); selectClient(rpSelectedClient!) }}>
                                <span className="rp-cd-msg-source">
                                  {m.source === 'whatsapp' ? <WhatsAppIcon size={10} color="#25D366" /> : <TelegramIcon size={10} color="#2AABEE" />}
                                </span>
                                <span className="rp-cd-msg-text">{m.text?.slice(0, 60) || (m.has_media ? `📎 ${m.media_type}` : '...')}</span>
                                <span className="rp-cd-msg-date">{new Date(m.message_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {rpClientCalls.length === 0 && rpClientMsgs.length === 0 && !rpClientDetailLoading && (
                          <div className="rp-empty">Немає історії</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          </div>
          <div className="right-panel-tabs">
            {rightTabs.map(tab => (
              <button
                key={tab}
                className={`rp-tab ${rightTab === tab ? 'active' : ''}`}
                data-tab={tab}
                onClick={() => { setRightTab(tab); if (tab === 'lab' && labPatients.length === 0 && !labLoading) loadLabResults(1, labSearch); if (tab === 'clients' && rpClients.length === 0 && !rpClientLoading) loadRpClients(1, '') }}
                title={tab === 'notes' ? 'Нотатки' : tab === 'quick' ? 'Шаблони' : tab === 'clients' ? 'Контакти' : 'Аналізи'}
                draggable
                onDragStart={e => { dragTabRef.current = tab; e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={e => {
                  e.preventDefault()
                  if (dragTabRef.current && dragTabRef.current !== tab) {
                    setRightTabs(prev => {
                      const arr = [...prev]
                      const fi = arr.indexOf(dragTabRef.current as RpTab)
                      const ti = arr.indexOf(tab)
                      if (fi < 0 || ti < 0) return prev
                      const [moved] = arr.splice(fi, 1)
                      arr.splice(ti, 0, moved)
                      try { localStorage.setItem('rp-tab-order', JSON.stringify(arr)) } catch {}
                      return arr
                    })
                  }
                  dragTabRef.current = null
                }}
                onDragEnd={() => { dragTabRef.current = null }}
              >
                {tab === 'notes' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                ) : tab === 'quick' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                ) : tab === 'clients' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 2v6a2 2 0 002 2h10M3 8v12a2 2 0 002 2h14a2 2 0 002-2V8"/><path d="M10 12h4M10 16h4"/></svg>
                )}
                <span className="rp-tab-label">{tab === 'notes' ? 'Нотатки' : tab === 'quick' ? 'Шаблони' : tab === 'clients' ? 'Контакти' : 'Аналізи'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {/* Recording Modal */}
      {isRecording && (
        <div className="modal-overlay recording-modal-overlay">
          <div className="recording-modal" onClick={e => e.stopPropagation()}>
            {recordingType === 'voice' ? (
              /* Voice recording modal */
              <>
                <div className="recording-modal-title">
                  <MicIcon />
                  <span>Голосове повідомлення</span>
                </div>
                <div className="recording-equalizer">
                  {audioLevels.map((level, i) => (
                    <div
                      key={i}
                      className="eq-bar"
                      style={{ height: `${Math.max(4, level * 60)}px` }}
                    />
                  ))}
                </div>
                <div className="recording-modal-time">
                  <span className="recording-dot" />
                  {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                </div>
              </>
            ) : (
              /* Video note recording modal */
              <>
                <div className="recording-modal-title">
                  <VideoIcon />
                  <span>Відеокружок</span>
                </div>
                <div className="recording-video-circle">
                  <video ref={videoPreviewRef} className="recording-video-feed" autoPlay muted playsInline />
                </div>
                <div className="recording-modal-time">
                  <span className="recording-dot" />
                  {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                </div>
              </>
            )}
            <div className="recording-modal-buttons">
              <button className="recording-modal-cancel" onClick={() => stopRecording(false)}>
                <XIcon /> Скасувати
              </button>
              <button className="recording-modal-send" onClick={() => stopRecording(true)}>
                <SendIcon /> Відправити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media context menu */}
      {ctxMenu && (
        <div className="ctx-menu-overlay" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null) }}>
          <div className="ctx-menu" style={{
          top: Math.min(ctxMenu.y, window.innerHeight - 140),
          left: Math.min(ctxMenu.x, window.innerWidth - 220),
        }} onClick={e => e.stopPropagation()}>
            {ctxMenu.mediaPath && (
              <>
                <button className="ctx-menu-item" onClick={ctxMenuOpen}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                  Відкрити
                </button>
                <button className="ctx-menu-item" onClick={ctxMenuSave}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  Зберегти на комп'ютер
                </button>
              </>
            )}
            <button className="ctx-menu-item" onClick={ctxMenuForward}>
              <ForwardIcon />
              Переслати
            </button>
            <button className="ctx-menu-item" onClick={ctxMenuLabAssign}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
              Додати аналіз
            </button>
          </div>
        </div>
      )}

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
                {accounts.filter(a => a.status === 'active').map(a => (
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

      {/* Add to Account Modal */}
      {addToAcctModal && (
        <div className="modal-overlay" onClick={() => setAddToAcctModal(null)}>
          <div className="add-acct-modal" onClick={e => e.stopPropagation()}>
            <div className="lab-send-header">
              <h3>Додати в акаунт</h3>
              <button className="modal-close-btn" onClick={() => setAddToAcctModal(null)}>×</button>
            </div>
            <div className="lab-send-patient">
              <div className="lab-patient-avatar"><span>{(addToAcctModal.name || addToAcctModal.phone || '?')[0].toUpperCase()}</span></div>
              <div className="lab-send-patient-info">
                <span className="lab-send-patient-name">{addToAcctModal.name || 'Невідомий'}</span>
                <span className="lab-send-patient-phone">{addToAcctModal.phone}</span>
              </div>
            </div>
            <div className="add-acct-check">
              {addToAcctChecking ? (
                <div className="add-acct-checking"><div className="spinner-sm" /> Перевірка месенджерів...</div>
              ) : addToAcctResult ? (
                <div className="add-acct-status">
                  <span className={`add-acct-badge${addToAcctResult.telegram ? ' found' : ''}`}>
                    <TelegramIcon size={14} color={addToAcctResult.telegram ? '#2AABEE' : 'var(--muted-foreground)'} />
                    {addToAcctResult.telegram ? 'Є в Telegram' : 'Немає в TG'}
                  </span>
                  <span className={`add-acct-badge${addToAcctResult.whatsapp ? ' found' : ''}`}>
                    <WhatsAppIcon size={14} color={addToAcctResult.whatsapp ? '#25D366' : 'var(--muted-foreground)'} />
                    {addToAcctResult.whatsapp ? 'Є в WhatsApp' : 'Немає в WA'}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="add-acct-list">
              <div className="rp-cd-section-title">Оберіть акаунт:</div>
              {accounts.map(a => (
                <label key={a.id} className={`add-acct-item${addToAcctSelected === a.id ? ' selected' : ''}`}>
                  <input type="radio" name="acct" checked={addToAcctSelected === a.id} onChange={() => setAddToAcctSelected(a.id)} />
                  {a.type === 'whatsapp' ? <WhatsAppIcon size={14} color="#25D366" /> : <TelegramIcon size={14} color="#2AABEE" />}
                  <span>{a.label || a.phone}</span>
                </label>
              ))}
            </div>
            <div className="lab-send-footer">
              <button className="lab-send-cancel" onClick={() => setAddToAcctModal(null)}>Скасувати</button>
              <button className="lab-send-submit" disabled={!addToAcctSelected || addToAcctAdding} onClick={addContactToAccount}>
                {addToAcctAdding ? 'Додавання...' : 'Додати і відкрити чат'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Template/Category */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-delete-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </div>
            <h3>Видалити {confirmDelete.type === 'category' ? 'категорію' : 'шаблон'}?</h3>
            <p>«{confirmDelete.name}» буде видалено назавжди{confirmDelete.type === 'category' ? ' разом з усіма шаблонами' : ''}.</p>
            <div className="confirm-delete-actions">
              <button onClick={() => setConfirmDelete(null)}>Скасувати</button>
              <button className="danger" onClick={() => {
                if (confirmDelete.type === 'category') deleteCategory(confirmDelete.id)
                else deleteTemplate(confirmDelete.id)
                setConfirmDelete(null)
              }}>Видалити</button>
            </div>
          </div>
        </div>
      )}

      {/* Lab Send Modal — send lab results to chat */}
      {labSendModal && (
        <div className="modal-overlay" onClick={() => { setLabSendModal(null); setLabSendSelected(new Set()) }}>
          <div className="lab-send-modal" onClick={e => e.stopPropagation()}>
            <div className="lab-send-header">
              <h3>Надіслати аналізи</h3>
              <button className="modal-close-btn" onClick={() => { setLabSendModal(null); setLabSendSelected(new Set()) }}>×</button>
            </div>
            <div className="lab-send-patient">
              <div className="lab-patient-avatar">
                <span>{(labSendModal.name || '?')[0].toUpperCase()}</span>
              </div>
              <div className="lab-send-patient-info">
                <span className="lab-send-patient-name">{labSendModal.name || 'Невідомий'}</span>
                {labSendModal.phone && <span className="lab-send-patient-phone">{labSendModal.phone}</span>}
              </div>
            </div>
            <div className="lab-send-select-all">
              <label>
                <input type="checkbox"
                  checked={labSendSelected.size === labSendModal.results.filter(r => r.media_file).length && labSendSelected.size > 0}
                  onChange={e => {
                    if (e.target.checked) {
                      setLabSendSelected(new Set(labSendModal.results.filter(r => r.media_file).map(r => r.id)))
                    } else {
                      setLabSendSelected(new Set())
                    }
                  }}
                />
                Вибрати всі ({labSendModal.results.filter(r => r.media_file).length})
              </label>
            </div>
            <div className="lab-send-list">
              {labSendModal.results.map(r => {
                const hasFile = !!r.media_file
                const isChecked = labSendSelected.has(r.id)
                const typeLabel: Record<string, string> = {
                  blood_test: 'Аналіз крові', ultrasound: 'УЗД', xray: 'Рентген',
                  ct_scan: 'КТ', mri: 'МРТ', ecg: 'ЕКГ', dental_scan: 'Стоматологія',
                  prescription: 'Рецепт', other_lab: 'Інше',
                }
                const thumbKey = `labsend_thumb_${r.id}`
                if (r.thumbnail && !mediaBlobMap[thumbKey] && !mediaLoading[thumbKey]) loadMediaBlob(thumbKey, r.thumbnail)
                return (
                  <label key={r.id} className={`lab-send-item${!hasFile ? ' disabled' : ''}${isChecked ? ' selected' : ''}`}>
                    <input type="checkbox" checked={isChecked} disabled={!hasFile}
                      onChange={() => setLabSendSelected(prev => {
                        const next = new Set(prev)
                        if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                        return next
                      })}
                    />
                    <div className="lab-send-item-thumb">
                      {mediaBlobMap[thumbKey] ? <img src={mediaBlobMap[thumbKey]} alt="" /> : (
                        <div className="lab-result-icon">{/\.pdf/i.test(r.media_file || '') ? '📄' : '🖼️'}</div>
                      )}
                    </div>
                    <div className="lab-send-item-info">
                      <span className="lab-send-item-type">{typeLabel[r.lab_result_type] || r.lab_result_type || 'Аналіз'}</span>
                      <span className="lab-send-item-date">{new Date(r.message_date).toLocaleDateString('uk-UA')}</span>
                    </div>
                    <span className="lab-result-badge">{r.source === 'telegram' ? 'TG' : '✉️'}</span>
                  </label>
                )
              })}
            </div>
            <div className="lab-send-footer">
              <button className="lab-send-cancel" onClick={() => { setLabSendModal(null); setLabSendSelected(new Set()) }}>Скасувати</button>
              <button className="lab-send-submit" disabled={labSendSelected.size === 0 || labSending} onClick={sendLabResults}>
                {labSending ? 'Надсилання...' : `Надіслати (${labSendSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lab Assign Modal */}
      {labAssignMsg && (
        <div className="modal-overlay" onClick={() => setLabAssignMsg(null)}>
          <div className="lab-assign-modal" onClick={e => e.stopPropagation()}>
            <h3>{labAssignMsg.is_lab_result ? 'Змінити пацієнта' : 'Додати аналіз'}</h3>
            <p className="lab-assign-hint">Оберіть пацієнта для прив'язки аналізу</p>
            <input
              className="lab-assign-search"
              placeholder="Пошук за ім'ям або телефоном..."
              value={labAssignSearch}
              onChange={e => { setLabAssignSearch(e.target.value); searchLabPatients(e.target.value) }}
              autoFocus
            />
            <div className="lab-assign-list">
              {labAssignLoading && <div className="lab-assign-loading"><div className="spinner-sm" /></div>}
              {labAssignResults.map(c => (
                <button key={c.id} className="lab-assign-item" onClick={() => assignLabResult(c.id, c.phone, c.full_name)}>
                  <div className="lab-assign-avatar"><UserIcon /></div>
                  <div className="lab-assign-info">
                    <div className="lab-assign-name">{c.full_name || c.phone}</div>
                    <div className="lab-assign-phone">{c.phone}</div>
                  </div>
                </button>
              ))}
              {labAssignSearch.length >= 2 && !labAssignLoading && labAssignResults.length === 0 && (
                <div className="lab-assign-empty">Не знайдено</div>
              )}
              {labAssignSearch.length < 2 && (
                <div className="lab-assign-empty">Введіть ім'я або телефон (мін. 2 символи)</div>
              )}
            </div>
            <button className="tpl-btn-secondary" onClick={() => setLabAssignMsg(null)}>Скасувати</button>
          </div>
        </div>
      )}

      {/* New Chat / Add Contact Modal */}
      {showAddContact && (
        <div className="modal-overlay" onClick={() => { setShowAddContact(false); setAddContactResult(''); setAddContactSuggestions([]); setAddContactShowSuggestions(false); setAddContactAvail(null) }}>
          <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 380 }}>
            <h3>Новий чат</h3>
            <select
              className="forward-modal-search"
              value={addContactAccount || selectedAccount}
              onChange={e => setAddContactAccount(e.target.value)}
              style={{ marginBottom: 8 }}
            >
              <option value="">-- Оберіть акаунт --</option>
              {accounts.filter(a => a.status === 'active' || a.status === 'connected').map(a => (
                <option key={a.id} value={a.id}>{a.type === 'telegram' ? 'TG' : 'WA'} {a.label}</option>
              ))}
            </select>
            <div style={{ position: 'relative' }}>
              <input
                className="forward-modal-search"
                placeholder="Пошук за ім'ям або телефоном..."
                value={addContactName}
                onChange={e => {
                  setAddContactName(e.target.value)
                  searchAddContactSuggestions(e.target.value)
                }}
                onFocus={() => addContactSuggestions.length > 0 && setAddContactShowSuggestions(true)}
                onBlur={() => setTimeout(() => setAddContactShowSuggestions(false), 200)}
                autoFocus
              />
              <div style={{ position: 'relative' }}>
                <input
                  className="forward-modal-search"
                  placeholder="Номер телефону"
                  value={addContactPhone}
                  onChange={e => {
                    setAddContactPhone(e.target.value)
                    setAddContactAvail(null)
                    checkPhoneAvail(e.target.value)
                    if (e.target.value.length >= 2) searchAddContactSuggestions(e.target.value)
                  }}
                  onFocus={() => addContactSuggestions.length > 0 && setAddContactShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setAddContactShowSuggestions(false), 200)}
                  style={{ marginTop: 8, paddingRight: 60 }}
                />
                {addContactAvail && (
                  <div className="phone-avail-badges">
                    {addContactAvail.telegram && <span className="avail-badge tg" title="Telegram">TG</span>}
                    {addContactAvail.whatsapp && <span className="avail-badge wa" title="WhatsApp">WA</span>}
                    {!addContactAvail.telegram && !addContactAvail.whatsapp && <span className="avail-badge none" title="Не знайдено">—</span>}
                  </div>
                )}
              </div>
              {addContactShowSuggestions && addContactSuggestions.length > 0 && (
                <div className="add-contact-suggestions">
                  {addContactSuggestions.map(s => (
                    <div key={s.client_id} className="add-contact-suggestion-item"
                      onMouseDown={() => {
                        setAddContactName(s.full_name)
                        setAddContactPhone(s.phone)
                        setAddContactShowSuggestions(false)
                        setAddContactSuggestions([])
                        checkPhoneAvail(s.phone)
                      }}
                    >
                      <span className="suggestion-name">{s.full_name || '—'}</span>
                      <span className="suggestion-phone">{s.phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {addContactResult && (
              <div className={`add-contact-result ${addContactResult.includes('Помилка') ? 'warn' : 'ok'}`}>
                {addContactResult}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="tpl-btn-primary"
                onClick={startNewChat}
                disabled={addContactLoading || !addContactPhone.trim() || !(addContactAccount || selectedAccount)}
              >
                {addContactLoading ? 'Зачекайте...' : 'Написати'}
              </button>
              <button
                className="tpl-btn-secondary"
                onClick={addContact}
                disabled={addContactLoading || !addContactPhone.trim() || !(addContactAccount || selectedAccount)}
              >
                Додати в акаунт
              </button>
              <button className="tpl-btn-secondary" onClick={() => { setShowAddContact(false); setAddContactResult(''); setAddContactSuggestions([]); setAddContactShowSuggestions(false); setAddContactAvail(null) }}>
                Скасувати
              </button>
            </div>
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
          <div className="tpl-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="tpl-edit-header">
              <span>{previewTpl.title}</span>
              <button onClick={() => setPreviewTpl(null)}>✕</button>
            </div>
            <div className="tpl-edit-body">
              {/* Media preview with remove */}
              {previewTpl.media_file && tplIncludeMedia && (
                <div className="tpl-edit-media">
                  {previewTpl.media_file.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                    <img src={`https://cc.vidnova.app${previewTpl.media_file}`} alt="" />
                  ) : previewTpl.media_file.match(/\.(mp4|webm|mov)/i) ? (
                    <div className="tpl-edit-file-tag">🎬 Відео</div>
                  ) : (
                    <div className="tpl-edit-file-tag">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                      {previewTpl.media_file.split('/').pop()}
                    </div>
                  )}
                  <button className="tpl-edit-media-remove" onClick={() => setTplIncludeMedia(false)} title="Видалити вкладення">✕</button>
                </div>
              )}
              {/* Re-include media button (when removed) */}
              {previewTpl.media_file && !tplIncludeMedia && (
                <button className="tpl-reinclude-media" onClick={() => setTplIncludeMedia(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  Повернути вкладення шаблону
                </button>
              )}
              {/* Extra file attachment */}
              {tplSendExtraFile ? (
                <div className="tpl-extra-file">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <span>{tplSendExtraFile.name}</span>
                  <button onClick={() => setTplSendExtraFile(null)} title="Видалити">✕</button>
                </div>
              ) : (
                <label className="tpl-attach-extra">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  Додати файл
                  <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={e => { setTplSendExtraFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setTplIncludeMedia(false) }} hidden />
                </label>
              )}
              {/* Editable text */}
              <textarea
                className="tpl-edit-textarea"
                value={tplEditText}
                onChange={e => setTplEditText(e.target.value)}
                rows={Math.max(4, tplEditText.split('\n').length + 1)}
              />
            </div>
            <div className="tpl-edit-footer">
              <span className="tpl-edit-hint">
                {chatContact?.full_name || chatContact?.phone || ''}
              </span>
              <button
                className="tpl-btn-send"
                onClick={() => sendTemplate(tplEditText, tplIncludeMedia ? previewTpl.media_file : null, tplSendExtraFile)}
                disabled={!selectedClient || (!tplEditText.trim() && !(tplIncludeMedia && previewTpl.media_file) && !tplSendExtraFile)}
              >
                <SendIcon /> Відправити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Edit Template Modal */}
      {editingTpl && (
        <div className="modal-overlay" onClick={() => setEditingTpl(null)}>
          <div className="tpl-modal tpl-global-edit-modal" onClick={e => e.stopPropagation()}>
            <h3>Редагувати шаблон</h3>
            <input
              value={editTplTitle}
              onChange={e => setEditTplTitle(e.target.value)}
              placeholder="Коротка назва"
              autoFocus
            />
            <textarea
              value={editTplText}
              onChange={e => setEditTplText(e.target.value)}
              placeholder="Текст повідомлення..."
              rows={4}
            />
            {/* Current media */}
            {editingTpl.media_file && !editTplRemoveMedia && !editTplMedia && (
              <div className="tpl-edit-media">
                {editingTpl.media_file.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                  <img src={`${API_BASE.replace('/api', '')}${editingTpl.media_file}`} alt="" />
                ) : (
                  <div className="tpl-edit-file-tag">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                    {editingTpl.media_file.split('/').pop()}
                  </div>
                )}
                <button className="tpl-edit-media-remove" onClick={() => setEditTplRemoveMedia(true)} title="Видалити вкладення">✕</button>
              </div>
            )}
            {/* New media selected */}
            {editTplMedia && (
              <div className="tpl-extra-file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                <span>{editTplMedia.name}</span>
                <button onClick={() => setEditTplMedia(null)} title="Видалити">✕</button>
              </div>
            )}
            {/* Media upload / re-add */}
            {!editTplMedia && (editTplRemoveMedia || !editingTpl.media_file) && (
              <label className="tpl-media-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                Прикріпити медіа
                <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={e => { setEditTplMedia(e.target.files?.[0] || null); setEditTplRemoveMedia(false) }} hidden />
              </label>
            )}
            <div className="tpl-modal-btns">
              <button className="tpl-btn-primary" onClick={() => saveTemplate(editingTpl)} disabled={!editTplTitle.trim() || !editTplText.trim()}>Зберегти</button>
              <button className="tpl-btn-secondary" onClick={() => setEditingTpl(null)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Compose modal */}
      {showCompose && selectedGmail && (
        <div className="modal-overlay" onClick={() => setShowCompose(false)}>
          <div className="gmail-compose-modal" onClick={e => e.stopPropagation()}>
            <div className="gmail-compose-header">
              <h3>Новий лист</h3>
              <button className="icon-btn" onClick={() => setShowCompose(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="gmail-compose-from">
              <GmailIcon size={14} color="#EA4335" />
              <span>{gmailAccounts.find(g => g.id === selectedGmail)?.email}</span>
            </div>
            <div className="gmail-compose-fields">
              <input placeholder="Кому" value={composeTo} onChange={e => setComposeTo(e.target.value)} className="gmail-compose-input" />
              <input placeholder="Тема" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} className="gmail-compose-input" />
              <textarea
                placeholder="Текст листа..."
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                className="gmail-compose-body"
                rows={10}
              />
            </div>
            {composeFiles.length > 0 && (
              <div className="gmail-compose-files">
                {composeFiles.map((f, i) => (
                  <div key={i} className="gmail-compose-file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    <span>{f.name}</span>
                    <button onClick={() => setComposeFiles(prev => prev.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="gmail-compose-actions">
              <div className="gmail-compose-actions-left">
                <button className="gmail-attach-btn" onClick={() => composeFileRef.current?.click()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  Вкласти
                </button>
                <input
                  ref={composeFileRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) setComposeFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
                />
              </div>
              <button className="gmail-send-btn" onClick={sendGmailEmail} disabled={composeSending || !composeTo.trim()}>
                {composeSending ? 'Надсилаю...' : 'Надіслати'}
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

      {/* Toast notifications — bottom-right, grouped by sender→account */}
      {toasts.length > 0 && (() => {
        // Group toasts by clientId+accountId
        const groupMap = new Map<string, typeof toasts>()
        const groupOrder: string[] = []
        for (const t of toasts) {
          const gk = `${t.clientId}:${t.accountId}`
          if (!groupMap.has(gk)) { groupMap.set(gk, []); groupOrder.push(gk) }
          groupMap.get(gk)!.push(t)
        }
        return (
          <div className="toast-container">
            {toasts.length > 2 && (
              <button className="toast-dismiss-all" onClick={() => { setToasts([]); setExpandedToastGroup(null) }}>
                Приховати всі
              </button>
            )}
            {groupOrder.map(gk => {
              const group = groupMap.get(gk)!
              const latest = group[group.length - 1]
              const isExpanded = expandedToastGroup === gk
              const acctType = accounts.find(a => a.id === latest.accountId)?.type
              const waClass = acctType === 'whatsapp' ? 'toast-wa' : 'toast-tg'
              const avatarUrl = photoMap[latest.clientId]
              const stackCount = group.length

              const renderToast = (t: typeof latest, idx: number, isStack = false) => (
                <div
                  key={t.id}
                  className={`toast-item ${waClass}${isStack ? ' toast-stack' : ''}`}
                  style={isStack ? { '--stack-i': idx } as React.CSSProperties : undefined}
                  onClick={() => {
                    if (!isExpanded && stackCount > 1) {
                      setExpandedToastGroup(gk)
                    } else {
                      setSelectedAccount('')
                      selectClient(t.clientId)
                      setToasts(prev => prev.filter(x => x.id !== t.id))
                      setExpandedToastGroup(null)
                    }
                  }}
                >
                  <div className="toast-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(t.sender || '?')[0].toUpperCase()}</span>}
                  </div>
                  <div className="toast-content">
                    <div className="toast-header">
                      <span className="toast-sender">{t.sender}</span>
                      {t.account && <><span className="toast-arrow">→</span><span className="toast-account">{t.account}</span></>}
                    </div>
                    <div className="toast-body">
                      {t.hasMedia && !t.text && <span className="toast-media">
                        {t.mediaType === 'photo' ? '🖼 Фото' : t.mediaType === 'video' ? '🎬 Відео' : t.mediaType === 'voice' ? '🎤 Голосове' : t.mediaType === 'sticker' ? '🏷 Стікер' : t.mediaType === 'document' ? '📄 Документ' : '📎 Медіа'}
                      </span>}
                      {t.hasMedia && t.text && <span className="toast-media-icon">
                        {t.mediaType === 'photo' ? '🖼' : t.mediaType === 'video' ? '🎬' : t.mediaType === 'voice' ? '🎤' : '📎'}
                        {' '}
                      </span>}
                      {t.text && <span className="toast-text">{t.text.slice(0, 120)}</span>}
                    </div>
                  </div>
                  <button
                    className="toast-close"
                    onClick={e => {
                      e.stopPropagation()
                      // Close top = close entire group
                      const groupIds = group.map(x => x.id)
                      setToasts(prev => prev.filter(x => !groupIds.includes(x.id)))
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

              // Collapsed stack: show latest on top with shadow cards behind
              return (
                <div key={gk} className="toast-group collapsed">
                  {group.slice(-3).reverse().map((t, i) =>
                    i === 0 ? renderToast(t, 0) : renderToast(t, i, true)
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
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
