# VoIP Video+Audio Bridge — План реалізації

> **Дата:** 2026-04-14
> **Проєкт:** Vidnovagram (`/home/serv/MarkAnaliz/Vidnovagram`)
> **Стек:** pytgcalls 2.2.11 + ntgcalls 2.1.0 + Pyrogram/Hydrogram + FastAPI + WebSocket

---

## 1. Загальний огляд

### Проблема
Зараз VoIP працює через MadelineProto (PHP) — тільки аудіо. MadelineProto не підтримує відеодзвінки.
Рішення: **pytgcalls** (Python) + **ntgcalls** (C++ WebRTC) — єдина бібліотека, яка підтримує
як аудіо, так і відео для приватних дзвінків (1-to-1 P2P) через Telegram.

### Критичне продуктове правило

Дзвінок має йти **з того самого Telegram акаунта**, з якого оператор уже веде переписку в Vidnovagram.

Тому план далі базується на таких правилах:
- `voip-bridge` працює не з окремим сервісним TG акаунтом, а з **усіма наявними робочими Telegram акаунтами**;
- один Telegram акаунт може мати **один активний дзвінок одночасно**;
- якщо в системі підключено 10 TG акаунтів, кожен з них повинен мати можливість ініціювати і приймати дзвінки;
- `Call_center`/backend має контролювати ownership дзвінка: хто саме з операторів зараз використовує конкретний TG акаунт.

### Що підтверджено дослідженням

1. **pytgcalls підтримує P2P приватні дзвінки** — є офіційний `p2p_example/`, метод `ChatUpdate.Status.INCOMING_CALL`
2. **ExternalMedia API** — можна передавати raw frames замість файлів:
   - `ExternalMedia.AUDIO` — зовнішнє аудіо (PCM16LE)
   - `ExternalMedia.VIDEO` — зовнішнє відео (I420/YUV420P)
3. **send_frame()** — відправка raw фреймів у call (`Device.MICROPHONE`, `Device.CAMERA`)
4. **stream_frame callback** — отримання фреймів від співрозмовника (`Direction.INCOMING`)
5. **Відео формат — I420 (YUV420 planar)**: Y plane + U plane + V plane, size = `width * height * 3 / 2`
6. **Аудіо формат — PCM16LE**: 48kHz, mono/stereo, chunk кожні 10ms
7. **Docker підтримка** — є офіційний Dockerfile приклад (python:3.13-slim + ffmpeg)

### Ключові API (підтверджено з вихідного коду)

```python
# === Типи ===
from pytgcalls.types import Device          # MICROPHONE, SPEAKER, CAMERA, SCREEN
from pytgcalls.types import ExternalMedia   # AUDIO, VIDEO
from pytgcalls.types import MediaStream     # обгортка для MediaSource
from pytgcalls.types import RecordStream    # запис incoming frames
from pytgcalls.types import StreamFrames    # callback з фреймами
from pytgcalls.types import Frame           # ssrc, frame(bytes), info(width,height,rotation)
from pytgcalls.types import ChatUpdate      # Status.INCOMING_CALL, DISCARDED_CALL, BUSY_CALL
from pytgcalls.types import Direction       # OUTGOING, INCOMING
from pytgcalls.types.raw import AudioParameters  # bitrate, channels
from pytgcalls.types.raw import VideoParameters  # width, height, frame_rate

# === Відправка фреймів ===
await call_py.send_frame(
    chat_id=user_id,           # int — Telegram user ID (для P2P)
    device=Device.MICROPHONE,  # або Device.CAMERA
    data=pcm_bytes,            # bytes — PCM16LE для аудіо, I420 для відео
    frame_data=Frame.Info(     # опціонально
        capture_time=0,
        width=640,             # для відео
        height=480,
        rotation=0,
    ),
)

# === Отримання фреймів (callback) ===
@call_py.on_update(filters.stream_frame(
    directions=Direction.INCOMING,
    devices=Device.CAMERA | Device.MICROPHONE,
))
async def on_frames(_, update: StreamFrames):
    # update.chat_id, update.direction, update.device
    for frame in update.frames:
        frame.ssrc     # int
        frame.frame    # bytes — raw I420 або PCM16LE
        frame.info     # Frame.Info(capture_time, width, height, rotation)

# === P2P call setup ===
@call_py.on_update(fl.chat_update(ChatUpdate.Status.INCOMING_CALL))
async def incoming(_, update: ChatUpdate):
    await call_py.play(update.chat_id, media_stream)

# === Ініціація дзвінка ===
await call_py.play(user_id, MediaStream(
    ExternalMedia.AUDIO | ExternalMedia.VIDEO,
    audio_parameters=AudioParameters(bitrate=48000, channels=1),
    video_parameters=VideoParameters(width=640, height=480, frame_rate=30),
))
```

### ntgcalls C API (під капотом)
```c
// P2P створення з'єднання
int ntg_create_p2p(uintptr_t ptr, int64_t userId, ntg_async_struct future);

// Обмін ключами шифрування (Diffie-Hellman)
int ntg_init_exchange(ptr, userId, dhConfig, g_a_hash, ...);
int ntg_exchange_keys(ptr, userId, g_a_or_b, ...);

// Підключення P2P (ICE/STUN/TURN)
int ntg_connect_p2p(ptr, userId, servers, serversSize, versions, versionsSize, p2pAllowed, ...);

// Відправка зовнішнього фрейму
int ntg_send_external_frame(ptr, chatID, device, frame, frameSize, frameData, ...);
// device: NTG_STREAM_MICROPHONE | NTG_STREAM_CAMERA
// frame: raw bytes (PCM16LE для аудіо, I420 для відео)

// Signaling
int ntg_send_signaling_data(ptr, userId, buffer, size, ...);
```

