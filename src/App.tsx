import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { relaunch } from '@tauri-apps/plugin-process'
import { tempDir, join } from '@tauri-apps/api/path'
import { save, open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { writeFile, readFile } from '@tauri-apps/plugin-fs'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import * as telemetry from './telemetry'
import './App.css'
import { makeReadTsKey, getReadTs, setReadTs } from './utils/readTs'
import { formatContactDate, formatDateSeparator } from './utils/dateFormat'
import {
  isPlaceholderPhone,
  isPlaceholderName,
  resolveContactDisplay,
} from './utils/contactDisplay'
import { formatPresence } from './utils/presence'
import { API_BASE } from './constants'
import {
  type AppSettings,
  loadSettings,
  saveSettings,
} from './settings'
import { authFetch } from './utils/authFetch'
import { extractFirstUrl } from './utils/urlExtract'
import { useTheme } from './utils/theme'
import {
  THUMB_STORE,
  getCached,
  putCache,
} from './cache'
import { AuthMedia } from './components/AuthMedia'
import { VoicePlayer } from './components/VoicePlayer'
import { LottieSticker } from './components/LottieSticker'
import { PollCard } from './components/PollCard'
import { Linkify } from './components/Linkify'
import { LinkPreviewCard } from './components/LinkPreviewCard'
import { ContactName } from './components/ContactName'
import { ThemeToggle } from './components/ThemeToggle'
import { LoginScreen } from './screens/LoginScreen'
import { useTauriUpdater } from './hooks/useTauriUpdater'
import { usePanelResize } from './hooks/usePanelResize'
import { useWallpapers } from './hooks/useWallpapers'
import { useGmailNotifications } from './hooks/useGmailNotifications'
import { useAuthController } from './hooks/useAuthController'
import { useVoipController } from './hooks/useVoipController'
import { VoipOverlays } from './components/VoipOverlays'
import { ToastsContainer } from './components/ToastsContainer'
import { BgUploadsContainer, type BgUpload } from './components/BgUploadsContainer'
import { WhatsNewModal } from './components/WhatsNewModal'
import { PhoneIcon, MicIcon, TelegramIcon, WhatsAppIcon, GmailIcon, SendIcon } from './components/icons'
import { SettingsModal } from './components/SettingsModal'
import { LightboxOverlay } from './components/LightboxOverlay'
import { FileUploadModal } from './components/FileUploadModal'
import { AddToAccountModal } from './components/AddToAccountModal'
import { AddContactModal } from './components/AddContactModal'
import { AccountRail } from './components/AccountRail'
import { ActiveAccountCard } from './components/ActiveAccountCard'
import { useToasts } from './hooks/useToasts'
import { useMessengerWebSocket } from './hooks/useMessengerWebSocket'
import { useWaSettings } from './hooks/useWaSettings'
import { useNotificationSound } from './hooks/useNotificationSound'
import { useContacts } from './hooks/useContacts'
import { useMessages } from './hooks/useMessages'
import type {
  Account,
  Contact,
  ChatMessage,
  AlbumGroup,
  GlobalSearchResult,
  ClientNote,
  TemplateCategory,
  QuickReply,
  LabResult,
  LabPatient,
  GmailAccount,
  GmailEmail,
} from './types'



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


// ===== SVG Icons =====

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
// Attachment & media icons
const PaperclipIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
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
// ===== Main App =====

function App() {
  const { theme, setTheme } = useTheme()
  const onLogoutReset = useCallback(() => {
    setContacts([])
    setMessages([])
    setSelectedClient(null)
    setAccounts([])
  }, [])
  const { auth, authLoading, authError, login, logout } = useAuthController({
    onLogout: onLogoutReset,
  })
  const {
    currentVersion,
    showWhatsNew,
    setShowWhatsNew,
    updateReady,
    updateProgress,
  } = useTauriUpdater()
  const [railExpanded, setRailExpanded] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings)
  // wallpapers state lives in useWallpapers() below
  const [settingsTab, setSettingsTab] = useState<'notifications' | 'background' | 'whatsapp'>('notifications')
  const [previewSound, setPreviewSound] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  // wallpaperBlobUrl lives in useWallpapers() below
  const [soundDropdownOpen, setSoundDropdownOpen] = useState<string | null>(null) // account ID

  // WhatsApp settings
  // WhatsApp settings lives in useWaSettings() (declared later — this placeholder keeps state map readable).

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const hasMessengerAccounts = accounts.length > 0

  // Contacts state lives in useContacts() (declared after auth/selectedAccount/photoMap below)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([])
  const [usernameSearchResult, setUsernameSearchResult] = useState<any | null>(null)
  const globalSearchTimer = useRef<any>(null)
  const pendingSearchOpenRef = useRef<{ clientId: string; accountId: string } | null>(null)
  const pendingSearchJumpRef = useRef<{ messageDomId: string } | null>(null)

  // Messages state lives in useMessages() below (after chatEndRef/chatContainerRef/scrollPositionsRef)
  const [messageText, setMessageText] = useState('')
  const [groupInfo, setGroupInfo] = useState<{ participants_count?: number; online_count?: number; about?: string; username?: string; is_broadcast?: boolean; linked_chat_id?: number } | null>(null)
  const [chatMuted, setChatMuted] = useState(false)
  const [muteLoading, setMuteLoading] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<{id: string; phone: string; full_name: string; calls_count: number}[]>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [sending, setSending] = useState(false)

  // Right panel
  type RpTab = 'notes' | 'quick' | 'lab' | 'clients' | 'card'
  const [rightTabs, setRightTabs] = useState<RpTab[]>(() => {
    try { const s = localStorage.getItem('rp-tab-order'); if (s) { const a = JSON.parse(s); if (!a.includes('lab')) a.push('lab'); if (!a.includes('clients')) a.push('clients'); if (!a.includes('card')) a.push('card'); return a } } catch {}
    return ['notes', 'quick', 'lab', 'clients', 'card']
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
  const [rpClientInfo, setRpClientInfo] = useState<{ name: string; phone: string; linked_phones?: { id: string; phone: string }[] } | null>(null)
  const [rpClientDetailLoading, setRpClientDetailLoading] = useState(false)
  const [rpClientPhotos, setRpClientPhotos] = useState<Record<string, string>>({})
  // Add-to-account modal
  const [addToAcctModal, setAddToAcctModal] = useState<{ phone: string; name: string; clientId: string } | null>(null)
  const [addToAcctChecking, setAddToAcctChecking] = useState(false)
  const [addToAcctResult, setAddToAcctResult] = useState<{ telegram: boolean; whatsapp: boolean } | null>(null)
  const [addToAcctSelected, setAddToAcctSelected] = useState<string>('')
  const [addToAcctAdding, setAddToAcctAdding] = useState(false)
  // Client Card tab state
  interface ClientCardData {
    id: string; phone: string; full_name: string; email?: string
    instagram?: string; facebook?: string; tiktok?: string
    city?: string; source?: string; source_detail?: string; comment?: string
    tags?: { id: string; name: string; color: string }[]
    links?: { id: string; url: string; title: string; created_at: string }[]
    linked_phones?: { id: string; phone: string; full_name: string }[]
  }
  const [cardData, setCardData] = useState<ClientCardData | null>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [cardEditField, setCardEditField] = useState<string | null>(null)
  const [cardEditValue, setCardEditValue] = useState('')
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([])
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [showAddLink, setShowAddLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  // Audio playback for calls in contacts panel
  const [rpPlayingCall, setRpPlayingCall] = useState<string | null>(null)
  const rpAudioRef = useRef<HTMLAudioElement | null>(null)
  const dragCatRef = useRef<string | null>(null)
  const dragTabRef = useRef<string | null>(null)
  const [chatDropHighlight, setChatDropHighlight] = useState(false)
  const [labSendModal, setLabSendModal] = useState<LabPatient | null>(null)
  const [labSendSelected, setLabSendSelected] = useState<Set<string | number>>(new Set())
  const [labSending, setLabSending] = useState(false)
  // Lab results
  const [labPatients, setLabPatients] = useState<LabPatient[]>([])
  const [labSearch, setLabSearch] = useState('')
  const [labLoading, setLabLoading] = useState(false)
  const [labPage, setLabPage] = useState(1)
  const [labHasMore, setLabHasMore] = useState(false)
  const [labLoadingMore, setLabLoadingMore] = useState(false)
  const labBottomSentinelRef = useRef<HTMLDivElement>(null)
  const labPatientsRef = useRef<LabPatient[]>([])
  const [expandedLabPatient, setExpandedLabPatient] = useState<string | null>(null)
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([])
  const [templateCategories, setTemplateCategories] = useState<TemplateCategory[]>([])
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [newNoteText, setNewNoteText] = useState('')
  const [showNoteModal, setShowNoteModal] = useState(false)
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
  const [tplSendExtraFiles, setTplSendExtraFiles] = useState<File[]>([]) // extra attachments for send
  // Global edit mode
  const [editingTpl, setEditingTpl] = useState<QuickReply | null>(null)
  const [editTplTitle, setEditTplTitle] = useState('')
  const [editTplText, setEditTplText] = useState('')
  const [editTplMedia, setEditTplMedia] = useState<File | null>(null)
  const [editTplRemoveMedia, setEditTplRemoveMedia] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'template' | 'category'; id: string; name: string } | null>(null)
  // Inline category rename + color
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [editingCatColor, setEditingCatColor] = useState('')
  // Drag template to chat
  const dragTplRef = useRef<QuickReply | null>(null)
  const lastDraggedTplRef = useRef<QuickReply | null>(null) // backup: survives onDragEnd
  const templateCategoriesRef = useRef<TemplateCategory[]>([])

  // Avatar photos
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({})
  const [audioBlobMap, setAudioBlobMap] = useState<Record<string, string>>({})
  const [audioLoading, setAudioLoading] = useState<Record<string, boolean>>({})
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)
  // Generic media blobs (voice, video, documents, full-size images)
  const [mediaBlobMap, setMediaBlobMap] = useState<Record<string, string>>({})
  const [mediaLoading, setMediaLoading] = useState<Record<string, boolean>>({})
  const mediaLoadingRef = useRef<Set<string>>(new Set())

  // soundEnabled + playNotifSound + isPopupEnabled all live in useNotificationSound()

  // Unread tracking
  const [updates, setUpdates] = useState<Record<string, { last_date: string; last_received: string }>>({})

  // In-app toast notifications
  const { toasts, expandedToastGroup, setExpandedToastGroup, addToast, dismissToast, dismissAll } = useToasts()
  // Dedup group messages/reactions: same tg_message_id+tg_peer_id arrives once per account
  const wsDedup = useRef(new Map<string, number>())
  // expandedToastGroup lives in useToasts()

  // Per-account unread counts (from WS events)
  const [accountUnreads, setAccountUnreads] = useState<Record<string, number>>({})

  // wsRef, wsLastActivityRef live in useMessengerWebSocket()
  // notifAudioRef moved into useNotificationSound()

  // VoIP state
  const onVoipError = useCallback((msg: string) => {
    addToastRef.current('', '', '', '', msg, false, '')
  }, [])
  const voip = useVoipController({
    token: auth?.token,
    onError: onVoipError,
  })
  // `voip` is passed whole to <VoipOverlays/>. Only the pieces that are still
  // needed in App-level logic are destructured here.
  const {
    activeCall,
    startCall: voipStartCall,
    applyWsEvent: voipApplyWsEvent,
  } = voip
  // Link preview cache now lives inside ./components/LinkPreviewCard.tsx
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const chatTopSentinelRef = useRef<HTMLDivElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const selectedClientRef = useRef<string | null>(null)
  const contactsRef = useRef<Contact[]>([])
  const messagesRef = useRef<ChatMessage[]>([])
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const linkSearchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Lightbox (scale/pan/drag state encapsulated in <LightboxOverlay/>)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  // Video note modal
  const [vnoteModal, setVnoteModal] = useState<{ src: string; id: string | number } | null>(null)
  const vnoteModalRef = useRef<HTMLVideoElement>(null)
  const [vnoteProgress, setVnoteProgress] = useState(0)
  const [vnotePlaying, setVnotePlaying] = useState(true)

  // File attachment (multi-file)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [attachedPreviews, setAttachedPreviews] = useState<string[]>([])
  const [showFileModal, setShowFileModal] = useState(false)
  const [fileCaption, setFileCaption] = useState('')
  const [forceDocument, setForceDocument] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Background upload queue — persists across chat switches
  const [bgUploads, setBgUploads] = useState<BgUpload[]>([])
  const bgUploadIdRef = useRef(0)

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

  // Typing indicators: { clientId: timestamp }
  const [typingIndicators, setTypingIndicators] = useState<Record<string, number>>({})
  const typingSentAtRef = useRef<Record<string, number>>({})
  const typingClearTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Scroll positions: { clientId: scrollTop }
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  // Presence: { tg_peer_id: { status, was_online } }
  const [peerPresence, setPeerPresence] = useState<Record<number, { status: string; was_online: number | null }>>({})

  // Contacts list + loader — co-located here because `contacts` is read by
  // the refs useEffect just below.
  const contactsCtrl = useContacts({
    token: auth?.token,
    account: selectedAccount,
    search,
    onUnauthorized: logout,
    photoMap,
    setPhotoMap,
    setPeerPresence,
  })
  const {
    contacts,
    setContacts,
    contactCount,
    loadingMore: loadingMoreContacts,
    loadContacts,
    loadMoreContacts,
  } = contactsCtrl

  // Current-chat messages + paging (see src/hooks/useMessages.ts)
  const messagesCtrl = useMessages({
    token: auth?.token,
    account: selectedAccount,
    onUnauthorized: logout,
    chatContainerRef,
    chatEndRef,
    scrollPositionsRef,
  })
  const {
    messages,
    setMessages,
    msgCount,
    msgCursor,
    hasOlder: hasOlderMessages,
    loadingOlder,
    clientName,
    clientPhone,
    clientLinkedPhones,
    isPlaceholder,
    setIsPlaceholder,
    setHasOlder: setHasOlderMessages,
    setMsgCursor,
    loadMessages,
    loadOlderMessages,
  } = messagesCtrl

  // Edit message mode
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null)
  // Drafts: save text per client when switching chats (persisted to localStorage)
  const draftsRef = useRef<Map<string, { text: string; replyTo?: any }>>(
    (() => { try { const s = localStorage.getItem('vg_drafts'); if (s) return new Map(JSON.parse(s)) } catch {} return new Map() })()
  )
  // Chat search
  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [chatSearchResults, setChatSearchResults] = useState<number[]>([]) // indices into messages
  const [chatSearchIdx, setChatSearchIdx] = useState(0)
  const chatSearchRef = useRef<HTMLInputElement>(null)

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
  const pendingGmailMsgRef = useRef<string | null>(null) // select after emails load
  const pendingToastChatRef = useRef<{ clientId: string; accountId: string; sender: string } | null>(null)
  const [gmailTotal, setGmailTotal] = useState(0)
  const [gmailPage, setGmailPage] = useState(1)
  const [gmailSearch, setGmailSearch] = useState('')
  const [gmailDirection, setGmailDirection] = useState<'' | 'inbox' | 'sent'>('inbox')
  const [gmailLoading, setGmailLoading] = useState(false)
  const [gmailSelectedMsg, setGmailSelectedMsg] = useState<GmailEmail | null>(null)
  const [showSelectAccountHint, setShowSelectAccountHint] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [todoTitle, setTodoTitle] = useState('')
  const [todoItems, setTodoItems] = useState<string[]>(['', ''])
  const [showContactProfile, setShowContactProfile] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    msgId: number | string
    source: 'telegram' | 'whatsapp'
    tgMsgId?: number
    peerId?: number
  } | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeFiles, setComposeFiles] = useState<File[]>([])
  const [composeSending, setComposeSending] = useState(false)
  const composeFileRef = useRef<HTMLInputElement>(null)
  const gmailSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Panel drag-resize lives in usePanelResize()
  const { sidebarWidth, rightPanelWidth, startResize } = usePanelResize()

  // auth persistence lives in useAuthController()

  useEffect(() => { selectedClientRef.current = selectedClient }, [selectedClient])
  useEffect(() => { contactsRef.current = contacts }, [contacts])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { labPatientsRef.current = labPatients }, [labPatients])
  useEffect(() => { templateCategoriesRef.current = templateCategories }, [templateCategories])

  // Global drag/drop handler for templates and lab patients
  // WebView2 doesn't reliably fire onDrop on nested scrollable containers
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!selectedClientRef.current) return
      // Templates or external files (lab patients use mouse-based drag)
      if (dragTplRef.current || lastDraggedTplRef.current ||
          (e.dataTransfer && e.dataTransfer.types.includes('Files'))) {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        setChatDropHighlight(true)
      }
    }
    const handleDragLeave = (e: DragEvent) => {
      // Only hide highlight when leaving the window
      if (!e.relatedTarget) setChatDropHighlight(false)
    }
    const handleDrop = (e: DragEvent) => {
      setChatDropHighlight(false)
      if (!selectedClientRef.current) return
      // Template drag — check refs + dataTransfer fallback
      let tpl = dragTplRef.current || lastDraggedTplRef.current
      if (!tpl && e.dataTransfer) {
        const title = e.dataTransfer.getData('text/plain')
        if (title) {
          for (const cat of templateCategoriesRef.current) {
            const found = cat.templates.find((t: any) => t.title === title)
            if (found) { tpl = found; break }
          }
        }
      }
      dragTplRef.current = null
      lastDraggedTplRef.current = null
      if (tpl) {
        e.preventDefault()
        e.stopPropagation()
        setPreviewTpl(tpl)
        setTplEditText(tpl.text)
        setTplIncludeMedia(!!tpl.media_file)
        setTplSendExtraFiles([])
        return
      }
      // External file drop (from file manager)
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        const newFiles = Array.from(e.dataTransfer.files)
        setAttachedFiles(prev => [...prev, ...newFiles])
        setAttachedPreviews(prev => [...prev,
          ...newFiles.map(f => (f.type.startsWith('image/') || f.type.startsWith('video/'))
            ? URL.createObjectURL(f) : '')
        ])
        setFileCaption('')
        setForceDocument(false)
        setShowFileModal(true)
      }
    }
    // Prevent WebView2 default file handling (opening dragged files)
    const preventDefault = (e: DragEvent) => { e.preventDefault() }
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  // Sound lifecycle + per-account settings live in useNotificationSound()
  const {
    soundEnabled,
    setSoundEnabled,
    playNotifSound,
    isPopupEnabled,
  } = useNotificationSound(appSettings)

  // Persist appSettings
  useEffect(() => { saveSettings(appSettings) }, [appSettings])

  const { wallpapers, wallpaperBlobUrl } = useWallpapers({
    showSettingsModal,
    chatBackground: appSettings.chatBackground,
    token: auth?.token,
  })

  // Tauri updater lifecycle lives in useTauriUpdater() above.

  // login/logout live in useAuthController() above

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

  const waSettings = useWaSettings({
    token: auth?.token,
    onAccountsChanged: loadAccounts,
  })
  const { load: loadWaSettings } = waSettings
  useEffect(() => {
    if (showSettingsModal && settingsTab === 'whatsapp') loadWaSettings()
  }, [showSettingsModal, settingsTab, loadWaSettings])

  // Link placeholder to real client (search for clients + link)
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
        loadContacts()
      }
    } catch (e) { console.error('Link client:', e) }
    setLinkLoading(false)
  }, [auth?.token, selectedClient, loadMessages, loadContacts, setIsPlaceholder])

  // Auto-load older messages when scrolling to top (IntersectionObserver)
  useEffect(() => {
    const sentinel = chatTopSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasOlderMessages && !loadingOlder && msgCursor && selectedClient) {
          loadOlderMessages(selectedClient)
        }
      },
      { root: chatContainerRef.current, rootMargin: '200px 0px 0px 0px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasOlderMessages, loadingOlder, msgCursor, loadOlderMessages])

  // Scroll to quoted message when clicking reply quote
  const scrollToReplyMessage = useCallback(async (replyToMsgId: number, peerIdHint?: number) => {
    // 1. Find message in loaded messages by tg_message_id
    const findInLoaded = () => messages.find(m =>
      m.tg_message_id === replyToMsgId && (!peerIdHint || !m.tg_peer_id || m.tg_peer_id === peerIdHint)
    )
    let target = findInLoaded()

    // 2. If not loaded — fetch older messages in loop until found or exhausted
    if (!target && hasOlderMessages && msgCursor) {
      const el = chatContainerRef.current
      let cursor = msgCursor
      let attempts = 0
      while (!target && cursor && attempts < 10) {
        attempts++
        try {
          const params = new URLSearchParams({ per_page: '100', before: cursor })
          if (selectedAccount) params.set('account', selectedAccount)
          const resp = await authFetch(
            `${API_BASE}/telegram/contacts/${selectedClient}/messages/?${params}`,
            auth?.token || ''
          )
          if (!resp.ok) break
          const data = await resp.json()
          const older: ChatMessage[] = data.results || []
          if (older.length === 0) { setHasOlderMessages(false); setMsgCursor(null); break }

          const prevScrollHeight = el ? el.scrollHeight : 0
          const prevScrollTop = el ? el.scrollTop : 0
          setMessages(prev => [...older, ...prev])
          cursor = data.next_cursor ?? null
          setMsgCursor(cursor)
          setHasOlderMessages(!!cursor || !!data.has_more)

          // Wait for DOM update
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          if (el) {
            el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight)
          }

          target = older.find(m =>
            m.tg_message_id === replyToMsgId && (!peerIdHint || !m.tg_peer_id || m.tg_peer_id === peerIdHint)
          )
        } catch (e) { console.error('scrollToReply load:', e); break }
      }
    }

    // 3. Scroll to target and highlight
    if (target) {
      setTimeout(() => {
        const el = document.querySelector(`[data-msg-id="${target!.id}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('search-active')
          setTimeout(() => el.classList.remove('search-active'), 2000)
        }
      }, 50)
    }
  }, [messages, hasOlderMessages, msgCursor, selectedAccount, selectedClient, auth?.token])

  // Send message (text, file, voice/video note)
  // Helper: build FormData for one send request
  const _buildSendFd = useCallback((opts: {
    text?: string
    file?: File | Blob
    fileName?: string
    mediaType?: string
    forceDoc?: boolean
    replyMsgId?: string | number
    clientId?: string
    accountId?: string
  }) => {
    const fd = new FormData()
    if (opts.file) {
      fd.append('file', opts.file, opts.fileName || (opts.file instanceof File ? opts.file.name : 'file'))
      if (opts.text) fd.append('text', opts.text)
      if (opts.forceDoc) fd.append('force_document', '1')
    } else if (opts.text) {
      fd.append('text', opts.text)
    }
    if (opts.mediaType) fd.append('media_type', opts.mediaType)
    if (opts.replyMsgId) fd.append('reply_to_msg_id', String(opts.replyMsgId))
    // Account routing
    const clientId = opts.clientId || selectedClient
    const accountId = opts.accountId || selectedAccount
    const contact = contactsRef.current.find(c => c.client_id === clientId)
    if (accountId) {
      const isWaAccount = accounts.some(a => a.id === accountId && a.type === 'whatsapp')
      const isTgContact = contact?.has_telegram
      if (isWaAccount && isTgContact) {
        fd.append('source', 'telegram')
      } else {
        fd.append('account_id', accountId)
      }
    }
    return fd
  }, [selectedClient, selectedAccount, accounts])

  const clearAttachment = useCallback(() => {
    attachedPreviews.forEach(p => { if (p) URL.revokeObjectURL(p) })
    setAttachedFiles([])
    setAttachedPreviews([])
    setShowFileModal(false)
    setFileCaption('')
    setForceDocument(false)
  }, [attachedPreviews])

  const sendWhatsAppTextWithUx = useCallback(async (opts: {
    clientId: string
    accountId: string
    token: string
    text: string
    replyMsgId?: string | number
    tempId?: string
    replyToText?: string
    replyToSender?: string
  }) => {
    const tempId = opts.tempId || `wa_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const accountLabel = accounts.find(a => a.id === opts.accountId)?.label || opts.accountId

    if (!opts.tempId) {
      const optimistic: ChatMessage = {
        id: tempId,
        source: 'whatsapp',
        direction: 'sent',
        text: opts.text,
        has_media: false,
        media_type: '',
        media_file: '',
        thumbnail: '',
        message_date: new Date().toISOString(),
        account_label: accountLabel,
        account_id: opts.accountId,
        reply_to_msg_id: null,
        reply_to_text: opts.replyToText || '',
        reply_to_sender: opts.replyToSender || '',
        local_status: 'sending',
        retry_data: { text: opts.text, replyMsgId: opts.replyMsgId },
      }
      setMessages(prev => [...prev, optimistic])
      requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        local_status: 'sending',
        local_error: '',
        message_date: new Date().toISOString(),
      } : m))
    }

    try {
      const fd = _buildSendFd({ text: opts.text, replyMsgId: opts.replyMsgId })
      const sendUrl = `${API_BASE}/telegram/contacts/${opts.clientId}/send/`
      const resp = await authFetch(sendUrl, opts.token, { method: 'POST', body: fd })
      if (!resp.ok) throw new Error(await resp.text().catch(() => `${resp.status}`))
      setMessages(prev => prev.filter(m => m.id !== tempId))
      loadMessages(opts.clientId)
      telemetry.trackChatWrite(opts.clientId, opts.accountId, 'text')
      return true
    } catch (e: any) {
      const errMsg = e?.message || String(e)
      console.error('WA send:', errMsg)
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        local_status: 'failed',
        local_error: errMsg,
        retry_data: { text: opts.text, replyMsgId: opts.replyMsgId },
      } : m))
      return false
    }
  }, [_buildSendFd, accounts, loadMessages])

  const retryFailedMessage = useCallback(async (messageId: number | string) => {
    if (!selectedClient || !selectedAccount || !auth?.token) return
    const msg = messages.find(m => m.id === messageId)
    if (!msg?.retry_data) return
    await sendWhatsAppTextWithUx({
      clientId: selectedClient,
      accountId: selectedAccount,
      token: auth.token,
      text: msg.retry_data.text,
      replyMsgId: msg.retry_data.replyMsgId,
      tempId: String(msg.id),
      replyToText: msg.reply_to_text,
      replyToSender: msg.reply_to_sender,
    })
  }, [selectedClient, selectedAccount, auth?.token, messages, sendWhatsAppTextWithUx])

  const runBgUpload = useCallback(async (upload: BgUpload, token: string) => {
    try {
      setBgUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'uploading', errorMsg: '' } : u))
      const sendUrl = `${API_BASE}/telegram/contacts/${upload.clientId}/send/`
      const isWaAccount = accounts.some(a => a.id === upload.accountId && a.type === 'whatsapp')

      if (upload.files && upload.files.length === 1 && !upload.directFile) {
        const file = upload.files[0]
        const fd = _buildSendFd({
          text: upload.caption,
          file,
          fileName: file instanceof File ? file.name : 'file',
          forceDoc: upload.forceDoc,
          replyMsgId: upload.replyMsgId,
          clientId: upload.clientId,
          accountId: upload.accountId,
        })
        const resp = await authFetch(sendUrl, token, { method: 'POST', body: fd })
        if (!resp.ok) throw new Error(await resp.text().catch(() => `${resp.status}`))
      } else if (upload.files && upload.files.length === 1 && upload.directFile) {
        const file = upload.files[0]
        const name = file instanceof File ? file.name : (upload.mediaType === 'voice' ? 'voice.webm' : 'video.webm')
        const fd = _buildSendFd({
          text: upload.caption,
          file,
          fileName: name,
          mediaType: upload.mediaType,
          replyMsgId: upload.replyMsgId,
          clientId: upload.clientId,
          accountId: upload.accountId,
        })
        const resp = await authFetch(sendUrl, token, { method: 'POST', body: fd })
        if (!resp.ok) throw new Error(await resp.text().catch(() => `${resp.status}`))
      } else if (upload.files && upload.files.length > 1 && isWaAccount) {
        for (let i = 0; i < upload.files.length; i++) {
          const file = upload.files[i]
          const fd = _buildSendFd({
            text: i === 0 ? upload.caption : '',
            file,
            fileName: file instanceof File ? file.name : `file_${i + 1}`,
            forceDoc: upload.forceDoc,
            replyMsgId: i === 0 ? upload.replyMsgId : undefined,
            clientId: upload.clientId,
            accountId: upload.accountId,
          })
          const resp = await authFetch(sendUrl, token, { method: 'POST', body: fd })
          if (!resp.ok) throw new Error(await resp.text().catch(() => `${resp.status}`))
        }
      } else {
        const albumFd = new FormData()
        albumFd.append('account_id', upload.accountId)
        if (upload.caption) albumFd.append('caption', upload.caption)
        if (upload.forceDoc) albumFd.append('force_document', '1')
        for (const f of (upload.files || [])) albumFd.append('files', f)
        const albumUrl = `${API_BASE}/telegram/contacts/${upload.clientId}/send-album/`
        const resp = await authFetch(albumUrl, token, { method: 'POST', body: albumFd })
        if (!resp.ok) throw new Error(await resp.text().catch(() => `${resp.status}`))
      }

      setBgUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'done' as const } : u))
      setTimeout(() => setBgUploads(prev => prev.filter(u => u.id !== upload.id)), 4000)
      telemetry.trackChatWrite(upload.clientId, upload.accountId, 'media')
    } catch (e: any) {
      console.error('Background upload:', e)
      setBgUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'error' as const, errorMsg: e.message || String(e) } : u))
    }
  }, [_buildSendFd, accounts])

  const retryBgUpload = useCallback(async (uploadId: string) => {
    if (!auth?.token) return
    const upload = bgUploads.find(u => u.id === uploadId)
    if (!upload) return
    await runBgUpload(upload, auth.token)
  }, [auth?.token, bgUploads, runBgUpload])

  const sendMessage = useCallback(async (file?: File | Blob, mediaType?: string) => {
    if (!selectedClient || !auth?.token || sending) return
    if (!selectedAccount) {
      setShowSelectAccountHint(true)
      return
    }
    const text = messageText.trim()
    const filesToSend = file ? [file] : attachedFiles.length > 0 ? attachedFiles : []
    if (!text && filesToSend.length === 0) return
    setSending(true)

    // Edit mode — no files
    if (editingMsg && text && filesToSend.length === 0) {
      if (editingMsg.source === 'whatsapp') {
        setEditingMsg(null)
        setSending(false)
        alert('Редагування WhatsApp-повідомлень ще не підтримується')
        return
      }
      try {
        const resp = await authFetch(`${API_BASE}/telegram/edit-message/`, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: selectedAccount,
            peer_id: contacts.find(c => c.client_id === selectedClient)?.tg_peer_id || editingMsg.tg_peer_id,
            message_id: editingMsg.tg_message_id,
            text,
          }),
        })
        if (resp.ok) {
          setMessages(prev => prev.map(m =>
            m.id === editingMsg.id ? { ...m, text, is_edited: true, original_text: m.original_text || m.text } : m
          ))
          setMessageText('')
          setEditingMsg(null)
          if (chatInputRef.current) chatInputRef.current.style.height = 'auto'
        }
      } catch (e) { console.error('Edit:', e) }
      finally { setSending(false) }
      return
    }

    const replyTo = (window as any).__replyTo
    const replyMsgId = replyTo?.msg_id || undefined
    const replyPreviewText = replyTo?.text || ''
    const replyPreviewSender = replyTo?.sender || ''
    const sendUrl = `${API_BASE}/telegram/contacts/${selectedClient}/send/`
    const contact = contacts.find(c => c.client_id === selectedClient)
    const isWaRoute = !!selectedAccount && accounts.some(a => a.id === selectedAccount && a.type === 'whatsapp') && !contact?.has_telegram

    // --- Background upload for files ---
    const hasFiles = filesToSend.length > 0
    if (hasFiles) {
      // Capture state before clearing UI
      const capturedClient = selectedClient
      const capturedAccount = selectedAccount
      const capturedToken = auth.token
      const capturedCaption = fileCaption.trim() || text
      const capturedForceDoc = forceDocument
      const capturedFiles = [...filesToSend]
      const capturedFile = file
      const capturedMediaType = mediaType
      const acctLabel = accounts.find(a => a.id === selectedAccount)?.label || selectedAccount

      // Build upload ID
      const uploadId = `upload_${++bgUploadIdRef.current}`
      const fileName = capturedFiles.length === 1
        ? (capturedFiles[0] instanceof File ? capturedFiles[0].name : 'file')
        : `${capturedFiles.length} файлів`

      // Close modal & clear UI immediately
      setMessageText('')
      clearAttachment()
      setEditingMsg(null)
      ;(window as any).__replyTo = null
      if (capturedClient) { draftsRef.current.delete(capturedClient); try { localStorage.setItem('vg_drafts', JSON.stringify([...draftsRef.current])) } catch {} }
      if (chatInputRef.current) chatInputRef.current.style.height = 'auto'
      setSending(false)

      // Add to background uploads
      setBgUploads(prev => [...prev, {
        id: uploadId, clientId: capturedClient, accountId: capturedAccount,
        accountLabel: acctLabel, status: 'uploading', fileName, fileCount: capturedFiles.length,
        files: capturedFiles,
        mediaType: capturedMediaType,
        caption: capturedCaption || text,
        forceDoc: capturedForceDoc,
        replyMsgId,
        directFile: !!capturedFile,
      }])

      // Fire-and-forget upload
      ;(async () => {
        await runBgUpload({
          id: uploadId,
          clientId: capturedClient,
          accountId: capturedAccount,
          accountLabel: acctLabel,
          status: 'uploading',
          fileName,
          fileCount: capturedFiles.length,
          files: capturedFiles,
          mediaType: capturedMediaType,
          caption: capturedCaption || text,
          forceDoc: capturedForceDoc,
          replyMsgId,
          directFile: !!capturedFile,
        }, capturedToken)
      })()
      return
    }

    // --- Text-only (synchronous as before) ---
    try {
      if (isWaRoute) {
        setMessageText('')
        clearAttachment()
        setEditingMsg(null)
        ;(window as any).__replyTo = null
        if (selectedClient) { draftsRef.current.delete(selectedClient); try { localStorage.setItem('vg_drafts', JSON.stringify([...draftsRef.current])) } catch {} }
        if (chatInputRef.current) chatInputRef.current.style.height = 'auto'
        await sendWhatsAppTextWithUx({
          clientId: selectedClient,
          accountId: selectedAccount!,
          token: auth.token,
          text,
          replyMsgId,
          replyToText: replyPreviewText,
          replyToSender: replyPreviewSender,
        })
        return
      }

      const fd = _buildSendFd({ text, replyMsgId })
      const resp = await authFetch(sendUrl, auth.token, { method: 'POST', body: fd })
      if (!resp.ok) throw new Error(await resp.text().catch(() => `${resp.status}`))

      setMessageText('')
      clearAttachment()
      setEditingMsg(null)
      ;(window as any).__replyTo = null
      if (selectedClient) { draftsRef.current.delete(selectedClient); try { localStorage.setItem('vg_drafts', JSON.stringify([...draftsRef.current])) } catch {} }
      if (chatInputRef.current) chatInputRef.current.style.height = 'auto'
      loadMessages(selectedClient)
      telemetry.trackChatWrite(selectedClient, selectedAccount, 'text')
    } catch (e: any) {
      console.error('Send:', e)
      alert(`Помилка відправки: ${e.message || e}`)
    } finally {
      setSending(false)
    }
  }, [selectedClient, messageText, selectedAccount, auth?.token, sending, loadMessages, attachedFiles, fileCaption, forceDocument, _buildSendFd, clearAttachment, accounts, contacts, sendWhatsAppTextWithUx, runBgUpload])

  // Send lab results to current chat: text header + files sequentially
  const sendLabResults = useCallback(async () => {
    console.log('sendLabResults called', { selectedClient, hasToken: !!auth?.token, hasModal: !!labSendModal, selectedSize: labSendSelected.size })
    if (!selectedClient || !auth?.token || !labSendModal || labSendSelected.size === 0) {
      console.warn('sendLabResults: early return', { selectedClient, hasToken: !!auth?.token, hasModal: !!labSendModal, selectedSize: labSendSelected.size })
      return
    }
    setLabSending(true)
    const patient = labSendModal
    const results = patient.results.filter(r => labSendSelected.has(r.id))
    try {
      // 1. Send text message with patient info
      const header = `${patient.name || 'Невідомий пацієнт'}${patient.phone ? `\n${patient.phone}` : ''}${patient.dob ? `\nДата народження: ${patient.dob}` : ''}\nАналізів: ${results.length}`
      const fd = new FormData()
      fd.append('text', header)
      if (selectedAccount) fd.append('account_id', selectedAccount)
      const headerResp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
        method: 'POST', body: fd,
      })
      console.log('Lab header send:', headerResp.status, await headerResp.clone().text())
      // 2. Send each file sequentially
      for (const r of results) {
        if (!r.media_file) continue
        const url = r.media_file.startsWith('http') ? r.media_file : `${API_BASE.replace('/api', '')}${r.media_file}`
        console.log('Lab file download:', url)
        const resp = await authFetch(url, auth.token)
        if (!resp.ok) { console.warn('Lab file download failed:', resp.status); continue }
        const blob = await resp.blob()
        const ext = r.media_file.split('.').pop() || 'jpg'
        const filename = `${r.lab_result_type || 'lab'}_${new Date(r.message_date).toLocaleDateString('uk-UA').replace(/\./g, '-')}.${ext}`
        const fileFd = new FormData()
        fileFd.append('file', blob, filename)
        if (selectedAccount) fileFd.append('account_id', selectedAccount)
        const sendResp = await authFetch(`${API_BASE}/telegram/contacts/${selectedClient}/send/`, auth.token, {
          method: 'POST', body: fileFd,
        })
        console.log('Lab file send:', sendResp.status, filename)
      }
      setLabSendModal(null)
      setLabSendSelected(new Set())
      loadMessages(selectedClient)
    } catch (e) { console.error('Send lab results:', e) }
    finally { setLabSending(false) }
  }, [selectedClient, auth?.token, labSendModal, labSendSelected, selectedAccount, loadMessages])

  // === Right panel Contacts functions ===
  const loadRpClients = useCallback(async (page = 1, search = '', append = false) => {
    if (!auth?.token) return
    if (!append) setRpClientLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '30' })
      if (search) params.set('search', search)
      const resp = await authFetch(`${API_BASE}/clients/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        const results = data.results || []
        setRpClients(prev => append ? [...prev, ...results] : results)
        setRpClientTotal(data.count || 0)
        setRpClientPage(page)
        // Load TG profile photos for these clients (as blobs with auth)
        const ids = results.map((c: any) => c.id).join(',')
        if (ids) {
          try {
            const pr = await authFetch(`${API_BASE}/telegram/photos-map/?ids=${ids}`, auth.token!)
            if (pr.ok) {
              const pm: Record<string, string> = await pr.json()
              for (const [cid, path] of Object.entries(pm)) {
                if (rpClientPhotos[cid]) continue
                authFetch(`${API_BASE.replace('/api', '')}${path}`, auth.token!)
                  .then(r => r.ok ? r.blob() : null)
                  .then(blob => {
                    if (blob) {
                      setRpClientPhotos(prev => ({ ...prev, [cid]: URL.createObjectURL(blob) }))
                    }
                  })
                  .catch(() => {})
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) { console.error('Load clients:', e) }
    finally { setRpClientLoading(false) }
  }, [auth?.token])

  // Debounced search for contacts tab
  useEffect(() => {
    if (rightTab !== 'clients') return
    const timer = setTimeout(() => {
      loadRpClients(1, rpClientSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [rpClientSearch, rightTab])

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
        setRpClientInfo({ name: md.client_name || '', phone: md.client_phone || '', linked_phones: md.linked_phones || [] })
      }
    } catch (e) { console.error('Client detail:', e) }
    finally { setRpClientDetailLoading(false) }
  }, [auth?.token])

  // Client Card functions
  const loadClientCard = useCallback(async (clientId: string) => {
    if (!auth?.token) return
    setCardLoading(true)
    try {
      const [clientResp, tagsResp] = await Promise.all([
        authFetch(`${API_BASE}/clients/${clientId}/`, auth.token),
        authFetch(`${API_BASE}/client-tags/`, auth.token),
      ])
      if (clientResp.ok) { const d = await clientResp.json(); setCardData(d) }
      if (tagsResp.ok) { const t = await tagsResp.json(); setAllTags(t) }
    } catch (e) { console.error('Load client card:', e) }
    finally { setCardLoading(false) }
  }, [auth?.token])

  const saveCardField = useCallback(async (field: string, value: string) => {
    if (!auth?.token || !cardData) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${cardData.id}/update-profile/`, auth.token, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (resp.ok) { setCardData(prev => prev ? { ...prev, [field]: value } : prev) }
    } catch (e) { console.error('Save card field:', e) }
    setCardEditField(null)
  }, [auth?.token, cardData])

  const toggleCardTag = useCallback(async (tagId: string) => {
    if (!auth?.token || !cardData) return
    const current = cardData.tags?.map(t => t.id) || []
    const newIds = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]
    try {
      const resp = await authFetch(`${API_BASE}/clients/${cardData.id}/tags/`, auth.token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: newIds }),
      })
      if (resp.ok) { setCardData(prev => prev ? { ...prev, tags: allTags.filter(t => newIds.includes(t.id)) } : prev) }
    } catch (e) { console.error('Toggle tag:', e) }
  }, [auth?.token, cardData, allTags])

  const createCardTag = useCallback(async (name: string) => {
    if (!auth?.token || !name.trim()) return
    const colors = ['#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316']
    const color = colors[Math.floor(Math.random() * colors.length)]
    try {
      const resp = await authFetch(`${API_BASE}/client-tags/`, auth.token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (resp.ok) {
        const tag = await resp.json()
        setAllTags(prev => [...prev, tag])
        setNewTagName('')
      }
    } catch (e) { console.error('Create tag:', e) }
  }, [auth?.token])

  const addCardLink = useCallback(async () => {
    if (!auth?.token || !cardData || !linkUrl.trim()) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${cardData.id}/links/`, auth.token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl.trim(), title: linkTitle.trim() }),
      })
      if (resp.ok) {
        const link = await resp.json()
        setCardData(prev => prev ? { ...prev, links: [...(prev.links || []), link] } : prev)
        setLinkUrl(''); setLinkTitle(''); setShowAddLink(false)
      }
    } catch (e) { console.error('Add link:', e) }
  }, [auth?.token, cardData, linkUrl, linkTitle])

  const deleteCardLink = useCallback(async (linkId: string) => {
    if (!auth?.token || !cardData) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${cardData.id}/links/${linkId}/`, auth.token, { method: 'DELETE' })
      if (resp.ok) { setCardData(prev => prev ? { ...prev, links: prev.links?.filter(l => l.id !== linkId) } : prev) }
    } catch (e) { console.error('Delete link:', e) }
  }, [auth?.token, cardData])

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


  const playCallAudio = useCallback(async (callId: string, audioFile?: string) => {
    if (!auth?.token || !audioFile) return
    if (rpPlayingCall === callId) {
      rpAudioRef.current?.pause()
      setRpPlayingCall(null)
      return
    }
    try {
      const mediaPath = audioFile.startsWith('/media/') ? audioFile : `/media/${audioFile}`
      const url = `${API_BASE.replace('/api', '')}${mediaPath}`
      const resp = await authFetch(url, auth.token)
      if (!resp.ok) { alert('Аудіо недоступне'); return }
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      if (rpAudioRef.current) { rpAudioRef.current.pause(); URL.revokeObjectURL(rpAudioRef.current.src) }
      const audio = new Audio(blobUrl)
      rpAudioRef.current = audio
      audio.onended = () => setRpPlayingCall(null)
      audio.play()
      setRpPlayingCall(callId)
    } catch { /* ignore */ }
  }, [auth?.token, rpPlayingCall])


  // Handle file attachment
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newFiles = Array.from(files)
    setAttachedFiles(prev => [...prev, ...newFiles])
    setAttachedPreviews(prev => [
      ...prev,
      ...newFiles.map(f => (f.type.startsWith('image/') || f.type.startsWith('video/')) ? URL.createObjectURL(f) : ''),
    ])
    if (!showFileModal) {
      setFileCaption('')
      setForceDocument(false)
    }
    setShowFileModal(true)
    e.target.value = ''
  }, [showFileModal])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length === 0) return
    e.preventDefault()
    setAttachedFiles(prev => [...prev, ...files])
    setAttachedPreviews(prev => [
      ...prev,
      ...files.map(f => (f.type.startsWith('image/') || f.type.startsWith('video/')) ? URL.createObjectURL(f) : ''),
    ])
    if (!showFileModal) {
      setFileCaption('')
      setForceDocument(false)
    }
    setShowFileModal(true)
  }, [showFileModal])

  const removeAttachedFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
    setAttachedPreviews(prev => {
      if (prev[index]) URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }, [])

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

  // Load lab results grouped by patient (page=1 replaces, page>1 appends)
  const loadLabResults = useCallback(async (page = 1, search = '') => {
    if (!auth?.token) return
    if (page === 1) setLabLoading(true); else setLabLoadingMore(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      const resp = await authFetch(`${API_BASE}/telegram/lab-results/?${params}`, auth.token)
      if (resp.ok) {
        const data = await resp.json()
        const results: LabResult[] = data.results || []
        const total = data.total || results.length
        setLabPage(page)
        const perPage = 50
        setLabHasMore(page * perPage < total)
        // Group new results by patient
        const map = new Map<string, LabPatient>()
        // If appending, start with existing patients
        if (page > 1) {
          for (const p of labPatientsRef.current) map.set(p.key, { ...p, results: [...p.results] })
        }
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
        // Fetch photos for patients that have client_id
        const clientIds = [...new Set(results.map(r => r.patient_client_id).filter(Boolean))]
        if (clientIds.length > 0) {
          const photoResp = await authFetch(`${API_BASE}/telegram/photos-map/?ids=${clientIds.join(',')}`, auth.token)
          if (photoResp.ok) {
            const pm: Record<string, string> = await photoResp.json()
            setLabPatients(prev => prev.map(p => {
              const cid = p.results[0]?.patient_client_id || ''
              return pm[cid] ? { ...p, photo: pm[cid] } : p
            }))
          }
        }
      }
    } catch { /* ignore */ }
    if (page === 1) setLabLoading(false); else setLabLoadingMore(false)
  }, [auth?.token])

  // Auto-load more lab results when scrolling to bottom
  useEffect(() => {
    const sentinel = labBottomSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && labHasMore && !labLoading && !labLoadingMore) {
          loadLabResults(labPage + 1, labSearch)
        }
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [labHasMore, labLoading, labLoadingMore, labPage, labSearch, loadLabResults])

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

  // Delete client note (with confirmation)
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<string | null>(null)
  const deleteClientNote = useCallback(async (noteId: string) => {
    if (!selectedClient || !auth?.token) return
    try {
      const resp = await authFetch(`${API_BASE}/clients/${selectedClient}/notes/${noteId}/`, auth.token, {
        method: 'DELETE',
      })
      if (resp.ok || resp.status === 204) loadClientNotes(selectedClient)
    } catch { /* ignore */ }
    setDeleteNoteConfirm(null)
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

  // Rename/recolor category (inline edit)
  const saveCategory = useCallback(async (id: string, newName: string, newColor: string) => {
    if (!newName.trim() || !auth?.token) return
    try {
      await authFetch(`${API_BASE}/messenger/template-categories/${id}/`, auth.token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      loadTemplateCategories()
    } catch { /* ignore */ }
    setEditingCatId(null)
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

  // Send template to current chat: text first, then each media separately
  const sendTemplate = useCallback(async (text: string, mediaUrl: string | null, extraFiles: File[]) => {
    if (!selectedClient || !auth?.token) return
    setPreviewTpl(null)
    setTplSendExtraFiles([])
    const acctId = selectedAccount || ''
    const sendUrl = `${API_BASE}/telegram/contacts/${selectedClient}/send/`

    try {
      // Step 1: Send text message
      if (text.trim()) {
        const resp = await authFetch(sendUrl, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, account_id: acctId }),
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          console.error('sendTemplate text error:', resp.status, err)
        }
      }

      // Step 2: Send template media as separate message
      if (mediaUrl) {
        try {
          const mediaResp = await authFetch(`${API_BASE.replace('/api', '')}${mediaUrl}`, auth.token)
          if (mediaResp.ok) {
            const blob = await mediaResp.blob()
            const fileName = `template.${mediaUrl.split('.').pop() || 'bin'}`
            const fd = new FormData()
            fd.append('text', '')
            fd.append('account_id', acctId)
            fd.append('file', blob, fileName)
            await authFetch(sendUrl, auth.token, { method: 'POST', body: fd })
          }
        } catch (e) { console.error('sendTemplate media download error:', e) }
      }

      // Step 3: Send each extra file as separate message
      for (const extraFile of extraFiles) {
        const fd = new FormData()
        fd.append('text', '')
        fd.append('account_id', acctId)
        fd.append('file', extraFile, extraFile.name)
        await authFetch(sendUrl, auth.token, { method: 'POST', body: fd })
      }

      loadMessages(selectedClient)
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
    // Use ref-based dedup to avoid stale closure race conditions
    if (mediaLoadingRef.current.has(key)) return null

    const isThumb = key.startsWith('thumb_')

    // Check IndexedDB cache for thumbnails
    if (isThumb) {
      const cached = await getCached(THUMB_STORE, mediaPath)
      if (cached) {
        setMediaBlobMap(prev => ({ ...prev, [key]: cached }))
        return cached
      }
    }

    mediaLoadingRef.current.add(key)
    setMediaLoading(prev => ({ ...prev, [key]: true }))
    try {
      const url = mediaPath.startsWith('http') ? mediaPath : `${API_BASE.replace('/api', '')}${mediaPath}`
      const resp = await authFetch(url, auth.token)
      if (resp.ok) {
        let blob = await resp.blob()
        // Skip empty blobs (server returned 200 but no content)
        if (blob.size === 0) {
          mediaLoadingRef.current.delete(key)
          setMediaLoading(prev => ({ ...prev, [key]: false }))
          return null
        }
        // Convert OGG voice messages to WAV for WebView2 compatibility
        const isVoice = key.startsWith('voice_')
        if (isVoice && (mediaPath.endsWith('.ogg') || blob.type.includes('ogg'))) {
          try { blob = await oggToWav(blob) } catch (e) { console.warn('OGG convert failed:', e) }
        }
        // Cache thumbnails locally
        if (isThumb) putCache(THUMB_STORE, mediaPath, blob)
        const blobUrl = URL.createObjectURL(blob)
        setMediaBlobMap(prev => ({ ...prev, [key]: blobUrl }))
        mediaLoadingRef.current.delete(key)
        setMediaLoading(prev => ({ ...prev, [key]: false }))
        return blobUrl
      }
    } catch { /* ignore */ }
    mediaLoadingRef.current.delete(key)
    setMediaLoading(prev => ({ ...prev, [key]: false }))
    return null
  }, [auth?.token, mediaBlobMap])

  const inferExtensionFromContentType = useCallback((contentType: string) => {
    const ct = (contentType || '').toLowerCase().split(';')[0].trim()
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
    }
    return map[ct] || ''
  }, [])

  const getFilenameFromResponse = useCallback((mediaPath: string, resp: Response, fallbackBase = 'file') => {
    const cd = resp.headers.get('content-disposition') || ''
    const quoted = cd.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i)
    const rawName = decodeURIComponent((quoted?.[1] || quoted?.[2] || '').trim())
    const pathName = (() => {
      try {
        const noQuery = mediaPath.split('?')[0]
        const last = noQuery.split('/').pop() || ''
        return decodeURIComponent(last)
      } catch {
        return mediaPath.split('?')[0].split('/').pop() || ''
      }
    })()
    const preferred = rawName || pathName || fallbackBase
    const clean = preferred.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').trim() || fallbackBase
    if (/\.[a-z0-9]{1,8}$/i.test(clean)) return clean
    const inferredExt = inferExtensionFromContentType(resp.headers.get('content-type') || '')
    return inferredExt ? `${clean}.${inferredExt}` : clean
  }, [inferExtensionFromContentType])

  const openFetchedFile = useCallback(async (mediaPath: string, fallbackBase = 'file') => {
    if (!auth?.token) return
    const url = mediaPath.startsWith('http') ? mediaPath : `${API_BASE.replace('/api', '')}${mediaPath}`
    const resp = await authFetch(url, auth.token)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const contentType = resp.headers.get('content-type') || blob.type || ''
    if (contentType.startsWith('image/')) {
      setLightboxSrc(URL.createObjectURL(blob))
      return
    }
    // PDF → save to temp and open with system viewer
    if (contentType === 'application/pdf' || mediaPath.toLowerCase().endsWith('.pdf')) {
      const pdfName = getFilenameFromResponse(mediaPath, resp, 'document')
      const finalName = pdfName.toLowerCase().endsWith('.pdf') ? pdfName : pdfName + '.pdf'
      const tmp = await tempDir()
      const filePath = await join(tmp, finalName)
      const buf = new Uint8Array(await blob.arrayBuffer())
      await writeFile(filePath, buf)
      await shellOpen(filePath)
      return
    }
    const filename = getFilenameFromResponse(mediaPath, resp, fallbackBase)
    const tmp = await tempDir()
    const filePath = await join(tmp, filename)
    const buf = new Uint8Array(await blob.arrayBuffer())
    await writeFile(filePath, buf)
    await shellOpen(filePath)
  }, [auth?.token, getFilenameFromResponse])

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
        const safeName = filename.split('?')[0]
        const ext = safeName.includes('.') ? safeName.split('.').pop() || '' : inferExtensionFromContentType(resp.headers.get('content-type') || '')
        const filePath = await save({
          defaultPath: safeName || 'file',
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
  }, [auth?.token, inferExtensionFromContentType])

  // Open media in default app (PDF → browser, images → lightbox)
  const openMedia = useCallback(async (mediaPath: string, mediaType: string, messageId: number | string) => {
    if (!auth?.token) return
    const isImage = mediaType === 'photo' || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(mediaPath)

    if (isImage) {
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
      const docKey = `doc_${mediaPath}`
      setMediaLoading(prev => ({ ...prev, [docKey]: true }))
      try {
        await openFetchedFile(mediaPath, mediaPath.split('?')[0].split('/').pop() || 'file')
      } catch (err) {
        console.error('openMedia document failed:', err)
      }
      setMediaLoading(prev => ({ ...prev, [docKey]: false }))
    }
  }, [auth?.token, mediaBlobMap, loadMediaBlob, openFetchedFile])

  // Auto-load video notes for inline autoplay (muted, like Telegram)
  useEffect(() => {
    const vnotes = messages.filter(m => m.media_type === 'video_note' && m.media_file && !mediaBlobMap[`vid_${m.id}`])
    for (const m of vnotes.slice(-6)) { // load last 6 visible
      loadMediaBlob(`vid_${m.id}`, m.media_file)
    }
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Enter select mode from context menu (multi-select)
  const ctxMenuSelect = useCallback(() => {
    if (!ctxMenu) return
    setForwardMode(true)
    toggleMsgSelection(ctxMenu.messageId)
    setCtxMenu(null)
  }, [ctxMenu, toggleMsgSelection])

  // Bulk copy selected messages text
  const bulkCopyMessages = useCallback(() => {
    const selected = messages.filter(m => selectedMsgIds.has(m.id))
    const text = selected.map(m => {
      const time = new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      const dir = m.direction === 'sent' ? '→' : '←'
      return `[${time}] ${dir} ${m.text || (m.media_type ? `[${m.media_type}]` : '')}`
    }).join('\n')
    navigator.clipboard.writeText(text)
    exitForwardMode()
  }, [messages, selectedMsgIds, exitForwardMode])

  // Bulk delete selected sent messages
  const bulkDeleteMessages = useCallback(async () => {
    if (!auth?.token || !selectedAccount || selectedMsgIds.size === 0) return
    const selectedSent = messages.filter(m => selectedMsgIds.has(m.id) && m.direction === 'sent')
    const tgMsgs = selectedSent.filter(m => m.tg_message_id && m.tg_peer_id)
    const waMsgs = selectedSent.filter(m => m.source === 'whatsapp')
    if (tgMsgs.length === 0 && waMsgs.length === 0) return
    const ok = window.confirm(`Видалити ${tgMsgs.length + waMsgs.length} повідомлень?`)
    if (!ok) return
    // Group by peer_id and delete in batches
    const byPeer = new Map<number, number[]>()
    for (const msg of tgMsgs) {
      const list = byPeer.get(msg.tg_peer_id!) || []
      list.push(msg.tg_message_id!)
      byPeer.set(msg.tg_peer_id!, list)
    }
    for (const [peerId, msgIds] of byPeer) {
      try {
        await authFetch(`${API_BASE}/telegram/delete-message/`, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: selectedAccount, peer_id: peerId, message_ids: msgIds }),
        })
      } catch { /* continue */ }
    }
    for (const msg of waMsgs) {
      try {
        await authFetch(`${API_BASE}/whatsapp/delete-message/`, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: selectedAccount, message_id: String(msg.id) }),
        })
      } catch { /* continue */ }
    }
    exitForwardMode()
    if (selectedClient) loadMessages(selectedClient)
  }, [auth?.token, selectedAccount, selectedMsgIds, messages, exitForwardMode, selectedClient, loadMessages])

  // Lab assign: open modal from context menu
  const ctxMenuLabAssign = useCallback(() => {
    if (!ctxMenu) return
    const msg = messages.find(m => m.id === ctxMenu.messageId)
    if (msg) { setLabAssignMsg(msg); setLabAssignSearch(''); setLabAssignResults([]) }
    setCtxMenu(null)
  }, [ctxMenu, messages])

  // Reply to message from context menu
  const ctxMenuReply = useCallback(() => {
    if (!ctxMenu) return
    const msg = messages.find(m => m.id === ctxMenu.messageId)
    if (msg) {
      setEditingMsg(null)
      const mediaLabels: Record<string, string> = { photo: 'Фото', video: 'Відео', video_note: 'Відеоповідомлення', voice: 'Голосове повідомлення', sticker: 'Стікер', document: 'Документ' }
      const replyPreview = msg.text?.slice(0, 80) || (msg.has_media && msg.media_type ? mediaLabels[msg.media_type] || 'Медіа' : '...')
      const contact = contacts.find(c => c.client_id === selectedClient)
      const sender = msg.direction === 'sent' ? 'Ви' : (contact?.full_name || contact?.phone || '')
      const replyTargetId = msg.source === 'whatsapp'
        ? msg.id
        : msg.tg_message_id
      ;(window as any).__replyTo = { msg_id: replyTargetId, text: replyPreview, sender }
    }
    setCtxMenu(null)
    chatInputRef.current?.focus()
  }, [ctxMenu, messages, contacts, selectedClient])

  // Edit own message from context menu
  const ctxMenuEdit = useCallback(() => {
    if (!ctxMenu) return
    const msg = messages.find(m => m.id === ctxMenu.messageId)
    if (msg && msg.direction === 'sent' && msg.source !== 'whatsapp') {
      setEditingMsg(msg)
      setMessageText(msg.text || '')
      ;(window as any).__replyTo = null
    }
    setCtxMenu(null)
    chatInputRef.current?.focus()
  }, [ctxMenu, messages])

  // Pin/unpin message from context menu
  const ctxMenuPin = useCallback(async () => {
    if (!ctxMenu || !auth?.token || !selectedAccount) return
    const msg = messages.find(m => m.id === ctxMenu.messageId)
    if (!msg?.tg_message_id || !msg?.tg_peer_id) { setCtxMenu(null); return }
    const action = msg.is_pinned ? 'unpin' : 'pin'
    try {
      const resp = await authFetch(`${API_BASE}/telegram/pin-message/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, peer_id: msg.tg_peer_id, message_id: msg.tg_message_id, action }),
      })
      if (resp.ok) {
        setMessages(prev => prev.map(m => {
          if (action === 'pin') return { ...m, is_pinned: m.id === msg.id }
          return m.id === msg.id ? { ...m, is_pinned: false } : m
        }))
      }
    } catch (e) { console.error('Pin error:', e) }
    setCtxMenu(null)
  }, [ctxMenu, messages, auth?.token, selectedAccount])

  // Copy text to clipboard
  const ctxMenuCopy = useCallback(() => {
    if (!ctxMenu) return
    const msg = messages.find(m => m.id === ctxMenu.messageId)
    if (msg?.text) navigator.clipboard.writeText(msg.text).catch(() => {})
    setCtxMenu(null)
  }, [ctxMenu, messages])

  // Send reaction
  const sendReaction = useCallback(async (msgId: number | string, emoji: string) => {
    if (!auth?.token) return
    if (!selectedAccount) {
      setCtxMenu(null)
      setShowSelectAccountHint(true)
      return
    }
    const msg = messages.find(m => m.id === msgId)
    try {
      if (msg?.source === 'whatsapp') {
        await authFetch(`${API_BASE}/whatsapp/send-reaction/`, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: selectedAccount,
            message_id: String(msg.id),
            emoji,
          }),
        })
      } else {
        if (!msg?.tg_message_id) return
        const contact = contacts.find(c => c.client_id === selectedClient)
        const peerId = contact?.tg_peer_id || msg.tg_peer_id
        if (!peerId) return
        await authFetch(`${API_BASE}/telegram/send-reaction/`, auth.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: selectedAccount,
            peer_id: peerId,
            message_id: msg.tg_message_id,
            emoji,
          }),
        })
      }
      // Optimistic update — replace previous chosen reaction
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m
        const others = (m.reactions || []).filter(r => !r.chosen)
        const updated = emoji ? [...others, { emoji, count: 1, chosen: true }] : others
        return { ...m, reactions: updated }
      }))
    } catch (e) { console.error('Reaction error:', e) }
    setCtxMenu(null)
  }, [auth?.token, selectedAccount, messages, contacts, selectedClient])

  // Delete message
  const deleteMessage = useCallback(async (target: { msgId: number | string; source: 'telegram' | 'whatsapp'; tgMsgId?: number; peerId?: number }) => {
    if (!auth?.token || !selectedAccount) return
    try {
      const isWhatsapp = target.source === 'whatsapp'
      const resp = await authFetch(
        `${API_BASE}/${isWhatsapp ? 'whatsapp/delete-message/' : 'telegram/delete-message/'}`,
        auth.token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isWhatsapp
              ? { account_id: selectedAccount, message_id: String(target.msgId) }
              : { account_id: selectedAccount, peer_id: target.peerId, message_ids: [target.tgMsgId] }
          ),
        }
      )
      const data = resp.ok ? await resp.json() : null
      const deletedBy = data?.deleted_by || auth.name || 'Ви'
      const deletedAt = data?.deleted_at || new Date().toISOString()
      // Optimistic update — message stays visible with deleted mark
      setMessages(prev => prev.map(m =>
        (isWhatsapp ? String(m.id) === String(target.msgId) : m.tg_message_id === target.tgMsgId)
          ? { ...m, is_deleted: true, deleted_at: deletedAt, deleted_by_peer_name: deletedBy }
          : m
      ))
    } catch (e) { console.error('Delete error:', e) }
    setDeleteConfirm(null)
  }, [auth?.token, selectedAccount])

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

  // Load accounts on auth + init telemetry
  useEffect(() => {
    if (auth?.authorized && auth.token) {
      loadAccounts()
      loadTemplateCategories()
      telemetry.init(auth.token)
      return () => { telemetry.stop() }
    }
  }, [auth?.authorized, loadAccounts, loadTemplateCategories])

  // Load contacts with debounce on search change
  useEffect(() => {
    if (!auth?.authorized) return
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(loadContacts, 300)
    return () => clearTimeout(searchTimerRef.current)
  }, [search, selectedAccount, auth?.authorized, loadContacts])

  // Poll updates every 30s, but only when WS is stale (>30s without activity).
  // Initial call runs once so startup state is populated before WS connects.
  useEffect(() => {
    if (!auth?.authorized) return
    loadUpdates()
    const iv = setInterval(() => {
      const wsStale = Date.now() - wsLastActivityRef.current >= 30000
      if (wsStale) loadUpdates()
    }, 30000)
    return () => clearInterval(iv)
  }, [auth?.authorized, loadUpdates])

  // Refs for stable WS callbacks (avoid reconnecting WS on every state change)
  const loadContactsRef = useRef(loadContacts)
  const loadMessagesRef = useRef(loadMessages)
  const soundEnabledRef = useRef(soundEnabled)
  const contactsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMessagesRefreshRef = useRef<{ clientId: string; scrollToEnd: boolean } | null>(null)
  const addToastRef = useRef<(clientId: string, accountId: string, sender: string, account: string, text: string, hasMedia: boolean, mediaType: string) => void>(() => {})
  useEffect(() => { loadContactsRef.current = loadContacts }, [loadContacts])
  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])
  const appSettingsRef = useRef(appSettings)
  useEffect(() => { appSettingsRef.current = appSettings }, [appSettings])

  const scheduleContactsRefresh = useCallback((delay = 250) => {
    if (contactsRefreshTimerRef.current) return
    contactsRefreshTimerRef.current = setTimeout(() => {
      contactsRefreshTimerRef.current = null
      loadContactsRef.current()
    }, delay)
  }, [])

  const scheduleMessagesRefresh = useCallback((clientId: string, scrollToEnd = false, delay = 120) => {
    const pending = pendingMessagesRefreshRef.current
    if (pending?.clientId === clientId) {
      pending.scrollToEnd = pending.scrollToEnd || scrollToEnd
    } else {
      pendingMessagesRefreshRef.current = { clientId, scrollToEnd }
    }
    if (messagesRefreshTimerRef.current) return
    messagesRefreshTimerRef.current = setTimeout(() => {
      messagesRefreshTimerRef.current = null
      const next = pendingMessagesRefreshRef.current
      pendingMessagesRefreshRef.current = null
      if (next) {
        loadMessagesRef.current(next.clientId, next.scrollToEnd)
      }
    }, delay)
  }, [])

  const sendTypingIndicator = useCallback(() => {
    if (!selectedClient || !selectedAccount) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const now = Date.now()
    const key = `${selectedAccount}:${selectedClient}`
    if (now - (typingSentAtRef.current[key] || 0) < 3000) return
    typingSentAtRef.current[key] = now
    try {
      ws.send(JSON.stringify({
        type: 'typing',
        account_id: selectedAccount,
        client_id: selectedClient,
      }))
    } catch {}
  }, [selectedAccount, selectedClient])

  useEffect(() => {
    return () => {
      if (contactsRefreshTimerRef.current) {
        clearTimeout(contactsRefreshTimerRef.current)
        contactsRefreshTimerRef.current = null
      }
      if (messagesRefreshTimerRef.current) {
        clearTimeout(messagesRefreshTimerRef.current)
        messagesRefreshTimerRef.current = null
      }
      for (const timer of Object.values(typingClearTimersRef.current)) {
        clearTimeout(timer)
      }
      typingClearTimersRef.current = {}
      pendingMessagesRefreshRef.current = null
    }
  }, [])

  // getAccountSettings / playNotifSound / isPopupEnabled now come from useNotificationSound()

  // Chat search — find matching message IDs
  useEffect(() => {
    if (!chatSearchQuery.trim()) {
      setChatSearchResults([])
      setChatSearchIdx(0)
      return
    }
    const q = chatSearchQuery.toLowerCase()
    const ids: number[] = []
    messages.forEach(m => {
      if (m.text && m.text.toLowerCase().includes(q)) ids.push(m.id as number)
    })
    setChatSearchResults(ids) // now stores message IDs
    setChatSearchIdx(0)
    // Scroll to first match
    if (ids.length > 0) {
      setTimeout(() => {
        const msgEl = document.querySelector(`[data-msg-id="${ids[0]}"]`)
        if (msgEl) msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 50)
    }
  }, [chatSearchQuery, messages])

  // Reset search when changing client
  useEffect(() => {
    setChatSearchOpen(false)
    setChatSearchQuery('')
  }, [selectedClient])

  // addToastRef updated below after addToast is defined

  // Messenger WebSocket ownership lives entirely in useMessengerWebSocket().
  const { wsRef, wsLastActivityRef } = useMessengerWebSocket({
    token: auth?.token,
    authorized: !!auth?.authorized,
    selectedClientRef,
    contactsRef,
    messagesRef,
    wsDedupRef: wsDedup,
    typingClearTimersRef,
    loadContactsRef,
    setMessages,
    setTypingIndicators,
    setPeerPresence,
    setNewChatClient,
    setAccountUnreads,
    scheduleMessagesRefresh,
    scheduleContactsRefresh,
    addToast,
    isPopupEnabled,
    playNotifSound,
    voipApplyWsEvent,
    accounts,
  })


  const addToastViaRef = useCallback<(...args: Parameters<typeof addToast>) => void>((...args) => {
    addToastRef.current(...args)
  }, [])
  useGmailNotifications({
    authorized: !!auth?.authorized,
    token: auth?.token,
    gmailAccounts,
    isPopupEnabled,
    playNotifSound,
    addToast: addToastViaRef,
  })

  // Compute unread (uses updates for external change detection)
  const isUnread = useCallback((contact: Contact) => {
    if (!contact.last_message_date || contact.last_message_direction !== 'received') return false
    const readTs = getReadTs()
    const routeKey = makeReadTsKey(contact.client_id, selectedAccount)
    const read = readTs[routeKey] || readTs[contact.client_id]
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
  const chatDisplay = resolveContactDisplay(chatContact ? {
    full_name: clientName && !isPlaceholderName(clientName) ? clientName : chatContact.full_name,
    phone: clientPhone && !isPlaceholderPhone(clientPhone) ? clientPhone : chatContact.phone,
    tg_name: (chatContact as any).tg_name,
    tg_username: (chatContact as any).tg_username,
    linked_phones: (chatContact as any)?.linked_phones,
  } : undefined)
  // Clear newChatClient when contact appears in the real list
  useEffect(() => {
    if (newChatClient && contacts.some(c => c.client_id === newChatClient.client_id)) {
      setNewChatClient(null)
    }
  }, [contacts, newChatClient])

  // Fetch group/channel info (participants_count, online_count, about, is_broadcast) + notify settings
  useEffect(() => {
    const ct = (chatContact as any)?.chat_type
    if (!ct || ct === 'private' || !auth?.token || !selectedAccount) {
      setGroupInfo(null)
      setChatMuted(false)
      return
    }
    const peerId = (chatContact as any)?.tg_peer_id
    if (!peerId) { setGroupInfo(null); setChatMuted(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const [infoRes, notifyRes] = await Promise.all([
          authFetch(`${API_BASE}/telegram/group-info/?account_id=${selectedAccount}&peer_id=${peerId}`, auth!.token),
          authFetch(`${API_BASE}/telegram/notify-settings/?account_id=${selectedAccount}&peer_id=${peerId}`, auth!.token),
        ])
        if (cancelled) return
        if (infoRes.ok) {
          const data = await infoRes.json()
          if (!cancelled) setGroupInfo(data)
        }
        if (notifyRes.ok) {
          const notifyData = await notifyRes.json()
          if (!cancelled) setChatMuted(!!notifyData.muted)
        }
      } catch { if (!cancelled) { setGroupInfo(null); setChatMuted(false) } }
    })()
    return () => { cancelled = true }
  }, [selectedClient, selectedAccount, (chatContact as any)?.chat_type])

  // Group messages + notes by date
  const groupedMessages: (ChatMessage | AlbumGroup | ClientNote & { _isNote: true } | { type: 'date'; date: string })[] = useMemo(() => {
    // Merge messages and notes into a single timeline
    type Item = { date: string; kind: 'msg'; data: ChatMessage } | { date: string; kind: 'note'; data: ClientNote }
    const items: Item[] = []
    for (const m of messages) items.push({ date: m.message_date, kind: 'msg', data: m })
    for (const n of clientNotes) items.push({ date: n.created_at, kind: 'note', data: n })
    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const result: (ChatMessage | AlbumGroup | ClientNote & { _isNote: true } | { type: 'date'; date: string })[] = []
    let lastDateStr = ''
    // Collect album groups: media_group_id → messages
    const albumMap = new Map<number, ChatMessage[]>()
    const albumFirst = new Set<number>() // track first occurrence index
    for (const item of items) {
      if (item.kind === 'msg' && item.data.media_group_id) {
        const gid = item.data.media_group_id
        if (!albumMap.has(gid)) albumMap.set(gid, [])
        albumMap.get(gid)!.push(item.data)
      }
    }
    // Filter duplicate documents when album also has photo version (e.g. Canon CR2 RAW
    // sent alongside compressed JPEG preview). Telegram-native behavior — show only
    // photo, document is the same content as separate downloadable file.
    const filteredAlbumMap = new Map<number, ChatMessage[]>()
    const skippedMessageIds = new Set<string | number>()
    for (const [gid, msgs] of albumMap) {
      const hasPhoto = msgs.some(m => m.media_type === 'photo')
      if (hasPhoto) {
        const filtered: ChatMessage[] = []
        for (const m of msgs) {
          if (m.media_type === 'document') {
            skippedMessageIds.add(m.id)
          } else {
            filtered.push(m)
          }
        }
        filteredAlbumMap.set(gid, filtered)
      } else {
        filteredAlbumMap.set(gid, msgs)
      }
    }
    // Only treat as album if 2+ messages in group (after filtering)
    const validAlbums = new Set<number>()
    for (const [gid, msgs] of filteredAlbumMap) {
      if (msgs.length >= 2) validAlbums.add(gid)
    }

    for (const item of items) {
      const d = formatDateSeparator(item.date)
      if (d !== lastDateStr) {
        result.push({ type: 'date', date: d })
        lastDateStr = d
      }
      if (item.kind === 'note') {
        result.push({ ...item.data, _isNote: true } as ClientNote & { _isNote: true })
      } else {
        const m = item.data
        if (skippedMessageIds.has(m.id)) continue
        if (m.media_group_id && validAlbums.has(m.media_group_id)) {
          // Only emit album on first message of group
          if (!albumFirst.has(m.media_group_id)) {
            albumFirst.add(m.media_group_id)
            const albumMsgs = filteredAlbumMap.get(m.media_group_id)!
            // Caption = text of last message in album (TG sends caption on last)
            const caption = albumMsgs.find(am => am.text && am.media_type !== 'contact')?.text || ''
            result.push({
              type: 'album',
              media_group_id: m.media_group_id,
              messages: albumMsgs,
              direction: m.direction as 'sent' | 'received',
              message_date: albumMsgs[albumMsgs.length - 1].message_date,
              caption,
              source: m.source,
            })
          }
          // Skip individual messages that are part of an album
        } else {
          result.push(m)
        }
      }
    }
    return result
  }, [messages, clientNotes])

  // Pinned message — find last pinned message in current chat
  const pinnedMessage = useMemo(() => {
    return messages.find(m => m.is_pinned) || null
  }, [messages])

  // Select client handler
  const selectClient = useCallback((clientId: string, opts?: { accountId?: string; jumpToMessageId?: string | number }) => {
    // Save scroll position for current client
    if (selectedClient && chatContainerRef.current) {
      const el = chatContainerRef.current
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      // Only save position if NOT at the bottom (bottom = default)
      if (!isAtBottom) {
        scrollPositionsRef.current.set(selectedClient, el.scrollTop)
      } else {
        scrollPositionsRef.current.delete(selectedClient)
      }
    }
    // Save draft for current client before switching
    if (selectedClient && messageText.trim()) {
      draftsRef.current.set(selectedClient, { text: messageText, replyTo: (window as any).__replyTo || undefined })
    } else if (selectedClient) {
      draftsRef.current.delete(selectedClient)
    }
    try { localStorage.setItem('vg_drafts', JSON.stringify([...draftsRef.current])) } catch {}
    // Restore draft for new client
    const draft = draftsRef.current.get(clientId)
    setMessageText(draft?.text || '')
    if (draft?.replyTo) (window as any).__replyTo = draft.replyTo
    else (window as any).__replyTo = null
    setEditingMsg(null)

    const nextAccountId = (opts?.accountId || '').trim()
    const accountChanged = !!nextAccountId && nextAccountId !== selectedAccount
    if (opts?.jumpToMessageId !== undefined && opts?.jumpToMessageId !== null) {
      pendingSearchJumpRef.current = { messageDomId: String(opts.jumpToMessageId) }
    }
    if (accountChanged) {
      pendingSearchOpenRef.current = { clientId, accountId: nextAccountId }
      setSelectedAccount(nextAccountId)
    }

    setSelectedClient(clientId)
    setSelectedGmail(null)
    setGmailSelectedMsg(null)
    setAudioBlobMap({})
    setMediaBlobMap({})
    setExpandedCallId(null)
    setCardData(null) // Reset card data for new client
    // Mark as read immediately
    setReadTs(clientId, new Date().toISOString(), nextAccountId || selectedAccount)
    if (!accountChanged) {
      loadMessages(clientId)
    }
    loadClientNotes(clientId)
    // Pre-load card data only for non-employee contacts
    const contact = contacts.find(c => c.client_id === clientId)
    if (!contact?.is_employee) loadClientCard(clientId)
    telemetry.trackChatView(clientId, selectedAccount)
  }, [loadMessages, loadClientNotes, loadClientCard, selectedAccount, selectedClient, messageText])

  useEffect(() => {
    const pending = pendingSearchOpenRef.current
    if (!pending || !selectedClient) return
    if (selectedClient !== pending.clientId || selectedAccount !== pending.accountId) return
    pendingSearchOpenRef.current = null
    loadMessages(selectedClient)
    loadClientNotes(selectedClient)
  }, [selectedClient, selectedAccount, loadMessages, loadClientNotes])

  useEffect(() => {
    const pending = pendingSearchJumpRef.current
    if (!pending) return
    const hasTarget = messages.some(m => String(m.id) === pending.messageDomId)
    if (!hasTarget) return
    pendingSearchJumpRef.current = null
    setTimeout(() => {
      const msgEl = document.querySelector(`[data-msg-id="${pending.messageDomId}"]`) as HTMLElement | null
      if (!msgEl) return
      msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      msgEl.classList.add('search-active')
      setTimeout(() => msgEl.classList.remove('search-active'), 2000)
    }, 80)
  }, [messages])

  const openClientChat = useCallback((clientId: string, phone?: string, name?: string) => {
    if (phone) setNewChatClient({ client_id: clientId, phone, full_name: name || '' })
    if (!selectedAccount && accounts.length > 0) {
      setSelectedAccount(accounts[0].id)
    }
    selectClient(clientId)
  }, [selectClient, selectedAccount, accounts])

  const openSelectedClientCard = useCallback((clientId?: string | null) => {
    if (!clientId) return
    setRightTab('card')
    loadClientCard(clientId)
  }, [loadClientCard])

  const openToastChat = useCallback((clientId: string, accountId: string, sender: string) => {
    if (!clientId) return
    setSelectedGmail(null)
    setGmailSelectedMsg(null)

    if (accountId && accountId !== selectedAccount) {
      pendingToastChatRef.current = { clientId, accountId, sender }
      setSelectedAccount(accountId)
      return
    }

    if (sender && !contacts.some(c => c.client_id === clientId)) {
      setNewChatClient(prev =>
        prev?.client_id === clientId ? prev : { client_id: clientId, phone: '', full_name: sender }
      )
    }
    selectClient(clientId)
  }, [selectedAccount, contacts, selectClient])

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
        const acctId = addToAcctSelected
        const clientId = data.client_id || addToAcctModal.clientId
        // Save new chat client so chat renders even without messages
        setNewChatClient({ client_id: clientId, phone: data.phone || addToAcctModal.phone, full_name: data.full_name || addToAcctModal.name || '' })
        setAddToAcctModal(null)
        if (acctId !== selectedAccount) setSelectedAccount(acctId)
        selectClient(clientId)
        loadContacts()
      } else {
        const err = await resp.json().catch(() => ({}))
        alert(err.error || 'Помилка додавання')
      }
    } catch (e) { console.error('Add contact:', e) }
    finally { setAddToAcctAdding(false) }
  }, [auth?.token, addToAcctModal, addToAcctSelected, selectClient, selectedAccount, loadContacts])

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

  // Auto-select pending Gmail message after emails load (from toast click)
  useEffect(() => {
    if (pendingGmailMsgRef.current && gmailEmails.length > 0) {
      const email = gmailEmails.find(e => e.id === pendingGmailMsgRef.current)
      if (email) setGmailSelectedMsg(email)
      pendingGmailMsgRef.current = null
    }
  }, [gmailEmails])

  // Open pending messenger chat after account switch triggered from toast click
  useEffect(() => {
    const pending = pendingToastChatRef.current
    if (!pending) return
    if (pending.accountId && pending.accountId !== selectedAccount) return

    if (pending.sender && !contacts.some(c => c.client_id === pending.clientId)) {
      setNewChatClient(prev =>
        prev?.client_id === pending.clientId
          ? prev
          : { client_id: pending.clientId, phone: '', full_name: pending.sender }
      )
    }

    pendingToastChatRef.current = null
    selectClient(pending.clientId)
  }, [selectedAccount, contacts, selectClient])

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
      // Other files (Excel, Word, etc.) — save to temp and open with default app
      const tmp = await tempDir()
      const filePath = await join(tmp, filename)
      const ab = await blob.arrayBuffer()
      await writeFile(filePath, new Uint8Array(ab))
      await shellOpen(filePath)
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
    telemetry.trackTabSwitch(accountId)
    setSelectedClient(null)
    setMessages([])
    setSelectedGmail(null); setGmailEmails([]); setGmailSelectedMsg(null)
    // Clear unread badge for this account
    setAccountUnreads(prev => { const n = { ...prev }; delete n[accountId]; return n })
  }, [])

  // VoIP handlers
  const toggleMuteChat = useCallback(async () => {
    const peerId = (chatContact as any)?.tg_peer_id
    if (!peerId || !selectedAccount || !auth?.token || muteLoading) return
    setMuteLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/telegram/mute-chat/`, auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, peer_id: peerId, mute: !chatMuted }),
      })
      if (res.ok) setChatMuted(!chatMuted)
    } catch (e) { console.error('mute error', e) }
    setMuteLoading(false)
  }, [chatContact, selectedAccount, auth, chatMuted, muteLoading])

  // Adapter: pass chatContact into voipStartCall from single call-site in JSX.
  const handleVoipCall = useCallback((accountId: string, peerId: number) => {
    const phone = (chatContact as any)?.phone || ''
    const name = (chatContact as any)?.full_name || (chatContact as any)?.name || ''
    return voipStartCall(accountId, peerId, phone, name)
  }, [voipStartCall, chatContact])

  if (!auth?.authorized) {
    return <LoginScreen onLogin={login} loading={authLoading} error={authError} theme={theme} setTheme={setTheme} />
  }

  return (
    <div className="app">
      <VoipOverlays voip={voip} />

      {/* Compact Top Bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="top-bar-title">Vidnovagram</span>
          <button className="icon-btn" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук'}>
            {soundEnabled ? <VolumeOnIcon /> : <VolumeOffIcon />}
          </button>
        </div>
        <div className="top-bar-right">
          {updateProgress === 'downloading' && (
            <span className="update-indicator" title="Завантаження оновлення...">
              <div className="spinner-xs" />
            </span>
          )}
          {updateProgress && updateProgress !== 'downloading' && (
            <span className="update-error" title={updateProgress} style={{ color: 'var(--destructive)', fontSize: '0.7rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ⚠ {updateProgress}
            </span>
          )}
          {updateReady && (
            <button className="update-ready-btn" onClick={() => relaunch()} title="Натисніть для перезапуску">
              Оновлення готове
            </button>
          )}
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
        {/* Account rail — expands on hover */}
        <AccountRail
          expanded={railExpanded}
          setExpanded={setRailExpanded}
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          setSelectedClient={setSelectedClient}
          setMessages={setMessages}
          selectedGmail={selectedGmail}
          accounts={accounts}
          gmailAccounts={gmailAccounts}
          unreadCount={unreadCount}
          accountUnreads={accountUnreads}
          onAccountClick={handleAccountClick}
          onGmailClick={handleGmailAccountClick}
          onOpenSettings={() => setShowSettingsModal(true)}
          currentVersion={currentVersion}
        />
        {/* Sidebar with contacts */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="resize-handle" onMouseDown={e => startResize('sidebar', e)} />
          <ActiveAccountCard
            selectedGmail={selectedGmail}
            gmailAccounts={gmailAccounts}
            selectedAccount={selectedAccount}
            accounts={accounts}
            hasMessengerAccounts={hasMessengerAccounts}
            contacts={contacts}
          />
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
                placeholder="Пошук контактів та повідомлень..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  const q = e.target.value.trim()
                  clearTimeout(globalSearchTimer.current)
                  setUsernameSearchResult(null)
                  if (q.length >= 3 && auth?.token) {
                    globalSearchTimer.current = setTimeout(async () => {
                      try {
                        const params = new URLSearchParams({ q, limit: '30' })
                        if (selectedAccount) params.set('account_id', selectedAccount)
                        const resp = await authFetch(`${API_BASE}/telegram/search-messages/?${params}`, auth!.token)
                        if (resp.ok) setGlobalSearchResults(await resp.json())
                      } catch { /* ignore */ }
                      // If starts with @, also resolve username
                      if (q.startsWith('@') && q.length >= 4 && selectedAccount) {
                        try {
                          const resp = await authFetch(`${API_BASE}/telegram/resolve-username/?account_id=${selectedAccount}&username=${encodeURIComponent(q)}`, auth!.token)
                          if (resp.ok) setUsernameSearchResult(await resp.json())
                        } catch { /* ignore */ }
                      }
                    }, 400)
                  } else {
                    setGlobalSearchResults([])
                  }
                }}
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
            hasMessengerAccounts ? (
              <button className="add-contact-btn" onClick={() => { setShowAddContact(true); setAddContactAccount(selectedAccount) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
                Новий чат
              </button>
            ) : (
              <div className="sidebar-empty-hint">Для цього користувача не налаштовано жодного TG/WA акаунта</div>
            )
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
                {hasMessengerAccounts ? (
                  <>
                    {contacts.map(c => {
                      const display = resolveContactDisplay(c)
                      return (
                      <div
                        key={c.client_id}
                        className={`contact ${selectedClient === c.client_id ? 'active' : ''}${isUnread(c) ? ' unread' : ''}${c.has_whatsapp && !c.has_telegram ? ' wa-contact' : ''}`}
                        onClick={() => selectClient(c.client_id)}
                      >
                        <div className={`avatar${c.has_whatsapp && !c.has_telegram ? ' wa-avatar' : ''}`}>
                          {photoMap[c.client_id]
                            ? <img src={photoMap[c.client_id]} className="avatar-img" alt="" />
                            : <UserIcon />}
                          {c.tg_peer_id && peerPresence[c.tg_peer_id]?.status === 'online' && (
                            <span className="online-dot" />
                          )}
                        </div>
                        <div className="contact-body">
                          <div className="contact-row">
                            <span className={`contact-name${c.is_employee ? ' employee' : ''}`}>
                              <ContactName name={display.name} isEmployee={c.is_employee} />
                            </span>
                            {isUnread(c) && <span className="unread-dot" />}
                            <span className="contact-time">
                              {c.last_message_date && formatContactDate(c.last_message_date)}
                            </span>
                          </div>
                          <div className="contact-row">
                            <span className="contact-preview">
                              {draftsRef.current.has(c.client_id) ? (
                                <><span className="preview-draft">Чернетка: </span>{draftsRef.current.get(c.client_id)!.text.slice(0, 50)}</>
                              ) : (
                                <>{c.last_message_direction === 'sent' && <span className="preview-you">Ви: </span>}{c.last_message_text?.slice(0, 60) || 'Медіа'}</>
                              )}
                            </span>
                          </div>
                          <div className="contact-meta">
                            <span className="contact-phone">{display.subtitle}</span>
                            <span className="contact-icons">
                              {c.has_telegram === true && <TelegramIcon size={12} color="#2AABEE" />}
                              {c.has_whatsapp && <WhatsAppIcon size={12} color="#25D366" />}
                            </span>
                          </div>
                        </div>
                      </div>
                      )
                    })}
                    {loadingMoreContacts && (
                      <div className="loading-more">Завантаження...</div>
                    )}
                    {/* Username search result (@bot / @user) */}
                    {usernameSearchResult && (
                      <>
                        <div className="search-section-header">
                          {usernameSearchResult.is_bot ? '🤖 Бот' : '👤 Користувач'}
                        </div>
                        <div className="contact search-result username-result" onClick={async () => {
                          // Start chat with bot/user: send /start if bot, or just open chat
                          const peerId = usernameSearchResult.peer_id
                          if (!peerId || !selectedAccount) return
                          try {
                            if (usernameSearchResult.is_bot) {
                              // Send /start to bot via MadelineProto directly
                              await authFetch(`${API_BASE}/telegram/send-to-peer/`, auth!.token, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ account_id: selectedAccount, peer_id: peerId, text: '/start' }),
                              })
                            }
                            // Reload contacts — bot should appear after /start
                            setSearch('')
                            setUsernameSearchResult(null)
                            setGlobalSearchResults([])
                            setTimeout(() => loadContacts(), 1500)
                          } catch (e) { console.error('Failed to start bot chat:', e) }
                        }}>
                          <div className="avatar">{usernameSearchResult.is_bot ? <span>🤖</span> : <UserIcon />}</div>
                          <div className="contact-body">
                            <div className="contact-row">
                              <span className="contact-name">{usernameSearchResult.first_name} {usernameSearchResult.last_name || ''}</span>
                            </div>
                            <div className="contact-row">
                              <span className="contact-preview">@{usernameSearchResult.username}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    {/* Global message search results */}
                    {globalSearchResults.length > 0 && (
                      <>
                        <div className="search-section-header">Повідомлення ({globalSearchResults.length})</div>
                        {globalSearchResults.map((r, i) => (
                          <div key={`sr-${i}`} className="contact search-result" onClick={() => {
                            if (r.client_id) {
                              selectClient(r.client_id, { accountId: r.account_id || undefined, jumpToMessageId: r.id })
                              setSearch('')
                              setGlobalSearchResults([])
                              setUsernameSearchResult(null)
                            }
                          }}>
                            <div className="avatar"><UserIcon /></div>
                            <div className="contact-body">
                              <div className="contact-row">
                                <span className="contact-name">{r.client_name || r.client_phone || 'Невідомий'}</span>
                                <span className="contact-time">{r.message_date && formatContactDate(r.message_date)}</span>
                              </div>
                              <div className="contact-row">
                                <span className="contact-preview search-preview">
                                  {r.direction === 'sent' && <span className="preview-you">Ви: </span>}
                                  {r.text?.slice(0, 80)}
                                </span>
                              </div>
                              <div className="contact-meta">
                                <span className="contact-phone">{r.account_label || '—'}</span>
                                <span className="contact-icons">
                                  {r.source === 'telegram'
                                    ? <TelegramIcon size={12} color="#2AABEE" />
                                    : <WhatsAppIcon size={12} color="#25D366" />}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <div className="sidebar-empty-state">
                    <div className="sidebar-empty-state-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div className="sidebar-empty-state-title">Немає доступних акаунтів</div>
                    <div className="sidebar-empty-state-text">
                      У налаштуваннях користувача не видано жодного Telegram або WhatsApp акаунта.
                    </div>
                  </div>
                )}
              </div>
              <div className="sidebar-footer">
                {hasMessengerAccounts ? `${contacts.length} / ${contactCount} контактів` : 'Попросіть адміністратора надати доступ до акаунтів'}
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
                  <div className="gmail-att-grid">
                    {gmailSelectedMsg.attachments.map((att, i) => {
                      const ext = att.filename.split('.').pop()?.toLowerCase() || ''
                      const mime = att.mime_type || ''
                      const isImage = mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)
                      const isPdf = mime === 'application/pdf' || ext === 'pdf'
                      const isDoc = ['doc','docx','odt','rtf'].includes(ext) || mime.includes('wordprocessing') || mime.includes('msword')
                      const isSheet = ['xls','xlsx','csv','ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('ms-excel')
                      const isArchive = ['zip','rar','7z','tar','gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')
                      const isAudio = mime.startsWith('audio/') || ['mp3','wav','ogg','flac','m4a'].includes(ext)
                      const isVideo = mime.startsWith('video/') || ['mp4','avi','mkv','mov','webm'].includes(ext)
                      const typeClass = isPdf ? 'att-pdf' : isImage ? 'att-img' : isDoc ? 'att-doc' : isSheet ? 'att-sheet' : isArchive ? 'att-zip' : isAudio ? 'att-audio' : isVideo ? 'att-video' : 'att-file'
                      const sizeStr = att.size > 1024*1024 ? `${(att.size/1024/1024).toFixed(1)} MB` : `${Math.round(att.size/1024)} KB`
                      return (
                        <button key={i} className={`gmail-att-card ${typeClass}`} onClick={() => downloadGmailAttachment(gmailSelectedMsg!.id, att.attachment_id, att.filename)} title={att.filename}>
                          <div className="att-card-icon">
                            {isPdf && <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5"/><text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text></svg>}
                            {isImage && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                            {isDoc && <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5"/><path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.5"/></svg>}
                            {isSheet && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>}
                            {isArchive && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8v13H3V3h12l6 5z"/><path d="M14 3v5h6"/><rect x="9" y="10" width="6" height="4" rx="1"/><path d="M12 10v-2M12 16v-2"/></svg>}
                            {isAudio && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
                            {isVideo && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="15" height="16" rx="2"/><path d="M17 8l5-3v14l-5-3z"/></svg>}
                            {!isPdf && !isImage && !isDoc && !isSheet && !isArchive && !isAudio && !isVideo && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>}
                          </div>
                          <div className="att-card-info">
                            <span className="att-card-name">{att.filename}</span>
                            <span className="att-card-size">{sizeStr}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
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
                <div className="chat-header-avatar" onClick={() => setShowContactProfile(true)} style={{ cursor: 'pointer' }}>
                  {selectedClient && photoMap[selectedClient]
                    ? <img src={photoMap[selectedClient]} className="avatar-img" alt="" />
                    : <UserIcon />}
                  {(chatContact as any)?.tg_peer_id && (!(chatContact as any)?.chat_type || (chatContact as any).chat_type === 'private') && peerPresence[(chatContact as any).tg_peer_id]?.status === 'online' && (
                    <span className="online-dot online-dot-header" />
                  )}
                </div>
                  <div className="chat-header-info" onClick={() => setShowContactProfile(true)} style={{ cursor: 'pointer' }}>
                  <div className="chat-header-name">
                    {chatDisplay.name}
                  </div>
                  <div className="chat-header-phone">
                    {selectedClient && typingIndicators[selectedClient] ? (
                      <span className="typing-indicator">набирає повідомлення<span className="typing-dots"><span>.</span><span>.</span><span>.</span></span></span>
                    ) : (() => {
                      const ct = (chatContact as any)?.chat_type
                      if (ct && ct !== 'private' && groupInfo) {
                        const parts: string[] = []
                        if (groupInfo.participants_count != null) {
                          parts.push(`${groupInfo.participants_count} ${ct === 'channel' ? 'підписників' : 'учасників'}`)
                        }
                        if (groupInfo.online_count != null && groupInfo.online_count > 0) parts.push(`${groupInfo.online_count} онлайн`)
                        if (ct === 'channel' && !parts.length) parts.push('канал')
                        if (parts.length) return <span className="presence-offline">{parts.join(', ')}</span>
                      }
                      const peerId = (chatContact as any)?.tg_peer_id
                      const pr = peerId ? peerPresence[peerId] : undefined
                      const { text: presText, isOnline } = formatPresence(pr)
                      if (presText) {
                        return (
                          <span className={isOnline ? 'presence-online' : 'presence-offline'}>
                            {presText}
                          </span>
                        )
                      }
                      return chatDisplay.subtitle
                    })()}
                  </div>
                </div>
                <div className="chat-header-right">
                  <button
                    className="chat-mute-btn"
                    onClick={() => openSelectedClientCard(selectedClient)}
                    title="Картка клієнта"
                  >
                    <UserIcon />
                  </button>
                  {(chatContact as any)?.tg_peer_id && selectedAccount && !activeCall && (!(chatContact as any)?.chat_type || (chatContact as any).chat_type === 'private') && (
                    <>
                      <button
                        className="voip-call-btn"
                        onClick={() => handleVoipCall(selectedAccount, (chatContact as any).tg_peer_id)}
                        title="Голосовий дзвінок"
                      >
                        <PhoneIcon />
                      </button>
                      <button
                        className="voip-call-btn voip-call-btn-disabled"
                        title="Відеодзвінок (незабаром)"
                        disabled
                      >
                        <VideoIcon />
                      </button>
                    </>
                  )}
                  {(chatContact as any)?.chat_type && (chatContact as any).chat_type !== 'private' && selectedAccount && (
                    <button
                      className={`chat-mute-btn${chatMuted ? ' muted' : ''}`}
                      onClick={toggleMuteChat}
                      disabled={muteLoading}
                      title={chatMuted ? 'Увімкнути сповіщення' : 'Вимкнути сповіщення'}
                    >
                      {chatMuted
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.8 8A6 6 0 0 1 20 12"/><path d="m2 2 20 20"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M8.54 5A6 6 0 0 1 18 8c0 1-.3 2.08-.78 3.1"/><path d="M6 6a8.11 8.11 0 0 0-1.56 3.85c-.42 2.15.07 3.75.56 5.15H18"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                      }
                    </button>
                  )}
                  <button className="chat-search-btn" onClick={() => setChatSearchOpen(o => !o)} title="Пошук у чаті">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </button>
                  <span className="msg-count-badge">{msgCount} повідомлень</span>
                </div>
              </div>

              {/* Chat search panel */}
              {chatSearchOpen && (
                <div className="chat-search-panel">
                  <input
                    ref={chatSearchRef}
                    type="text"
                    className="chat-search-input"
                    placeholder="Пошук у чаті..."
                    value={chatSearchQuery}
                    onChange={e => setChatSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && chatSearchResults.length > 0) {
                        const nextIdx = (chatSearchIdx + 1) % chatSearchResults.length
                        setChatSearchIdx(nextIdx)
                        const msgEl = document.querySelector(`[data-msg-id="${chatSearchResults[nextIdx]}"]`)
                        if (msgEl) msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      }
                      if (e.key === 'Escape') {
                        setChatSearchOpen(false)
                        setChatSearchQuery('')
                      }
                    }}
                    autoFocus
                  />
                  {chatSearchResults.length > 0 && (
                    <div className="chat-search-nav">
                      <span className="chat-search-count">{chatSearchIdx + 1}/{chatSearchResults.length}</span>
                      <button className="chat-search-nav-btn" onClick={() => {
                        const prev = (chatSearchIdx - 1 + chatSearchResults.length) % chatSearchResults.length
                        setChatSearchIdx(prev)
                        const msgEl = document.querySelector(`[data-msg-id="${chatSearchResults[prev]}"]`)
                        if (msgEl) msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      }}>▲</button>
                      <button className="chat-search-nav-btn" onClick={() => {
                        const next = (chatSearchIdx + 1) % chatSearchResults.length
                        setChatSearchIdx(next)
                        const msgEl = document.querySelector(`[data-msg-id="${chatSearchResults[next]}"]`)
                        if (msgEl) msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      }}>▼</button>
                    </div>
                  )}
                  {chatSearchQuery && chatSearchResults.length === 0 && (
                    <span className="chat-search-count">0 результатів</span>
                  )}
                  <button className="chat-search-close" onClick={() => { setChatSearchOpen(false); setChatSearchQuery('') }}>✕</button>
                </div>
              )}

              {/* Placeholder banner — hide for groups/supergroups */}
              {isPlaceholder && (!(chatContact as any)?.chat_type || (chatContact as any).chat_type === 'private') && (
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
                      {linkResults.map(c => {
                        const display = resolveContactDisplay({ full_name: c.full_name, phone: c.phone })
                        return (
                          <button
                            key={c.id}
                            className="link-modal-item"
                            onClick={() => handleLinkClient(c.id)}
                            disabled={linkLoading}
                          >
                            <div className="link-modal-item-avatar"><UserIcon /></div>
                            <div className="link-modal-item-info">
                              <div className="link-modal-item-name">{display.name}</div>
                              <div className="link-modal-item-phone">{c.phone}{c.calls_count > 0 ? ` · ${c.calls_count} дзвінків` : ''}</div>
                            </div>
                          </button>
                        )
                      })}
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

              {pinnedMessage && (
                <div className="pinned-banner" onClick={() => {
                  const el = document.querySelector(`[data-msg-id="${pinnedMessage.id}"]`)
                  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('search-active'); setTimeout(() => el.classList.remove('search-active'), 2000) }
                }}>
                  <div className="pinned-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
                  </div>
                  <div className="pinned-text">{pinnedMessage.text?.slice(0, 100) || (pinnedMessage.has_media ? `📎 ${pinnedMessage.media_type || 'Медіа'}` : 'Закріплене повідомлення')}</div>
                </div>
              )}
              <div className={`chat-messages${chatDropHighlight ? ' drop-highlight' : ''}`}
                ref={chatContainerRef}
                style={
                  appSettings.chatBackground.type === 'color' && appSettings.chatBackground.value
                    ? { backgroundColor: appSettings.chatBackground.value }
                    : appSettings.chatBackground.type === 'wallpaper' && wallpaperBlobUrl
                    ? { backgroundImage: `url(${wallpaperBlobUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : undefined
                }
                onScroll={e => {
                  const el = e.currentTarget
                  setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 200)
                }}
                onDragOver={e => {
                  if (selectedClient) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setChatDropHighlight(true)
                  }
                }}
                onDragLeave={() => setChatDropHighlight(false)}
              >
                <div ref={chatTopSentinelRef} className="load-older-wrap" style={{ minHeight: 1 }}>
                  {loadingOlder && (
                    <div className="load-older-btn" style={{ pointerEvents: 'none' }}>
                      <div className="spinner-sm" />
                    </div>
                  )}
                </div>
                {groupedMessages.map((item, i) => {
                  if ('type' in item && item.type === 'date') {
                    return (
                      <div key={`date-${i}`} className="date-separator">
                        <span>{item.date}</span>
                      </div>
                    )
                  }
                  // Note item
                  if ('_isNote' in item && (item as any)._isNote) {
                    const note = item as ClientNote & { _isNote: true }
                    return (
                      <div key={`note-${note.id}`} data-note-id={note.id} className="msg msg-note">
                        <div className="msg-bubble msg-bubble-note">
                          <div className="msg-note-header">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
                            <span className="msg-note-author">{note.author_name}</span>
                            <button className="msg-note-delete" onClick={() => deleteClientNote(note.id)} title="Видалити">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                          <div className="msg-note-text">{note.text}</div>
                          <div className="msg-time">
                            {new Date(note.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  }
                  // Album group
                  if ('type' in item && (item as any).type === 'album') {
                    const album = item as AlbumGroup
                    const count = album.messages.length
                    // Grid class: 2 items = 2 cols, 3 = 2+1, 4+ = 2x2 grid
                    const gridClass = count === 2 ? 'album-grid-2' : count === 3 ? 'album-grid-3' : 'album-grid-4'
                    return (
                      <div key={`album-${album.media_group_id}`} className={`msg ${album.direction} src-${album.source || 'telegram'}`}>
                        <div className="msg-bubble">
                          <div className={`album-grid ${gridClass}`}>
                            {album.messages.map((am, ai) => (
                              <div key={am.id} className={`album-item${count === 3 && ai === 0 ? ' album-item-wide' : ''}`}>
                                {am.thumbnail || am.media_file ? (
                                  (() => {
                                    const preferFullImage = am.media_type === 'photo' && !!am.media_file
                                    const mediaKey = `${preferFullImage ? 'full' : 'thumb'}_${am.id}`
                                    const mediaPath = preferFullImage
                                      ? am.media_file
                                      : (am.thumbnail || am.media_file)
                                    const fallbackPath = preferFullImage
                                      ? (am.thumbnail || undefined)
                                      : (am.thumbnail && am.media_file ? am.media_file : undefined)
                                    return (
                                  <AuthMedia
                                    mediaKey={mediaKey}
                                    mediaPath={mediaPath}
                                    type="image"
                                    className="album-media"
                                    token={auth?.token || ''}
                                    blobMap={mediaBlobMap}
                                    loadBlob={loadMediaBlob}
                                    fallbackPath={fallbackPath}
                                    onClick={async () => {
                                      if (am.media_file) {
                                        const blob = mediaBlobMap[`full_${am.id}`] || await loadMediaBlob(`full_${am.id}`, am.media_file)
                                        if (blob) setLightboxSrc(blob)
                                      } else if (mediaBlobMap[`thumb_${am.id}`]) {
                                        setLightboxSrc(mediaBlobMap[`thumb_${am.id}`])
                                      }
                                    }}
                                  />
                                    )
                                  })()
                                ) : (
                                  <div className="album-placeholder">
                                    {am.media_status === 'pending' ? <div className="spinner-sm" /> : `📎 ${am.media_type || 'медіа'}`}
                                  </div>
                                )}
                                {am.media_type === 'video' && (
                                  <div className="album-video-badge">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {album.caption && <div className="msg-text"><Linkify text={album.caption} onLinkClick={u => shellOpen(u)} /></div>}
                          <div className="msg-footer">
                            <span className="msg-source">
                              {album.source === 'whatsapp'
                                ? <WhatsAppIcon size={10} color="#25D366" />
                                : <TelegramIcon size={10} color="#2AABEE" />
                              }
                            </span>
                            <span className="msg-time">
                              {new Date(album.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {album.direction === 'sent' && (
                              <span className="msg-status-text read">Прочитано</span>
                            )}
                          </div>
                        </div>
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
                  {/* Service messages — centered text, no bubble */}
                  if (m.is_service) {
                    const svcText = (() => {
                      const sd = m.service_data || {}
                      const names = (sd.user_names || []).join(', ')
                      switch (m.service_type) {
                        case 'chat_add_user': return `${m.sender_name || 'Хтось'} додав ${names || 'учасника'}`
                        case 'chat_delete_user': return `${m.sender_name || 'Хтось'} видалив ${names || 'учасника'}`
                        case 'chat_joined_by_link': return `${m.sender_name || 'Хтось'} приєднався за посиланням`
                        case 'chat_joined_by_request': return `${m.sender_name || 'Хтось'} приєднався за запитом`
                        case 'chat_edit_title': return `${m.sender_name || 'Хтось'} змінив назву на «${sd.title || ''}»`
                        case 'chat_edit_photo': return `${m.sender_name || 'Хтось'} змінив фото групи`
                        case 'chat_delete_photo': return `${m.sender_name || 'Хтось'} видалив фото групи`
                        case 'chat_create': return `${m.sender_name || 'Хтось'} створив групу`
                        case 'channel_create': return `Канал створено`
                        case 'pin_message': return `${m.sender_name || 'Хтось'} закріпив повідомлення`
                        case 'phone_call': return `📞 Дзвінок`
                        case 'group_call': return `📞 Груповий дзвінок`
                        case 'set_ttl': return `Встановлено автовидалення повідомлень`
                        case 'topic_create': return `Тему створено: ${sd.title || ''}`
                        case 'topic_edit': return `Тему змінено`
                        default: return m.service_type || 'Сервісне повідомлення'
                      }
                    })()
                    return (
                      <div key={m.id} className="msg-service">
                        <span className="msg-service-text">{svcText}</span>
                      </div>
                    )
                  }
                  return (
                    <div key={m.id} data-msg-id={m.id} className={`msg ${m.direction} src-${m.source || 'telegram'}${forwardMode ? ' selectable' : ''}${selectedMsgIds.has(m.id) ? ' selected' : ''}${chatSearchResults.includes(m.id as number) ? ' search-highlight' : ''}${chatSearchResults[chatSearchIdx] === m.id ? ' search-active' : ''}`}
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
                      <div className={`msg-bubble${m.is_deleted ? ' msg-bubble-deleted' : ''}${m.is_lab_result ? ' msg-bubble-lab' : ''}${m.media_type === 'sticker' && (m.thumbnail || m.media_file) ? ' msg-bubble-sticker' : ''}${m.media_type === 'video_note' ? ' msg-bubble-vnote' : ''}`}>
                        {/* Group sender name */}
                        {m.chat_type && m.chat_type !== 'private' && m.direction === 'received' && m.sender_name && (
                          <div className="msg-group-sender">{m.sender_name}</div>
                        )}
                        {/* Forwarded header */}
                        {m.fwd_from_name && (
                          <div className="msg-forward-header">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                            <span>Переслано від <strong>{m.fwd_from_name}</strong></span>
                          </div>
                        )}
                        {/* Reply quote — click to scroll to quoted message */}
                        {(m.reply_to_msg_id || m.reply_to_text || m.reply_to_sender) && (() => {
                          // Find thumbnail from replied message (lookup in loaded messages)
                          const replyThumb = (() => {
                            if (m.reply_to_thumbnail) return { thumb: m.reply_to_thumbnail, mediaType: m.reply_to_media_type || '' }
                            if (!m.reply_to_msg_id) return null
                            const replied = messages.find(rm => rm.tg_message_id === m.reply_to_msg_id && (!m.tg_peer_id || rm.tg_peer_id === m.tg_peer_id))
                            if (replied?.thumbnail) return { thumb: replied.thumbnail, mediaType: replied.media_type || '' }
                            return null
                          })()
                          const replyMediaType = m.reply_to_media_type || (() => {
                            if (!m.reply_to_msg_id) return ''
                            const replied = messages.find(rm => rm.tg_message_id === m.reply_to_msg_id && (!m.tg_peer_id || rm.tg_peer_id === m.tg_peer_id))
                            return replied?.media_type || ''
                          })()
                          const replyText = m.reply_to_text || (replyMediaType ? ({
                            photo: 'Фото', video: 'Відео', video_note: 'Відеоповідомлення',
                            voice: 'Голосове повідомлення', sticker: 'Стікер', document: 'Документ',
                          } as Record<string, string>)[replyMediaType] || 'Медіа' : '...')
                          return (
                            <div className="msg-reply-quote clickable" onClick={m.reply_to_msg_id ? (e) => { e.stopPropagation(); scrollToReplyMessage(m.reply_to_msg_id!, m.tg_peer_id) } : undefined}>
                              <div className="msg-reply-bar" />
                              <div className="msg-reply-body">
                                {m.reply_to_sender && <span className="msg-reply-sender">{m.reply_to_sender}</span>}
                                <span className="msg-reply-text">{replyText}</span>
                              </div>
                              {replyThumb && (
                                <AuthMedia
                                  mediaKey={`reply_thumb_${m.id}`}
                                  mediaPath={replyThumb.thumb}
                                  type="image"
                                  className={`msg-reply-thumb${replyThumb.mediaType === 'video_note' ? ' msg-reply-thumb-round' : ''}`}
                                  token={auth?.token || ''}
                                  blobMap={mediaBlobMap}
                                  loadBlob={loadMediaBlob}
                                />
                              )}
                            </div>
                          )
                        })()}
                        {/* Photo with thumbnail → click to view full (exclude stickers — rendered separately) */}
                        {m.has_media && m.thumbnail && m.media_type !== 'video' && m.media_type !== 'voice' && m.media_type !== 'document' && m.media_type !== 'sticker' && (
                          (() => {
                            const preferFullImage = m.media_type === 'photo' && !!m.media_file
                            const mediaKey = `${preferFullImage || (m.source === 'whatsapp' && m.media_file) ? 'full' : 'thumb'}_${m.id}`
                            const mediaPath = preferFullImage
                              ? m.media_file
                              : (m.source === 'whatsapp' && m.media_file ? m.media_file : m.thumbnail)
                            const fallbackPath = preferFullImage
                              ? (m.thumbnail || undefined)
                              : (m.source === 'whatsapp' ? undefined : (m.media_file || undefined))
                            return (
                          <AuthMedia
                            mediaKey={mediaKey}
                            mediaPath={mediaPath}
                            type="image"
                            className={`msg-media${m.source === 'whatsapp' ? ' msg-media-wa' : ''}`}
                            token={auth?.token || ''}
                            blobMap={mediaBlobMap}
                            loadBlob={loadMediaBlob}
                            fallbackPath={fallbackPath}
                            onClick={async () => {
                              if (m.media_file) {
                                const blob = mediaBlobMap[`full_${m.id}`] || await loadMediaBlob(`full_${m.id}`, m.media_file)
                                if (blob) setLightboxSrc(blob)
                              } else if (mediaBlobMap[`thumb_${m.id}`]) {
                                setLightboxSrc(mediaBlobMap[`thumb_${m.id}`])
                              }
                            }}
                          />
                            )
                          })()
                        )}
                        {/* Photo without thumbnail → load full image directly */}
                        {m.has_media && !m.thumbnail && m.media_type === 'photo' && m.media_file && (
                          <AuthMedia
                            mediaKey={`full_${m.id}`}
                            mediaPath={m.media_file}
                            type="image"
                            className={`msg-media${m.source === 'whatsapp' ? ' msg-media-wa' : ''}`}
                            token={auth?.token || ''}
                            blobMap={mediaBlobMap}
                            loadBlob={loadMediaBlob}
                            onClick={() => {
                              const src = mediaBlobMap[`full_${m.id}`]
                              if (src) setLightboxSrc(src)
                            }}
                          />
                        )}
                        {/* Voice message → Telegram-style player */}
                        {m.has_media && m.media_type === 'voice' && m.media_file && (
                          <VoicePlayer
                            messageId={m.id}
                            mediaFile={m.media_file}
                            blobMap={mediaBlobMap}
                            loadBlob={loadMediaBlob}
                            loading={!!mediaLoading[`voice_${m.id}`]}
                            direction={m.direction}
                          />
                        )}
                        {/* Video note (round video / кружок) — autoplay muted like Telegram */}
                        {m.has_media && m.media_type === 'video_note' && m.media_file && (
                          <div className={`msg-vnote-wrap ${m.direction}`}>
                            <div className="msg-vnote" onClick={async () => {
                              const key = `vid_${m.id}`
                              let src = mediaBlobMap[key]
                              if (!src) { src = await loadMediaBlob(key, m.media_file) || '' }
                              if (src) { setVnoteModal({ src, id: m.id }); setVnotePlaying(true); setVnoteProgress(0) }
                            }}>
                              {mediaBlobMap[`vid_${m.id}`] ? (
                                <video
                                  src={mediaBlobMap[`vid_${m.id}`]}
                                  className="msg-vnote-player"
                                  autoPlay muted loop playsInline
                                />
                              ) : (
                                <>
                                  {m.thumbnail ? (
                                    <AuthMedia
                                      mediaKey={`vnthumb_${m.id}`}
                                      mediaPath={m.thumbnail}
                                      type="image"
                                      className="msg-vnote-thumb"
                                      token={auth?.token || ''}
                                      blobMap={mediaBlobMap}
                                      loadBlob={loadMediaBlob}
                                    />
                                  ) : <div className="msg-vnote-thumb" style={{background: 'var(--muted)'}} />}
                                  <div className="msg-vnote-play" onClick={async (e) => {
                                    e.stopPropagation()
                                    const key = `vid_${m.id}`
                                    if (!mediaBlobMap[key]) await loadMediaBlob(key, m.media_file)
                                  }}>
                                    {mediaLoading[`vid_${m.id}`] ? <div className="spinner-sm" /> : (
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.4))'}}><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Regular video */}
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
                              <>
                                {m.thumbnail && <AuthMedia mediaKey={`vthumb_${m.id}`} mediaPath={m.thumbnail} type="image" className="msg-video-thumb" token={auth?.token || ''} blobMap={mediaBlobMap} loadBlob={loadMediaBlob} />}
                                <button
                                  className={`msg-video-btn${!m.thumbnail ? ' msg-video-btn-static' : ''}`}
                                  onClick={() => loadMediaBlob(`vid_${m.id}`, m.media_file)}
                                  disabled={mediaLoading[`vid_${m.id}`]}
                                >
                                  {mediaLoading[`vid_${m.id}`] ? <div className="spinner-sm" /> : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                  )}
                                </button>
                              </>
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
                        {/* Contact (vCard) — inline card with name & phone */}
                        {/* Media pending download — show loading indicator */}
                        {m.has_media && m.media_status === 'pending' && !m.media_file && (
                          <div className="msg-media-pending">
                            <div className="spinner-sm" />
                            <span>{m.media_type === 'photo' ? 'Фото' : m.media_type === 'video' ? 'Відео' : m.media_type === 'document' ? 'Файл' : m.media_type === 'voice' ? 'Голосове' : 'Медіа'} завантажується...</span>
                          </div>
                        )}
                        {/* Sticker — show emoji or media */}
                        {m.media_type === 'sticker' && (() => {
                          // Animated sticker (TGS/Lottie) — render with lottie-web
                          if (m.is_animated_sticker && (m.media_file || m.thumbnail)) {
                            const stickerKey = `sticker_${m.id}`
                            const blobUrl = mediaBlobMap[stickerKey]
                            if (!blobUrl) {
                              loadMediaBlob(stickerKey, m.media_file || m.thumbnail)
                              return (
                                <div className="msg-sticker-img" title={m.sticker_set_name || m.sticker_emoji || 'Стікер'}>
                                  {m.sticker_emoji || '🏷️'}
                                </div>
                              )
                            }
                            return (
                              <div className="msg-sticker-img" title={m.sticker_set_name || m.sticker_emoji || 'Стікер'}>
                                <LottieSticker blobUrl={blobUrl} size={200} />
                              </div>
                            )
                          }
                          // Static/video sticker with image — render large without bubble
                          if (m.thumbnail || m.media_file) {
                            return (
                              <div className="msg-sticker-img" title={m.sticker_set_name || m.sticker_emoji || 'Стікер'}>
                                <AuthMedia
                                  mediaKey={`sticker_${m.id}`}
                                  mediaPath={m.thumbnail || m.media_file}
                                  type="image"
                                  className="sticker-image"
                                  token={auth?.token || ''}
                                  blobMap={mediaBlobMap}
                                  loadBlob={loadMediaBlob}
                                />
                              </div>
                            )
                          }
                          // Sticker without image — show emoji or placeholder
                          return (
                            <div className="msg-sticker" title={m.sticker_set_name || 'Стікер'}>
                              {m.sticker_emoji ? <span className="msg-sticker-emoji">{m.sticker_emoji}</span> : '🏷️ Стікер'}
                            </div>
                          )
                        })()}
                        {/* Unknown media without specific handler */}
                        {m.has_media && !m.thumbnail && m.media_type && !['voice', 'video', 'video_note', 'document', 'photo', 'contact', 'geo', 'poll', 'sticker'].includes(m.media_type) && !m.media_file && m.media_status !== 'pending' && (
                          <div className="msg-media-placeholder">
                            {`📎 ${m.media_type}`}
                          </div>
                        )}
                        {/* Contact card */}
                        {m.media_type === 'contact' && (() => {
                          // Use dedicated API fields, fallback to text parsing
                          let name = '', phone = ''
                          if (m.contact_first_name || m.contact_last_name || m.contact_phone) {
                            name = [m.contact_first_name, m.contact_last_name].filter(Boolean).join(' ')
                            phone = (m.contact_phone || '').replace(/\D/g, '')
                          } else {
                            const lines = (m.text || '').split('\n')
                            for (const l of lines) {
                              const lt = l.trim()
                              if (lt.startsWith('👤')) name = lt.slice(2).trim()
                              else if (lt.startsWith('📞')) phone = lt.slice(2).trim().replace(/\D/g, '')
                            }
                          }
                          if (!name && !phone) name = m.text || 'Контакт'
                          const normPhone = phone.startsWith('380') ? '0' + phone.slice(3) : phone
                          // Find avatar from contacts photoMap
                          const matchedContact = normPhone ? contacts.find(c => c.phone === normPhone || c.phone === phone) : null
                          const avatarUrl = matchedContact ? photoMap[matchedContact.client_id] : null
                          return (
                            <div className="msg-contact-card" onClick={() => {
                              if (normPhone) {
                                setAddToAcctModal({ phone: normPhone, name, clientId: matchedContact?.client_id || '' })
                                checkPhoneMessengers(normPhone)
                              }
                            }}>
                              <div className="msg-contact-avatar">
                                {avatarUrl ? <img src={avatarUrl} alt="" /> : (name || phone || '?')[0].toUpperCase()}
                              </div>
                              <div className="msg-contact-info">
                                {name && <div className="msg-contact-name">{name}</div>}
                                {phone && <div className="msg-contact-phone">{phone.startsWith('380') ? '+' + phone : phone}</div>}
                              </div>
                            </div>
                          )
                        })()}
                        {/* Poll/checklist/ToDo card */}
                        {m.media_type === 'poll' && (() => {
                          const onUpdate = (msgId: number | string, newText: string) => setMessages(prev => prev.map(msg => msg.id === msgId ? { ...msg, text: newText } : msg))
                          const syncProps = { accountId: m.account_id || selectedAccount, peerId: m.tg_peer_id, tgMessageId: m.tg_message_id, fullText: m.text, authToken: auth?.token, onTextUpdate: onUpdate }
                          // Dedicated API fields (poll_question present)
                          if (m.poll_question) {
                            const opts = (m.poll_options || []).map(o => typeof o === 'string' ? o : o.text)
                            // Detect ToDo: options already have ☐/☑ markers
                            const isTodo = opts.some(o => o.startsWith('☐ ') || o.startsWith('☑ '))
                            const normalizedOpts = isTodo ? opts : opts.map(o => `☐ ${o}`)
                            return <PollCard question={m.poll_question} options={normalizedOpts} messageId={m.id}
                              totalVoters={m.poll_total_voters} isClosed={m.poll_is_closed}
                              isTodo={isTodo} {...syncProps} />
                          }
                          // Text-based fallback (📊 or 📋 prefix)
                          if (m.text && (m.text.startsWith('📊') || m.text.startsWith('📋'))) {
                            const lines = m.text.split('\n')
                            const isTodo = m.text.startsWith('📋')
                            const question = lines[0]?.replace(/^[📊📋]\s*/, '') || 'Опитування'
                            const options = lines.slice(1).filter(l => l.startsWith('☐') || l.startsWith('☑'))
                            return <PollCard question={question} options={options} messageId={m.id}
                              isTodo={isTodo} {...syncProps} />
                          }
                          return null
                        })()}
                        {/* Geo location card */}
                        {m.media_type === 'geo' && (() => {
                          // Use dedicated API fields, fallback to text parsing
                          let title = '', address = '', mapUrl = '', isLive = false
                          if (m.location_lat != null && m.location_lng != null) {
                            title = m.location_title || 'Геолокація'
                            address = m.location_address || ''
                            mapUrl = `https://maps.google.com/maps?q=${m.location_lat},${m.location_lng}`
                          } else if (m.text && m.text.includes('📍')) {
                            const lines = (m.text || '').split('\n')
                            title = lines[0]?.replace('📍 ', '') || 'Геолокація'
                            mapUrl = lines.find(l => l.startsWith('https://maps.google.com')) || ''
                            address = lines.length > 2 ? lines.slice(1, -1).join(', ') : ''
                            isLive = title.startsWith('Маячок')
                          } else {
                            return null
                          }
                          const lat = m.location_lat ?? parseFloat((mapUrl.match(/q=([-\d.]+)/) || [])[1] || '0')
                          const lng = m.location_lng ?? parseFloat((mapUrl.match(/,([-\d.]+)/) || [])[1] || '0')
                          const hasCoords = lat !== 0 || lng !== 0
                          // Build 2x2 tile grid from OSM for map preview
                          const zoom = isLive ? 14 : 15
                          const n = Math.pow(2, zoom)
                          const xTile = (lng + 180) / 360 * n
                          const yTile = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
                          const tx = Math.floor(xTile), ty = Math.floor(yTile)
                          // Fractional position within tile for pin offset
                          const fracX = xTile - tx, fracY = yTile - ty
                          const tileBase = `https://tile.openstreetmap.org/${zoom}`
                          return (
                            <div className="msg-geo-card" onClick={() => mapUrl && shellOpen(mapUrl)}>
                              {hasCoords && (
                                <div className="msg-geo-map">
                                  <div className="msg-geo-tiles" style={{ transform: `translate(${-(fracX * 256)}px, ${-(fracY * 256)}px)` }}>
                                    <img src={`${tileBase}/${tx}/${ty}.png`} alt="" loading="lazy" />
                                    <img src={`${tileBase}/${tx + 1}/${ty}.png`} alt="" loading="lazy" />
                                    <img src={`${tileBase}/${tx}/${ty + 1}.png`} alt="" loading="lazy" />
                                    <img src={`${tileBase}/${tx + 1}/${ty + 1}.png`} alt="" loading="lazy" />
                                  </div>
                                  <div className="msg-geo-pin">{isLive ? '📡' : '📍'}</div>
                                </div>
                              )}
                              <div className="msg-geo-info-bottom">
                                <span className="msg-geo-title">{title}</span>
                                {address && <span className="msg-geo-address">{address}</span>}
                              </div>
                            </div>
                          )
                        })()}
                        {/* Message text — always shown, even for deleted */}
                        {m.text && m.media_type !== 'contact' && !(m.media_type === 'poll' && (m.poll_question || m.text.startsWith('📊') || m.text.startsWith('📋'))) && !(m.media_type === 'geo' && (m.location_lat != null || m.text.includes('📍'))) && <div className={`msg-text${m.is_deleted ? ' msg-text-deleted' : ''}`}><Linkify text={m.text} onLinkClick={u => shellOpen(u)} /></div>}
                        {m.text && !m.is_deleted && m.media_type !== 'geo' && (() => { const u = extractFirstUrl(m.text); return u ? <LinkPreviewCard url={u} token={auth!.token} onClick={u => shellOpen(u)} /> : null })()}
                        {/* Inline keyboard (bot buttons) */}
                        {m.reply_markup && m.reply_markup.length > 0 && (
                          <div className="msg-inline-keyboard">
                            {m.reply_markup.map((row: any[], ri: number) => (
                              <div key={ri} className="msg-inline-row">
                                {row.map((btn: any, bi: number) => (
                                  <button
                                    key={bi}
                                    className={`msg-inline-btn${btn.type === 'url' || btn.type === 'web_app' ? ' msg-inline-btn-url' : ''}`}
                                    onClick={async () => {
                                      if (btn.type === 'url' || btn.type === 'web_app') {
                                        shellOpen(btn.url)
                                      } else if (btn.type === 'callback' && selectedAccount) {
                                        try {
                                          const res = await authFetch(`${API_BASE}/telegram/click-inline-button/`, auth!.token, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              account_id: selectedAccount,
                                              peer_id: m.tg_peer_id,
                                              msg_id: m.tg_message_id,
                                              data: btn.data,
                                            }),
                                          })
                                          if (res.ok) {
                                            const result = await res.json()
                                            if (result.message) {
                                              if (result.alert) {
                                                alert(result.message)
                                              }
                                              // Bot may send new messages — they'll arrive via WS
                                            }
                                            if (result.url) shellOpen(result.url)
                                          }
                                        } catch (e) { console.error('Inline button click failed:', e) }
                                      }
                                    }}
                                  >
                                    {(btn.type === 'url' || btn.type === 'web_app') && <span className="inline-btn-icon">↗</span>}
                                    {btn.text}
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Deleted label under message */}
                        {m.is_deleted && (
                          <div className="msg-deleted-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            <span>{m.direction === 'sent'
                              ? `Видалено у співрозмовника${m.deleted_by_peer_name ? ` · ${m.deleted_by_peer_name}` : ''}`
                              : `Видалено співрозмовником${m.deleted_by_peer_name ? ` (${m.deleted_by_peer_name})` : ''}`
                            }{m.deleted_at ? ` · ${new Date(m.deleted_at).toLocaleDateString('uk-UA')} ${new Date(m.deleted_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                          </div>
                        )}
                        {/* Reactions */}
                        {m.reactions && m.reactions.length > 0 && (
                          <div className="msg-reactions">
                            {m.reactions.map((r, i) => (
                              <span key={i} className={`msg-reaction${r.chosen ? ' chosen' : ''}`}>
                                {!r.chosen && selectedClient && photoMap[selectedClient] ? (
                                  <img src={photoMap[selectedClient]} className="reaction-avatar" alt="" />
                                ) : !r.chosen ? (
                                  <span className="reaction-avatar reaction-avatar-placeholder">
                                    {(contacts.find(c => c.client_id === selectedClient)?.full_name || '?')[0].toUpperCase()}
                                  </span>
                                ) : null}
                                <span className="reaction-emoji">{r.emoji}</span>{r.count > 1 ? ` ${r.count}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="msg-footer">
                          <span className="msg-source">
                            {m.source === 'whatsapp'
                              ? <WhatsAppIcon size={10} color="#25D366" />
                              : <TelegramIcon size={10} color="#2AABEE" />
                            }
                          </span>
                          {m.is_edited && (
                            <span className="msg-edited" title={m.original_text ? `Оригінал: ${m.original_text}` : 'Редаговано'}>ред.</span>
                          )}
                          <span className="msg-time">
                            {new Date(m.message_date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {m.direction === 'sent' && (
                            <span className={`msg-status-text ${
                              m.source === 'whatsapp'
                                ? (m.is_read ? 'read' : 'sent')
                                : (m.is_read ? 'read' : m.is_read === false ? 'delivered' : 'sent')
                            }`}>
                              {m.local_status === 'sending'
                                ? 'Надсилання'
                                : m.local_status === 'failed'
                                  ? 'Не відправлено'
                                  : m.source === 'whatsapp'
                                    ? (m.is_read ? 'Прочитано' : 'Надіслано')
                                    : m.is_read ? 'Прочитано' : m.is_read === false ? 'Доставлено' : 'Надіслано'}
                            </span>
                          )}
                        </div>
                        {m.local_status === 'failed' && (
                          <div className="msg-deleted-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            <span>Не вдалося відправити{m.local_error ? ` · ${m.local_error}` : ''}</span>
                          </div>
                        )}
                      </div>
                      {/* Lab result strip: linked */}
                      {m.is_lab_result && (m.patient_client_id || m.patient_name) && (
                        <div className="lab-strip lab-strip-linked" onClick={(e) => {
                          e.stopPropagation()
                          // Open lab tab and highlight the patient
                          setRightTab('lab')
                          if (labPatients.length === 0 && !labLoading) loadLabResults(1, '')
                          const patientKey = m.patient_client_id || m.patient_name || ''
                          setExpandedLabPatient(patientKey)
                        }}>
                          <svg className="lab-strip-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
                          <span className="lab-strip-name">{m.patient_client_name || m.patient_name}</span>
                          <div className="lab-strip-actions">
                            <button onClick={(e) => { e.stopPropagation(); editLabResult(m) }} title="Змінити пацієнта">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); unlinkLabResult(m) }} title="Відкріпити">
                              <XIcon />
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Lab result strip: unlinked (detected but no patient) */}
                      {m.is_lab_result && !m.patient_client_id && !m.patient_name && (
                        <div className="lab-strip lab-strip-unlinked" onClick={(e) => { e.stopPropagation(); editLabResult(m) }}>
                          <svg className="lab-strip-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M12 11v4"/><path d="M12 17h.01"/></svg>
                          <span className="lab-strip-label">Привʼязати пацієнта</span>
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
                {showScrollDown && (
                  <button className="chat-scroll-down" onClick={() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                )}
              </div>
              {/* Forward mode bar */}
              {forwardMode && (
                <div className="forward-bar">
                  <button className="forward-bar-cancel" onClick={exitForwardMode}><XIcon /> Скасувати</button>
                  <span className="forward-bar-count">Обрано: {selectedMsgIds.size}</span>
                  <button className="forward-bar-btn" onClick={bulkCopyMessages} disabled={selectedMsgIds.size === 0} title="Копіювати">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                  {messages.some(m => selectedMsgIds.has(m.id) && m.direction === 'sent' && ((!!m.tg_message_id && !!m.tg_peer_id) || m.source === 'whatsapp')) && (
                    <button className="forward-bar-btn forward-bar-btn-danger" onClick={bulkDeleteMessages} disabled={selectedMsgIds.size === 0} title="Видалити">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  )}
                  <button className="forward-bar-send" onClick={openForwardModal} disabled={selectedMsgIds.size === 0}>
                    <ForwardIcon /> Переслати
                  </button>
                </div>
              )}
              {!forwardMode && (chatContact as any)?.chat_type === 'channel' && (
                <div className="channel-readonly-bar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>
                  <span>Канал — тільки перегляд</span>
                  {chatMuted && <span className="channel-muted-label">🔇</span>}
                </div>
              )}
              {!forwardMode && (chatContact as any)?.chat_type !== 'channel' && (
                <div className="chat-input">
                  <input type="file" ref={fileInputRef} hidden multiple
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                    onChange={handleFileSelect} />
                  {/* ToDo list creation modal */}
                  {showTodoModal && (
                    <div className="file-modal-overlay" onClick={() => setShowTodoModal(false)}>
                      <div className="file-modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
                        <div className="file-modal-header">
                          <span className="file-modal-title">Новий список</span>
                          <button className="file-modal-close" onClick={() => setShowTodoModal(false)}>✕</button>
                        </div>
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input
                            className="todo-modal-input"
                            value={todoTitle}
                            onChange={e => setTodoTitle(e.target.value)}
                            placeholder="Назва списку"
                            autoFocus
                          />
                          {todoItems.map((item, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ opacity: 0.4, fontSize: 14 }}>☐</span>
                              <input
                                className="todo-modal-input"
                                value={item}
                                onChange={e => { const arr = [...todoItems]; arr[i] = e.target.value; setTodoItems(arr) }}
                                placeholder={`Пункт ${i + 1}`}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); setTodoItems(prev => [...prev, '']) }
                                  if (e.key === 'Backspace' && !item && todoItems.length > 1) { e.preventDefault(); setTodoItems(prev => prev.filter((_, j) => j !== i)) }
                                }}
                              />
                            </div>
                          ))}
                          <button className="attach-menu-item" onClick={() => setTodoItems(prev => [...prev, ''])} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                            + Додати пункт
                          </button>
                        </div>
                        <div className="file-modal-actions">
                          <button className="file-modal-send" disabled={!todoTitle.trim() || todoItems.filter(i => i.trim()).length === 0 || sending}
                            onClick={async () => {
                              if (!selectedClient || !auth?.token || !selectedAccount) return
                              const items = todoItems.filter(i => i.trim())
                              if (!todoTitle.trim() || items.length === 0) return
                              const text = `📋 ${todoTitle.trim()}\n${items.map(i => `☐ ${i.trim()}`).join('\n')}`
                              setShowTodoModal(false)
                              setSending(true)
                              try {
                                const sendUrl = `${API_BASE}/telegram/contacts/${selectedClient}/send/`
                                const fd = _buildSendFd({ text })
                                await authFetch(sendUrl, auth.token, { method: 'POST', body: fd })
                                setTodoTitle('')
                                setTodoItems(['', '', ''])
                              } catch (e) { console.error('ToDo send failed:', e) }
                              finally { setSending(false) }
                            }}>
                            <SendIcon /> Надіслати
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* File upload modal (multi-file) */}
                  <FileUploadModal
                    open={showFileModal}
                    files={attachedFiles}
                    previews={attachedPreviews}
                    caption={fileCaption}
                    setCaption={setFileCaption}
                    forceDocument={forceDocument}
                    setForceDocument={setForceDocument}
                    sending={sending}
                    onSend={() => sendMessage()}
                    onClear={clearAttachment}
                    onRemoveFile={removeAttachedFile}
                    onAddMore={() => fileInputRef.current?.click()}
                    onCloseEmpty={() => setShowFileModal(false)}
                  />
                  {/* Attachment indicator (fallback when modal closed) */}
                  {attachedFiles.length > 0 && !showFileModal && (
                    <div className="attached-preview">
                      {attachedFiles.length === 1 && attachedPreviews[0] && attachedFiles[0].type.startsWith('image/') ? (
                        <img src={attachedPreviews[0]} alt="" className="attached-thumb" />
                      ) : (
                        <span className="attached-name">
                          {attachedFiles.length === 1 ? attachedFiles[0].name : `${attachedFiles.length} файлів`}
                        </span>
                      )}
                      <button className="attached-remove" onClick={clearAttachment}><XIcon /></button>
                    </div>
                  )}
                  {/* Reply / Edit bar */}
                  {(editingMsg || (window as any).__replyTo) && (
                    <div className="reply-edit-bar">
                      <div className="reply-edit-bar-accent" />
                      <div className="reply-edit-bar-content">
                        <span className="reply-edit-bar-title">
                          {editingMsg ? '✏️ Редагування' : `↩️ ${(window as any).__replyTo?.sender || ''}`}
                        </span>
                        <span className="reply-edit-bar-text">
                          {editingMsg ? editingMsg.text?.slice(0, 80) : (window as any).__replyTo?.text}
                        </span>
                      </div>
                      <button className="reply-edit-bar-close" onClick={() => {
                        setEditingMsg(null)
                        ;(window as any).__replyTo = null
                        if (editingMsg) setMessageText('')
                      }}>✕</button>
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
                      <div className="attach-menu-wrap">
                        <button className="chat-input-btn" onClick={() => { setShowAttachMenu(p => !p); setShowEmojiPicker(false) }} title="Вкласти">
                          <PaperclipIcon />
                        </button>
                        {showAttachMenu && (
                          <div className="attach-menu-panel">
                            <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click() }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                              Медіа
                            </button>
                            <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); setForceDocument(true); fileInputRef.current?.click() }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              Файл
                            </button>
                            <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); setShowTodoModal(true); setTodoTitle(''); setTodoItems(['', '']) }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                              Список
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="emoji-picker-wrap">
                        <button className="chat-input-btn" onClick={() => setShowEmojiPicker(p => !p)} title="Емодзі">
                          <span style={{ fontSize: 18, lineHeight: 1 }}>😊</span>
                        </button>
                        {showEmojiPicker && (
                          <div className="emoji-picker-panel">
                            {['😊','😂','❤️','👍','🙏','😍','🥰','😘','🤗','😎','🔥','✨','💪','👏','🎉','😢','😭','🤔','😮','😡','👋','🤝','💕','⭐','🌟','✅','❌','💯','🫶','🤩','😇','🥺','😋','🤣','😅','🫡','🙌','💐','🌹','🎂'].map(e => (
                              <button key={e} className="emoji-picker-item" onClick={() => {
                                setMessageText(prev => prev + e)
                                setShowEmojiPicker(false)
                                chatInputRef.current?.focus()
                              }}>{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <textarea
                        ref={chatInputRef}
                        value={messageText}
                        onFocus={() => { setShowAttachMenu(false); setShowEmojiPicker(false) }}
                        onChange={e => {
                          setMessageText(e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
                          sendTypingIndicator()
                        }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        onPaste={handlePaste}
                        placeholder="Написати повідомлення..."
                        rows={1}
                      />
                      {messageText.trim() || attachedFiles.length > 0 ? (
                        <button className="chat-send-btn" onClick={() => sendMessage()} disabled={sending}>
                          {sending ? <div className="spinner-sm" /> : <SendIcon />}
                        </button>
                      ) : (
                        <div className="chat-input-media-btns">
                          <button className="chat-input-btn" onClick={() => { setNewNoteText(''); setShowNoteModal(true) }} title="Нотатка">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
                          </button>
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
              ) : rightTab === 'card' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M15 8h4M15 12h4"/><path d="M3 21v0c0-2.21 2.69-4 6-4s6 1.79 6 4"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 2v6a2 2 0 002 2h10M3 8v12a2 2 0 002 2h14a2 2 0 002-2V8"/><path d="M10 12h4M10 16h4"/></svg>
              )}
              {rightTab === 'notes' ? 'Нотатки' : rightTab === 'quick' ? 'Шаблони' : rightTab === 'card' ? 'Картка клієнта' : rightTab === 'clients' ? (rpSelectedClient ? (
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
                      <div key={note.id} className="rp-note rp-note-clickable" onClick={() => {
                        // Scroll to note in chat
                        const el = document.querySelector(`[data-note-id="${note.id}"]`)
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          el.classList.add('note-highlight')
                          setTimeout(() => el.classList.remove('note-highlight'), 1500)
                        }
                      }}>
                        <div className="rp-note-header">
                          <span className="rp-note-author">{note.author_name}</span>
                          <span className="rp-note-date">
                            {new Date(note.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            {' '}
                            {new Date(note.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button className="rp-delete-btn" onClick={(e) => { e.stopPropagation(); setDeleteNoteConfirm(note.id) }} title="Видалити">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                        <div className="rp-note-text">{note.text}</div>
                      </div>
                    ))}
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
                    <div key={p.key} className={`lab-patient${expandedLabPatient === p.key ? ' lab-patient-active' : ''}`}
                      ref={expandedLabPatient === p.key ? el => { if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100) } : undefined}
                    >
                      <div
                        className="lab-patient-header"
                        onMouseDown={e => {
                          if (e.button !== 0) return
                          const startX = e.clientX, startY = e.clientY
                          let dragging = false
                          let ghost: HTMLDivElement | null = null
                          const onMove = (me: MouseEvent) => {
                            if (!dragging && Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) > 8) {
                              dragging = true
                              document.body.classList.add('lab-dragging')
                              ghost = document.createElement('div')
                              ghost.className = 'lab-drag-ghost'
                              ghost.textContent = `📋 ${p.name || 'Аналізи'}`
                              document.body.appendChild(ghost)
                            }
                            if (dragging) {
                              me.preventDefault()
                            }
                            if (dragging && ghost) {
                              ghost.style.left = me.clientX + 12 + 'px'
                              ghost.style.top = me.clientY + 12 + 'px'
                              const chatEl = document.querySelector('.chat-messages')
                              if (chatEl) {
                                const r = chatEl.getBoundingClientRect()
                                const over = me.clientX >= r.left && me.clientX <= r.right && me.clientY >= r.top && me.clientY <= r.bottom
                                chatEl.classList.toggle('drop-highlight', over)
                              }
                            }
                          }
                          const onUp = (ue: MouseEvent) => {
                            document.removeEventListener('mousemove', onMove)
                            document.removeEventListener('mouseup', onUp)
                            document.body.classList.remove('lab-dragging')
                            if (ghost) { ghost.remove(); ghost = null }
                            const chatEl = document.querySelector('.chat-messages')
                            if (chatEl) chatEl.classList.remove('drop-highlight')
                            if (dragging) {
                              const chatEl2 = document.querySelector('.chat-messages')
                              if (chatEl2) {
                                const r = chatEl2.getBoundingClientRect()
                                if (ue.clientX >= r.left && ue.clientX <= r.right && ue.clientY >= r.top && ue.clientY <= r.bottom) {
                                  setLabSendModal(p)
                                  setLabSendSelected(new Set(p.results.filter((r: any) => r.media_file).map((r: any) => r.id)))
                                }
                              }
                            }
                          }
                          document.addEventListener('mousemove', onMove)
                          document.addEventListener('mouseup', onUp)
                        }}
                        onClick={() => setExpandedLabPatient(prev => prev === p.key ? null : p.key)}
                      >
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
                                  if (isImg) {
                                    const blob = mediaBlobMap[fullKey] || await loadMediaBlob(fullKey, r.media_file)
                                    if (blob) setLightboxSrc(blob)
                                  } else {
                                    try {
                                      await openFetchedFile(
                                        r.media_file,
                                        `${r.lab_result_type || 'lab'}_${new Date(r.message_date).toISOString().slice(0, 10)}`
                                      )
                                    } catch (err) { console.error('Lab file open error:', err) }
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
                <div ref={labBottomSentinelRef} style={{ minHeight: 1 }}>
                  {labLoadingMore && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                      <div className="spinner-sm" />
                    </div>
                  )}
                </div>
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
                        {editingCatId === cat.id ? (
                          <div className="tpl-cat-inline-edit" onClick={e => e.stopPropagation()}>
                            <input
                              className="tpl-cat-name-edit"
                              value={editingCatName}
                              onChange={e => setEditingCatName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveCategory(cat.id, editingCatName, editingCatColor); if (e.key === 'Escape') setEditingCatId(null) }}
                              autoFocus
                              style={{ color: editingCatColor }}
                            />
                            <div className="tpl-cat-inline-colors">
                              {['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b'].map(c => (
                                <button key={c} className={`tpl-color-dot-sm ${editingCatColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setEditingCatColor(c)} />
                              ))}
                            </div>
                            <button className="tpl-cat-save-btn" onClick={() => saveCategory(cat.id, editingCatName, editingCatColor)} title="Зберегти">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            </button>
                          </div>
                        ) : (
                          <span className="tpl-cat-name" style={{ color: cat.color }} onDoubleClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatColor(cat.color) }}>{cat.name}</span>
                        )}
                        <span className="tpl-cat-count">{cat.templates.length}</span>
                        <div className="tpl-cat-actions">
                          <button className="tpl-edit-global-btn" onClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatColor(cat.color) }} title="Редагувати категорію">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          </button>
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
                            <div key={tpl.id} className="tpl-item" draggable
                              onDragStart={e => { dragTplRef.current = tpl; lastDraggedTplRef.current = tpl; e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', tpl.title) }}
                              onDragEnd={() => { dragTplRef.current = null }}
                              onClick={() => { if (selectedClient) { setPreviewTpl(tpl); setTplEditText(tpl.text); setTplIncludeMedia(!!tpl.media_file); setTplSendExtraFiles([]) } }}>
                              <span className="tpl-item-title">{tpl.title}</span>
                              {tpl.media_file && <svg className="tpl-media-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                              <button className="tpl-send-btn" onClick={e => { e.stopPropagation(); if (selectedClient) { setPreviewTpl(tpl); setTplEditText(tpl.text); setTplIncludeMedia(!!tpl.media_file); setTplSendExtraFiles([]) } }} title="Надіслати">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                              </button>
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
                      {rpClientSearch && (
                        <button onClick={() => { setRpClientSearch(''); loadRpClients(1, '') }} title="Очистити" className="rp-search-clear">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                      <button onClick={() => loadRpClients(1, rpClientSearch)} title="Пошук">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      </button>
                    </div>
                    {rpClientLoading && <div className="rp-empty">Завантаження...</div>}
                    {!rpClientLoading && rpClients.length === 0 && <div className="rp-empty">Немає контактів</div>}
                    <div className="rp-client-list" onScroll={e => {
                      const el = e.currentTarget
                      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && !rpClientLoading && rpClients.length < rpClientTotal) {
                        loadRpClients(rpClientPage + 1, rpClientSearch, true)
                      }
                    }}>
                      {rpClients.map(c => {
                        const display = resolveContactDisplay({ full_name: c.full_name, phone: c.phone })
                        return (
                        <div key={c.id} className="rp-client-item" onClick={() => loadRpClientDetail(c.id)}>
                          <div className="rp-client-avatar">
                            {rpClientPhotos[c.id]
                              ? <img src={rpClientPhotos[c.id]} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
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
                        )
                      })}
                      {rpClientLoading && rpClients.length > 0 && <div className="rp-empty" style={{ padding: '8px' }}>Завантаження...</div>}
                    </div>
                  </>
                ) : (
                  <div className="rp-client-detail">
                    {rpClientDetailLoading && <div className="rp-empty">Завантаження...</div>}
                    {!rpClientDetailLoading && (
                      <>
                        {/* Client info card */}
                        <div className="rp-cd-card">
                          {rpSelectedClient && rpClientPhotos[rpSelectedClient] && (
                            <img src={rpClientPhotos[rpSelectedClient]} alt="" className="rp-cd-photo" />
                          )}
                          <div className="rp-cd-name">{rpClientInfo?.name || 'Невідомий'}</div>
                          <div className="rp-cd-phone">{rpClientInfo?.phone}</div>
                          {(rpClientInfo?.linked_phones?.length ?? 0) > 0 && (
                            <div className="rp-cd-linked-phones">
                              {rpClientInfo!.linked_phones!.map(lp => (
                                <div key={lp.id} className="rp-cd-linked-phone">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                                  {lp.phone}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="rp-cd-actions">
                            <button onClick={() => openClientChat(rpSelectedClient!, rpClientInfo?.phone, rpClientInfo?.name)} title="Відкрити чат">
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
                        {/* Chronological timeline: calls + messages merged by date */}
                        {(() => {
                          const timeline: { type: 'call' | 'msg'; date: string; data: any }[] = []
                          rpClientCalls.forEach(c => timeline.push({ type: 'call', date: c.call_datetime, data: c }))
                          rpClientMsgs.filter(m => m.source !== 'binotel' && (m as any).type !== 'call').forEach(m => timeline.push({ type: 'msg', date: m.message_date, data: m }))
                          timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          const shown = timeline.slice(0, 50)
                          if (shown.length === 0) return <div className="rp-empty">Немає історії</div>
                          return (
                            <div className="rp-cd-section">
                              <div className="rp-cd-section-title">
                                Хронологія ({timeline.length})
                                <button className="rp-cd-chat-link" onClick={() => openClientChat(rpSelectedClient!, rpClientInfo?.phone, rpClientInfo?.name)}>
                                  Відкрити чат →
                                </button>
                              </div>
                              {shown.map(item => item.type === 'call' ? (
                                <div key={`c-${item.data.id}`} className={`rp-cd-call ${(item.data.disposition || '').toLowerCase() === 'answer' ? 'answered' : (item.data.disposition || '').toLowerCase()}`}>
                                  <div className="rp-cd-call-icon">
                                    {item.data.direction === 'incoming'
                                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 2 16 8 22 8"/><line x1="22" y1="2" x2="16" y2="8"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/></svg>
                                      : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 8 22 2 16 2"/><line x1="16" y1="8" x2="22" y2="2"/><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/></svg>
                                    }
                                  </div>
                                  <div className="rp-cd-call-info">
                                    <span className="rp-cd-call-date">{new Date(item.data.call_datetime).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className="rp-cd-call-dur">{item.data.duration_seconds ? `${Math.floor(item.data.duration_seconds / 60)}:${String(item.data.duration_seconds % 60).padStart(2, '0')}` : '—'}</span>
                                    {item.data.operator_name && <span className="rp-cd-call-op">{item.data.operator_name}</span>}
                                  </div>
                                  {item.data.has_audio && (
                                    <button className={`rp-cd-play${rpPlayingCall === item.data.id ? ' playing' : ''}`} onClick={() => playCallAudio(item.data.id, item.data.audio_file)}>
                                      {rpPlayingCall === item.data.id ? '⏸' : '▶'}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div key={`m-${item.data.id}`} className={`rp-cd-msg ${item.data.direction}`} onClick={() => openClientChat(rpSelectedClient!, rpClientInfo?.phone, rpClientInfo?.name)}>
                                  <span className="rp-cd-msg-source">
                                    {item.data.source === 'whatsapp' ? <WhatsAppIcon size={10} color="#25D366" /> : <TelegramIcon size={10} color="#2AABEE" />}
                                  </span>
                                  <span className="rp-cd-msg-text">{item.data.text?.slice(0, 60) || (item.data.has_media ? `📎 ${item.data.media_type || 'медіа'}` : '...')}</span>
                                  <span className="rp-cd-msg-date">{new Date(item.data.message_date).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
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
            ) : rightTab === 'card' ? (
              selectedClient ? (
                contacts.find(c => c.client_id === selectedClient)?.is_employee ? (
                  <div className="rp-empty">Картка доступна тільки для клієнтів</div>
                ) : <div className="rp-card">
                  {cardLoading ? (
                    <div className="rp-empty">Завантаження...</div>
                  ) : !cardData ? (
                    <div className="rp-empty">Немає даних</div>
                  ) : (
                    <div className="rp-card-content">
                      <div className="rp-card-section">
                        <div className="rp-card-label">Канали зв'язку</div>
                        <div className="rp-card-tags">
                          {(selectedContact?.has_whatsapp || clientLinkedPhones.length > 0) && (
                            <span className="rp-card-tag" style={{ backgroundColor: '#25D36622', color: '#25D366', borderColor: '#25D36644' }}>
                              <WhatsAppIcon size={12} color="#25D366" />&nbsp;Є в WhatsApp
                            </span>
                          )}
                          {selectedContact?.has_telegram && (
                            <span className="rp-card-tag" style={{ backgroundColor: '#2AABEE22', color: '#2AABEE', borderColor: '#2AABEE44' }}>
                              <TelegramIcon size={12} color="#2AABEE" />&nbsp;Є в Telegram
                            </span>
                          )}
                          <button
                            className="rp-card-tag-add"
                            title="Відкрити чат"
                            onClick={() => openClientChat(selectedClient, selectedContact?.phone, selectedContact?.full_name)}
                          >
                            →
                          </button>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">Теги</div>
                        <div className="rp-card-tags">
                          {(cardData.tags || []).map(tag => (
                            <span key={tag.id} className="rp-card-tag" style={{ backgroundColor: tag.color + '22', color: tag.color, borderColor: tag.color + '44' }}>
                              {tag.name}
                              <button className="rp-card-tag-x" onClick={() => toggleCardTag(tag.id)}>×</button>
                            </span>
                          ))}
                          <button className="rp-card-tag-add" onClick={() => setShowTagPicker(!showTagPicker)}>+</button>
                        </div>
                        {showTagPicker && (
                          <div className="rp-card-tag-picker">
                            {allTags.filter(t => !(cardData.tags || []).find(ct => ct.id === t.id)).map(tag => (
                              <button key={tag.id} className="rp-card-tag-option" style={{ borderLeft: `3px solid ${tag.color}` }} onClick={() => { toggleCardTag(tag.id); setShowTagPicker(false) }}>
                                {tag.name}
                              </button>
                            ))}
                            <div className="rp-card-tag-create">
                              <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Новий тег..." onKeyDown={e => { if (e.key === 'Enter' && newTagName.trim()) { createCardTag(newTagName); setShowTagPicker(false) } }} />
                              {newTagName.trim() && <button onClick={() => { createCardTag(newTagName); setShowTagPicker(false) }}>+</button>}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Social Links */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">Соцмережі</div>
                        <div className="rp-card-socials">
                          {(['instagram', 'facebook', 'tiktok'] as const).map(soc => (
                            <div key={soc} className="rp-card-social-row">
                              <span className={`rp-card-social-icon ${soc}`}>
                                {soc === 'instagram' ? '📷' : soc === 'facebook' ? '📘' : '🎵'}
                              </span>
                              {cardEditField === soc ? (
                                <input className="rp-card-input" autoFocus value={cardEditValue}
                                  onChange={e => setCardEditValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveCardField(soc, cardEditValue); if (e.key === 'Escape') setCardEditField(null) }}
                                  onBlur={() => saveCardField(soc, cardEditValue)}
                                  placeholder={`@${soc}`} />
                              ) : (
                                <span className={`rp-card-social-value${cardData[soc] ? '' : ' empty'}`}
                                  onClick={() => { setCardEditField(soc); setCardEditValue(cardData[soc] || '') }}>
                                  {cardData[soc] || `Додати ${soc}`}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Email */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">Email</div>
                        {cardEditField === 'email' ? (
                          <input className="rp-card-input" autoFocus value={cardEditValue}
                            onChange={e => setCardEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveCardField('email', cardEditValue); if (e.key === 'Escape') setCardEditField(null) }}
                            onBlur={() => saveCardField('email', cardEditValue)}
                            placeholder="email@example.com" />
                        ) : (
                          <span className={`rp-card-value${cardData.email ? '' : ' empty'}`}
                            onClick={() => { setCardEditField('email'); setCardEditValue(cardData.email || '') }}>
                            {cardData.email || 'Додати email'}
                          </span>
                        )}
                      </div>

                      {/* City */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">Місто</div>
                        {cardEditField === 'city' ? (
                          <input className="rp-card-input" autoFocus value={cardEditValue}
                            onChange={e => setCardEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveCardField('city', cardEditValue); if (e.key === 'Escape') setCardEditField(null) }}
                            onBlur={() => saveCardField('city', cardEditValue)}
                            placeholder="Місто" />
                        ) : (
                          <span className={`rp-card-value${cardData.city ? '' : ' empty'}`}
                            onClick={() => { setCardEditField('city'); setCardEditValue(cardData.city || '') }}>
                            {cardData.city || 'Додати місто'}
                          </span>
                        )}
                      </div>

                      {/* Source */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">Джерело</div>
                        {cardEditField === 'source' ? (
                          <select className="rp-card-select" autoFocus value={cardEditValue}
                            onChange={e => { setCardEditValue(e.target.value); saveCardField('source', e.target.value) }}
                            onBlur={() => setCardEditField(null)}>
                            <option value="">— не вказано —</option>
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="google">Google</option>
                            <option value="recommendation">Рекомендація</option>
                            <option value="website">Сайт</option>
                            <option value="walk_in">Самозвернення</option>
                            <option value="return">Повторний</option>
                            <option value="other">Інше</option>
                          </select>
                        ) : (
                          <span className={`rp-card-value${cardData.source ? '' : ' empty'}`}
                            onClick={() => { setCardEditField('source'); setCardEditValue(cardData.source || '') }}>
                            {cardData.source || 'Вказати джерело'}
                          </span>
                        )}
                      </div>

                      {/* Comment */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">Коментар</div>
                        {cardEditField === 'comment' ? (
                          <textarea className="rp-card-textarea" autoFocus value={cardEditValue}
                            onChange={e => setCardEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveCardField('comment', cardEditValue) } if (e.key === 'Escape') setCardEditField(null) }}
                            onBlur={() => saveCardField('comment', cardEditValue)}
                            placeholder="Коментар..." rows={3} />
                        ) : (
                          <span className={`rp-card-value rp-card-comment${cardData.comment ? '' : ' empty'}`}
                            onClick={() => { setCardEditField('comment'); setCardEditValue(cardData.comment || '') }}>
                            {cardData.comment || 'Додати коментар'}
                          </span>
                        )}
                      </div>

                      {/* Links */}
                      <div className="rp-card-section">
                        <div className="rp-card-label">
                          Посилання
                          <button className="rp-card-add-btn" onClick={() => setShowAddLink(!showAddLink)}>+</button>
                        </div>
                        {showAddLink && (
                          <div className="rp-card-add-link">
                            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." />
                            <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Назва (необов'язково)" onKeyDown={e => { if (e.key === 'Enter') addCardLink() }} />
                            <button onClick={addCardLink} disabled={!linkUrl.trim()}>Додати</button>
                          </div>
                        )}
                        {(cardData.links || []).length === 0 && !showAddLink && (
                          <div className="rp-card-value empty">Немає посилань</div>
                        )}
                        {(cardData.links || []).map(link => (
                          <div key={link.id} className="rp-card-link">
                            <span className="rp-card-link-text" onClick={() => shellOpen(link.url)} title={link.url}>
                              {link.title || link.url.replace(/^https?:\/\//, '').slice(0, 40)}
                            </span>
                            <button className="rp-card-link-del" onClick={() => deleteCardLink(link.id)}>×</button>
                          </div>
                        ))}
                      </div>

                      {/* Open on CC link */}
                      <div className="rp-card-section rp-card-cc-link">
                        <span onClick={() => shellOpen(`https://cc.vidnova.app/clients/${cardData.id}`)}>
                          Відкрити на cc.vidnova.app →
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rp-empty">Оберіть чат для перегляду картки</div>
              )
            ) : null}
          </div>
          </div>
          <div className="right-panel-tabs">
            {rightTabs.map(tab => (
              <button
                key={tab}
                className={`rp-tab ${rightTab === tab ? 'active' : ''}`}
                data-tab={tab}
                onClick={() => { setRightTab(tab); if (tab === 'lab' && labPatients.length === 0 && !labLoading) loadLabResults(1, labSearch); if (tab === 'clients' && rpClients.length === 0 && !rpClientLoading) loadRpClients(1, ''); if (tab === 'card' && selectedClient && !cardData) loadClientCard(selectedClient) }}
                title={tab === 'notes' ? 'Нотатки' : tab === 'quick' ? 'Шаблони' : tab === 'clients' ? 'Контакти' : tab === 'card' ? 'Картка клієнта' : 'Аналізи'}
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
                ) : tab === 'card' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M15 8h4M15 12h4"/><path d="M3 21v0c0-2.21 2.69-4 6-4s6 1.79 6 4"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 2v6a2 2 0 002 2h10M3 8v12a2 2 0 002 2h14a2 2 0 002-2V8"/><path d="M10 12h4M10 16h4"/></svg>
                )}
                <span className="rp-tab-label">{tab === 'notes' ? 'Нотатки' : tab === 'quick' ? 'Шаблони' : tab === 'clients' ? 'Контакти' : tab === 'card' ? 'Картка' : 'Аналізи'}</span>
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
          <div className="ctx-menu" ref={el => {
          if (el) {
            const rect = el.getBoundingClientRect()
            const maxY = window.innerHeight - rect.height - 8
            const maxX = window.innerWidth - rect.width - 8
            if (rect.top > maxY || rect.left > maxX) {
              el.style.top = `${Math.max(8, Math.min(ctxMenu.y, maxY))}px`
              el.style.left = `${Math.max(8, Math.min(ctxMenu.x, maxX))}px`
            }
          }
        }} style={{
          top: ctxMenu.y,
          left: ctxMenu.x,
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
            {/* Quick reactions */}
            <div className="ctx-menu-reactions">
              {['👍', '❤️', '😂', '😮', '😢', '👎'].map(emoji => (
                <button key={emoji} className="ctx-reaction-btn" onClick={() => sendReaction(ctxMenu.messageId, emoji)}>{emoji}</button>
              ))}
            </div>
            <button className="ctx-menu-item" onClick={ctxMenuReply}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              Відповісти
            </button>
            <button className="ctx-menu-item" onClick={ctxMenuCopy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Копіювати
            </button>
            {messages.find(m => m.id === ctxMenu.messageId)?.local_status === 'failed' && (
              <button className="ctx-menu-item" onClick={() => { retryFailedMessage(ctxMenu.messageId); setCtxMenu(null) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/></svg>
                Повторити
              </button>
            )}
            {messages.find(m => m.id === ctxMenu.messageId)?.direction === 'sent' && messages.find(m => m.id === ctxMenu.messageId)?.source !== 'whatsapp' && (
              <button className="ctx-menu-item" onClick={ctxMenuEdit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Редагувати
              </button>
            )}
            <button className="ctx-menu-item" onClick={ctxMenuForward}>
              <ForwardIcon />
              Переслати
            </button>
            <button className="ctx-menu-item" onClick={ctxMenuSelect}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Виділити
            </button>
            <button className="ctx-menu-item" onClick={ctxMenuLabAssign}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
              Додати аналіз
            </button>
            {selectedAccount && messages.find(m => m.id === ctxMenu.messageId)?.source !== 'whatsapp' && (
              <button className="ctx-menu-item" onClick={ctxMenuPin}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
                {messages.find(m => m.id === ctxMenu.messageId)?.is_pinned ? 'Відкріпити' : 'Закріпити'}
              </button>
            )}
            {messages.find(m => m.id === ctxMenu.messageId)?.direction === 'sent' && (
              <button className="ctx-menu-item ctx-menu-item-danger" onClick={() => {
                const msg = messages.find(m => m.id === ctxMenu.messageId)
                if (msg) {
                  setDeleteConfirm({
                    msgId: msg.id,
                    source: (msg.source || 'telegram') as 'telegram' | 'whatsapp',
                    tgMsgId: msg.tg_message_id,
                    peerId: msg.tg_peer_id,
                  })
                }
                setCtxMenu(null)
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Видалити
              </button>
            )}
          </div>
        </div>
      )}

      <LightboxOverlay src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Note modal */}
      {showNoteModal && (
        <div className="note-modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="note-modal" onClick={e => e.stopPropagation()}>
            <div className="note-modal-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
              <span>Нотатка</span>
              <button className="note-modal-close" onClick={() => setShowNoteModal(false)}>✕</button>
            </div>
            <textarea
              className="note-modal-input"
              value={newNoteText}
              onChange={e => setNewNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addClientNote(); setShowNoteModal(false) } }}
              placeholder="Текст нотатки..."
              rows={4}
              autoFocus
            />
            <button
              className="note-modal-save"
              disabled={!newNoteText.trim()}
              onClick={() => { addClientNote(); setShowNoteModal(false) }}
            >
              Зберегти
            </button>
          </div>
        </div>
      )}

      {/* Video note modal */}
      {vnoteModal && (
        <div className="vnote-modal-overlay" onClick={() => { setVnoteModal(null); setVnotePlaying(false) }}>
          <div className="vnote-modal" onClick={e => e.stopPropagation()}>
            <button className="vnote-modal-close" onClick={() => { setVnoteModal(null); setVnotePlaying(false) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <div className="vnote-modal-video">
              <video
                ref={vnoteModalRef}
                src={vnoteModal.src}
                autoPlay
                className="vnote-modal-player"
                onTimeUpdate={e => {
                  const v = e.target as HTMLVideoElement
                  setVnoteProgress(v.duration ? v.currentTime / v.duration : 0)
                }}
                onPlay={() => setVnotePlaying(true)}
                onPause={() => setVnotePlaying(false)}
                onEnded={() => { setVnotePlaying(false); setVnoteProgress(1) }}
              />
            </div>
            <div className="vnote-modal-seek" onClick={e => {
              const v = vnoteModalRef.current
              if (!v || !v.duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              v.currentTime = pct * v.duration
            }}>
              <div className="vnote-modal-seek-fill" style={{ width: `${vnoteProgress * 100}%` }} />
              <div className="vnote-modal-seek-thumb" style={{ left: `${vnoteProgress * 100}%` }} />
            </div>
            <div className="vnote-modal-controls">
              <button className="vnote-modal-btn" onClick={() => {
                const v = vnoteModalRef.current
                if (!v) return
                v.paused ? v.play() : v.pause()
              }}>
                {vnotePlaying ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                )}
              </button>
              <button className="vnote-modal-btn" onClick={() => {
                const v = vnoteModalRef.current
                if (v) v.muted = !v.muted
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
              </button>
            </div>
          </div>
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
              {forwardContacts.filter(c => c.client_id !== selectedClient).map(c => {
                const display = resolveContactDisplay(c)
                return (
                  <div key={c.client_id} className="forward-modal-contact" onClick={() => executeForward(c.client_id)}>
                    <div className="forward-modal-avatar">
                      {photoMap[c.client_id]
                        ? <img src={photoMap[c.client_id]} alt="" />
                        : <span>{(display.name || '?')[0]}</span>
                      }
                    </div>
                    <div className="forward-modal-info">
                      <div className="forward-modal-name">{display.name}</div>
                      <div className="forward-modal-phone">{display.subtitle || c.phone}</div>
                    </div>
                  </div>
                )
              })}
              {forwardContacts.length === 0 && <div className="forward-modal-empty">Контактів не знайдено</div>}
            </div>
            <button className="tpl-btn-secondary" onClick={() => setShowForwardModal(false)}>Скасувати</button>
          </div>
        </div>
      )}

      {/* Add to Account Modal */}
      <AddToAccountModal
        state={addToAcctModal}
        checking={addToAcctChecking}
        result={addToAcctResult}
        selected={addToAcctSelected}
        setSelected={setAddToAcctSelected}
        adding={addToAcctAdding}
        onClose={() => setAddToAcctModal(null)}
        onAdd={addContactToAccount}
        accounts={accounts}
      />

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

      {/* Select Account Hint Modal */}
      {showSelectAccountHint && (
        <div className="modal-overlay" onClick={() => setShowSelectAccountHint(false)}>
          <div className="select-account-hint-modal" onClick={e => e.stopPropagation()}>
            <div className="select-account-hint-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <h3 className="select-account-hint-title">Виберіть акаунт</h3>
            <p className="select-account-hint-text">
              Для відправки повідомлень та реакцій потрібно вибрати конкретний акаунт у лівій панелі.
            </p>
            <button className="select-account-hint-btn" onClick={() => setShowSelectAccountHint(false)}>Зрозуміло</button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="delete-confirm-title">Видалити повідомлення?</h3>
            <p className="delete-confirm-text">Повідомлення буде видалено у співрозмовника, але залишиться у вас з позначкою.</p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-btn delete-btn-revoke" onClick={() => deleteMessage(deleteConfirm)}>
                Видалити у співрозмовника
              </button>
              <button className="delete-confirm-btn delete-btn-cancel" onClick={() => setDeleteConfirm(null)}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Profile Modal */}
      {showContactProfile && selectedClient && chatContact && (() => {
        const ct = (chatContact as any)?.chat_type
        const isPrivate = !ct || ct === 'private'
        const isChannel = ct === 'channel'
        const peerId = (chatContact as any)?.tg_peer_id
        const pr = peerId ? peerPresence[peerId] : undefined
        const { text: presText, isOnline: presOnline } = formatPresence(pr)
        const phone = chatDisplay.subtitle || clientPhone || chatContact.phone || ''
        const username = (chatContact as any)?.tg_username || ''
        const photoCount = messages.filter(m => m.media_type === 'photo').length
        const voiceCount = messages.filter(m => m.media_type === 'voice' || m.media_type === 'video_note').length
        const docCount = messages.filter(m => m.media_type === 'document').length
        const videoCount = messages.filter(m => m.media_type === 'video').length
        return (
        <div className="modal-overlay" onClick={() => setShowContactProfile(false)}>
          <div className="contact-profile-modal" onClick={e => e.stopPropagation()}>
            <button className="contact-profile-close" onClick={() => setShowContactProfile(false)}>✕</button>
            <div className="contact-profile-avatar" onClick={() => { if (photoMap[selectedClient]) setLightboxSrc(photoMap[selectedClient]) }} style={photoMap[selectedClient] ? { cursor: 'pointer' } : undefined}>
              {photoMap[selectedClient]
                ? <img src={photoMap[selectedClient]} alt="" />
                : <div className="contact-profile-avatar-placeholder">
                    {(chatDisplay.name || '?')[0].toUpperCase()}
                  </div>
              }
            </div>
            <h2 className="contact-profile-name">{chatDisplay.name || 'Без імені'}</h2>
            {isPrivate && presText && (
              <p className={`contact-profile-presence${presOnline ? ' online' : ''}`}>
                {presOnline ? 'онлайн' : presText}
              </p>
            )}
            {isChannel ? (
              <>
                {groupInfo?.username && (
                  <p className="contact-profile-phone">@{groupInfo.username}</p>
                )}
                {groupInfo?.about && (
                  <p className="contact-profile-about">{groupInfo.about}</p>
                )}
                <div className="contact-profile-stats">
                  <div className="contact-profile-stat">
                    <span className="contact-profile-stat-value">{groupInfo?.participants_count ?? '—'}</span>
                    <span className="contact-profile-stat-label">підписників</span>
                  </div>
                  <div className="contact-profile-stat">
                    <span className="contact-profile-stat-value">{messages.length}</span>
                    <span className="contact-profile-stat-label">повідомлень</span>
                  </div>
                  <div className="contact-profile-stat">
                    <span className="contact-profile-stat-value">{messages.filter(m => m.has_media).length}</span>
                    <span className="contact-profile-stat-label">медіа</span>
                  </div>
                </div>
                <div className="contact-profile-actions">
                  <button
                    className={`contact-profile-mute-btn${chatMuted ? ' muted' : ''}`}
                    onClick={toggleMuteChat}
                    disabled={muteLoading}
                  >
                    {chatMuted ? '🔇 Сповіщення вимкнено' : '🔔 Сповіщення увімкнено'}
                  </button>
                </div>
                {groupInfo?.username && (
                  <a className="contact-profile-link" href={`https://t.me/${groupInfo.username}`} onClick={e => { e.preventDefault(); shellOpen(`https://t.me/${groupInfo.username}`) }}>
                    Відкрити в Telegram
                  </a>
                )}
              </>
            ) : (
              <>
                {/* Phone + type */}
                {phone && (
                  <div className="contact-profile-info-section">
                    <div className="contact-profile-info-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      <div className="contact-profile-info-text">
                        <span className="contact-profile-info-value">{phone.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, '+$1 $2 $3 $4 $5')}</span>
                        <span className="contact-profile-info-label">Мобільний</span>
                      </div>
                    </div>
                    {username && (
                      <div className="contact-profile-info-row">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
                        <div className="contact-profile-info-text">
                          <span className="contact-profile-info-value">@{username}</span>
                          <span className="contact-profile-info-label">Ім'я користувача</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {clientLinkedPhones.length > 0 && (
                  <div className="contact-profile-linked">
                    {clientLinkedPhones.map(lp => (
                      <span key={lp.id} className="contact-profile-linked-phone">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        {lp.phone}
                      </span>
                    ))}
                  </div>
                )}
                {!isPrivate && groupInfo?.about && (
                  <p className="contact-profile-about">{groupInfo.about}</p>
                )}
                {/* Media stats — like Telegram */}
                <div className="contact-profile-media-list">
                  {photoCount > 0 && (
                    <div className="contact-profile-media-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                      <span>{photoCount} фото</span>
                    </div>
                  )}
                  {videoCount > 0 && (
                    <div className="contact-profile-media-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                      <span>{videoCount} відео</span>
                    </div>
                  )}
                  {docCount > 0 && (
                    <div className="contact-profile-media-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span>{docCount} файлів</span>
                    </div>
                  )}
                  {voiceCount > 0 && (
                    <div className="contact-profile-media-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                      <span>{voiceCount} голосових</span>
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="contact-profile-action-list">
                  <div className="contact-profile-action-row" onClick={() => { setShowContactProfile(false); openSelectedClientCard(selectedClient) }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span>Відкрити картку клієнта</span>
                  </div>
                  {(chatContact as any).source === 'telegram' && peerId && (
                    <div className="contact-profile-action-row" onClick={() => { setShowContactProfile(false); shellOpen(`https://t.me/+${phone.replace(/^0/, '38')}`) }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      <span>Відкрити в Telegram</span>
                    </div>
                  )}
                  {!isPrivate && (
                    <div className="contact-profile-action-row" onClick={toggleMuteChat}>
                      {chatMuted
                        ? <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 2 2 18"/><path d="M18 12H5.91a2 2 0 0 1-1.58-.77L2.2 8.56A2 2 0 0 1 3.91 5.5H18"/></svg><span>Увімкнути сповіщення</span></>
                        : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span>Не сповіщати</span></>
                      }
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )
      })()}

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
              <label onMouseDown={e => e.stopPropagation()}>
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
                  <div
                    key={r.id}
                    className={`lab-send-item${!hasFile ? ' disabled' : ''}${isChecked ? ' selected' : ''}`}
                    onClick={() => {
                      if (!hasFile) return
                      setLabSendSelected(prev => {
                        const next = new Set(prev)
                        if (next.has(r.id)) next.delete(r.id)
                        else next.add(r.id)
                        return next
                      })
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!hasFile}
                      onClick={e => e.stopPropagation()}
                      onChange={() => {
                        if (!hasFile) return
                        setLabSendSelected(prev => {
                          const next = new Set(prev)
                          if (next.has(r.id)) next.delete(r.id)
                          else next.add(r.id)
                          return next
                        })
                      }}
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
                  </div>
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
              {labAssignResults.map(c => {
                const display = resolveContactDisplay({ full_name: c.full_name, phone: c.phone })
                return (
                  <button key={c.id} className="lab-assign-item" onClick={() => assignLabResult(c.id, c.phone, c.full_name)}>
                    <div className="lab-assign-avatar"><UserIcon /></div>
                    <div className="lab-assign-info">
                      <div className="lab-assign-name">{display.name}</div>
                      <div className="lab-assign-phone">{display.subtitle || c.phone}</div>
                    </div>
                  </button>
                )
              })}
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
      <AddContactModal
        open={showAddContact}
        onClose={() => { setShowAddContact(false); setAddContactResult(''); setAddContactSuggestions([]); setAddContactShowSuggestions(false); setAddContactAvail(null) }}
        accounts={accounts}
        selectedAccount={selectedAccount}
        addContactAccount={addContactAccount}
        setAddContactAccount={setAddContactAccount}
        addContactName={addContactName}
        setAddContactName={setAddContactName}
        addContactPhone={addContactPhone}
        setAddContactPhone={setAddContactPhone}
        addContactLoading={addContactLoading}
        addContactResult={addContactResult}
        addContactAvail={addContactAvail}
        setAddContactAvail={setAddContactAvail}
        addContactSuggestions={addContactSuggestions}
        setAddContactSuggestions={setAddContactSuggestions}
        addContactShowSuggestions={addContactShowSuggestions}
        setAddContactShowSuggestions={setAddContactShowSuggestions}
        searchAddContactSuggestions={searchAddContactSuggestions}
        checkPhoneAvail={checkPhoneAvail}
        startNewChat={startNewChat}
        addContact={addContact}
      />

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
              rows={12}
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
              {/* Extra file attachments (multiple) */}
              {tplSendExtraFiles.length > 0 && (
                <div className="tpl-extra-files">
                  {tplSendExtraFiles.map((f, i) => (
                    <div className="tpl-extra-file" key={i}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                      <span>{f.name}</span>
                      <button onClick={() => setTplSendExtraFiles(prev => prev.filter((_, j) => j !== i))} title="Видалити">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="tpl-attach-extra" onClick={async () => {
                try {
                  const selected = await openFileDialog({ multiple: true, title: 'Додати файли' })
                  if (!selected) return
                  const paths = Array.isArray(selected) ? selected : [selected]
                  for (const p of paths) {
                    const data = await readFile(p)
                    const name = p.split(/[/\\]/).pop() || 'file'
                    const file = new File([data], name)
                    setTplSendExtraFiles(prev => [...prev, file])
                  }
                } catch (e) { console.log('File pick cancelled', e) }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                Додати файл{tplSendExtraFiles.length > 0 ? ` (${tplSendExtraFiles.length})` : ''}
              </button>
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
                {chatDisplay.name || chatDisplay.subtitle || ''}
              </span>
              <button
                className="tpl-btn-send"
                onClick={() => sendTemplate(tplEditText, tplIncludeMedia ? previewTpl.media_file : null, tplSendExtraFiles)}
                disabled={!selectedClient || (!tplEditText.trim() && !(tplIncludeMedia && previewTpl.media_file) && !tplSendExtraFiles.length)}
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

      {/* Settings modal */}
      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        soundDropdownOpen={soundDropdownOpen}
        setSoundDropdownOpen={setSoundDropdownOpen}
        accounts={accounts}
        gmailAccounts={gmailAccounts}
        appSettings={appSettings}
        setAppSettings={setAppSettings}
        previewSound={previewSound}
        setPreviewSound={setPreviewSound}
        previewAudioRef={previewAudioRef}
        waSettings={waSettings}
        wallpapers={wallpapers}
        currentVersion={currentVersion}
      />

      {/* What's New modal */}
      <WhatsNewModal
        open={showWhatsNew}
        version={currentVersion}
        onClose={() => setShowWhatsNew(false)}
      />

      {/* Delete note confirmation modal */}
      {deleteNoteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteNoteConfirm(null)}>
          <div className="modal-dialog modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Видалити нотатку?</h3>
            </div>
            <div className="modal-body">
              <p>Нотатку буде позначено як видалену. Вона залишиться видимою в картці клієнта на сайті.</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn-cancel" onClick={() => setDeleteNoteConfirm(null)}>Скасувати</button>
              <button className="modal-btn modal-btn-danger" onClick={() => deleteClientNote(deleteNoteConfirm)}>Видалити</button>
            </div>
          </div>
        </div>
      )}

      <ToastsContainer
        toasts={toasts}
        expandedToastGroup={expandedToastGroup}
        setExpandedToastGroup={setExpandedToastGroup}
        dismissAll={dismissAll}
        dismissToast={dismissToast}
        accounts={accounts}
        gmailAccounts={gmailAccounts}
        photoMap={photoMap}
        selectedGmail={selectedGmail}
        gmailEmails={gmailEmails}
        pendingGmailMsgRef={pendingGmailMsgRef}
        setGmailSelectedMsg={setGmailSelectedMsg}
        loadGmailEmails={loadGmailEmails}
        handleGmailAccountClick={handleGmailAccountClick}
        openToastChat={openToastChat}
      />
      <BgUploadsContainer
        uploads={bgUploads}
        onRetry={retryBgUpload}
        onDismiss={(id) => setBgUploads(prev => prev.filter(x => x.id !== id))}
      />
    </div>
  )
}

// ===== Login Screen =====


export default App
