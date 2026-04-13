/**
 * VoIP Audio Engine for Vidnovagram.
 *
 * Handles:
 * - getUserMedia for microphone capture
 * - WebSocket binary connection to telegram-mp VoipBridge
 * - Remote audio playback via AudioContext
 * - Combined recording (mic + remote) via MediaRecorder
 */

const API_BASE = 'https://cc.vidnova.app'
const WS_AUDIO_URL = 'wss://cc.vidnova.app/ws/audio'
const SAMPLE_RATE = 48000

export interface VoIPCall {
  id: string
  tg_account_id: string
  client_id: string | null
  operator_user_id: number | null
  direction: 'outgoing' | 'incoming'
  state: string
  tg_peer_id: number
  peer_phone: string
  peer_name: string
  mp_call_id: string
  started_at: string | null
  answered_at: string | null
  ended_at: string | null
  end_reason: string
  recording_duration_seconds: number | null
}

type AuthFetchFn = (url: string, init?: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------
// Audio Engine
// ---------------------------------------------------------------------------

export class AudioEngine {
  private ws: WebSocket | null = null
  private audioCtx: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private playbackQueue: Float32Array[] = []
  private muted = false

  async start(callId: string, token: string): Promise<void> {
    // 1. Get microphone
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    // 2. Set up AudioContext
    this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })

    // 3. Connect mic → ScriptProcessor → send PCM via WS
    const source = this.audioCtx.createMediaStreamSource(this.mediaStream)
    this.scriptProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1)

    this.scriptProcessor.onaudioprocess = (event) => {
      if (this.muted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

      const input = event.inputBuffer.getChannelData(0)
      // Convert Float32 to Int16
      const int16 = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      this.ws.send(int16.buffer)
    }

    source.connect(this.scriptProcessor)
    this.scriptProcessor.connect(this.audioCtx.destination)

    // 4. Set up playback for remote audio
    const playbackNode = this.audioCtx.createScriptProcessor(4096, 1, 1)
    playbackNode.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0)
      if (this.playbackQueue.length > 0) {
        const chunk = this.playbackQueue.shift()!
        const len = Math.min(output.length, chunk.length)
        for (let i = 0; i < len; i++) output[i] = chunk[i]
        for (let i = len; i < output.length; i++) output[i] = 0
      } else {
        output.fill(0)
      }
    }
    playbackNode.connect(this.audioCtx.destination)

    // 5. Start recording both sides
    try {
      const dest = this.audioCtx.createMediaStreamDestination()
      source.connect(dest)
      // Remote audio is merged via playbackNode → destination
      this.mediaRecorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
      })
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data)
      }
      this.mediaRecorder.start(1000) // chunk every 1s
    } catch (e) {
      console.warn('[VoIP] MediaRecorder failed:', e)
    }

    // 6. Connect WebSocket to VoipBridge
    const wsUrl = `${WS_AUDIO_URL}?token=${encodeURIComponent(token)}&call_id=${encodeURIComponent(callId)}`
    this.ws = new WebSocket(wsUrl)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Convert Int16 PCM to Float32 for playback
        const int16 = new Int16Array(event.data)
        const float32 = new Float32Array(int16.length)
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 0x8000
        }
        this.playbackQueue.push(float32)

        // Prevent queue from growing too large (buffer 5 chunks max)
        while (this.playbackQueue.length > 5) {
          this.playbackQueue.shift()
        }
      }
    }

    this.ws.onerror = (e) => {
      console.error('[VoIP] WS error:', e)
    }
  }

  stop(): Blob | null {
    // Stop recording
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000)
      this.ws = null
    }

    // Stop mic
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }

    // Disconnect audio nodes
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }

    // Close AudioContext
    if (this.audioCtx) {
      this.audioCtx.close()
      this.audioCtx = null
    }

    this.playbackQueue = []

    // Return recorded blob
    if (this.recordedChunks.length > 0) {
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' })
      this.recordedChunks = []
      return blob
    }
    return null
  }

  setMuted(muted: boolean) {
    this.muted = muted
  }

  isMuted(): boolean {
    return this.muted
  }
}

// ---------------------------------------------------------------------------
// VoIP API
// ---------------------------------------------------------------------------

export async function voipCall(
  authFetch: AuthFetchFn,
  accountId: string,
  peerId: number,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/voip/call/`, {
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
  callId: string,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/voip/answer/`, {
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
  callId: string,
): Promise<VoIPCall> {
  const resp = await authFetch(`${API_BASE}/api/voip/hangup/`, {
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

export async function voipUploadRecording(
  authFetch: AuthFetchFn,
  callId: string,
  recording: Blob,
  duration?: number,
): Promise<void> {
  const form = new FormData()
  form.append('recording', recording, `${callId}.webm`)
  if (duration !== undefined) form.append('duration', String(Math.round(duration)))

  const resp = await authFetch(`${API_BASE}/api/voip/${callId}/recording/`, {
    method: 'POST',
    body: form,
  })
  if (!resp.ok) {
    console.error('[VoIP] Upload recording failed:', resp.status)
  }
}

export async function voipGetActive(
  authFetch: AuthFetchFn,
): Promise<VoIPCall[]> {
  const resp = await authFetch(`${API_BASE}/api/voip/active/`)
  if (!resp.ok) return []
  return resp.json()
}