Відео фрейм **I420** (підтверджено з `wrtc/src/models/i420_image_data.cpp`):
```
Layout: [Y plane: W*H bytes] [U plane: W*H/4 bytes] [V plane: W*H/4 bytes]
Total size: W * H * 3 / 2
Приклад 640x480: 640*480*1.5 = 460,800 bytes на фрейм
```

---

## 2. Архітектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vidnovagram Desktop (Tauri)                  │
│                                                                 │
│  getUserMedia(audio+video) → Canvas → I420 frames               │
│        ↓ WebSocket (binary)                                     │
│  Remote I420 frames → Canvas/Video element                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ wss://cc.vidnova.app/ws/voip
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    nginx (WebSocket proxy)                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│               voip-bridge (Python мікросервіс)                   │
│                                                                  │
│  FastAPI + WebSocket server (:8099)                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ pytgcalls (PyTgCalls + Pyrogram/Hydrogram)              │    │
│  │   └─ ntgcalls (C++ WebRTC)                              │    │
│  │       ├─ P2P call signaling (DH key exchange)           │    │
│  │       ├─ ICE/STUN/TURN connectivity                     │    │
│  │       ├─ SRTP encryption                                │    │
│  │       └─ Media encoding/decoding (Opus, VP8/H264)       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  WebSocket Handler:                                              │
│    Browser → WS (binary I420+PCM) → send_frame() → Telegram     │
│    Telegram → stream_frame callback → WS (binary) → Browser     │
│                                                                  │
│  REST API (:8099/api/):                                          │
│    POST /call       — ініціювати дзвінок                         │
│    POST /answer     — прийняти вхідний                           │
│    POST /hangup     — завершити                                  │
│    GET  /status     — стан дзвінка                               │
│    GET  /accounts   — доступні TG акаунти                        │
└──────────────────────────────────────────────────────────────────┘
                         │
                    Telegram P2P
                    (WebRTC encrypted)
                         │
                    ┌────▼─────┐
                    │ Абонент  │
                    │ Telegram │
                    └──────────┘
```

### Протокол WebSocket (Browser ↔ voip-bridge)

**Бінарний формат повідомлень:**

```
Byte 0: Message Type
  0x01 = Audio frame (PCM16LE)
  0x02 = Video frame (I420)
  0x03 = Control message (JSON)

Для 0x01 (Audio):
  Bytes 1-N: PCM16LE samples (48kHz, mono, 960 samples = 10ms = 1920 bytes)

Для 0x02 (Video):
  Bytes 1-2: width (uint16 BE)
  Bytes 3-4: height (uint16 BE)
  Bytes 5-N: I420 data (width * height * 3 / 2 bytes)

Для 0x03 (Control):
  Bytes 1-N: JSON UTF-8
  {
    "type": "call" | "answer" | "hangup" | "mute" | "unmute" |
            "camera_on" | "camera_off" | "incoming" | "state_change" |
            "error",
    "call_id": "...",
    "peer_id": 12345,
    ...
  }
```

---

## 3. Phase 1: Audio через pytgcalls (заміна MadelineProto)

### Мета
Замінити PHP VoipBridge на Python voip-bridge, валідувати архітектуру тільки з аудіо.

### 3.1. Мікросервіс voip-bridge

**Принцип роботи з акаунтами:**
- `voip-bridge` піднімає calling-client **для кожного активного Telegram акаунта**, який уже використовується в системі;
- bridge не вводить окремий номер “тільки для дзвінків”;
- якщо акаунт недоступний для calling, це вважається проблемою інтеграції конкретного акаунта, а не підставою заводити інший номер.

**Структура директорії:**
```
voip-bridge/
├── Dockerfile
├── requirements.txt
├── main.py              # FastAPI app + startup
├── bridge.py            # PyTgCalls wrapper
├── ws_handler.py        # WebSocket audio/video routing
├── protocol.py          # Binary frame protocol
├── config.py            # Settings from env
├── auth.py              # Token validation (via Django API)
└── session/             # Pyrogram .session files (volume mount)
```

**requirements.txt:**
```
py-tgcalls[hydrogram]==2.2.11
hydrogram>=0.2.1
tgcrypto
fastapi>=0.115
uvicorn[standard]>=0.32
websockets>=13.0
numpy
```

**Dockerfile:**
```dockerfile
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8099", "--ws-max-size", "1048576"]
```

### 3.2. Bridge core (bridge.py)

```python
import asyncio
import logging
from typing import Dict, Optional, Callable, Awaitable

from hydrogram import Client
from pytgcalls import PyTgCalls, filters as fl
from pytgcalls.types import (
    ChatUpdate, Device, Direction, ExternalMedia,
    MediaStream, RecordStream, StreamFrames, Frame,
)
from pytgcalls.types.raw import AudioParameters, VideoParameters

logger = logging.getLogger("voip-bridge")

AUDIO_PARAMS = AudioParameters(bitrate=48000, channels=1)
# Phase 2: VIDEO_PARAMS = VideoParameters(width=640, height=480, frame_rate=30)

# Callback type для надсилання фреймів у WebSocket
FrameCallback = Callable[[int, bytes, str, Optional[Frame.Info]], Awaitable[None]]


