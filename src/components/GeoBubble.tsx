import type { ChatMessage } from '../types'

interface Props {
  message: ChatMessage
  shellOpen: (url: string) => Promise<void>
}

/**
 * Geolocation / live-location card with a 2×2 OpenStreetMap tile preview and
 * pin overlay. Data comes from dedicated lat/lng fields, or is parsed from
 * legacy text that starts with 📍 and includes a `maps.google.com` URL.
 * Click opens the full map in the external shell.
 */
export function GeoBubble({ message: m, shellOpen }: Props) {
  let title = ''
  let address = ''
  let mapUrl = ''
  let isLive = false

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
  const tx = Math.floor(xTile)
  const ty = Math.floor(yTile)
  const fracX = xTile - tx
  const fracY = yTile - ty
  const tileBase = `https://tile.openstreetmap.org/${zoom}`

  return (
    <div className="msg-geo-card" onClick={() => { if (mapUrl) shellOpen(mapUrl) }}>
      {hasCoords && (
        <div className="msg-geo-map">
          <div
            className="msg-geo-tiles"
            style={{ transform: `translate(${-(fracX * 256)}px, ${-(fracY * 256)}px)` }}
          >
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
}
