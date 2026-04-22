import type { Dispatch, MouseEvent, SetStateAction } from 'react'
import { BubbleHeader } from './BubbleHeader'
import { ReplyQuote } from './ReplyQuote'
import { PhotoBubble } from './PhotoBubble'
import { BubbleOrigin } from './BubbleOrigin'
import { VoiceBubble } from './VoiceBubble'
import { VideoNoteBubble } from './VideoNoteBubble'
import { VideoBubble } from './VideoBubble'
import { DocumentBubble } from './DocumentBubble'
import { MediaPendingIndicator } from './MediaPendingIndicator'
import { StickerBubble } from './StickerBubble'
import { UnknownMediaPlaceholder } from './UnknownMediaPlaceholder'
import { ContactBubble } from './ContactBubble'
import { PollBubble } from './PollBubble'
import { GeoBubble } from './GeoBubble'
import { InlineButtons } from './InlineButtons'
import { DeletedLabel } from './DeletedLabel'
import { ReactionsRow } from './ReactionsRow'
import { MessageFooter } from './MessageFooter'
import { FailedStatusLabel } from './FailedStatusLabel'
import { LabResultStrip } from './LabResultStrip'
import { Linkify } from './Linkify'
import { LinkPreviewCard } from './LinkPreviewCard'
import { extractFirstUrl } from '../utils/urlExtract'
import type { ChatMessage, Contact, LabPatient } from '../types'

interface CtxMenuState {
  x: number
  y: number
  mediaPath?: string
  mediaType?: string
  messageId: string | number
}

interface AddToAcctState {
  phone: string
  name: string
  clientId: string
}

interface VnoteModalState {
  src: string
  id: string | number
}

interface Props {
  message: ChatMessage
  messages: ChatMessage[]
  selectedClient: string | null
  selectedAccount: string
  selectedBusiness?: string
  token: string

  forwardMode: boolean
  selectedMsgIds: Set<string | number>
  toggleMsgSelection: (id: string | number) => void
  chatSearchResults: (string | number)[]
  chatSearchIdx: number
  setCtxMenu: Dispatch<SetStateAction<CtxMenuState | null>>

  mediaBlobMap: Record<string, string>
  mediaLoading: Record<string, boolean>
  loadMediaBlob: (key: string, mediaPath: string) => Promise<string | null>
  setLightboxSrc: Dispatch<SetStateAction<string | null>>

  shellOpen: (url: string) => Promise<void>
  openMedia: (mediaPath: string, mediaType: string, messageId: string | number) => void
  scrollToReplyMessage?: (msgId: number, peerId?: number) => void

  setVnoteModal: Dispatch<SetStateAction<VnoteModalState | null>>
  setVnotePlaying: Dispatch<SetStateAction<boolean>>
  setVnoteProgress: Dispatch<SetStateAction<number>>

  photoMap: Record<string, string>
  contacts: Contact[]
  setAddToAcctModal: Dispatch<SetStateAction<AddToAcctState | null>>
  checkPhoneMessengers: (phone: string) => void

  setMessages: Dispatch<SetStateAction<ChatMessage[]>>

  setRightTab: (tab: 'notes' | 'quick' | 'lab' | 'clients' | 'card') => void
  labPatients: LabPatient[]
  labLoading: boolean
  loadLabResults: (page: number, search: string) => void
  setExpandedLabPatient: Dispatch<SetStateAction<string | null>>
  editLabResult: (message: ChatMessage) => void
  unlinkLabResult: (message: ChatMessage) => void
}

/**
 * Full-fat message renderer. Composed from ~18 sub-components that each handle
 * one media-type / decoration (reply quote, reactions, footer, lab strip, etc).
 * This component only handles the outer container, forward-mode checkbox, bubble
 * classes, and context menu dispatch — content rendering is delegated downward.
 */
