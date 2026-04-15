# VoIP Implementation Plan — Vidnovagram + NTgCalls

## Дата: 2026-04-14
## Статус: IN PROGRESS

---

## 1. Проблема

MadelineProto v8.6.4 VoIP **не працює**:
- Старий протокол (libtgvoip PKT_INIT) — relay сервери не відповідають, Telegram більше не підтримує для сучасних клієнтів
- Новий протокол (WebRTC) — `quasarstream/webrtc` (pure PHP) зависає на `createOffer()`, бібліотека експериментальна
- `Controller.php` містить dead code: `sendSignalling()` шифрує SDP але ніколи не відправляє, `var_dump/readline` в production

**Рішення**: NTgCalls — C++ бібліотека з повною WebRTC реалізацією (Chromium build), Python біндинги.

---

## 2. Архітектура

```
┌─────────────────────────────────────────────────────────────────┐
│                     Vidnovagram Desktop                          │
│  AudioEngine: getUserMedia → PCM → WS | WS → PCM → speaker     │
│  UI: IncomingCallOverlay, ActiveCallOverlay, CallButton          │
└──────────────┬──────────────────────────────────┬───────────────┘
               │ WebSocket (PCM Int16 48kHz mono)  │ HTTPS REST
               │ wss://cc.vidnova.app/ws/audio     │ /api/voip/*
               ↓                                    ↓
┌──────────────────────┐              ┌──────────────────────────┐
│   voip-bridge        │              │   Django (web)            │
│   Python 3.12        │              │   VoIPCallSession model   │
│   ntgcalls (C++)     │←── HTTP ────→│   voip views              │
│   FastAPI/uvicorn    │              │   WS broadcast            │
│   Port 8086          │              │   beat cleanup             │
└──────────┬───────────┘              └──────────────────────────┘
           │ HTTP (signaling relay,                    ↑
           │ DH params, RTC servers)                   │ webhook
           ↓                                           │
┌──────────────────────┐                               │
│   telegram-mp        │                               │
│   MadelineProto PHP  │───────────────────────────────┘
│   MTProto signaling  │  phone.requestCall
│   Port 8085          │  phone.acceptCall
│                      │  phone.confirmCall
│                      │  phone.sendSignalingData
└──────────┬───────────┘
           │ MTProto (encrypted)
           ↓
┌──────────────────────┐
│   Telegram DC        │
│                      │
│   WebRTC (encrypted, │
│   managed by         │
│   ntgcalls C++)      │
└──────────────────────┘
```

### Чому окремий мікросервіс, а не вбудовано в telegram-mp?

1. **Мова**: ntgcalls має Python біндинги, telegram-mp — PHP
2. **Сесії**: telegram-mp тримає MTProto сесії (messaging працює). NTgCalls працює з WebRTC окремо — немає конфлікту
3. **Ізоляція**: VoIP потребує realtime, аудіо-буфери, FFI до C++ — краще ізолювати
4. **Масштабування**: можна запустити кілька voip-bridge інстансів

---

## 3. Компоненти та файли

### 3.1 voip-bridge (НОВИЙ мікросервіс)

```
Call_center/voip-bridge/
├── main.py              # FastAPI app + WebSocket + startup
├── ntg_manager.py       # NTgCalls lifecycle (create, exchange, connect, stop)
├── signaling_relay.py   # HTTP client до telegram-mp для signaling
├── ws_audio.py          # WebSocket endpoint для Vidnovagram audio
├── models.py            # Pydantic models (CallInfo, SignalingData, etc.)
├── config.py            # Settings from env
├── Dockerfile
├── requirements.txt
└── .env.example
```

### 3.2 telegram-mp (ЗМІНИ)

```
telegram-mp/
├── src/HttpApi.php          # +3 VoIP signaling endpoints
├── src/TelegramHandler.php  # +handleIncomingCall, +onUpdatePhoneCall handlers
└── src/VoipBridge.php       # ВИДАЛИТИ (замінено Python voip-bridge)
```

### 3.3 Django (МІНІМАЛЬНІ ЗМІНИ)

```
calls/
├── views/voip.py            # Вже існує — мінімальні зміни
├── services/mp_client.py    # +voip_bridge_* functions (HTTP до voip-bridge)
└── consumers.py             # Вже є voip WS events
```

### 3.4 Vidnovagram (ЗМІНИ)

```
Vidnovagram/src/
├── App.tsx                  # +AudioEngine, +CallOverlays, +Call button
└── App.css                  # +call overlay styles
```

### 3.5 Інфра

```
Call_center/
├── docker-compose.yml       # +voip-bridge service
├── docker-compose.dev.yml   # +voip-bridge dev override
└── frontend/nginx.conf      # +/ws/audio proxy → voip-bridge:8086
```

---

## 4. Детальна реалізація

### Phase 1: voip-bridge мікросервіс

