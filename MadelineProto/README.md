# MadelineProto Documentation Reference

Повний локальний довідник документації MadelineProto v8.
Спарсено з https://docs.madelineproto.xyz/ та GitHub репозиторію `danog/MadelineProtoDocs`.

**Дата збору**: 2026-04-14
**Версія**: MadelineProto v8 (PHP 8.3+)

## Структура

```
MadelineProto/
├── docs/              # 31 файлів — основна документація (гайди)
│   ├── CALLS.md           # VoIP дзвінки (play, setOutput, accept, discard)
│   ├── CREATING_A_CLIENT.md
│   ├── LOGIN.md
│   ├── UPDATES.md         # Обробка оновлень (EventHandler)
│   ├── FILES.md           # Завантаження/відправка файлів
│   ├── SETTINGS.md        # Налаштування клієнта
│   ├── FILTERS.md         # Фільтри подій (120KB — найбільший файл)
│   ├── PLUGINS.md         # Система плагінів
│   ├── DATABASE.md        # Бекенди БД (MySQL, Postgres, Redis)
│   ├── BROADCAST.md       # Масова розсилка
│   ├── ASYNC.md           # Асинхронний PHP (Amphp/Revolt)
│   ├── DOCKER.md          # Docker deployment
│   ├── FEATURES.md        # Повний список фіч
│   ├── INSTALLATION.md    # Встановлення
│   ├── REQUIREMENTS.md    # Системні вимоги
│   ├── EXCEPTIONS.md      # Обробка помилок
│   ├── FAQ.md             # Часті питання
│   ├── FLOOD_WAIT.md      # FloodWait та rate limits
│   ├── LOGGING.md         # Логування
│   ├── METRICS.md         # Метрики
│   ├── CHAT_INFO.md       # Інформація про чати
│   ├── DIALOGS.md         # Діалоги
│   ├── INLINE_BUTTONS.md  # Інлайн кнопки
│   ├── SECRET_CHATS.md    # Секретні чати
│   ├── PROXY.md           # Проксі
│   ├── SELF.md            # Інформація про себе
│   ├── TEMPLATES.md       # Веб-шаблони
│   ├── UPGRADING.md       # Міграція v7 → v8
│   ├── USING_METHODS.md   # Виклик методів API
│   ├── CONTRIB.md         # Contribution guide
│   └── UPDATES_INTERNAL.md # Внутрішня обробка оновлень
│
├── php/               # 80 файлів — PHP класи (API reference)
│   ├── API.md             # Головний клас (164KB)
│   ├── EventHandler.md    # EventHandler (165KB)
│   ├── LocalFile.md       # Локальні файли для play/upload
│   ├── RemoteUrl.md       # Віддалені URL для play/upload
│   ├── BotApiFileId.md    # Bot API file IDs
│   ├── FileCallback.md    # Callback для прогресу файлів
│   ├── VoIP/              # VoIP класи
│   │   ├── VoIP.md            # Клас дзвінка (play, setOutput, accept, discard)
│   │   ├── CallState.md       # Стани дзвінка
│   │   ├── DiscardReason.md   # Причини завершення
│   │   ├── VoIPState.md       # Стан протоколу
│   │   └── Settings_VoIP.md   # Налаштування VoIP
│   ├── Settings/          # Налаштування (11 файлів)
│   │   ├── AppInfo.md, Auth.md, Connection.md, Files.md, ...
│   │   └── Database/      # Бекенди БД (Memory, Mysql, Postgres, Redis)
│   ├── Media/             # Типи медіа (9 файлів)
│   │   ├── Audio.md, Video.md, Voice.md, Photo.md, Document.md, ...
│   ├── Messages/          # Повідомлення (8 файлів)
│   │   ├── AbstractMessage.md, AbstractPrivateMessage.md, Command.md, ...
│   ├── Filters/           # Фільтри подій (26 файлів)
│   │   ├── Filter.md, FilterIncoming.md, FilterOutgoing.md, ...
│   ├── Events/            # Атрибути та події (6 файлів)
│   │   ├── Handler.md, Cron.md, CallbackQuery.md, ...
│   └── Errors/            # RPC помилки (2 файли)
│       ├── CallAlreadyAcceptedError.md, CallAlreadyDeclinedError.md
│
├── methods/           # 771 файл — ВСІ методи Telegram API
│   ├── phone.requestCall.md
│   ├── phone.acceptCall.md
│   ├── phone.discardCall.md
│   ├── phone.sendSignalingData.md
│   ├── messages.sendMessage.md
│   ├── messages.sendMedia.md
│   ├── messages.editMessage.md
│   ├── messages.deleteMessages.md
│   ├── upload.getFile.md
│   ├── contacts.importContacts.md
│   └── ... (771 методів)
│
├── api/               # 19 файлів — загальні API хелпери
│   ├── index.md           # Головна сторінка
│   ├── README.md
│   ├── Chat.md, Info.md, FullInfo.md, Participant.md
│   ├── phoneLogin.md, botLogin.md, completePhoneLogin.md, ...
│   └── getSelf.md, getInfo.md, getId.md, ...
│
└── README.md          # Цей файл
```