class VoipBridge:
    """Обгортка над pytgcalls для управління P2P дзвінками."""

    def __init__(self, api_id: int, api_hash: str, session_name: str):
        self.client = Client(session_name, api_id=api_id, api_hash=api_hash)
        self.call_py = PyTgCalls(self.client)
        # active_calls: {user_id: {"ws_callback": fn, "state": str}}
        self.active_calls: Dict[int, dict] = {}
        self._setup_handlers()

    def _setup_handlers(self):
        """Реєстрація обробників подій pytgcalls."""

        @self.call_py.on_update(fl.chat_update(ChatUpdate.Status.INCOMING_CALL))
        async def on_incoming(_, update: ChatUpdate):
            logger.info(f"Incoming call from user {update.chat_id}")
            if update.chat_id in self.active_calls:
                cb = self.active_calls[update.chat_id].get("ws_callback")
                if cb:
                    await cb(update.chat_id, b'', "incoming", None)

        @self.call_py.on_update(fl.chat_update(ChatUpdate.Status.DISCARDED_CALL))
        async def on_discarded(_, update: ChatUpdate):
            logger.info(f"Call discarded: user {update.chat_id}")
            await self._notify_state(update.chat_id, "ended")
            self.active_calls.pop(update.chat_id, None)

        @self.call_py.on_update(fl.chat_update(ChatUpdate.Status.BUSY_CALL))
        async def on_busy(_, update: ChatUpdate):
            logger.info(f"Call busy: user {update.chat_id}")
            await self._notify_state(update.chat_id, "busy")
            self.active_calls.pop(update.chat_id, None)

        # Отримання аудіо від співрозмовника
        @self.call_py.on_update(fl.stream_frame(
            directions=Direction.INCOMING,
            devices=Device.MICROPHONE,
        ))
        async def on_audio_frame(_, update: StreamFrames):
            call = self.active_calls.get(update.chat_id)
            if call and call.get("ws_callback"):
                for frame in update.frames:
                    await call["ws_callback"](
                        update.chat_id, frame.frame, "audio", frame.info
                    )

        # Phase 2: Отримання відео від співрозмовника
        # @self.call_py.on_update(fl.stream_frame(
        #     directions=Direction.INCOMING,
        #     devices=Device.CAMERA,
        # ))
        # async def on_video_frame(_, update: StreamFrames):
        #     ...

    async def _notify_state(self, user_id: int, state: str):
        call = self.active_calls.get(user_id)
        if call and call.get("ws_callback"):
            await call["ws_callback"](user_id, b'', state, None)

    async def start(self):
        await self.call_py.start()
        logger.info("VoipBridge started")

    async def stop(self):
        # Завершити всі дзвінки
        for uid in list(self.active_calls):
            try:
                await self.call_py.leave_call(uid)
            except Exception:
                pass
        self.active_calls.clear()

    async def make_call(self, user_id: int, ws_callback: FrameCallback,
                        video: bool = False):
        """Ініціювати дзвінок до user_id."""
        self.active_calls[user_id] = {
            "ws_callback": ws_callback,
            "state": "calling",
            "video": video,
        }

        if video:
            stream = MediaStream(
                ExternalMedia.AUDIO | ExternalMedia.VIDEO,
                audio_parameters=AUDIO_PARAMS,
                video_parameters=VideoParameters(width=640, height=480, frame_rate=30),
            )
        else:
            stream = MediaStream(ExternalMedia.AUDIO, AUDIO_PARAMS)

        await self.call_py.play(user_id, stream)

        # Запис incoming фреймів
        await self.call_py.record(user_id, RecordStream(
            audio=True,
            audio_parameters=AUDIO_PARAMS,
            camera=video,
        ))

        self.active_calls[user_id]["state"] = "ringing"

    async def answer_call(self, user_id: int, ws_callback: FrameCallback,
                          video: bool = False):
        """Прийняти вхідний дзвінок."""
        self.active_calls[user_id] = {
            "ws_callback": ws_callback,
            "state": "answering",
            "video": video,
        }

        if video:
            stream = MediaStream(
                ExternalMedia.AUDIO | ExternalMedia.VIDEO,
                audio_parameters=AUDIO_PARAMS,
                video_parameters=VideoParameters(width=640, height=480, frame_rate=30),
            )
        else:
            stream = MediaStream(ExternalMedia.AUDIO, AUDIO_PARAMS)

        await self.call_py.play(user_id, stream)
        await self.call_py.record(user_id, RecordStream(
            audio=True,
            audio_parameters=AUDIO_PARAMS,
            camera=video,
        ))
        self.active_calls[user_id]["state"] = "active"

    async def hangup(self, user_id: int):
        """Завершити дзвінок."""
        try:
            await self.call_py.leave_call(user_id)
        except Exception as e:
            logger.warning(f"Error leaving call {user_id}: {e}")
        self.active_calls.pop(user_id, None)

    async def send_audio(self, user_id: int, pcm_data: bytes):
        """Надіслати аудіо фрейм (PCM16LE, 48kHz, mono)."""
        try:
            await self.call_py.send_frame(user_id, Device.MICROPHONE, pcm_data)
        except Exception as e:
            logger.warning(f"send_audio error: {e}")

    async def send_video(self, user_id: int, i420_data: bytes,
                         width: int, height: int):
        """Надіслати відео фрейм (I420, width x height)."""
        try:
            await self.call_py.send_frame(
                user_id, Device.CAMERA, i420_data,
                Frame.Info(width=width, height=height),
            )
        except Exception as e:
            logger.warning(f"send_video error: {e}")
