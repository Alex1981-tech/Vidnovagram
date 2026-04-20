import type { Dispatch, SetStateAction } from 'react'
import { TelegramIcon, WhatsAppIcon } from './icons'
import type { Contact } from '../types'

export interface ClientCardData {
  id: string
  phone: string
  full_name: string
  email?: string
  instagram?: string
  facebook?: string
  tiktok?: string
  city?: string
  source?: string
  source_detail?: string
  comment?: string
  tags?: { id: string; name: string; color: string }[]
  links?: { id: string; url: string; title: string; created_at: string }[]
  linked_phones?: { id: string; phone: string; full_name: string }[]
}

type Social = 'instagram' | 'facebook' | 'tiktok'

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  selectedClient: string | null
  selectedContact: Contact | undefined
  contacts: Contact[]
  clientLinkedPhones: { id: string; phone: string }[]
  cardLoading: boolean
  cardData: ClientCardData | null
  allTags: Tag[]

  showTagPicker: boolean
  setShowTagPicker: Dispatch<SetStateAction<boolean>>
  newTagName: string
  setNewTagName: Dispatch<SetStateAction<string>>
  toggleCardTag: (tagId: string) => void
  createCardTag: (name: string) => void

  cardEditField: string | null
  setCardEditField: Dispatch<SetStateAction<string | null>>
  cardEditValue: string
  setCardEditValue: Dispatch<SetStateAction<string>>
  saveCardField: (field: string, value: string) => void

  showAddLink: boolean
  setShowAddLink: Dispatch<SetStateAction<boolean>>
  linkUrl: string
  setLinkUrl: Dispatch<SetStateAction<string>>
  linkTitle: string
  setLinkTitle: Dispatch<SetStateAction<string>>
  addCardLink: () => void
  deleteCardLink: (linkId: string) => void

  openClientChat: (clientId: string, phone?: string, name?: string) => void
  shellOpen: (url: string) => Promise<void>
}

const SOCIALS: readonly Social[] = ['instagram', 'facebook', 'tiktok'] as const
const SOCIAL_ICON: Record<Social, string> = {
  instagram: '📷',
  facebook: '📘',
  tiktok: '🎵',
}

/**
 * Right panel "Картка клієнта" tab: tags, social links, email/city/source/comment,
 * custom URL links. All fields use inline edit (click-to-edit, Enter to save, Escape to cancel).
 */