#### 4.1 config.py

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Auth
    worker_api_token: str = ""

    # telegram-mp HTTP API
    telegram_mp_url: str = "http://telegram-mp:8085"

    # Django webhook
    django_webhook_url: str = "http://web:8000/api/internal/voip-event/"

    # Server
    host: str = "0.0.0.0"
    port: int = 8086

    # Audio
    sample_rate: int = 48000
    channels: int = 1  # mono
    frame_duration_ms: int = 20  # 20ms frames = 50 fps

    # Recording
    recording_dir: str = "/app/media/voip_recordings"

    class Config:
        env_prefix = "VOIP_"
```

#### 4.2 ntg_manager.py — Ядро VoIP

```python
"""NTgCalls lifecycle manager for P2P private calls."""

import asyncio
import logging
from typing import Optional, Callable
from ntgcalls import (
    NTgCalls, DhConfig, RTCServer, MediaDescription,
    AudioDescription, MediaSource, StreamMode, StreamDevice,
    ConnectionState,
)

logger = logging.getLogger("voip.ntg")

class ActiveCall:
    """State for a single active P2P call."""
    user_id: int           # Telegram user_id (peer)
    call_id: str           # Django VoIPCallSession UUID
    mp_call_id: str        # MadelineProto internal call reference
    account_id: str        # TG account UUID
    is_outgoing: bool
    auth_key: Optional[bytes] = None
    g_a: Optional[bytes] = None
    g_a_hash: Optional[bytes] = None

class NtgManager:
    def __init__(self, on_signaling: Callable, on_state_change: Callable):
        self._client = NTgCalls()
        self._calls: dict[int, ActiveCall] = {}  # user_id → ActiveCall
        self._on_signaling = on_signaling
        self._on_state_change = on_state_change

        # Register NTgCalls callbacks
        self._client.on_signaling(self._handle_signaling)
        self._client.on_connection_change(self._handle_connection_change)
        self._client.on_frames(self._handle_frames)

        # WS audio callback (set by ws_audio.py when client connects)
        self._audio_callbacks: dict[int, Callable] = {}  # user_id → send_audio_fn

    # ── Outgoing call flow ──

    async def start_outgoing(self, call: ActiveCall, dh_config: dict) -> bytes:
        """Step 1: Create call + init DH exchange. Returns g_a_hash."""
        self._calls[call.user_id] = call
        self._client.create_p2p_call(call.user_id)

        # Set audio capture (from WebSocket via EXTERNAL source)
        self._client.set_stream_sources(
            call.user_id,
            StreamMode.CAPTURE,
            MediaDescription(
                microphone=AudioDescription(
                    MediaSource.EXTERNAL, 48000, 1, ""
                )
            ),
        )

        # Init DH exchange
        config = DhConfig(
            g=dh_config["g"],
            p=bytes.fromhex(dh_config["p"]),
            random=bytes.fromhex(dh_config["random"]),
        )
        g_a_hash = self._client.init_exchange(call.user_id, config, None)
        call.g_a_hash = g_a_hash
        return g_a_hash

    async def complete_outgoing(self, user_id: int, g_b: bytes,
                                 fingerprint: int,
                                 servers: list[dict],
                                 versions: list[str],
                                 p2p_allowed: bool) -> bytes:
        """Step 2: Exchange keys + connect. Returns g_a for phone.confirmCall."""
        call = self._calls.get(user_id)
        if not call:
            raise ValueError(f"No call for user {user_id}")

        auth = self._client.exchange_keys(user_id, g_b, fingerprint)
        call.g_a = auth.g_a_or_b

        # Convert server dicts to RTCServer objects
        rtc_servers = [
            RTCServer(
                id=s["id"],
                ipv4=s.get("ipv4", ""),
                ipv6=s.get("ipv6", ""),
                port=s["port"],
                username=s.get("username", ""),
                password=s.get("password", ""),
                turn=s.get("turn", False),
                stun=s.get("stun", False),
                tcp=s.get("tcp", False),
                peer_tag=bytes.fromhex(s["peer_tag"]) if s.get("peer_tag") else b"",
            )
            for s in servers
        ]

        self._client.connect_p2p(user_id, rtc_servers, versions, p2p_allowed)
        return auth.g_a_or_b

    # ── Incoming call flow ──

    async def start_incoming(self, call: ActiveCall, dh_config: dict,
                              g_a_hash: bytes) -> bytes:
        """Accept incoming: create call + init exchange. Returns g_b."""
        self._calls[call.user_id] = call
        self._client.create_p2p_call(call.user_id)

        self._client.set_stream_sources(
            call.user_id,
            StreamMode.CAPTURE,
            MediaDescription(
                microphone=AudioDescription(
                    MediaSource.EXTERNAL, 48000, 1, ""
                )
            ),
        )

        config = DhConfig(
            g=dh_config["g"],
            p=bytes.fromhex(dh_config["p"]),
            random=bytes.fromhex(dh_config["random"]),
        )
        g_b = self._client.init_exchange(call.user_id, config, g_a_hash)
        return g_b

    async def complete_incoming(self, user_id: int, g_a: bytes,
                                 fingerprint: int,
                                 servers: list[dict],
                                 versions: list[str],
                                 p2p_allowed: bool):
        """Finalize incoming: exchange keys + connect."""
        auth = self._client.exchange_keys(user_id, g_a, fingerprint)

        rtc_servers = [
            RTCServer(
                id=s["id"], ipv4=s.get("ipv4", ""), ipv6=s.get("ipv6", ""),
                port=s["port"], username=s.get("username", ""),
                password=s.get("password", ""), turn=s.get("turn", False),
                stun=s.get("stun", False), tcp=s.get("tcp", False),
                peer_tag=bytes.fromhex(s["peer_tag"]) if s.get("peer_tag") else b"",
            )
            for s in servers
        ]

        self._client.connect_p2p(user_id, rtc_servers, versions, p2p_allowed)

    # ── Signaling relay ──

    def receive_signaling(self, user_id: int, data: bytes):
        """Forward signaling from Telegram to NTgCalls."""
        self._client.send_signaling(user_id, data)

    # ── Audio I/O ──

    def feed_audio(self, user_id: int, pcm_data: bytes):
        """Feed PCM audio from WebSocket to NTgCalls (mic input)."""
        from ntgcalls import FrameData
        self._client.send_external_frame(
            user_id, StreamDevice.MICROPHONE, pcm_data,
            FrameData(0, 0, 0, 0)  # audio doesn't need width/height
        )

    def register_audio_callback(self, user_id: int, callback: Callable):
        """Register callback for sending received audio to WebSocket."""
        self._audio_callbacks[user_id] = callback

    def unregister_audio_callback(self, user_id: int):
        self._audio_callbacks.pop(user_id, None)

    # ── Hangup ──

    async def hangup(self, user_id: int):
        """Stop call and cleanup."""
        call = self._calls.pop(user_id, None)
        if call:
            try:
                self._client.stop(user_id)
            except Exception as e:
                logger.warning("NTgCalls stop error: %s", e)
            self._audio_callbacks.pop(user_id, None)

    # ── Callbacks from NTgCalls ──

    def _handle_signaling(self, user_id: int, data: bytes):
        """NTgCalls wants to send signaling → relay to Telegram."""
        asyncio.get_event_loop().call_soon_threadsafe(
            asyncio.create_task, self._on_signaling(user_id, data)
        )

    def _handle_connection_change(self, user_id: int, network_info):
        """WebRTC connection state changed."""
        state_name = str(network_info.state)
        logger.info("Connection change user=%d state=%s", user_id, state_name)
        asyncio.get_event_loop().call_soon_threadsafe(
            asyncio.create_task, self._on_state_change(user_id, state_name)
        )

    def _handle_frames(self, user_id: int, mode, device, frames):
        """Received audio/video frames from peer."""
        if device == StreamDevice.SPEAKER and user_id in self._audio_callbacks:
            for frame in frames:
                self._audio_callbacks[user_id](frame.data)

    # ── Utils ──

    def get_call(self, user_id: int) -> Optional[ActiveCall]:
        return self._calls.get(user_id)

    def get_call_by_id(self, call_id: str) -> Optional[ActiveCall]:
        for c in self._calls.values():
            if c.call_id == call_id:
                return c
        return None

    @staticmethod
    def get_protocol() -> dict:
        proto = NTgCalls.get_protocol()
        return {
            "min_layer": proto.min_layer,
            "max_layer": proto.max_layer,
            "udp_p2p": proto.udp_p2p,
            "udp_reflector": proto.udp_reflector,
            "library_versions": list(proto.library_versions),
        }