```

### 3.3. Аудіо chunk timing

```
PCM16LE, 48000 Hz, mono:
  10ms chunk = 48000 * 0.01 * 2 bytes = 960 samples * 2 = 1920 bytes
  20ms chunk = 3840 bytes

Формула chunk_size (з офіційного прикладу):
  chunk_size = bitrate * 16 // 8 // 100 * channels
  = 48000 * 16 / 8 / 100 * 1 = 960 bytes (для 10ms mono)
  Але 16-bit = 2 bytes per sample, тому 960 samples = 1920 bytes

УВАГА: у прикладі pytgcalls використовується time.sleep(0.01),
тобто фрейми відправляються кожні 10ms.
Для WebSocket це означає ~100 повідомлень/сек для аудіо.
```

### 3.4. docker-compose.yml (сервіс voip-bridge)

```yaml
  voip-bridge:
    build:
      context: ./voip-bridge
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8099:8099"
    volumes:
      - ./voip-bridge/session:/app/session
    environment:
      TG_API_ID: ${TG_API_ID}
      TG_API_HASH: ${TG_API_HASH}
      TG_SESSION_NAME: voip_bridge
      DJANGO_API_URL: http://web:8000
      VOIP_AUTH_TOKEN: ${VOIP_AUTH_TOKEN}
    depends_on:
      web:
        condition: service_healthy
    mem_limit: 512m
    restart: unless-stopped
