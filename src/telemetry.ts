/**
 * Vidnovagram telemetry — collects system info and usage events,
 * batches and sends to cc.vidnova.app backend.
 */

const API_BASE = 'https://cc.vidnova.app/api'
const FLUSH_INTERVAL = 60_000    // 60s
const HEARTBEAT_INTERVAL = 300_000 // 5min
const OFFLINE_THRESHOLD = 360_000  // 6min (server checks last_seen < 6min)

interface TelemetryEvent {
  event_type: string
  metadata: Record<string, unknown>
  client_time: string
}

let token = ''
let deviceId = ''
let flushTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let eventQueue: TelemetryEvent[] = []
let chatViewStart: { clientId: string; accountId: string; ts: number } | null = null

function getDeviceId(): string {
  let id = localStorage.getItem('vidnovagram_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('vidnovagram_device_id', id)
  }
  return id
}

function getSystemInfo() {
  const ua = navigator.userAgent
  let osName = 'Unknown'
  let osVersion = ''

  if (ua.includes('Windows NT 10.0')) {
    osName = ua.includes('Windows NT 10.0; Win64') ? 'Windows 10/11' : 'Windows 10'
    const match = ua.match(/Windows NT (\d+\.\d+)/)
    if (match) osVersion = match[1]
  } else if (ua.includes('Windows')) {
    osName = 'Windows'
    const match = ua.match(/Windows NT (\d+\.\d+)/)
    if (match) osVersion = match[1]
  } else if (ua.includes('Mac')) {
    osName = 'macOS'
  } else if (ua.includes('Linux')) {
    osName = 'Linux'
  }

  return {
    device_id: deviceId,
    app_version: '', // will be set from getVersion()
    os_name: osName,
    os_version: osVersion,
    cpu_cores: navigator.hardwareConcurrency || 0,
    ram_mb: Math.round(((navigator as any).deviceMemory || 0) * 1024),
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    screen_scale: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
  }
}

function pushEvent(type: string, metadata: Record<string, unknown> = {}) {
  eventQueue.push({
    event_type: type,
    metadata,
    client_time: new Date().toISOString(),
  })
}

async function flush() {
  if (!token || eventQueue.length === 0) return

  const events = eventQueue.splice(0)
  const sysInfo = getSystemInfo()

  // Try to get app version
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    sysInfo.app_version = await getVersion()
  } catch { /* ignore */ }

  try {
    await fetch(`${API_BASE}/vidnovagram/telemetry/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
      },
      body: JSON.stringify({ device: sysInfo, events }),
    })
  } catch (e) {
    // Put events back on failure
    eventQueue.unshift(...events)
    console.warn('[Telemetry] flush failed:', e)
  }
}

function heartbeat() {
  pushEvent('heartbeat')
  flush()
}

// ── Public API ──

export function init(authToken: string) {
  token = authToken
  deviceId = getDeviceId()

  pushEvent('app_open')

  // Periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL)

  // Heartbeat every 5 min
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL)

  // Flush on close
  window.addEventListener('beforeunload', () => {
    finishChatView()
    pushEvent('app_close')
    // Use keepalive fetch for reliable delivery on close (supports headers unlike sendBeacon)
    const sysInfo = getSystemInfo()
    const events = eventQueue.splice(0)
    if (events.length === 0) return
    try {
      fetch(`${API_BASE}/vidnovagram/telemetry/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ device: sysInfo, events }),
        keepalive: true,
      })
    } catch { /* ignore */ }
  })
}

export function stop() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  flush()
  token = ''
}

function finishChatView() {
  if (chatViewStart) {
    const duration = Math.round((Date.now() - chatViewStart.ts) / 1000)
    if (duration > 1) {
      pushEvent('chat_view', {
        client_id: chatViewStart.clientId,
        account_id: chatViewStart.accountId,
        duration_seconds: duration,
      })
    }
    chatViewStart = null
  }
}

export function trackChatView(clientId: string, accountId: string) {
  finishChatView()
  chatViewStart = { clientId, accountId, ts: Date.now() }
}

export function trackChatWrite(clientId: string, accountId: string, messageType = 'text') {
  pushEvent('chat_write', { client_id: clientId, account_id: accountId, message_type: messageType })
}

export function trackSearch(queryLength: number, resultCount: number) {
  pushEvent('search', { query_length: queryLength, result_count: resultCount })
}

export function trackTabSwitch(accountId: string) {
  pushEvent('tab_switch', { account_id: accountId })
}