```

#### 4.3 signaling_relay.py

```python
"""HTTP client for telegram-mp signaling + Django webhooks."""

import httpx
import logging

logger = logging.getLogger("voip.relay")

class SignalingRelay:
    def __init__(self, mp_url: str, django_url: str, token: str):
        self.mp_url = mp_url
        self.django_url = django_url
        self.headers = {"Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"}
        self._http = httpx.AsyncClient(timeout=30)

    # ── telegram-mp calls ──

    async def get_dh_config(self, account_id: str) -> dict:
        """Get DH config from Telegram via telegram-mp."""
        r = await self._http.post(
            f"{self.mp_url}/voip/get-dh-config",
            json={"account_id": account_id},
            headers=self.headers,
        )
        r.raise_for_status()
        return r.json()

    async def request_call(self, account_id: str, peer_id: int,
                           g_a_hash: str, protocol: dict) -> dict:
        """phone.requestCall via telegram-mp. Returns PhoneCallWaiting."""
        r = await self._http.post(
            f"{self.mp_url}/voip/request-call",
            json={
                "account_id": account_id,
                "peer_id": peer_id,
                "g_a_hash": g_a_hash,  # hex
                "protocol": protocol,
            },
            headers=self.headers,
        )
        r.raise_for_status()
        return r.json()

    async def confirm_call(self, account_id: str, call_peer: dict,
                           g_a: str, fingerprint: int,
                           protocol: dict) -> dict:
        """phone.confirmCall via telegram-mp. Returns PhoneCall with connections."""
        r = await self._http.post(
            f"{self.mp_url}/voip/confirm-call",
            json={
                "account_id": account_id,
                "call_peer": call_peer,
                "g_a": g_a,  # hex
                "key_fingerprint": fingerprint,
                "protocol": protocol,
            },
            headers=self.headers,
        )
        r.raise_for_status()
        return r.json()

    async def accept_call(self, account_id: str, call_peer: dict,
                          g_b: str, protocol: dict) -> dict:
        """phone.acceptCall via telegram-mp."""
        r = await self._http.post(
            f"{self.mp_url}/voip/accept-call",
            json={
                "account_id": account_id,
                "call_peer": call_peer,
                "g_b": g_b,  # hex
                "protocol": protocol,
            },
            headers=self.headers,
        )
        r.raise_for_status()
        return r.json()

    async def send_signaling_data(self, account_id: str, call_peer: dict,
                                   data: str):
        """phone.sendSignalingData via telegram-mp."""
        r = await self._http.post(
            f"{self.mp_url}/voip/send-signaling",
            json={
                "account_id": account_id,
                "call_peer": call_peer,
                "data": data,  # base64
            },
            headers=self.headers,
        )
        r.raise_for_status()

    async def discard_call(self, account_id: str, call_peer: dict,
                           reason: str = "hangup"):
        """phone.discardCall via telegram-mp."""
        r = await self._http.post(
            f"{self.mp_url}/voip/discard-call",
            json={
                "account_id": account_id,
                "call_peer": call_peer,
                "reason": reason,
            },
            headers=self.headers,
        )
        r.raise_for_status()

    # ── Django webhooks ──

    async def notify_django(self, event: str, data: dict):
        """Send VoIP event to Django webhook."""
        try:
            r = await self._http.post(
                self.django_url,
                json={"event": event, "data": data},
                headers=self.headers,
            )
            if r.status_code >= 400:
                logger.warning("Django webhook %s → %d", event, r.status_code)
        except Exception as e:
            logger.error("Django webhook failed: %s", e)