```

### 3.5. nginx конфіг (WebSocket proxy)

```nginx
# Додати до існуючого nginx.conf
location /ws/voip {
    proxy_pass http://127.0.0.1:8099/ws/voip;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location /api/voip/ {
    proxy_pass http://127.0.0.1:8099/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 4. Phase 2: Відеодзвінки

### 4.1. Browser → Server (відправка відео)

**Browser (Vidnovagram):**
```typescript
// getUserMedia з відео
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true },
  video: { width: 640, height: 480, frameRate: 30 },
});

// Відео фрейми через Canvas → I420
const videoTrack = stream.getVideoTracks()[0];
// Спосіб 1: MediaStreamTrackProcessor (Chrome 94+, працює в WebView2)
const processor = new MediaStreamTrackProcessor({ track: videoTrack });
const reader = processor.readable.getReader();

async function readFrames() {
  while (true) {
    const { value: frame, done } = await reader.read();
    if (done) break;

    // VideoFrame API — отримати I420 дані
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    const i420Size = width * height * 3 / 2;
    const buffer = new Uint8Array(i420Size);

    // copyTo з форматом I420
    await frame.copyTo(buffer, { format: 'I420' });
    frame.close();

    // Відправити через WebSocket
    // Header: 0x02 + width(2) + height(2) + I420 data
    const msg = new Uint8Array(5 + i420Size);
    msg[0] = 0x02;
    msg[1] = (width >> 8) & 0xFF;
    msg[2] = width & 0xFF;
    msg[3] = (height >> 8) & 0xFF;
    msg[4] = height & 0xFF;
    msg.set(buffer, 5);

    ws.send(msg.buffer);
  }
}
```

**УВАГА щодо VideoFrame.copyTo('I420'):**
- Підтримується в Chromium 94+ (WebView2 в Tauri v2 = Chromium)
- Формат `I420` = YUV420P planar = саме те що потрібно для ntgcalls
- Це **zero-copy** path — найефективніший спосіб

**Альтернатива (якщо VideoFrame API недоступний):**
```typescript
// Fallback: Canvas → RGBA → конвертація на сервері
const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 480;
const ctx = canvas.getContext('2d')!;

// Малюємо відео кадр на canvas
ctx.drawImage(videoElement, 0, 0, 640, 480);
const imageData = ctx.getImageData(0, 0, 640, 480);
// imageData.data = RGBA, 640*480*4 = 1,228,800 bytes

// Відправляємо RGBA (сервер конвертує в I420)
// Header: 0x04 + width(2) + height(2) + RGBA data
```

### 4.2. Server → Browser (отримання відео)

**Server (voip-bridge ws_handler.py):**
```python
# Отримання відео від Telegram через stream_frame callback
@call_py.on_update(fl.stream_frame(
    directions=Direction.INCOMING,
    devices=Device.CAMERA,
))
async def on_video_frame(_, update: StreamFrames):
    call = active_calls.get(update.chat_id)
    if not call or not call.get("ws"):
        return
    ws = call["ws"]
    for frame in update.frames:
        # frame.frame = I420 bytes
        # frame.info.width, frame.info.height
        w = frame.info.width
        h = frame.info.height
        header = bytes([0x02]) + w.to_bytes(2, 'big') + h.to_bytes(2, 'big')
        await ws.send_bytes(header + frame.frame)
```

**Browser (відображення I420):**
```typescript
// Спосіб 1: VideoFrame API → <canvas> (найшвидший)
ws.onmessage = async (event) => {
  const data = new Uint8Array(event.data);
  if (data[0] === 0x02) {
    const width = (data[1] << 8) | data[2];
    const height = (data[3] << 8) | data[4];
    const i420Data = data.slice(5);

    // Створюємо VideoFrame з I420
    const frame = new VideoFrame(i420Data.buffer, {
      format: 'I420',
      codedWidth: width,
      codedHeight: height,
      timestamp: performance.now() * 1000,
    });

    // Малюємо на canvas
    const ctx = remoteCanvas.getContext('2d');
    ctx.drawImage(frame, 0, 0);
    frame.close();
  }
};

// Спосіб 2: WebGL YUV shader (fallback, більш сумісний)
// Три текстури (Y, U, V) + fragment shader для конвертації YUV→RGB
```

### 4.3. Конвертація RGBA ↔ I420 на сервері (якщо browser не підтримує I420)

```python
import numpy as np

def rgba_to_i420(rgba: bytes, width: int, height: int) -> bytes:
    """Конвертація RGBA → I420 (YUV420P planar)."""
    frame = np.frombuffer(rgba, dtype=np.uint8).reshape(height, width, 4)
    r, g, b = frame[:,:,0].astype(np.int16), frame[:,:,1].astype(np.int16), frame[:,:,2].astype(np.int16)

    # ITU-R BT.601
    y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16
    u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128
    v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128

    y = np.clip(y, 0, 255).astype(np.uint8)
    u = np.clip(u[::2, ::2], 0, 255).astype(np.uint8)  # subsample 2x2
    v = np.clip(v[::2, ::2], 0, 255).astype(np.uint8)

    return y.tobytes() + u.tobytes() + v.tobytes()

def i420_to_rgba(i420: bytes, width: int, height: int) -> bytes:
    """Конвертація I420 → RGBA."""
    y_size = width * height
    uv_size = y_size // 4

    y = np.frombuffer(i420[:y_size], dtype=np.uint8).reshape(height, width).astype(np.int16)
    u = np.frombuffer(i420[y_size:y_size+uv_size], dtype=np.uint8).reshape(height//2, width//2).astype(np.int16)
    v = np.frombuffer(i420[y_size+uv_size:], dtype=np.uint8).reshape(height//2, width//2).astype(np.int16)

    # Upsample U and V
    u = np.repeat(np.repeat(u, 2, axis=0), 2, axis=1)
    v = np.repeat(np.repeat(v, 2, axis=0), 2, axis=1)

    c = y - 16
    d = u - 128
    e = v - 128

    r = np.clip((298 * c + 409 * e + 128) >> 8, 0, 255).astype(np.uint8)
    g = np.clip((298 * c - 100 * d - 208 * e + 128) >> 8, 0, 255).astype(np.uint8)
    b = np.clip((298 * c + 516 * d + 128) >> 8, 0, 255).astype(np.uint8)
    a = np.full_like(r, 255)

    return np.stack([r, g, b, a], axis=-1).tobytes()
```

### 4.4. Оптимізація: уникнути RGBA конвертації

Найкращий шлях (нульова конвертація):
1. **Browser → Server**: `VideoFrame.copyTo({format: 'I420'})` → WS binary → `send_frame(Device.CAMERA, i420_bytes)`
2. **Server → Browser**: `stream_frame` I420 bytes → WS binary → `new VideoFrame(buffer, {format: 'I420'})` → canvas

Обидва кроки працюють з I420 нативно. RGBA конвертація потрібна тільки як fallback.

---

## 5. Phase 3: Інтеграція

### 5.1. Зміни в voip.ts (Vidnovagram)

```typescript
// Нові API endpoints — тепер через voip-bridge замість Django
const VOIP_API = 'https://cc.vidnova.app/api/voip'
const VOIP_WS = 'wss://cc.vidnova.app/ws/voip'

export class MediaEngine {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private localStream: MediaStream | null = null;
  private videoEnabled = false;
  private audioWorklet: AudioWorkletNode | null = null;

  // Remote video rendering
  private remoteCanvas: HTMLCanvasElement | null = null;

  async start(callId: string, token: string, opts: {
    video?: boolean;
    remoteCanvas?: HTMLCanvasElement;
  } = {}): Promise<void> {
    this.videoEnabled = opts.video ?? false;
    this.remoteCanvas = opts.remoteCanvas ?? null;

    // 1. getUserMedia
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true },
      video: this.videoEnabled ? { width: 640, height: 480, frameRate: 30 } : false,
    });

    // 2. AudioContext для PCM capture
    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    // ... (аналогічно поточному AudioEngine)

    // 3. Video frame capture (якщо відео)
    if (this.videoEnabled) {
      this.startVideoCapture();
    }

    // 4. WebSocket
    const wsUrl = `${VOIP_WS}?token=${encodeURIComponent(token)}&call_id=${callId}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (e) => this.handleMessage(e);
  }

  private handleMessage(event: MessageEvent): void {
    const data = new Uint8Array(event.data as ArrayBuffer);
    const type = data[0];

    if (type === 0x01) {
      // Audio frame (PCM16LE) → playback
      this.playAudio(data.slice(1));
    } else if (type === 0x02) {
      // Video frame (I420) → render
      this.renderVideoFrame(data);
    } else if (type === 0x03) {
      // Control message
      const json = new TextDecoder().decode(data.slice(1));
      this.handleControl(JSON.parse(json));
    }
  }

  private renderVideoFrame(data: Uint8Array): void {
    if (!this.remoteCanvas) return;
    const width = (data[1] << 8) | data[2];
    const height = (data[3] << 8) | data[4];
    const i420Data = data.slice(5);

    const frame = new VideoFrame(i420Data.buffer, {
      format: 'I420',
      codedWidth: width,
      codedHeight: height,
      timestamp: performance.now() * 1000,
    });
    const ctx = this.remoteCanvas.getContext('2d')!;
    ctx.drawImage(frame, 0, 0, this.remoteCanvas.width, this.remoteCanvas.height);
    frame.close();
  }
  // ...
}
```

### 5.2. Vidnovagram UI зміни

**Компонент VideoCall (React):**
```
┌──────────────────────────────────────────────────┐
│                Remote Video (canvas)              │
│                                                   │
│                                                   │
│                  ┌─────────┐                      │
│                  │ Local   │  ← PiP (маленьке)    │
│                  │ Preview │                      │
│                  └─────────┘                      │
│                                                   │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐   │
│  │ Mic │  │ Cam │  │ End │  │Scrn │  │ Rec │   │
│  │ 🎤  │  │ 📷  │  │ 📞  │  │ 🖥  │  │ ⏺  │   │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘   │
└──────────────────────────────────────────────────┘
```

### 5.3. Django API зміни

Не мінімальні. Для production Django/backend потрібен для:
1. **Авторизації** — voip-bridge перевіряє token через Django `/api/auth/status/`
2. **Call session lifecycle** — start / answer / reject / hangup / timeout / failed
3. **Ownership Telegram акаунта** — хто з операторів зараз має право дзвонити з конкретного акаунта
4. **Обмеження один дзвінок на акаунт** — guard від паралельних дзвінків
5. **Маршрутизації incoming call** — якому desktop-клієнту показати вхідний дзвінок
6. **Збереження логів дзвінків** — voip-bridge POST-ить результат дзвінка в Django
7. **Telegram акаунти та їх calling-state** — bridge читає session з shared volume, а backend тримає source of truth по стану

### 5.4. Повний docker-compose фрагмент

```yaml
  voip-bridge:
    build:
      context: ./voip-bridge
    ports:
      - "127.0.0.1:8099:8099"
    volumes:
      # Pyrogram session files (TG акаунт повинен бути авторизований)
      - voip_sessions:/app/session
      # Recordings output
      - media_files:/app/recordings
    environment:
      TG_API_ID: ${TG_API_ID}
      TG_API_HASH: ${TG_API_HASH}
      TG_SESSION_NAME: ${VOIP_SESSION_NAME:-voip_bridge}
      DJANGO_API_URL: http://web:8000
      VOIP_AUTH_TOKEN: ${VOIP_AUTH_TOKEN}
      # Відео параметри
      VIDEO_WIDTH: 640
      VIDEO_HEIGHT: 480
      VIDEO_FPS: 30
      AUDIO_BITRATE: 48000
      AUDIO_CHANNELS: 1
      LOG_LEVEL: INFO
    depends_on:
      web:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "python -c 'import urllib.request; urllib.request.urlopen(\"http://localhost:8099/health\")'"]
      interval: 10s
      timeout: 5s
      retries: 5
    mem_limit: 512m
    restart: unless-stopped
