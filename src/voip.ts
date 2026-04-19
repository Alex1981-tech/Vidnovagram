/**
 * VoIP API for Vidnovagram.
 *
 * Signaling/state lives in the backend.
 * Live audio uses a dedicated websocket media channel.
 */

const API_BASE = 'https://cc.vidnova.app'
const VOIP_WS_BASE = 'wss://cc.vidnova.app/ws/voip-audio/'
const AUDIO_SAMPLE_RATE = 48_000
const AUDIO_CHANNELS = 1
const AUDIO_FRAME_MAGIC = 0x56444e41
const AUDIO_FRAME_HEADER_BYTES = 16
const RECONNECT_DELAYS_MS = [750, 1500, 3000, 5000]

export interface VoIPCall {
  id: number
  tg_account_id: string | null
  direction: 'outgoing' | 'incoming'
  state: 'ringing' | 'connecting' | 'connected' | 'media_connecting' | 'media_live' | 'media_failed' | 'ended'
  tg_peer_id: number
  peer_phone: string
  peer_name: string
  mp_call_id: string
  started_at: string | null
  answered_at: string | null
  ended_at: string | null
  end_reason: string
  recording_file?: string
  recording_duration_seconds: number | null
  media_error?: string
}

export type AudioEngineState = 'idle' | 'connecting' | 'streaming' | 'error'

type AuthFetchFn = (url: string, init?: RequestInit) => Promise<Response>

interface AudioEngineStartOptions {
  callId: number | string
  token: string
  mpCallId?: string | null
}

interface DecodedAudioFrame {
  pcm: Float32Array
  seq: number
  timestampMs: number
}

function encodePcmToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i] || 0))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return out
}

function encodeAudioFrame(input: Float32Array, seq: number, timestampMs: number): ArrayBuffer {
  const pcm = encodePcmToInt16(input)
  const frame = new ArrayBuffer(AUDIO_FRAME_HEADER_BYTES + pcm.byteLength)
  const view = new DataView(frame)
  view.setUint32(0, AUDIO_FRAME_MAGIC, true)
  view.setUint32(4, seq >>> 0, true)
  view.setUint32(8, Math.max(0, timestampMs) >>> 0, true)
  view.setUint32(12, pcm.length >>> 0, true)
  new Int16Array(frame, AUDIO_FRAME_HEADER_BYTES, pcm.length).set(pcm)
  return frame
}

function decodeInt16Pcm(buffer: ArrayBuffer): Float32Array {
  const input = new Int16Array(buffer)
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    out[i] = input[i] / 0x8000
  }
  return out
}

function decodeAudioFrame(buffer: ArrayBuffer): DecodedAudioFrame | null {
  if (buffer.byteLength === 0) return null

  if (buffer.byteLength >= AUDIO_FRAME_HEADER_BYTES) {
    const view = new DataView(buffer)
    const magic = view.getUint32(0, true)
    if (magic === AUDIO_FRAME_MAGIC) {
      const seq = view.getUint32(4, true)
      const timestampMs = view.getUint32(8, true)
      return {
        pcm: decodeInt16Pcm(buffer.slice(AUDIO_FRAME_HEADER_BYTES)),
        seq,
        timestampMs,
      }
    }
  }

  return {
    pcm: decodeInt16Pcm(buffer),
    seq: 0,
    timestampMs: 0,
  }
}

export class AudioEngine {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private mediaSourceNode: MediaStreamAudioSourceNode | null = null
  private captureNode: AudioWorkletNode | null = null
  private playbackNode: AudioWorkletNode | null = null
  private ws: WebSocket | null = null
  private muted = false
  private stopped = true
  private currentCallId: string | number | null = null
  private receiveSeq = 0
  private sendSeq = 1
  private captureStartedAtMs = 0
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private currentToken = ''
  private currentMpCallId = ''
  private workletLoaded = false
  private readonly onStateChange?: (state: AudioEngineState, error?: string) => void

  constructor(onStateChange?: (state: AudioEngineState, error?: string) => void) {
    this.onStateChange = onStateChange
  }

  get callId(): string | number | null {
    return this.currentCallId
  }

  get isActive(): boolean {
    return !this.stopped
  }

  async start({ callId, token, mpCallId }: AudioEngineStartOptions): Promise<void> {
    if (!token) throw new Error('Missing auth token for VoIP audio')

    if (!this.stopped) {
      if (this.currentCallId === callId) return
      await this.stop()
    }

    this.stopped = false
    this.currentCallId = callId
    this.currentToken = token
    this.currentMpCallId = mpCallId || ''
    this.sendSeq = 1
    this.receiveSeq = 0
    this.captureStartedAtMs = 0
    this.reconnectAttempt = 0
    this.setState('connecting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_SAMPLE_RATE,
          channelCount: AUDIO_CHANNELS,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      if (this.stopped) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      this.mediaStream = stream
      this.audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      if (!this.workletLoaded) {
        await this.audioContext.audioWorklet.addModule('/voip-capture-worklet.js')
        await this.audioContext.audioWorklet.addModule('/voip-playback-worklet.js')
        this.workletLoaded = true
      }

      this.mediaSourceNode = this.audioContext.createMediaStreamSource(stream)
      this.captureNode = new AudioWorkletNode(this.audioContext, 'voip-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: AUDIO_CHANNELS,
      })
      this.playbackNode = new AudioWorkletNode(this.audioContext, 'voip-playback', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [AUDIO_CHANNELS],
      })

