import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine, voipCall, voipAnswer, voipHangup, type AudioEngineState, type VoIPCall } from '../voip'
import { authFetch } from '../utils/authFetch'

export interface VoipState {
  incomingCall: (VoIPCall & { account_label?: string }) | null
  activeCall: VoIPCall | null
  callDuration: number
  callMuted: boolean
  callMinimized: boolean
  callAudioState: AudioEngineState
  callAudioError: string
}

export interface VoipController extends VoipState {
  startCall: (accountId: string, peerId: number, peerPhone: string, peerName: string) => Promise<void>
  answer: () => Promise<void>
  hangup: () => Promise<void>
  decline: () => Promise<void>
  toggleMute: () => void
  setMinimized: (v: boolean) => void
  /** Called from the messenger WebSocket handler to inject VoIP events. */
  applyWsEvent: (data: {
    type: string
    call?: VoIPCall
    account_label?: string
  }) => void
}

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Owns everything that touches a VoIP call: state, AudioEngine lifecycle,
 * ringtone, outgoing timer, and the incoming/state-change/ended events
 * arriving through the messenger WebSocket (exposed as `applyWsEvent`).
 */
export function useVoipController({
  token,
  onError,
}: {
  token: string | undefined
  onError?: (message: string) => void
}): VoipController {
  const [incomingCall, setIncomingCall] = useState<(VoIPCall & { account_label?: string }) | null>(null)
  const [activeCall, setActiveCall] = useState<VoIPCall | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [callMuted, setCallMuted] = useState(false)
  const [callMinimized, setCallMinimized] = useState(false)
  const [callAudioState, setCallAudioState] = useState<AudioEngineState>('idle')
  const [callAudioError, setCallAudioError] = useState('')
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)
  const audioEngineRef = useRef<AudioEngine | null>(null)

  const makeAuthFetch = useCallback(
    () => (url: string, opts?: RequestInit) => authFetch(url, token || '', opts),
    [token],
  )

  const startCall = useCallback(async (
    accountId: string,
    peerId: number,
    peerPhone: string,
    peerName: string,
  ) => {
    const optimistic: VoIPCall = {
      id: 0,
      tg_account_id: accountId,
      direction: 'outgoing',
      state: 'ringing',
      tg_peer_id: peerId,
      peer_phone: peerPhone,
      peer_name: peerName,
      mp_call_id: '',
      started_at: new Date().toISOString(),
      answered_at: null,
      ended_at: null,
      end_reason: '',
      recording_duration_seconds: null,
    }
    setActiveCall(optimistic)
    try {
      const call = await voipCall(makeAuthFetch(), accountId, peerId)
      setActiveCall(call)
    } catch (e: any) {
      console.error('[VoIP] Call failed:', e.message)
      setActiveCall(null)
      onError?.(`Дзвінок не вдався: ${e.message || 'невідома помилка'}`)
    }
  }, [makeAuthFetch, onError])

  const answer = useCallback(async () => {
    if (!incomingCall) return
    try {
      ringtoneRef.current?.pause()
      const call = await voipAnswer(makeAuthFetch(), incomingCall.id)
      setActiveCall(call)
      setIncomingCall(null)
    } catch (e: any) {
      console.error('[VoIP] Answer failed:', e.message)
    }
  }, [incomingCall, makeAuthFetch])

  const resetCall = useCallback(() => {
    audioEngineRef.current?.stop().catch(() => {})
    audioEngineRef.current = null
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    setActiveCall(null)
    setIncomingCall(null)
    setCallDuration(0)
    setCallMuted(false)
    setCallMinimized(false)
    setCallAudioState('idle')
    setCallAudioError('')
    ringtoneRef.current?.pause()
  }, [])

  const hangup = useCallback(async () => {
    const call = activeCall || incomingCall
    ringtoneRef.current?.pause()
    if (call?.id) {
      try {
        await voipHangup(makeAuthFetch(), call.id)
      } catch (e: any) {
        console.error('[VoIP] Hangup failed:', e.message)
      }
    }
    resetCall()
  }, [activeCall, incomingCall, makeAuthFetch, resetCall])

  const decline = useCallback(async () => {
    if (!incomingCall) return
    ringtoneRef.current?.pause()
    if (incomingCall.id) {
      try {
        await voipHangup(makeAuthFetch(), incomingCall.id)
      } catch (e: any) {
        console.error('[VoIP] Decline failed:', e.message)
      }
    }
    setIncomingCall(null)
  }, [incomingCall, makeAuthFetch])

  const toggleMute = useCallback(() => {
    setCallMuted((prev) => {
      const next = !prev
      if (next) audioEngineRef.current?.mute()
      else audioEngineRef.current?.unmute()
      return next
    })
  }, [])

  // WS-driven lifecycle events from the messenger socket.
  const applyWsEvent = useCallback((data: { type: string; call?: VoIPCall; account_label?: string }) => {
    if (data.type === 'voip_incoming' && data.call) {
      const call = data.call
      setIncomingCall({ ...call, account_label: data.account_label || '' })
      try {
        if (!ringtoneRef.current) {
          ringtoneRef.current = new Audio('/sounds/ringtone.mp3')
          ringtoneRef.current.loop = true
        }
        ringtoneRef.current.play().catch(() => {})
      } catch {
        // ignore
      }
      setTimeout(() => {
        setIncomingCall((prev) => (prev?.id === call.id ? null : prev))
        ringtoneRef.current?.pause()
      }, 30000)
      return
    }
    if (data.type === 'voip_state_change' && data.call) {
      const call = data.call
      setActiveCall((prev) => (prev?.id === call.id ? { ...prev, ...call } : prev))
      if (call.state === 'connected') {
        setCallDuration(0)
        if (callTimerRef.current) clearInterval(callTimerRef.current)
        callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000)
      }
      return
    }
    if (data.type === 'voip_ended') {
      resetCall()
    }
  }, [resetCall])

  // Audio engine lifecycle — runs when an active call reaches a live state.
  useEffect(() => {
    if (!activeCall || !['connected', 'media_connecting', 'media_live'].includes(activeCall.state) || !token) return
    if (audioEngineRef.current?.callId === activeCall.id && audioEngineRef.current.isActive) return

    const engine = new AudioEngine((state, error) => {
      setCallAudioState(state)
      setCallAudioError(error || '')
    })
    audioEngineRef.current = engine

    let cancelled = false
    ;(async () => {
      try {
        await engine.start({
          callId: activeCall.id,
          mpCallId: activeCall.mp_call_id,
          token,
        })
        if (cancelled) {
          await engine.stop()
          return
        }
        if (callMuted) engine.mute()
      } catch (e: any) {
        console.error('[VoIP] Audio engine failed:', e?.message || e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeCall, token, callMuted])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      audioEngineRef.current?.stop().catch(() => {})
      audioEngineRef.current = null
    }
  }, [])

  return {
    incomingCall,
    activeCall,
    callDuration,
    callMuted,
    callMinimized,
    callAudioState,
    callAudioError,
    startCall,
    answer,
    hangup,
    decline,
    toggleMute,
    setMinimized: setCallMinimized,
    applyWsEvent,
  }
}