```

---

## 6. Технічні деталі

### 6.1. Bandwidth розрахунки

```
AUDIO (PCM16LE через WebSocket, до стиснення Opus ntgcalls):
  48000 Hz * 16 bit * 1 ch = 768 kbps (raw PCM через WS)
  Після Opus в WebRTC: ~32-64 kbps

VIDEO (I420 raw через WebSocket):
  640x480 @ 30fps:
    Frame size: 640*480*1.5 = 460,800 bytes = ~450 KB
    Raw: 450 KB * 30 fps = 13.5 MB/s = 108 Mbps (!!!)

  ПРОБЛЕМА: Передача raw I420 через WebSocket — дуже багато bandwidth.

  РІШЕННЯ (варіанти, від найкращого до найпростішого):

  A) Знизити resolution + fps:
     320x240 @ 15fps = 320*240*1.5*15 = 1.7 MB/s = 13.7 Mbps
     Все ще багато, але для LAN прийнятно.

  B) JPEG стиснення на browser (замість I420):
     640x480 JPEG Q=50 ≈ 20-40 KB per frame
     30 fps = 600 KB/s - 1.2 MB/s = 4.8-9.6 Mbps ✅
     Сервер: decode JPEG → I420 (через ffmpeg/Pillow)

  C) H.264 encode на browser через MediaRecorder:
     640x480 @ 30fps H.264 ≈ 500 kbps - 2 Mbps ✅✅
     Але: треба decode на сервері в I420 для send_frame
     FFmpeg pipe: browser → H.264 chunks → ffmpeg -f h264 → rawvideo I420

  D) WebCodecs API (найкращий для Chromium):
     VideoEncoder → H.264/VP8 encoded chunks → WS → server decode → I420
     Або: VideoEncoder конфіг {codec: 'vp08'} → raw decode на сервері

  РЕКОМЕНДАЦІЯ: Варіант B (JPEG) для MVP, потім оптимізувати до C або D.
```

### 6.2. Оптимальна стратегія відео (поетапно)

**MVP (Phase 2a):** JPEG через WebSocket
```
Browser: getUserMedia → Canvas → toBlob('image/jpeg', 0.5) → WS
Server:  JPEG bytes → Pillow → I420 → send_frame(Device.CAMERA)
Server:  stream_frame I420 → Pillow → JPEG → WS
Browser: JPEG blob → createImageBitmap → Canvas
```
- Bandwidth: ~1 MB/s при 640x480@15fps
- Латентність: +20-50ms (JPEG encode/decode)
- CPU сервера: помірне

**Optimized (Phase 2b):** Raw I420 з зменшеним resolution
```
Browser: VideoFrame.copyTo('I420') для 320x240 → WS binary
Server:  I420 bytes → send_frame прямо (zero conversion!)
Server:  stream_frame I420 → WS binary
Browser: new VideoFrame('I420') → Canvas
```
- Bandwidth: ~1.7 MB/s при 320x240@15fps
- Латентність: мінімальна (no encode/decode)
- CPU сервера: мінімальне

**Production (Phase 2c):** WebCodecs H.264
```
Browser: VideoEncoder H.264 → encoded chunks → WS
Server:  FFmpeg pipe decode → I420 → send_frame
Server:  stream_frame I420 → FFmpeg pipe encode H.264 → WS
Browser: VideoDecoder H.264 → VideoFrame → Canvas
```
- Bandwidth: ~500 kbps - 1 Mbps
- Латентність: +30-100ms (encode/decode pipeline)
- CPU сервера: FFmpeg decode+encode

### 6.3. Frame timing

```python
# Аудіо: кожні 10ms
AUDIO_INTERVAL = 0.01  # 10ms
AUDIO_CHUNK_SAMPLES = 480  # 48000 * 0.01
AUDIO_CHUNK_BYTES = 960  # 480 * 2 (16-bit)