      this.captureNode.port.onmessage = (event) => {
        if (this.stopped || this.muted) return
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        const channel = event.data as Float32Array
        if (!channel || channel.length === 0) return
        if (!this.captureStartedAtMs) this.captureStartedAtMs = performance.now()
        const timestampMs = Math.round(performance.now() - this.captureStartedAtMs)
        const frame = encodeAudioFrame(channel, this.sendSeq, timestampMs)
        this.sendSeq += 1
        if (frame.byteLength > AUDIO_FRAME_HEADER_BYTES) {
          this.ws.send(frame)
        }
      }

      this.mediaSourceNode.connect(this.captureNode)
      this.playbackNode.connect(this.audioContext.destination)
      this.openWebSocket()
    } catch (error: any) {
      await this.stop()
      this.setState('error', error?.message || 'Failed to start audio engine')
      throw error
    }
  }

  mute(): void {
    this.muted = true
  }

  unmute(): void {
    this.muted = false
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.muted = false
    this.currentCallId = null
    this.currentToken = ''
    this.currentMpCallId = ''
    this.sendSeq = 1
    this.receiveSeq = 0
    this.captureStartedAtMs = 0
    this.reconnectAttempt = 0

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const ws = this.ws
    this.ws = null
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close() } catch {}
    }

    if (this.captureNode) {
      try { this.captureNode.port.close() } catch {}
      try { this.captureNode.disconnect() } catch {}
      this.captureNode = null
    }

    if (this.playbackNode) {
      try { this.playbackNode.port.postMessage({ type: 'clear' }) } catch {}
      try { this.playbackNode.port.close() } catch {}
      try { this.playbackNode.disconnect() } catch {}
      this.playbackNode = null
    }

    if (this.mediaSourceNode) {
      try { this.mediaSourceNode.disconnect() } catch {}
      this.mediaSourceNode = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      try { await this.audioContext.close() } catch {}
      this.audioContext = null
    }

    this.setState('idle')
  }

  private setState(state: AudioEngineState, error = ''): void {
    this.onStateChange?.(state, error)
  }

  private openWebSocket(): void {
    if (this.stopped || !this.currentToken || !this.currentCallId) return

    const params = new URLSearchParams({
      token: this.currentToken,
      call_id: String(this.currentCallId),
    })
    if (this.currentMpCallId) params.set('mp_call_id', this.currentMpCallId)

    const ws = new WebSocket(`${VOIP_WS_BASE}?${params.toString()}`)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.setState('connecting')

    ws.onopen = () => {
      if (this.stopped || this.ws !== ws) return
      this.reconnectAttempt = 0
      this.setState('streaming')
    }

    ws.onmessage = async event => {
      if (this.stopped || this.ws !== ws) return
      try {
        const payload = event.data instanceof Blob
          ? await event.data.arrayBuffer()
          : event.data instanceof ArrayBuffer
            ? event.data
            : null
        if (!payload || payload.byteLength === 0) return
        const frame = decodeAudioFrame(payload)
        if (!frame || frame.pcm.length === 0) return
        this.enqueuePlayback(frame)
      } catch (error: any) {
        this.setState('error', error?.message || 'Audio decode failed')
      }
    }

    ws.onerror = () => {
      if (this.stopped || this.ws !== ws) return
      this.setState('connecting', 'VoIP audio reconnecting')
    }

    ws.onclose = () => {
      if (this.stopped || this.ws !== ws) return
      this.ws = null
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
    this.reconnectAttempt += 1
    this.setState('connecting', 'VoIP audio reconnecting')
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openWebSocket()
    }, delay)
  }

  private enqueuePlayback(frame: DecodedAudioFrame): void {
    const seq = frame.seq || (this.receiveSeq + 1)
    this.receiveSeq = Math.max(this.receiveSeq, seq)
    // Jitter buffering + reorder live inside the playback worklet. We just
    // hand off Float32 chunks; the worklet handles the rest.
    if (this.playbackNode) {
      // Transfer the underlying buffer to avoid a copy.
      this.playbackNode.port.postMessage(
        { type: 'push', pcm: frame.pcm },
        [frame.pcm.buffer],
      )
    }
  }
}

export async function voipCall(
  authFetch: AuthFetchFn,
  accountId: string,
  peerId: number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/call/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, peer_id: peerId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

export async function voipAnswer(
  authFetch: AuthFetchFn,
  callId: string | number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/answer/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_id: callId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

export async function voipHangup(
  authFetch: AuthFetchFn,
  callId: string | number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/hangup/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_id: callId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || resp.statusText)
  }
  return resp.json()
}

export async function voipGetActive(
  authFetch: AuthFetchFn,
): Promise<VoIPCall[]> {
  const resp = await authFetch(`${API_BASE}/api/telegram/voip/active/`)
  if (!resp.ok) return []
  return resp.json()
}