```

#### 4.4 ws_audio.py — WebSocket Audio Bridge

```python
"""WebSocket endpoint for bidirectional PCM audio with Vidnovagram."""

import logging
from fastapi import WebSocket, WebSocketDisconnect, Query

logger = logging.getLogger("voip.ws")

# PCM Int16 48kHz mono: 48000 samples/sec × 2 bytes = 96000 bytes/sec
# 20ms frame = 960 samples × 2 bytes = 1920 bytes
FRAME_SIZE = 1920

class AudioBridge:
    def __init__(self, ntg_manager):
        self.ntg = ntg_manager
        self._connections: dict[str, WebSocket] = {}  # call_id → ws

    async def handle(self, ws: WebSocket, call_id: str, token: str):
        """Handle WebSocket connection for audio streaming."""
        await ws.accept()
        logger.info("Audio WS connected: call_id=%s", call_id)

        # Find the active call
        call = self.ntg.get_call_by_id(call_id)
        if not call:
            await ws.close(4004, "No active call")
            return

        self._connections[call_id] = ws

        # Register callback: NTgCalls peer audio → WebSocket
        def send_to_ws(pcm_data: bytes):
            try:
                # This is called from NTgCalls thread, need async bridge
                import asyncio
                loop = asyncio.get_event_loop()
                loop.call_soon_threadsafe(
                    asyncio.create_task,
                    ws.send_bytes(pcm_data)
                )
            except Exception:
                pass

        self.ntg.register_audio_callback(call.user_id, send_to_ws)

        try:
            while True:
                # Receive PCM audio from Vidnovagram mic → NTgCalls
                data = await ws.receive_bytes()
                self.ntg.feed_audio(call.user_id, data)
        except WebSocketDisconnect:
            logger.info("Audio WS disconnected: call_id=%s", call_id)
        except Exception as e:
            logger.error("Audio WS error: %s", e)
        finally:
            self.ntg.unregister_audio_callback(call.user_id)
            self._connections.pop(call_id, None)
```

#### 4.5 main.py — FastAPI Application

```python
"""VoIP Bridge — NTgCalls + WebSocket audio server."""

import asyncio
import base64
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Query, Request, HTTPException
from pydantic import BaseModel

from config import Settings
from ntg_manager import NtgManager, ActiveCall
from signaling_relay import SignalingRelay
from ws_audio import AudioBridge

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("voip")

settings = Settings()

# Globals initialized in lifespan
relay: SignalingRelay = None
ntg: NtgManager = None
audio_bridge: AudioBridge = None


async def _on_signaling(user_id: int, data: bytes):
    """Callback: NTgCalls wants to send signaling to peer via Telegram."""
    call = ntg.get_call(user_id)
    if not call:
        return
    await relay.send_signaling_data(
        call.account_id,
        call.mp_call_id,  # call peer reference
        base64.b64encode(data).decode(),
    )


