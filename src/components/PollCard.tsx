import { useState } from 'react'
import { API_BASE } from '../constants'
import { authFetch } from '../utils/authFetch'

/**
 * Renders a poll/todo card. Supports two sync paths:
 *  - native Telegram ToDo (`toggle-todo` API)
 *  - text-based checklists (`edit-message` API)
 */
export function PollCard({
  question,
  options,
  messageId,
  totalVoters,
  isClosed,
  accountId,
  peerId,
  tgMessageId,
  fullText,
  authToken,
  onTextUpdate,
  isTodo,
}: {
  question: string
  options: string[]
  messageId: number | string
  totalVoters?: number
  isClosed?: boolean
  accountId?: string
  peerId?: number
  tgMessageId?: number
  fullText?: string
  authToken?: string
  onTextUpdate?: (msgId: number | string, newText: string) => void
  isTodo?: boolean
}) {
  const canSync = !!(accountId && peerId && tgMessageId && authToken && onTextUpdate)
  const checked = new Set<number>(options.map((opt, i) => (opt.startsWith('☑') ? i : -1)).filter(i => i >= 0))
  const [syncing, setSyncing] = useState(false)

  const toggle = async (idx: number) => {
    if (syncing) return
    if (!canSync) {
      console.error('PollCard canSync=false:', {
        accountId,
        peerId,
        tgMessageId,
        authToken: !!authToken,
        onTextUpdate: !!onTextUpdate,
      })
      return
    }
    const opt = options[idx]
    if (!opt) return
    const wasChecked = opt.startsWith('☑')
    const newMarker = wasChecked ? '☐' : '☑'

    // Optimistic local update.
    if (fullText) {
      const lines = fullText.split('\n')
      const checklistLines = lines.filter(l => l.startsWith('☐') || l.startsWith('☑'))
      const targetLine = checklistLines[idx]
      if (targetLine) {
        let replaced = false
        const newLines = lines.map(l => {
          if (!replaced && l === targetLine) {
            replaced = true
            return newMarker + l.slice(1)
          }
          return l
        })
        onTextUpdate!(messageId, newLines.join('\n'))
      }
    }

    setSyncing(true)
    try {
      if (isTodo) {
        await authFetch(`${API_BASE}/telegram/toggle-todo/`, authToken!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: accountId,
            peer_id: peerId,
            message_id: tgMessageId,
            completed: wasChecked ? [] : [idx],
            incompleted: wasChecked ? [idx] : [],
          }),
        })
      } else if (fullText) {
        const lines = fullText.split('\n')
        const checklistLines = lines.filter(l => l.startsWith('☐') || l.startsWith('☑'))
        const targetLine = checklistLines[idx]
        if (targetLine) {
          let replaced = false
          const newLines = lines.map(l => {
            if (!replaced && l === targetLine) {
              replaced = true
              return newMarker + l.slice(1)
            }
            return l
          })
          await authFetch(`${API_BASE}/telegram/edit-message/`, authToken!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: accountId,
              peer_id: peerId,
              message_id: tgMessageId,
              text: newLines.join('\n'),
            }),
          })
        }
      }
    } catch (e) {
      console.error('Checklist sync failed:', e)
      if (fullText) onTextUpdate!(messageId, fullText) // revert
    }
    setSyncing(false)
  }

  const doneCount = checked.size
  return (
    <div className="msg-poll-card">
      <div className="msg-poll-title">
        {isTodo ? '📋' : '📊'} {question}
      </div>
      <div className="msg-poll-options">
        {options.map((opt, i) => {
          const label = opt.replace(/^[☐☑]\s*/, '')
          const done = checked.has(i)
          return (
            <button
              key={i}
              className={`msg-poll-option${done ? ' checked' : ''}`}
              onClick={() => toggle(i)}
              disabled={syncing}
            >
              <span className="msg-poll-check">{done ? '☑' : '☐'}</span>
              <span className={`msg-poll-label${done ? ' done' : ''}`}>{label}</span>
            </button>
          )
        })}
      </div>
      <div className="msg-poll-footer">
        {doneCount} з {options.length} виконано
        {(totalVoters ?? 0) > 0 && <span className="msg-poll-voters"> · {totalVoters} голосів</span>}
        {isClosed && <span className="msg-poll-closed"> · Закрито</span>}
      </div>
    </div>
  )
}