export function ClientCardTab({
  selectedClient,
  selectedContact,
  contacts,
  clientLinkedPhones,
  cardLoading,
  cardData,
  allTags,
  showTagPicker,
  setShowTagPicker,
  newTagName,
  setNewTagName,
  toggleCardTag,
  createCardTag,
  cardEditField,
  setCardEditField,
  cardEditValue,
  setCardEditValue,
  saveCardField,
  showAddLink,
  setShowAddLink,
  linkUrl,
  setLinkUrl,
  linkTitle,
  setLinkTitle,
  addCardLink,
  deleteCardLink,
  openClientChat,
  shellOpen,
}: Props) {
  if (!selectedClient) {
    return <div className="rp-empty">Оберіть чат для перегляду картки</div>
  }

  if (contacts.find(c => c.client_id === selectedClient)?.is_employee) {
    return <div className="rp-empty">Картка доступна тільки для клієнтів</div>
  }

  if (cardLoading) {
    return (
      <div className="rp-card">
        <div className="rp-empty">Завантаження...</div>
      </div>
    )
  }

  if (!cardData) {
    return (
      <div className="rp-card">
        <div className="rp-empty">Немає даних</div>
      </div>
    )
  }

  return (
    <div className="rp-card">
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
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  placeholder="Новий тег..."
                  onKeyDown={e => { if (e.key === 'Enter' && newTagName.trim()) { createCardTag(newTagName); setShowTagPicker(false) } }}
                />
                {newTagName.trim() && <button onClick={() => { createCardTag(newTagName); setShowTagPicker(false) }}>+</button>}
              </div>
            </div>
          )}
        </div>

        {/* Social Links */}
        <div className="rp-card-section">
          <div className="rp-card-label">Соцмережі</div>
          <div className="rp-card-socials">
            {SOCIALS.map(soc => (
              <div key={soc} className="rp-card-social-row">
                <span className={`rp-card-social-icon ${soc}`}>{SOCIAL_ICON[soc]}</span>
                {cardEditField === soc ? (
                  <input
                    className="rp-card-input"
                    autoFocus
                    value={cardEditValue}
                    onChange={e => setCardEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveCardField(soc, cardEditValue); if (e.key === 'Escape') setCardEditField(null) }}
                    onBlur={() => saveCardField(soc, cardEditValue)}
                    placeholder={`@${soc}`}
                  />
                ) : (
                  <span
                    className={`rp-card-social-value${cardData[soc] ? '' : ' empty'}`}
                    onClick={() => { setCardEditField(soc); setCardEditValue(cardData[soc] || '') }}
                  >
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
            <input
              className="rp-card-input"
              autoFocus
              value={cardEditValue}
              onChange={e => setCardEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCardField('email', cardEditValue); if (e.key === 'Escape') setCardEditField(null) }}
              onBlur={() => saveCardField('email', cardEditValue)}
              placeholder="email@example.com"
            />
          ) : (
            <span
              className={`rp-card-value${cardData.email ? '' : ' empty'}`}
              onClick={() => { setCardEditField('email'); setCardEditValue(cardData.email || '') }}
            >
              {cardData.email || 'Додати email'}
            </span>
          )}
        </div>

        {/* City */}
        <div className="rp-card-section">
          <div className="rp-card-label">Місто</div>
          {cardEditField === 'city' ? (
            <input
              className="rp-card-input"
              autoFocus
              value={cardEditValue}
              onChange={e => setCardEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCardField('city', cardEditValue); if (e.key === 'Escape') setCardEditField(null) }}
              onBlur={() => saveCardField('city', cardEditValue)}
              placeholder="Місто"
            />
          ) : (
            <span
              className={`rp-card-value${cardData.city ? '' : ' empty'}`}
              onClick={() => { setCardEditField('city'); setCardEditValue(cardData.city || '') }}
            >
              {cardData.city || 'Додати місто'}
            </span>
          )}
        </div>

        {/* Source */}
        <div className="rp-card-section">
          <div className="rp-card-label">Джерело</div>
          {cardEditField === 'source' ? (
            <select
              className="rp-card-select"
              autoFocus
              value={cardEditValue}
              onChange={e => { setCardEditValue(e.target.value); saveCardField('source', e.target.value) }}
              onBlur={() => setCardEditField(null)}
            >
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
            <span
              className={`rp-card-value${cardData.source ? '' : ' empty'}`}
              onClick={() => { setCardEditField('source'); setCardEditValue(cardData.source || '') }}
            >
              {cardData.source || 'Вказати джерело'}
            </span>
          )}
        </div>

        {/* Comment */}
        <div className="rp-card-section">
          <div className="rp-card-label">Коментар</div>
          {cardEditField === 'comment' ? (
            <textarea
              className="rp-card-textarea"
              autoFocus
              value={cardEditValue}
              onChange={e => setCardEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveCardField('comment', cardEditValue) }
                if (e.key === 'Escape') setCardEditField(null)
              }}
              onBlur={() => saveCardField('comment', cardEditValue)}
              placeholder="Коментар..."
              rows={3}
            />
          ) : (
            <span
              className={`rp-card-value rp-card-comment${cardData.comment ? '' : ' empty'}`}
              onClick={() => { setCardEditField('comment'); setCardEditValue(cardData.comment || '') }}
            >
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
              <input
                value={linkTitle}
                onChange={e => setLinkTitle(e.target.value)}
                placeholder="Назва (необов'язково)"
                onKeyDown={e => { if (e.key === 'Enter') addCardLink() }}
              />
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
    </div>
  )
}