async def _on_state_change(user_id: int, state: str):
    """Callback: WebRTC connection state changed."""
    call = ntg.get_call(user_id)
    if not call:
        return

    logger.info("Call %s state → %s", call.call_id, state)

    # Map NTgCalls states to Django states
    state_map = {
        "CONNECTING": "connecting",
        "CONNECTED": "connected",
        "FAILED": "failed",
        "TIMEOUT": "failed",
        "CLOSED": "ended",
    }
    django_state = state_map.get(state)
    if django_state:
        await relay.notify_django("voip_state_change", {
            "call_id": call.mp_call_id,
            "state": django_state,
        })


@asynccontextmanager
async def lifespan(app: FastAPI):
    global relay, ntg, audio_bridge
    relay = SignalingRelay(
        settings.telegram_mp_url,
        settings.django_webhook_url,
        settings.worker_api_token,
    )
    ntg = NtgManager(_on_signaling, _on_state_change)
    audio_bridge = AudioBridge(ntg)
    logger.info("VoIP Bridge started on port %d", settings.port)
    yield
    logger.info("VoIP Bridge shutting down")


app = FastAPI(title="VoIP Bridge", lifespan=lifespan)


# ── Auth helper ──

def _check_token(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if settings.worker_api_token and token != settings.worker_api_token:
        raise HTTPException(401, "Unauthorized")


# ── REST API (called by Django and telegram-mp) ──

class OutgoingCallRequest(BaseModel):
    account_id: str
    peer_id: int
    call_id: str  # Django VoIPCallSession UUID

class IncomingCallRequest(BaseModel):
    account_id: str
    peer_id: int
    call_id: str
    mp_call_id: str
    g_a_hash: str  # hex

class ExchangeRequest(BaseModel):
    user_id: int
    g_a_or_b: str  # hex
    fingerprint: int
    servers: list[dict]
    versions: list[str]
    p2p_allowed: bool = True

class SignalingRequest(BaseModel):
    user_id: int
    data: str  # base64


@app.get("/health")
async def health():
    protocol = NtgManager.get_protocol()
    return {"status": "ok", "protocol": protocol}


@app.post("/call/outgoing")
async def start_outgoing_call(req: OutgoingCallRequest, request: Request):
    """Step 1 of outgoing call: create NTgCalls slot + DH init.

    Called by Django voip_call view.
    Returns g_a_hash for phone.requestCall.
    """
    _check_token(request)

    # Get DH config from Telegram
    dh = await relay.get_dh_config(req.account_id)

    call = ActiveCall()
    call.user_id = req.peer_id
    call.call_id = req.call_id
    call.account_id = req.account_id
    call.is_outgoing = True

    g_a_hash = await ntg.start_outgoing(call, dh)

    protocol = NtgManager.get_protocol()

    return {
        "g_a_hash": g_a_hash.hex(),
        "protocol": protocol,
    }


@app.post("/call/outgoing/complete")
async def complete_outgoing_call(req: ExchangeRequest, request: Request):
    """Step 2: peer accepted, exchange keys + connect WebRTC.

    Called by telegram-mp when PhoneCallAccepted received.
    Returns g_a for phone.confirmCall.
    """
    _check_token(request)

    g_a = await ntg.complete_outgoing(
        req.user_id,
        bytes.fromhex(req.g_a_or_b),
        req.fingerprint,
        req.servers,
        req.versions,
        req.p2p_allowed,
    )

    return {"g_a": g_a.hex()}


@app.post("/call/incoming")
async def start_incoming_call(req: IncomingCallRequest, request: Request):
    """Step 1 of incoming call: create NTgCalls slot + DH init.

    Called by telegram-mp when PhoneCallRequested received.
    Returns g_b for phone.acceptCall.
    """
    _check_token(request)

    dh = await relay.get_dh_config(req.account_id)

    call = ActiveCall()
    call.user_id = req.peer_id
    call.call_id = req.call_id
    call.mp_call_id = req.mp_call_id
    call.account_id = req.account_id
    call.is_outgoing = False

    g_b = await ntg.start_incoming(call, dh, bytes.fromhex(req.g_a_hash))

    protocol = NtgManager.get_protocol()

    return {
        "g_b": g_b.hex(),
        "protocol": protocol,
    }


@app.post("/call/incoming/complete")
async def complete_incoming_call(req: ExchangeRequest, request: Request):
    """Step 2: we accepted, got PhoneCall with connections. Exchange + connect.

    Called by telegram-mp when PhoneCall received after our acceptCall.
    """
    _check_token(request)

    await ntg.complete_incoming(
        req.user_id,
        bytes.fromhex(req.g_a_or_b),
        req.fingerprint,
        req.servers,
        req.versions,
        req.p2p_allowed,
    )

    return {"status": "ok"}


@app.post("/call/signaling")
async def receive_signaling(req: SignalingRequest, request: Request):
    """Forward signaling data from Telegram to NTgCalls.

    Called by telegram-mp when UpdatePhoneCallSignalingData received.
    """
    _check_token(request)
    ntg.receive_signaling(req.user_id, base64.b64decode(req.data))
    return {"status": "ok"}


@app.post("/call/hangup")
async def hangup_call(request: Request):
    """Hangup call by user_id or call_id."""
    _check_token(request)
    body = await request.json()
    user_id = body.get("user_id")
    call_id = body.get("call_id")

    if user_id:
        await ntg.hangup(user_id)
    elif call_id:
        call = ntg.get_call_by_id(call_id)
        if call:
            await ntg.hangup(call.user_id)

    return {"status": "ok"}


# ── WebSocket Audio ──

@app.websocket("/ws/audio")
async def ws_audio(ws: WebSocket,
                   call_id: str = Query(...),
                   token: str = Query("")):
    """Bidirectional PCM audio streaming with Vidnovagram."""
    if settings.worker_api_token and token != settings.worker_api_token:
        await ws.close(4001, "Unauthorized")
        return
    await audio_bridge.handle(ws, call_id, token)


# ── Entry point ──

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
```

#### 4.6 Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# System deps for ntgcalls
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libssl3 libsrtp2-1 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/media/voip_recordings

EXPOSE 8086

CMD ["python", "main.py"]
```

#### 4.7 requirements.txt

```
ntgcalls>=1.3.0
fastapi>=0.115
uvicorn[standard]>=0.34
websockets>=14.0
httpx>=0.28
pydantic-settings>=2.7
```

---

### Phase 2: telegram-mp зміни

#### 4.8 Нові HTTP endpoints в HttpApi.php

telegram-mp має стати **тонким MTProto шаром** для VoIP — він виконує Telegram API
методи, а voip-bridge приймає рішення.

**Нові ендпоінти** (додати в HttpApi.php):

| Endpoint | Що робить |
|----------|-----------|
| `POST /voip/get-dh-config` | `messages.getDhConfig` → повертає `{g, p, random}` |
| `POST /voip/request-call` | `phone.requestCall(peer_id, g_a_hash, protocol)` → повертає PhoneCallWaiting |
| `POST /voip/confirm-call` | `phone.confirmCall(peer, g_a, fingerprint, protocol)` → повертає PhoneCall |
| `POST /voip/accept-call` | `phone.acceptCall(peer, g_b, protocol)` → повертає PhoneCallAccepted |
| `POST /voip/send-signaling` | `phone.sendSignalingData(peer, data)` |
| `POST /voip/discard-call` | `phone.discardCall(peer, reason, ...)` |

**Також**: TelegramHandler.php має forward VoIP events до voip-bridge:

| TG Update | Дія |
|-----------|-----|
| `UpdatePhoneCall(PhoneCallRequested)` | POST voip-bridge `/call/incoming` + POST Django webhook `voip_incoming` |
| `UpdatePhoneCall(PhoneCallAccepted)` | POST voip-bridge `/call/outgoing/complete` з g_b + servers |
| `UpdatePhoneCall(PhoneCall)` | POST voip-bridge `/call/incoming/complete` з g_a + servers |
| `UpdatePhoneCallSignalingData` | POST voip-bridge `/call/signaling` |
| `UpdatePhoneCall(PhoneCallDiscarded)` | POST voip-bridge `/call/hangup` + Django webhook `voip_ended` |

**Видалити**: `VoipBridge.php` (PHP WebSocket audio bridge) — замінено Python voip-bridge.

---

### Phase 3: Docker Compose

#### 4.9 docker-compose.yml — новий сервіс

```yaml
voip-bridge:
  build: ./voip-bridge
  environment:
    VOIP_WORKER_API_TOKEN: ${WORKER_API_TOKEN}
    VOIP_TELEGRAM_MP_URL: "http://telegram-mp:8085"
    VOIP_DJANGO_WEBHOOK_URL: "http://web:8000/api/internal/voip-event/"
    VOIP_PORT: "8086"
  volumes:
    - media_files:/app/media
  depends_on:
    telegram-mp:
      condition: service_started
    web:
      condition: service_healthy
  security_opt: [no-new-privileges]
  cap_drop: [ALL]
  tmpfs: ["/tmp:size=64m"]
  mem_limit: 512m
  restart: unless-stopped
  labels:
    - "com.centurylinklabs.watchtower.enable=true"
```

#### 4.10 nginx.conf — proxy WebSocket

```nginx
# Додати до frontend/nginx.conf
location /ws/audio {
    proxy_pass http://voip-bridge:8086/ws/audio;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

### Phase 4: Vidnovagram UI

#### 4.11 AudioEngine (в App.tsx)

```typescript
class AudioEngine {
    private ws: WebSocket | null = null;
    private audioCtx: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private gainNode: GainNode | null = null;
    private isMuted = false;

    async start(callId: string, token: string): Promise<void> {
        // 1. Get microphone
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true }
        });

        // 2. Audio context for processing
        this.audioCtx = new AudioContext({ sampleRate: 48000 });

        // 3. WebSocket to voip-bridge
        const wsUrl = `wss://cc.vidnova.app/ws/audio?call_id=${callId}&token=${token}`;
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        // 4. Capture: mic → PCM Int16 → WS
        const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
        // ScriptProcessor (deprecated but simple) or AudioWorklet
        const processor = this.audioCtx.createScriptProcessor(960, 1, 1);
        processor.onaudioprocess = (e) => {
            if (this.ws?.readyState === WebSocket.OPEN && !this.isMuted) {
                const float32 = e.inputBuffer.getChannelData(0);
                const int16 = new Int16Array(float32.length);
                for (let i = 0; i < float32.length; i++) {
                    int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
                }
                this.ws.send(int16.buffer);
            }
        };
        source.connect(processor);
        processor.connect(this.audioCtx.destination); // needed for processing

        // 5. Playback: WS → PCM → speaker
        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const int16 = new Int16Array(event.data);
                const float32 = new Float32Array(int16.length);
                for (let i = 0; i < int16.length; i++) {
                    float32[i] = int16[i] / 32768;
                }
                const buffer = this.audioCtx!.createBuffer(1, float32.length, 48000);
                buffer.copyToChannel(float32, 0);
                const bufferSource = this.audioCtx!.createBufferSource();
                bufferSource.buffer = buffer;
                bufferSource.connect(this.audioCtx!.destination);
                bufferSource.start();
            }
        };
    }

    mute() { this.isMuted = true; }
    unmute() { this.isMuted = false; }
    get muted() { return this.isMuted; }

    stop() {
        this.ws?.close();
        this.mediaStream?.getTracks().forEach(t => t.stop());
        this.audioCtx?.close();
        this.ws = null;
        this.mediaStream = null;
        this.audioCtx = null;
    }
}
```

#### 4.12 UI Components

**IncomingCallOverlay**: тригер на WS event `voip_incoming` з MessengerConsumer.
**ActiveCallOverlay**: таймер, mute/unmute, hangup.
**Call Button**: іконка телефону в хедері чату.

(Детальний UI код вже є в плані, Phase 3 — без змін)

---

## 5. Потік дзвінків (детально)

### 5.1 Вихідний дзвінок (Operator → Client)

```
1. Vidnovagram: клік "Call" →
   POST /api/voip/call/ {account_id, peer_id}

