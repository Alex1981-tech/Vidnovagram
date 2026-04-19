// URL detection helpers used by the linkify renderer and link-preview card.

export const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi

export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX)
  return m ? m[0] : null
}
