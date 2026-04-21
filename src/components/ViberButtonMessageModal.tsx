import { useCallback, useEffect, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSend: (payload: { text: string; buttonText: string; buttonUrl: string }) => Promise<void>
}

/**
 * "Viber message + link button" modal.
 * Three fields: body text, button label (≤ 30 chars per TurboSMS), URL.
 * Button+URL both required; text optional — but TurboSMS still wants some
 * textual body, so if empty we disable the submit.
 */
export function ViberButtonMessageModal({ open, onClose, onSend }: Props) {
  const [text, setText] = useState('')
  const [buttonText, setButtonText] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) {
      setText(''); setButtonText(''); setButtonUrl(''); setSending(false)
    }
  }, [open])

  const submit = useCallback(async () => {
    if (!text.trim() || !buttonText.trim() || !buttonUrl.trim() || sending) return
    setSending(true)
    try {
      await onSend({ text: text.trim(), buttonText: buttonText.trim(), buttonUrl: buttonUrl.trim() })
      onClose()
    } finally {
      setSending(false)
    }
  }, [text, buttonText, buttonUrl, sending, onSend, onClose])

  if (!open) return null

  const urlLooksValid = !buttonUrl.trim() || /^https?:\/\//i.test(buttonUrl.trim())
  const canSend = !!text.trim() && !!buttonText.trim() && !!buttonUrl.trim() && urlLooksValid

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 440, maxWidth: 520 }}>
        <h3>Viber — повідомлення з кнопкою</h3>
        <label className="viber-btn-modal-label">Текст повідомлення</label>
        <textarea
          className="forward-modal-search"
          placeholder="Текст повідомлення клієнту…"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          style={{ resize: 'vertical', minHeight: 70 }}
          autoFocus
        />
        <label className="viber-btn-modal-label">Назва кнопки <span className="viber-btn-modal-hint">(до 30 символів)</span></label>
        <input
          className="forward-modal-search"
          placeholder="Напр.: Записатись"
          value={buttonText}
          maxLength={30}
          onChange={e => setButtonText(e.target.value)}
        />
        <label className="viber-btn-modal-label">Посилання <span className="viber-btn-modal-hint">(https://…)</span></label>
        <input
          className="forward-modal-search"
          placeholder="https://vidnova.app/book"
          value={buttonUrl}
          onChange={e => setButtonUrl(e.target.value)}
        />
        {!urlLooksValid && (
          <div className="add-contact-result warn">URL має починатися з http:// або https://</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="tpl-btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="tpl-btn-primary" onClick={submit} disabled={!canSend || sending}>
            {sending ? 'Надсилання…' : 'Надіслати'}
          </button>
        </div>
      </div>
    </div>
  )
}