2. Django voip_call():
   - Перевірка one-call-per-account
   - POST voip-bridge /call/outgoing {account_id, peer_id, call_id}

3. voip-bridge:
   - GET telegram-mp /voip/get-dh-config → {g, p, random}
   - NTgCalls: create_p2p_call(peer_id)
   - NTgCalls: set_stream_sources(EXTERNAL mic)
   - NTgCalls: init_exchange(dh_config, None) → g_a_hash
   - Response → Django: {g_a_hash, protocol}

4. Django:
   - POST telegram-mp /voip/request-call {peer_id, g_a_hash, protocol}
   - telegram-mp: phone.requestCall → PhoneCallWaiting
   - Створити VoIPCallSession(state=ringing)
   - WS broadcast → Vidnovagram

5. Telegram: peer's phone rings...

6. Peer answers →
   telegram-mp отримує UpdatePhoneCall(PhoneCallAccepted):
   - Витягує g_b, fingerprint, connections (RTC servers)
   - POST voip-bridge /call/outgoing/complete {user_id, g_b, fingerprint, servers, versions}

7. voip-bridge:
   - NTgCalls: exchange_keys(peer_id, g_b, fingerprint) → AuthParams(g_a, key_fingerprint)
   - NTgCalls: connect_p2p(peer_id, rtc_servers, versions, p2p_allowed)
   - Response → telegram-mp: {g_a}

