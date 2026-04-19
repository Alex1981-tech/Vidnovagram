import { URL_REGEX } from '../utils/urlExtract'

export function Linkify({ text, onLinkClick }: { text: string; onLinkClick: (url: string) => void }) {
  const parts = text.split(URL_REGEX)
  const urls = text.match(URL_REGEX) || []
  const result: React.ReactNode[] = []
  parts.forEach((part, i) => {
    if (part) result.push(part)
    if (urls[i]) {
      result.push(
        <a
          key={i}
          className="msg-link"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onLinkClick(urls[i])
          }}
        >
          {urls[i].length > 60 ? urls[i].slice(0, 57) + '...' : urls[i]}
        </a>,
      )
    }
  })
  return <>{result}</>
}
