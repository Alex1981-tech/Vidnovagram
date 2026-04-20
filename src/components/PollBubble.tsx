import { PollCard } from './PollCard'
import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  selectedAccount: string
  authToken: string
  onTextUpdate: (msgId: string | number, newText: string) => void
}

/**
 * Wraps PollCard for two sources:
 *  - native TG poll/todo with dedicated `poll_question` + `poll_options` fields
 *  - legacy text-based checklist prefixed with 📊 (poll) or 📋 (todo)
 */
export function PollBubble({ message: m, selectedAccount, authToken, onTextUpdate }: Props) {
  const syncProps = {
    accountId: m.account_id || selectedAccount,
    peerId: m.tg_peer_id,
    tgMessageId: m.tg_message_id,
    fullText: m.text,
    authToken,
    onTextUpdate,
  }

  // Dedicated API fields present
  if (m.poll_question) {
    const opts = (m.poll_options || []).map(o => typeof o === 'string' ? o : o.text)
    const isTodo = opts.some(o => o.startsWith('☐ ') || o.startsWith('☑ '))
    const normalizedOpts = isTodo ? opts : opts.map(o => `☐ ${o}`)
    return (
      <PollCard
        question={m.poll_question}
        options={normalizedOpts}
        messageId={m.id}
        totalVoters={m.poll_total_voters}
        isClosed={m.poll_is_closed}
        isTodo={isTodo}
        {...syncProps}
      />
    )
  }

  // Text-based fallback
  if (m.text && (m.text.startsWith('📊') || m.text.startsWith('📋'))) {
    const lines = m.text.split('\n')
    const isTodo = m.text.startsWith('📋')
    const question = lines[0]?.replace(/^[📊📋]\s*/, '') || 'Опитування'
    const options = lines.slice(1).filter(l => l.startsWith('☐') || l.startsWith('☑'))
    return (
      <PollCard
        question={question}
        options={options}
        messageId={m.id}
        isTodo={isTodo}
        {...syncProps}
      />
    )
  }

  return null
}