8. telegram-mp:
   - phone.confirmCall(peer, g_a, key_fingerprint, protocol) → PhoneCall
   - POST Django webhook: voip_state_change → connecting

9. NTgCalls WebRTC establishing...
   - on_signaling callbacks → telegram-mp phone.sendSignalingData
   - UpdatePhoneCallSignalingData → voip-bridge send_signaling()

10. NTgCalls: on_connection_change → CONNECTED
    - voip-bridge → Django webhook: voip_state_change → connected
    - WS broadcast → Vidnovagram

11. Vidnovagram: відкриває WebSocket /ws/audio?call_id=X&token=Y
    - Аудіо тече: mic → WS → voip-bridge → NTgCalls → Telegram
    - І навпаки: Telegram → NTgCalls → voip-bridge → WS → speaker
```

### 5.2 Вхідний дзвінок (Client → Operator)

```
1. telegram-mp отримує UpdatePhoneCall(PhoneCallRequested):
   - Витягує peer info, g_a_hash
   - POST Django webhook: voip_incoming {account_id, peer_id, peer_phone, peer_name, call_id}

2. Django:
   - Створити VoIPCallSession(state=incoming)
   - WS broadcast → Vidnovagram: voip_incoming

3. Vidnovagram: показує IncomingCallOverlay (рингтон, Accept/Decline)

4. Operator натискає Accept →
   POST /api/voip/answer/ {call_id}

5. Django voip_answer():
   - Atomic claim (select_for_update)
   - POST voip-bridge /call/incoming {account_id, peer_id, call_id, mp_call_id, g_a_hash}