export function MessageBubble({
  message: m,
  messages,
  selectedClient,
  selectedAccount,
  selectedBusiness = '',
  token,
  forwardMode,
  selectedMsgIds,
  toggleMsgSelection,
  chatSearchResults,
  chatSearchIdx,
  setCtxMenu,
  mediaBlobMap,
  mediaLoading,
  loadMediaBlob,
  setLightboxSrc,
  shellOpen,
  openMedia,
  scrollToReplyMessage,
  setVnoteModal,
  setVnotePlaying,
  setVnoteProgress,
  photoMap,
  contacts,
  setAddToAcctModal,
  checkPhoneMessengers,
  setMessages,
  setRightTab,
  labPatients,
  labLoading,
  loadLabResults,
  setExpandedLabPatient,
  editLabResult,
  unlinkLabResult,
}: Props) {
  const isSelected = selectedMsgIds.has(m.id)
  const isSearchHit = chatSearchResults.includes(m.id as number)
  const isSearchActive = chatSearchResults[chatSearchIdx] === m.id

  const outerClass = `msg ${m.direction} src-${m.source || 'telegram'}`
    + `${forwardMode ? ' selectable' : ''}`
    + `${isSelected ? ' selected' : ''}`
    + `${isSearchHit ? ' search-highlight' : ''}`
    + `${isSearchActive ? ' search-active' : ''}`

  const bubbleClass = 'msg-bubble'
    + `${m.is_deleted ? ' msg-bubble-deleted' : ''}`
    + `${m.is_lab_result ? ' msg-bubble-lab' : ''}`
    + `${m.media_type === 'sticker' && (m.thumbnail || m.media_file) ? ' msg-bubble-sticker' : ''}`
    + `${m.media_type === 'video_note' ? ' msg-bubble-vnote' : ''}`

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (m.has_media && m.media_file) {
      setCtxMenu({ x: e.clientX, y: e.clientY, mediaPath: m.media_file, mediaType: m.media_type, messageId: m.id })
    } else {
      setCtxMenu({ x: e.clientX, y: e.clientY, messageId: m.id })
    }
  }

  const clientInitial = (contacts.find(c => c.client_id === selectedClient)?.full_name || '?')[0].toUpperCase()

  const showTextRow = !!m.text
    && m.media_type !== 'contact'
    && !(m.media_type === 'poll' && (m.poll_question || m.text.startsWith('📊') || m.text.startsWith('📋')))
    && !(m.media_type === 'geo' && (m.location_lat != null || m.text.includes('📍')))

  const linkPreviewUrl = (m.text && !m.is_deleted && m.media_type !== 'geo')
    ? extractFirstUrl(m.text)
    : null

  return (
    <div
      data-msg-id={m.id}
      className={outerClass}
      onClick={forwardMode ? () => toggleMsgSelection(m.id) : undefined}
      onContextMenu={!forwardMode ? handleContextMenu : undefined}
    >
      {forwardMode && (
        <div className={`msg-checkbox${isSelected ? ' checked' : ''}`}>
          {isSelected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
      )}
      <div className={bubbleClass}>
        <BubbleHeader message={m} />
        <ReplyQuote
          message={m}
          messages={messages}
          token={token}
          mediaBlobMap={mediaBlobMap}
          loadMediaBlob={loadMediaBlob}
          onClickReply={scrollToReplyMessage}
        />
        <PhotoBubble
          message={m}
          token={token}
          mediaBlobMap={mediaBlobMap}
          loadMediaBlob={loadMediaBlob}
          setLightboxSrc={setLightboxSrc}
        />
        {m.has_media && m.media_type === 'voice' && (
          <VoiceBubble
            message={m}
            mediaBlobMap={mediaBlobMap}
            mediaLoading={mediaLoading}
            loadMediaBlob={loadMediaBlob}
          />
        )}
        {m.has_media && m.media_type === 'video_note' && (
          <VideoNoteBubble
            message={m}
            token={token}
            mediaBlobMap={mediaBlobMap}
            mediaLoading={mediaLoading}
            loadMediaBlob={loadMediaBlob}
            onOpenVnote={(src, id) => {
              setVnoteModal({ src, id })
              setVnotePlaying(true)
              setVnoteProgress(0)
            }}
          />
        )}
        {m.has_media && m.media_type === 'video' && (
          <VideoBubble
            message={m}
            token={token}
            mediaBlobMap={mediaBlobMap}
            mediaLoading={mediaLoading}
            loadMediaBlob={loadMediaBlob}
          />
        )}
        {m.has_media && m.media_type === 'document' && (
          <DocumentBubble
            message={m}
            mediaLoading={mediaLoading}
            onOpen={openMedia}
          />
        )}
        <MediaPendingIndicator message={m} />
        {m.media_type === 'sticker' && (
          <StickerBubble
            message={m}
            token={token}
            mediaBlobMap={mediaBlobMap}
            loadMediaBlob={loadMediaBlob}
          />
        )}
        <UnknownMediaPlaceholder message={m} />
        {m.media_type === 'contact' && (
          <ContactBubble
            message={m}
            contacts={contacts}
            photoMap={photoMap}
            onAddToAccount={(state) => {
              setAddToAcctModal(state)
              checkPhoneMessengers(state.phone)
            }}
          />
        )}
        {m.media_type === 'poll' && (
          <PollBubble
            message={m}
            selectedAccount={selectedAccount}
            authToken={token}
            onTextUpdate={(msgId, newText) => setMessages(prev => prev.map(msg => msg.id === msgId ? { ...msg, text: newText } : msg))}
          />
        )}
        {m.media_type === 'geo' && <GeoBubble message={m} shellOpen={shellOpen} />}
        {showTextRow && (
          <div className={`msg-text${m.is_deleted ? ' msg-text-deleted' : ''}`}>
            <Linkify text={m.text} onLinkClick={u => shellOpen(u)} />
          </div>
        )}
        {linkPreviewUrl && (
          <LinkPreviewCard url={linkPreviewUrl} token={token} onClick={u => shellOpen(u)} />
        )}
        <InlineButtons
          message={m}
          selectedAccount={selectedAccount}
          token={token}
          shellOpen={shellOpen}
        />
        {m.button_text && m.button_url && (
          <button
            type="button"
            className="msg-viber-btn"
            onClick={(e) => { e.stopPropagation(); shellOpen(m.button_url!) }}
            title={m.button_url}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>{m.button_text}</span>
          </button>
        )}
        <DeletedLabel message={m} />
        <ReactionsRow
          reactions={m.reactions || []}
          selectedClient={selectedClient}
          clientPhotoUrl={selectedClient ? photoMap[selectedClient] : undefined}
          clientInitial={clientInitial}
        />
        <MessageFooter message={m} />
        <BubbleOrigin
          message={m}
          activeAccountId={selectedBusiness || selectedAccount || ''}
        />
        <FailedStatusLabel message={m} />
      </div>
      <LabResultStrip
        message={m}
        onOpenLabTab={(patientKey) => {
          setRightTab('lab')
          if (labPatients.length === 0 && !labLoading) loadLabResults(1, '')
          setExpandedLabPatient(patientKey)
        }}
        onEditLabResult={editLabResult}
        onUnlinkLabResult={unlinkLabResult}
      />
    </div>
  )
}