**Всього: 901 файл, 5.2 MB**

## Швидкий доступ по темах

### VoIP дзвінки
- Гайд: `docs/CALLS.md`
- Клас VoIP: `php/VoIP/VoIP.md` — методи `play()`, `setOutput()`, `accept()`, `discard()`
- Стани: `php/VoIP/CallState.md` — REQUESTED, INCOMING, ACCEPTED, RUNNING, ENDED
- API: `methods/phone.requestCall.md`, `methods/phone.acceptCall.md`, `methods/phone.discardCall.md`, `methods/phone.sendSignalingData.md`

### EventHandler
- Гайд: `docs/UPDATES.md`
- Клас: `php/EventHandler.md` (165KB — повний API)
- Фільтри: `docs/FILTERS.md` + `php/Filters/`
- Атрибути: `php/Events/Handler.md`, `php/Events/Cron.md`

### Файли та медіа
- Гайд: `docs/FILES.md`
- Класи: `php/LocalFile.md`, `php/RemoteUrl.md`
- Типи: `php/Media/` (Audio, Video, Voice, Photo, Document, ...)

### Налаштування
- Гайд: `docs/SETTINGS.md`
- Класи: `php/Settings/` (AppInfo, Connection, RPC, VoIP, ...)
- БД: `php/Settings/Database/` (Memory, Mysql, Postgres, Redis)

### Повідомлення
- Класи: `php/Messages/AbstractMessage.md`, `php/Messages/Command.md`
- Видалення: `php/Messages/Delete.md`, `php/Messages/DeleteMessages.md`

## Додаткові джерела інформації

Якщо завантаженої документації недостатньо, актуальну інформацію можна знайти в наступних репозиторіях:

### GitHub репозиторії
| Репозиторій | Опис | Що шукати |
|-------------|------|-----------|
| `danog/MadelineProto` (branch `v8`) | Вихідний код бібліотеки | PHP класи, реалізація методів, internal логіка |
| `danog/MadelineProtoDocs` (branch `master`) | Документація (це джерело) | Оновлені гайди, нові методи API |

### Корисні файли у вихідному коді MadelineProto
| Файл | Опис |
|------|------|
| `src/VoIPController.php` | Контролер VoIP дзвінків (old + WebRTC protocol) |
| `src/Tgcalls/Controller.php` | WebRTC реалізація (RTCPeerConnection) |
| `src/EventHandler.php` | Базовий EventHandler |
| `src/MTProtoTools/Files.php` | Upload/download файлів |
| `src/MTProtoTools/PeerHandler.php` | Робота з peer'ами |
| `src/Settings/` | Всі класи налаштувань |
| `src/VoIP.php` | Клас VoIP дзвінка |

### Як шукати
```bash
# Пошук в локальному довіднику
grep -r "play(" php/VoIP/
grep -r "requestCall" methods/

# Пошук у GitHub (вихідний код)
# Використовуйте mcp__gitmcp__search_generic_code або GitHub API
# Repo: danog/MadelineProto, branch: v8

# Онлайн документація (завжди актуальна)
# https://docs.madelineproto.xyz/
# https://docs.madelineproto.xyz/docs/CALLS.html — VoIP
# https://docs.madelineproto.xyz/PHP/danog/MadelineProto/API.html — API класс
```

### Контекст для Context7 MCP
Для отримання актуальної документації через Context7:
- Library: `danog/MadelineProto`
- Topics: VoIP, EventHandler, Files, Settings, etc.