6. voip-bridge:
   - GET telegram-mp /voip/get-dh-config → {g, p, random}
   - NTgCalls: create_p2p_call, set_stream_sources, init_exchange(dh, g_a_hash) → g_b
   - Response → Django: {g_b, protocol}

7. Django:
   - POST telegram-mp /voip/accept-call {call_peer, g_b, protocol}
   - telegram-mp: phone.acceptCall → PhoneCallAccepted

8. telegram-mp отримує UpdatePhoneCall(PhoneCall):
   - g_a_or_b, key_fingerprint, connections
   - POST voip-bridge /call/incoming/complete {user_id, g_a, fingerprint, servers, versions}

9. voip-bridge:
   - NTgCalls: exchange_keys + connect_p2p
   - WebRTC → signaling relay → CONNECTED

10. Vidnovagram: відкриває WS аудіо, дзвінок працює
```

### 5.3 Завершення дзвінка

```
Operator hangup:
  Vidnovagram → POST /api/voip/hangup/ → Django →
    POST voip-bridge /call/hangup →
      NTgCalls stop() →
    POST telegram-mp /voip/discard-call →
      phone.discardCall

Remote hangup:
  telegram-mp: UpdatePhoneCall(PhoneCallDiscarded) →
    POST voip-bridge /call/hangup →
      NTgCalls stop()
    POST Django webhook: voip_ended →
      WS broadcast → Vidnovagram
```

---

## 6. Запис дзвінків

Два підходи паралельно:

### 6.1 Server-side (voip-bridge)
- NTgCalls `on_frames(PLAYBACK, SPEAKER)` → зберігати PCM в файл
- По закінченню: ffmpeg конвертувати PCM → OGG Opus
- Зберегти в `/app/media/voip_recordings/{call_id}.ogg`
- Сповістити Django (recording_file, recording_duration)

### 6.2 Client-side (Vidnovagram)
- MediaRecorder на merged stream (mic + remote playback)
- По закінченню: POST /api/voip/{id}/upload-recording/ (вже існує)
- Це записує обидві сторони (оператор + клієнт)

---

## 7. Порядок реалізації

### Step 1: voip-bridge scaffold ✅ ← ПОЧИНАЄМО ТУТ
- [ ] Створити `Call_center/voip-bridge/` з усіма файлами
- [ ] Dockerfile + requirements.txt
- [ ] config.py, models.py
- [ ] main.py (FastAPI + health endpoint)
- [ ] Перевірити що ntgcalls імпортується в Docker

### Step 2: NTgCalls integration
- [ ] ntg_manager.py — повний lifecycle
- [ ] ws_audio.py — WebSocket audio bridge
- [ ] Тест: NTgCalls.get_protocol() працює

### Step 3: telegram-mp VoIP signaling
- [ ] Нові endpoint в HttpApi.php (get-dh-config, request-call, confirm-call, accept-call, send-signaling, discard-call)
- [ ] TelegramHandler.php: UpdatePhoneCall handlers → forward до voip-bridge
- [ ] Видалити VoipBridge.php

### Step 4: Django integration
- [ ] Оновити voip_call() — додати POST до voip-bridge
- [ ] Оновити voip_answer() — додати POST до voip-bridge
- [ ] mp_client.py: додати voip_bridge_* функції

### Step 5: Docker + Nginx
- [ ] docker-compose.yml: додати voip-bridge сервіс
- [ ] nginx.conf: /ws/audio proxy
- [ ] Тест: docker compose up, health check

### Step 6: End-to-end test
- [ ] Вихідний дзвінок через API (curl)
- [ ] Перевірити signaling relay
- [ ] Перевірити WebRTC connection

### Step 7: Vidnovagram UI
- [ ] AudioEngine class
- [ ] IncomingCallOverlay
- [ ] ActiveCallOverlay
- [ ] Call button

### Step 8: Recording + cleanup
- [ ] Server-side recording
- [ ] Beat task cleanup
- [ ] Error recovery

---

## 8. Ризики та мітигація

| Ризик | Мітигація |
|-------|-----------|
| ntgcalls wheels не збираються | Pre-built wheels є для linux-x86_64 на PyPI |
| DH exchange формат не збігається | Дивимось py-tgcalls source (connect_call.py) як reference |
| Signaling timing (race conditions) | Буферизація в NTgCalls + retry в relay |
| Audio latency через WebSocket | 20ms frames, binary WS, local network |
| Session conflict MP + NTgCalls | NTgCalls НЕ використовує MTProto — тільки WebRTC |
| telegram-mp не має VoIP TL events | MadelineProto підтримує UpdatePhoneCall — треба зареєструвати handler |

---

## 9. Залежності між сервісами

```
voip-bridge ──depends──→ telegram-mp (MTProto signaling)
voip-bridge ──depends──→ web (Django webhook)
web ──calls──→ voip-bridge (HTTP API)
web ──calls──→ telegram-mp (HTTP API, існуючі)
Vidnovagram ──ws──→ voip-bridge (audio)
Vidnovagram ──ws──→ web (messenger events, існуючі)
Vidnovagram ──https──→ web (REST API, існуючі)
```