# Відео: кожні 33ms (30fps) або 66ms (15fps)
VIDEO_INTERVAL_30FPS = 0.033
VIDEO_INTERVAL_15FPS = 0.066
```

### 6.4. CPU/RAM вимоги

```
voip-bridge контейнер:
  Idle: ~50 MB RAM, ~1% CPU
  1 audio call: ~80 MB RAM, ~5% CPU
  1 video call (JPEG): ~150 MB RAM, ~15-25% CPU (Pillow encode/decode)
  1 video call (raw I420): ~120 MB RAM, ~5% CPU
  1 video call (H.264 ffmpeg): ~200 MB RAM, ~20-30% CPU

  Максимум одночасних дзвінків: 3-5 (на 192.168.91.92)
  mem_limit: 512m достатньо для 2-3 дзвінки
```

### 6.5. Pyrogram session

```
ВАЖЛИВО: pytgcalls потребує USERBOT (не bot token).
Потрібен Telegram акаунт з API credentials.

Створення session (одноразово):
  python -c "
  from hydrogram import Client
  app = Client('voip_bridge', api_id=API_ID, api_hash='API_HASH')
  app.run()  # Введе код авторизації
  "

Session files мають зберігатися так, щоб `telegram-mp` і `voip-bridge` працювали з тією самою моделлю акаунтів.

Цільова модель:
- кожен вже підключений у системі Telegram акаунт має свій calling session;
- `voip-bridge` підключається до тих самих робочих акаунтів, що і месенджер;
- окремий TG акаунт “тільки для дзвінків” не використовується;
- якщо одночасне використання одного session storage неможливе, потрібно реалізувати керовану схему окремих calling-sessions **для тих самих акаунтів**, а не для інших номерів.

Отже, головне обмеження не “потрібен окремий TG номер”, а:
- потрібен **окремий calling-runtime на кожен робочий TG акаунт**;
- потрібен контроль, щоб один акаунт не використовувався одночасно двома активними дзвінками.
```

### 6.6. Error handling та reconnection

```python
# WebSocket reconnection (browser side)
class ReconnectingWebSocket:
    MAX_RETRIES = 5
    BACKOFF_MS = [1000, 2000, 4000, 8000, 16000]

# pytgcalls connection states (server side)
# ntgcalls callbacks:
#   NTG_STATE_CONNECTING → очікування
#   NTG_STATE_CONNECTED → дзвінок активний
#   NTG_STATE_TIMEOUT → переспроба або завершення
#   NTG_STATE_FAILED → помилка, повідомити browser
#   NTG_STATE_CLOSED → дзвінок завершено

# Graceful shutdown
async def on_ws_disconnect(user_id):
    # Зберегти запис, повідомити Django, очистити ресурси
    await bridge.hangup(user_id)
```

### 6.7. Recording (запис обох сторін)

```python
# Варіант A: RecordStream → файл (вбудовано в pytgcalls)
await call_py.record(user_id, RecordStream(
    audio='/app/recordings/{call_id}.mp3',  # або .flac
    audio_parameters=AUDIO_PARAMS,
))

# Варіант B: Manual recording через stream_frame
# Зберігаємо PCM в буфер, потім кодуємо через ffmpeg
class CallRecorder:
    def __init__(self, call_id: str):
        self.local_audio = bytearray()   # від browser
        self.remote_audio = bytearray()  # від Telegram

    def add_local(self, pcm: bytes):
        self.local_audio.extend(pcm)

    def add_remote(self, pcm: bytes):
        self.remote_audio.extend(pcm)

    async def save(self) -> str:
        # Mix + encode to webm/opus
        ...
