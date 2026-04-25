// Shared TypeScript types for Vidnovagram. Consolidated here as an interim step
// in the App.tsx split. Feature-domain types will migrate into `features/*/types.ts`
// during the later etaps of the split plan.

// ── Theme / auth / shell ─────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system'

export interface AuthState {
  authorized: boolean
  name: string
  token: string
  isAdmin: boolean
  /**
   * Local calendar date of the most recent successful login, in `YYYY-MM-DD`.
   * Session auto-expires when this date is no longer "today" — user must
   * re-login once per calendar day (00:00 — 24:00 local).
   */
  loginDate?: string
}

export interface Wallpaper {
  id: string
  full: string
  thumb: string
  _thumbBlob?: string // blob URL for authenticated thumbnail
  _fullBlob?: string  // blob URL for authenticated full image
}

// ── Messenger / contacts ────────────────────────────────────────────────

export interface Account {
  id: string
  label: string
  phone: string
  status: string
  type: 'telegram' | 'whatsapp' | 'viber'
}

export interface Contact {
  client_id: string
  phone: string
  full_name: string
  tg_name?: string
  tg_username?: string
  message_count: number
  last_message_date: string
  last_message_text: string
  last_message_direction: string
  has_telegram?: boolean
  has_whatsapp?: boolean
  is_employee?: boolean
  tg_peer_id?: number
  chat_type?: 'private' | 'group' | 'supergroup' | 'channel'
  linked_phones?: {
    id: string
    phone: string
    full_name: string
    tg_name?: string
    tg_username?: string
  }[]
  // Business / bot contacts
  tg_photo_url?: string
  is_new_patient?: boolean
}

export interface ChatMessage {
  id: number | string
  type?: 'call'
  source?: 'telegram' | 'whatsapp' | 'binotel' | 'viber' | 'viber_turbosms' | 'telegram_bot' | 'facebook_messenger' | 'instagram_direct' | 'whatsapp_cloud'
  direction: 'sent' | 'received' | 'incoming' | 'outgoing'
  text: string
  has_media: boolean
  media_type: string
  media_file: string
  media_status?: string
  thumbnail: string
  message_date: string
  account_label: string
  account_id?: string
  is_read?: boolean
  tg_message_id?: number
  tg_peer_id?: number
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
  // Reply / forward metadata
  reply_to_msg_id?: number | null
  reply_to_text?: string
  reply_to_sender?: string
  reply_to_media_type?: string
  reply_to_thumbnail?: string
  fwd_from_name?: string
  // Extended message types
  media_group_id?: number | null
  sticker_emoji?: string
  sticker_set_name?: string
  is_animated_sticker?: boolean
  is_video_sticker?: boolean
  poll_question?: string
  poll_options?: { text: string; voters?: number }[]
  poll_total_voters?: number
  poll_is_closed?: boolean
  poll_is_multiple?: boolean
  location_lat?: number | null
  location_lng?: number | null
  location_title?: string
  location_address?: string
  contact_first_name?: string
  contact_last_name?: string
  contact_phone?: string
  is_pinned?: boolean
  // Group / service message fields
  chat_type?: 'private' | 'group' | 'supergroup' | 'channel'
  sender_id?: number | null
  sender_name?: string
  is_service?: boolean
  service_type?: string
  service_data?: Record<string, any>
  // Edit / delete / reactions
  is_deleted?: boolean
  deleted_at?: string
  deleted_by_peer_name?: string
  is_edited?: boolean
  edited_at?: string
  original_text?: string
  reactions?: { emoji: string; count: number; chosen?: boolean }[]
  // Inline keyboard (bot messages)
  reply_markup?: { text: string; url?: string }[][]
  // Local desktop-only send UX
  local_status?: 'sending' | 'failed'
  local_error?: string
  retry_data?: { text: string; replyMsgId?: string | number }
  // Business-provider delivery status (Viber DLR): pending → delivered → read,
  // or failed / expired. Not used by TG/WA (those use is_read).
  status?: 'pending' | 'delivered' | 'read' | 'failed' | 'expired'
  provider_msg_id?: string
  error_code?: string
  // Viber/business link button (populated from reply_markup caption/action)
  button_text?: string
  button_url?: string
  // Origin badge data: who sent it (sent only) + which account it went to.
  // sent_by_name — empty for historical rows and for inbound messages.
  sent_by_name?: string
  account_phone?: string
  // Consultation lead companion record (mini-app «Запис на консультацію»).
  // Drives the lead-card UI: live counter while open, accept button,
  // accepted-by footer once taken.
  lead?: {
    id: string
    status: 'open' | 'accepted' | 'closed'
    contact_methods: string[]
    wishes: string
    created_at: string | null
    accepted_at: string | null
    accepted_by_id: number | null
    accepted_by_name: string
    seconds_to_accept: number | null
    // Effective start of the response-time clock — created_at if filed
    // during work hours (09:00–19:00 Kyiv), otherwise the next 09:00.
    // The card shows «Очікує робочого часу» until this moment passes.
    work_started_at?: string | null
  } | null
}

export interface AlbumGroup {
  type: 'album'
  media_group_id: number
  messages: ChatMessage[]
  direction: 'sent' | 'received'
  message_date: string
  caption?: string
  source?: 'telegram' | 'whatsapp' | 'binotel' | 'viber' | 'viber_turbosms' | 'telegram_bot' | 'facebook_messenger' | 'instagram_direct' | 'whatsapp_cloud'
}

export interface WsReactionEvent {
  type: string
  source?: 'telegram' | 'whatsapp' | 'viber'
  client_id?: string
  account_id?: string
  message_id?: string
  tg_message_id?: number
  message?: {
    client_name?: string
    phone?: string
    tg_name?: string
    tg_username?: string
    account_label?: string
    text?: string
    has_media?: boolean
    media_type?: string
    direction?: string
    _media_update?: boolean
    [key: string]: any
  }
  reactions?: { emoji: string; count: number; chosen?: boolean }[]
  actor?: 'self' | 'peer'
  target_message_text?: string
  target_message_direction?: string
  target_message_has_media?: boolean
  target_message_media_type?: string
  [key: string]: any
}

// ── URL / search previews ───────────────────────────────────────────────

export interface LinkPreview {
  url: string
  title: string
  description: string
  image: string
  site_name: string
}

export interface GlobalSearchResult {
  id: string | number
  account_id?: string | null
  client_id?: string | null
  client_name?: string
  client_phone?: string
  text?: string
  message_date?: string | null
  direction?: string
  source?: 'telegram' | 'whatsapp' | 'viber'
  account_label?: string
}

// ── Right panel — notes / templates ────────────────────────────────────

export interface ClientNote {
  id: string
  author_id: number
  author_name: string
  text: string
  created_at: string
  updated_at?: string
}

export interface TemplateCategory {
  id: string
  name: string
  color: string
  sort_order: number
  templates: QuickReply[]
}

export interface QuickReply {
  id: string
  category_id: string
  title: string
  text: string
  media_file: string | null
  sort_order: number
}

// ── Lab results ─────────────────────────────────────────────────────────

export interface LabResult {
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

export interface LabPatient {
  key: string
  name: string
  phone: string
  dob: string
  photo: string | null
  results: LabResult[]
}

// ── Gmail ───────────────────────────────────────────────────────────────

export interface GmailAccount {
  id: string
  label: string
  email: string
  status: string
  messages_count: number
}

export interface GmailEmail {
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
