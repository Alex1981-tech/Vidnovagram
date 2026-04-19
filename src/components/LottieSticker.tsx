import { useEffect, useRef } from 'react'
// lottie-web + pako are heavy (~500 KB combined) and only needed when
// an animated Telegram sticker is actually rendered. Lazy-import them.

/**
 * Plays a Telegram TGS (gzipped Lottie) sticker from an already-fetched
 * blob URL. Handles both compressed and plain-JSON payloads.
 */
export function LottieSticker({ blobUrl, size = 200 }: { blobUrl: string; size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<any>(null)

  useEffect(() => {
    if (!blobUrl || !containerRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const [{ default: lottie }, { default: pako }] = await Promise.all([
          import('lottie-web'),
          import('pako'),
        ])
        const resp = await fetch(blobUrl)
        const buf = new Uint8Array(await resp.arrayBuffer())
        let json: any
        try {
          // TGS files are gzipped Lottie JSON.
          const decompressed = pako.inflate(buf, { to: 'string' })
          json = JSON.parse(decompressed)
        } catch {
          // Fallback: plain JSON (not gzipped).
          json = JSON.parse(new TextDecoder().decode(buf))
        }
        if (cancelled || !containerRef.current) return
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: json,
        })
      } catch (e) {
        console.warn('LottieSticker error:', e)
      }
    })()
    return () => {
      cancelled = true
      animRef.current?.destroy()
    }
  }, [blobUrl])

  return <div ref={containerRef} style={{ width: size, height: size }} />
}