```

---

## 7. Обмеження та ризики

### Підтверджені обмеження

| Обмеження | Опис | Вплив |
|-----------|------|-------|
| **Один активний дзвінок на TG акаунт** | Telegram дозволяє тільки 1 активний дзвінок на акаунт | Один акаунт = один активний call |
| **Calling має працювати на тих самих TG акаунтах** | Не можна дзвонити з іншого номера, ніж той, з якого йде переписка | Потрібен per-account calling runtime |
| **Raw frame bandwidth** | I420 640x480@30fps = 13 MB/s через WS | Потрібна компресія (JPEG/H264) |
| **Латентність WS** | Browser → Server → Telegram додає ~50-150ms | Помітно, але прийнятно для не-real-time |
| **CPU на сервері** | Кожен відеодзвінок = decode+encode overhead | Обмежує кількість одночасних дзвінків |
| **Pyrogram session** | Потрібна одноразова ручна авторизація | Не автоматизується |

### Ризики

| Ризик | Ймовірність | Мітигація |
|-------|-------------|-----------|
| pytgcalls P2P не стабільний | Середня | Тестувати на реальних акаунтах рано |
| VideoFrame API не працює в WebView2 | Низька | Fallback на JPEG через Canvas |
| Telegram блокує userbot | Низька | Використовувати premium акаунт |
| Великий jitter аудіо через WS | Середня | Jitter buffer на browser (5 chunks max) |
| ICE/STUN fails за NAT | Низька | ntgcalls підтримує TURN relay |
| Calling session не вдається стабільно підняти на всіх робочих акаунтах | Середня | Запускати pilot поетапно, акаунт за акаунтом |
| Два оператори одночасно намагаються дзвонити з одного акаунта | Висока | Backend lock + ownership state на акаунт |

---

## 8. Roadmap

### Phase 0: Account model та ownership (1 тиждень)
- [x] Описати модель “той самий TG акаунт для чату і дзвінка”
  > ✅ 2026-04-14: VoipBridge per account, multi-account через _fetch_accounts() з Django API
- [x] Визначити, де і як зберігаються calling sessions для всіх робочих акаунтів
  > ✅ 2026-04-14: Pyrogram sessions у /app/session/voip_{account_id}.session (Docker volume voip_sessions)
- [x] Реалізувати backend lock: один активний дзвінок на один TG акаунт
  > ✅ 2026-04-14: bridge.is_busy перевірка + active_calls dict в VoipBridge (один дзвінок per bridge)
- [ ] Описати routing incoming call → конкретний оператор / desktop
- [x] Підтвердити, що окремий TG номер для дзвінків не потрібен
  > ✅ Pyrogram створює окремий session від MadelineProto — співіснують як різні “пристрої” одного акаунта

### Phase 1: Audio-only VoIP bridge (2-3 тижні) — 🔄 IN PROGRESS
- [x] Створити voip-bridge мікросервіс (FastAPI + pytgcalls) з підтримкою кількох TG акаунтів
  > ✅ 2026-04-14: main.py (FastAPI + multi-account), bridge.py (VoipBridge per account), auth.py, ws_handler.py, protocol.py, config.py
  > Docker image зібраний: python:3.13-slim, ntgcalls 2.1.0, pytgcalls 2.2.11, hydrogram 0.2.0
- [x] WebSocket протокол для аудіо (PCM16LE бінарний)
  > ✅ 2026-04-14: protocol.py (0x01=Audio, 0x02=Video, 0x03=Control), ws_handler.py (binary frame routing)
- [ ] Інтеграція з існуючим VoIPCall API та backend call-session state
- [ ] Тестування P2P дзвінків (вхідні + вихідні) на кількох реальних акаунтах
- [x] Docker compose інтеграція
  > ✅ 2026-04-14: voip-bridge сервіс в docker-compose.yml, bind mount sessions + accounts.json,
  > nginx proxy /ws/voip + /api/voip/, healthcheck, Pyrogram session створена для Рецепція Віднова
  > PyTgCalls v2.2.11 + NTgCalls v2.1.0 запущені, account=Vidnova (ID:1667227705)
- [ ] Міграція з MadelineProto PHP audio bridge

### Phase 2a: Video MVP - JPEG (1-2 тижні)
- [ ] Додати відео capture на browser (Canvas → JPEG)
- [ ] Сервер: JPEG → I420 конвертація + send_frame(Device.CAMERA)
- [ ] Сервер: stream_frame Camera → JPEG → WS
- [ ] Browser: відображення remote video
- [ ] UI: кнопка камери, local preview, remote canvas

### Phase 2b: Video Optimized - Raw I420 (1 тиждень)
- [ ] Browser: VideoFrame.copyTo('I420') замість JPEG
- [ ] Zero-conversion path (I420 → I420)
- [ ] Зменшити resolution для bandwidth (320x240 або 480x360)
- [ ] Adaptive resolution based on bandwidth

### Phase 2c: Video Production - WebCodecs (2 тижні)
- [ ] Browser: VideoEncoder H.264/VP8
- [ ] Server: FFmpeg decode pipeline
- [ ] Двосторонній H.264 через WS
- [ ] Bandwidth < 1 Mbps

### Phase 3: Polish (1-2 тижні)
- [ ] Recording обох сторін
- [ ] Screen sharing (Device.SCREEN + getDisplayMedia)
- [ ] Call history + duration tracking
- [ ] Automatic codec negotiation
- [ ] Error recovery та reconnection
- [ ] Performance monitoring

---

## 9. Перший крок

1. ~~**Підтвердити calling-модель для всіх існуючих Telegram акаунтів**~~ ✅ done
2. **Підняти Pyrogram/pytgcalls session для одного вже робочого TG акаунта** ← NEXT
3. ~~**Зробити мінімальний audio-only voip-bridge**~~ ✅ мікросервіс створений, Docker image ready
4. ~~**Додати backend lock/state для одного активного дзвінка на акаунт**~~ ✅ bridge.is_busy
5. **Тест**: вихідний і вхідний дзвінок на тому самому TG акаунті, що вже використовується для чату
6. Після цього масштабувати на інші акаунти і лише потім починати video

---

## Джерела

- [pytgcalls GitHub](https://github.com/pytgcalls/pytgcalls) — v2.2.11
- [ntgcalls GitHub](https://github.com/pytgcalls/ntgcalls) — v2.1.0, C++ WebRTC
- [ntgcalls C API (ntgcalls.h)](https://github.com/pytgcalls/ntgcalls/blob/master/include/ntgcalls.h)
- [PyPI py-tgcalls](https://pypi.org/project/py-tgcalls/)
- [pytgcalls офіційна документація](https://pytgcalls.github.io/)
- [MarshalX/tgcalls](https://github.com/MarshalX/tgcalls) — альтернативна бібліотека (для довідки)
