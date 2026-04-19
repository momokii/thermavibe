# Multi-Kiosk Architecture Plan

> **Status:** Future reference — not implemented yet.
> **Last analyzed:** 2026-04-19
> **Current state:** Single-kiosk (one backend, one camera, one display)
> **Related docs:** `architecture-overview.md`, `api-contract.md`, `docker-deployment-guide.md`

---

## Table of Contents

1. [Context](#1-context)
2. [Target Architecture](#2-target-architecture)
3. [Current State Assessment](#3-current-state-assessment)
4. [Database Schema Changes](#4-database-schema-changes)
5. [WebSocket Protocol](#5-websocket-protocol)
6. [Room Agent Design](#6-room-agent-design)
7. [Implementation Phases](#7-implementation-phases)
8. [Migration Strategy](#8-migration-strategy)
9. [Security Considerations](#9-security-considerations)
10. [Hardware Reference](#10-hardware-reference)
11. [Warnings](#11-warnings)

---

## 1. Context

VibePrint OS is currently a single-kiosk application — one machine runs the backend,
camera, printer, and display. The eventual goal is to support **multiple themed rooms**
at a single location (e.g. a photobooth venue), each with its own camera, printer, and
touchscreen display for full user interaction, all managed from one centralized admin
dashboard.

### Use case

A photobooth venue with multiple rooms, each with a different theme:

- **Room A** — "Retro Vibes" theme, specific AI prompt, green lighting
- **Room B** — "Neon Dreams" theme, different AI prompt, pink lighting
- **Room C** — "Nature Zen" theme, nature-focused AI prompt, warm lighting

Each room has:
- A camera (for taking photos)
- A touchscreen display (for user interaction: start → capture → review → reveal)
- Optionally a printer (for physical photo receipts)

The venue operator manages all rooms from a single admin dashboard — configuring
cameras, printers, AI prompts, and viewing analytics per room.

### Why not just run independent kiosks?

You CAN run the full stack independently in each room (current code, zero changes).
The centralized approach becomes worth it when:
- You want one admin dashboard instead of opening N browser tabs
- You want per-room analytics aggregated in one place
- You want to change AI config across all rooms at once
- You want to monitor which rooms are online/offline
- You have 3+ rooms (below that, independent kiosks are simpler)

---

## 2. Target Architecture

```
┌──────────────────────────────────────────────────────┐
│              Central Server (one machine)             │
│                                                      │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ FastAPI      │  │ Postgres │  │ Admin Dashboard  │ │
│  │ Backend API  │  │ Database │  │ (React SPA)      │ │
│  │             │  │          │  │                  │ │
│  │ - Sessions  │  │ - Kiosks │  │ - Room management│ │
│  │ - AI dispatch│  │ - Config │  │ - Per-room config│ │
│  │ - Analytics │  │ - Sessions│  │ - Analytics      │ │
│  │ - WebSocket │  │          │  │ - Monitoring     │ │
│  └──────┬──────┘  └──────────┘  └─────────────────┘ │
│         │                                            │
└─────────┼──────────────┬─────────────────────────────┘
          │              │
     WebSocket           │
          │              │
   ┌──────▼──────┐ ┌─────▼───────┐ ┌──────────────┐
   │  Room A     │ │  Room B     │ │  Room C      │
   │             │ │             │ │              │
   │  Mini PC    │ │  Mini PC    │ │  Mini PC     │
   │  + Camera   │ │  + Camera   │ │  + Camera    │
   │  + Display  │ │  + Display  │ │  + Display   │
   │  + Printer  │ │  + Printer  │ │  (no printer)│
   │             │ │             │ │              │
   │  Runs:      │ │  Runs:      │ │  Runs:       │
   │  - Agent    │ │  - Agent    │ │  - Agent     │
   │  - Browser  │ │  - Browser  │ │  - Browser   │
   └─────────────┘ └─────────────┘ └──────────────┘
```

### What runs where

| Component | Central Server | Each Room |
|-----------|---------------|-----------|
| Backend API (FastAPI) | YES | NO |
| Database (Postgres) | YES | NO |
| Admin Dashboard | YES | NO |
| AI analysis | YES (cloud APIs / Ollama) | NO |
| Camera capture | NO | YES (agent) |
| Printer output | NO | YES (agent) |
| User display | NO | YES (browser, kiosk mode) |
| Session state machine | YES (backend) | NO |

### Network flow

```
User touches display
       │
       ▼
Browser (room) ──HTTP──► Central Backend
                         │
                         ├── Creates session (scoped to this room)
                         ├── Sends "capture" command ──WebSocket──► Agent (room)
                         │                                              │
                         │                         Agent captures photo│
                         │                         with local camera   │
                         │                                              │
                         │◄──JPEG frame────WebSocket──┘                 │
                         │
                         ├── Sends JPEG to AI provider (cloud/local)
                         ├── Gets vibe reading
                         ├── Stores in DB
                         ├── Sends "print" command ──WebSocket──► Agent (room)
                         │
                         ◄── Returns result to browser
                         │
Browser shows reveal screen to user
```

---

## 3. Current State Assessment

### What's already multi-kiosk ready

| Component | File | Why it's ready |
|-----------|------|---------------|
| State machine | `session_service.py` | Sessions are independent, concurrent sessions work |
| Session API | `kiosk.py` | Most endpoints are session-scoped by `session_id` |
| Device model | `backend/app/models/device.py` | Already has `DeviceType.CAMERA`, `DeviceType.PRINTER` |
| AI dispatch | `ai_service.py` | Provider-agnostic, config-driven, chain-based |
| Config service | `config_service.py` | Category-based system, extensible to per-kiosk |
| Frontend kiosk UI | `KioskShell.tsx`, screens | Display-only, driven by backend state |

### What needs to change (ranked by difficulty)

| Difficulty | Component | Current | Needed |
|-----------|-----------|---------|--------|
| HARD | Camera service | Global singleton | Per-device instances or remote via WebSocket |
| MEDIUM | Session model | No kiosk identity | Add `kiosk_id` FK |
| MEDIUM | Config service | Global config | Per-kiosk overrides with global fallback |
| MEDIUM | Frontend admin | Single device view | Multi-room dashboard |
| SMALL | API endpoints | No kiosk scoping | `X-Kiosk-ID` header or path param |
| SMALL | Frontend kiosk | No device identity | `device_id` from URL/localStorage |
| NEW | Room agent | Doesn't exist | Lightweight Python daemon |

---

## 4. Database Schema Changes

### New: `kiosks` table

```python
class Kiosk(Base):
    __tablename__ = 'kiosks'

    id: Mapped[uuid.UUID]         # Primary key
    name: Mapped[str]             # "Room A - Retro Vibes"
    location: Mapped[str]         # "Main floor, left"
    theme: Mapped[str]            # "retro" / "neon" / "nature"
    status: Mapped[str]           # "online" / "offline" / "maintenance"
    api_key: Mapped[str]          # For agent authentication
    config_overrides: Mapped[dict] # JSONB: per-kiosk config overrides
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    # Relationships
    sessions: Mapped[list['KioskSession']]
    devices: Mapped[list['Device']]
```

### Modified: `kiosk_sessions` table

```python
class KioskSession(Base):
    # ... existing fields ...
    kiosk_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey('kiosks.id'), nullable=True
    )
    # nullable=True for backward compatibility during migration
```

### Modified: `operator_configs` table

```python
class OperatorConfig(Base):
    # ... existing fields ...
    kiosk_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey('kiosks.id'), nullable=True
    )
    # NULL = global config, non-NULL = kiosk-specific override
```

### Modified: `devices` table

```python
class Device(Base):
    # ... existing fields ...
    kiosk_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey('kiosks.id'), nullable=True
    )
    # Links hardware device to specific kiosk/room
```

### Config resolution order

When the backend needs a config value for a kiosk:

```
1. Check operator_configs WHERE kiosk_id = <this_kiosk> AND key = <key>
2. If not found, check operator_configs WHERE kiosk_id IS NULL AND key = <key>
3. If not found, use settings.* (env var defaults)
```

This lets you set global defaults and override per-room.

---

## 5. WebSocket Protocol

### Connection

Each room agent connects to: `ws://<central-server>:8000/api/v1/ws/agent`

**Authentication:** Agent sends its `kiosk_id` and `api_key` in the first message
after connecting. Server validates and associates the WebSocket connection with that kiosk.

### Message format

All messages are JSON. Every message has a `type` field.

```json
{
  "type": "<message_type>",
  "kiosk_id": "<uuid>",
  "session_id": "<uuid>",  // optional, for session-scoped commands
  "data": { ... }          // payload varies by type
}
```

### Server → Agent messages

| Type | When | Data |
|------|------|------|
| `auth_ok` | After successful authentication | `{ "kiosk": { "name": "...", "theme": "..." } }` |
| `auth_fail` | After failed authentication | `{ "reason": "..." }` |
| `capture` | User clicks Analyze, backend needs photo | `{ "session_id": "..." }` |
| `snap` | User clicks Snap in multi-photo flow | `{ "session_id": "..." }` |
| `print` | Photo needs printing | `{ "session_id": "...", "image_url": "/api/v1/..." }` |
| `start_preview` | User enters capture screen | `{ "resolution": "1280x720", "fps": 15 }` |
| `stop_preview` | User leaves capture screen | `{}` |
| `ping` | Keepalive (every 30s) | `{}` |

### Agent → Server messages

| Type | When | Data |
|------|------|------|
| `auth` | Immediately after WebSocket connect | `{ "kiosk_id": "...", "api_key": "..." }` |
| `frame` | After capture/snap command | `{ "session_id": "...", "image": "<base64 jpeg>" }` |
| `preview_frame` | Streaming MJPEG frames (if proxying) | `{ "image": "<base64 jpeg>" }` |
| `print_done` | After successful print | `{ "session_id": "..." }` |
| `print_fail` | After print failure | `{ "session_id": "...", "error": "..." }` |
| `health` | Periodic (every 10s) | `{ "camera": true, "printer": true, "paper_ok": true }` |
| `pong` | Response to ping | `{}` |
| `error` | Any unexpected error | `{ "message": "...", "code": "..." }` |

### Preview stream approach

The MJPEG preview (live camera feed shown to user before capture) has two options:

**Option A: Agent proxies stream (recommended)**
- Agent starts a local MJPEG HTTP server on the room's mini PC (e.g. `http://localhost:8080/stream`)
- Frontend browser connects directly to the local agent's MJPEG stream
- Low latency, no central server bandwidth used
- Central server only handles still captures (sent via WebSocket)

**Option B: Stream through WebSocket**
- Agent sends preview frames through WebSocket to central server
- Central server relays as MJPEG stream to frontend
- Higher latency, uses central server bandwidth
- Simpler network setup (only one connection needed from agent)

Recommend Option A for production. The frontend URL for the preview would be:
`http://<room-agent-ip>:8080/stream` instead of the current `/api/v1/camera/stream`.

---

## 6. Room Agent Design

The room agent is a lightweight Python daemon that runs on each room's mini PC.

### Directory structure

```
scripts/room_agent/
├── agent.py              # Main entry point, WebSocket client
├── camera.py             # OpenCV camera capture
├── printer.py            # ESC/POS printer output
├── preview_server.py     # Local MJPEG preview stream server
├── config.py             # Agent configuration (server URL, kiosk ID, etc.)
├── requirements.txt      # Minimal deps: websockets, opencv-python, escpos
└── room-agent.service    # Systemd service file
```

### Dependencies

```
# requirements.txt
websockets>=12.0          # WebSocket client
opencv-python>=4.8        # Camera capture
python-escpos>=3.0        # Printer (optional)
Pillow>=10.0              # Image processing
httpx>=0.25               # HTTP for health checks
```

### Agent lifecycle

```
1. Start → Read config (server URL, kiosk_id, api_key)
2. Connect to WebSocket: ws://<server>/api/v1/ws/agent
3. Send auth message
4. Wait for auth_ok
5. Start health reporting loop (every 10s)
6. Start local MJPEG preview server (port 8080)
7. Listen for commands:
   - "capture" → OpenCV read frame → encode JPEG → send "frame" message
   - "snap" → Same as capture
   - "print" → Download image from URL → send to ESC/POS printer
   - "ping" → Send "pong"
8. If connection drops → retry with exponential backoff (1s, 2s, 4s, ..., max 60s)
9. On reconnect → re-authenticate → resume
```

### Systemd service

```ini
# /etc/systemd/system/room-agent.service
[Unit]
Description=VibePrint Room Agent
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/vibeprint-agent/agent.py
WorkingDirectory=/opt/vibeprint-agent
Restart=always
RestartSec=5
Environment="VP_SERVER_URL=ws://192.168.1.100:8000/api/v1/ws/agent"
Environment="VP_KIOSK_ID=<room-uuid>"
Environment="VP_API_KEY=<room-api-key>"

[Install]
WantedBy=default.target
```

---

## 7. Implementation Phases

### Phase 1: Data model + kiosk identity (estimated: 2-3 days)

**Goal:** Add kiosk concept to the database without breaking anything.

1. Create `Kiosk` model in `backend/app/models/kiosk.py`
2. Add `kiosk_id` (nullable) to `KioskSession`, `OperatorConfig`, `Device`
3. Create Alembic migration
4. Add kiosk CRUD endpoints: `POST /admin/kiosks`, `GET /admin/kiosks`, `PUT /admin/kiosks/{id}`
5. Add kiosk registration with API key generation
6. Scope `get_active_session()` by `kiosk_id` (fallback to global if null)
7. Update config resolution: kiosk-specific → global → env var
8. Write tests for new model and scoped queries

**Files to modify:**
- `backend/app/models/kiosk.py` — NEW
- `backend/app/models/session.py` — add `kiosk_id`
- `backend/app/models/device.py` — add `kiosk_id`
- `backend/app/services/config_service.py` — per-kiosk resolution
- `backend/app/services/session_service.py` — scope queries
- `backend/app/api/v1/endpoints/admin.py` — kiosk management endpoints
- `backend/alembic/versions/` — new migration

### Phase 2: WebSocket communication layer (estimated: 3-4 days)

**Goal:** Backend can communicate with room agents in real-time.

1. Add FastAPI WebSocket endpoint at `/api/v1/ws/agent`
2. Create `AgentManager` service to track connected agents:
   - Track which `kiosk_id` has an active WebSocket connection
   - Send commands to specific agents
   - Handle disconnection/reconnection
3. Implement the full message protocol (see Section 5)
4. Add authentication via API key on WebSocket connect
5. Write tests with mock WebSocket clients

**Files to add:**
- `backend/app/api/v1/endpoints/ws.py` — WebSocket endpoint
- `backend/app/services/agent_manager.py` — connection tracking

**Files to modify:**
- `backend/app/main.py` — include WebSocket router
- `backend/app/api/v1/endpoints/kiosk.py` — proxy camera/printer through WS

### Phase 3: Room agent daemon (estimated: 3-5 days)

**Goal:** Each room has a working agent that handles camera + printer.

1. Create `scripts/room_agent/agent.py` — main WebSocket client
2. Create `scripts/room_agent/camera.py` — OpenCV capture
3. Create `scripts/room_agent/printer.py` — ESC/POS output
4. Create `scripts/room_agent/preview_server.py` — local MJPEG server
5. Create `scripts/room_agent/config.py` — config from env vars
6. Test on actual hardware (Raspberry Pi or Intel NUC with real camera)
7. Create systemd service file
8. Write agent-specific tests

**Files to add:**
- `scripts/room_agent/` — entire directory (see Section 6)

### Phase 4: Admin multi-room dashboard (estimated: 3-4 days)

**Goal:** Admin can see and manage all rooms from one dashboard.

1. Add "Rooms" to admin sidebar navigation
2. Create rooms list page with status indicators (online/offline/health)
3. Create per-room configuration panel (camera, printer, AI theme/prompt)
4. Add per-room analytics breakdown
5. Add global config defaults with room-level override indicators
6. Add room registration flow (generate API key for new room)

**Files to modify:**
- `frontend/src/components/admin/AdminLayout.tsx` — add Rooms nav item
- `frontend/src/api/adminApi.ts` — room management API calls
- `frontend/src/api/types.ts` — room-related types

**Files to add:**
- `frontend/src/pages/AdminRoomsPage.tsx`
- `frontend/src/components/admin/RoomList.tsx`
- `frontend/src/components/admin/RoomConfig.tsx`

### Phase 5: Kiosk frontend device identity (estimated: 1-2 days)

**Goal:** Each room's browser identifies itself to the backend.

1. Frontend reads `device_id` from URL parameter (`?kiosk=room-a-uuid`)
2. Store in localStorage for subsequent visits
3. Send `X-Kiosk-ID` header on all API requests
4. Backend middleware resolves kiosk config from the header
5. Frontend gets kiosk-specific theme/prompt
6. Browser launches in kiosk mode (no URL bar, no right-click)

**Files to modify:**
- `frontend/src/api/client.ts` — add kiosk ID header interceptor
- `frontend/src/stores/kioskStore.ts` — store and load device_id
- `frontend/src/pages/KioskPage.tsx` — read device_id from URL/localStorage
- `backend/app/core/middleware.py` — kiosk ID resolution middleware

---

## 8. Migration Strategy

How to go from single-kiosk to multi-kiosk without breaking existing deployments.

### Step 1: Add kiosk model (non-breaking)

All new columns are nullable. Existing sessions continue to work with `kiosk_id = NULL`.
A kiosk_id of NULL means "legacy single-kiosk mode" — backward compatible.

### Step 2: Register the existing kiosk

Run a one-time script to create a `Kiosk` record for the existing deployment
and backfill `kiosk_id` on existing sessions. After this, the single-kiosk setup
works exactly as before but now has a kiosk identity.

### Step 3: Deploy agent to new rooms

For each new room:
1. Install the room agent on a mini PC
2. Connect camera + printer + display
3. Register the room in the admin dashboard (generates API key)
4. Configure the agent with the server URL, kiosk ID, and API key
5. Start the agent + open browser in kiosk mode

### Step 4: Migrate existing room to agent

For the original kiosk (already running the full stack):
1. Keep the backend on the central server
2. Deploy the agent on the kiosk machine
3. Reconfigure the browser to point to the central server
4. Remove the local backend from the kiosk machine

---

## 9. Security Considerations

### Agent authentication

- Each kiosk gets a unique `api_key` generated at registration
- API key is sent on WebSocket connect (first message)
- Server validates and associates the connection with the kiosk
- Failed auth → connection closed immediately

### Network security

- Run WebSocket over `wss://` (TLS) in production
- Use a VPN or isolated VLAN for kiosk network
- Central server should not be exposed to the public internet
- Agent configs (API keys) should be in env vars, not committed

### Admin access

- Admin dashboard is separate from kiosk displays
- Kiosk browsers run in kiosk mode (no URL bar, no dev tools)
- Room agents have no admin capabilities — they only execute commands

### Data isolation

- All session queries are scoped by `kiosk_id`
- Agents can only access their own kiosk's sessions
- Analytics are aggregated but filterable by room

---

## 10. Hardware Reference

### Per-room hardware (estimated cost)

| Component | Example | Cost (IDR) |
|-----------|---------|-----------|
| Mini PC | Intel NUC / Beelink Mini S | 2-4 jt |
| USB Webcam | Logitech C920 / C270 | 500k-1.5 jt |
| Touchscreen | 15-22" HDMI touchscreen | 2-4 jt |
| Thermal Printer | POS-58 / EPSON TM-T82 | 500k-1.5 jt |
| **Total per room** | | **~5-11 jt** |

### Central server

The existing development machine is likely sufficient. Requirements:
- Python 3.12+ runtime
- PostgreSQL database
- Network accessible from all rooms
- If using cloud AI (OpenAI, etc.): internet access

### Recommended mini PC specs

- Intel N100 or better (handles OpenCV + WebSocket)
- 8GB RAM minimum
- Ubuntu/Debian Linux
- 2+ USB ports (camera + printer)
- HDMI output (display)

---

## 11. Warnings

1. **USB webcam concurrency** — Some cheap webcams don't support being opened
   by multiple processes simultaneously. Test with your actual hardware before
   committing to the multi-instance camera approach. The room agent design avoids
   this by having one agent process per camera.

2. **Network reliability** — WiFi between rooms and central server can drop.
   The WebSocket protocol must handle reconnection gracefully. The agent uses
   exponential backoff (1s, 2s, 4s, ..., max 60s) and re-authenticates on reconnect.

3. **Camera latency over network** — Sending raw JPEG frames over WebSocket
   adds latency. The recommended approach is: agent runs a LOCAL MJPEG preview
   server on the room's mini PC, and the frontend browser connects directly to
   `http://localhost:8080/stream`. Only still-capture frames (one per session)
   go through the WebSocket to the central server.

4. **This doc reflects the codebase as of 2026-04-19.** Models, services, and
   file paths may have changed by the time you implement this. Re-read the actual
   code before starting — the architectural concepts stay the same but the file
   names and function signatures may not.

5. **Alternative: independent kiosks** — If centralized management is not needed
   yet, the simplest multi-room setup is: each room runs the FULL stack (backend
   + frontend + camera) independently, and you manage them by opening each room's
   admin page from your laptop. Zero code changes needed for this approach.

6. **The camera service refactor is the riskiest change.** Everything else is
   additive (new models, new endpoints, new agent). But moving camera control from
   direct backend access to a remote WebSocket agent affects the core capture flow.
   Test thoroughly with real hardware before relying on it.

7. **Database migration is non-destructive.** All new columns (`kiosk_id`) are
   nullable. Existing data keeps working. The migration can be rolled back safely.

8. **The admin dashboard should be accessible only on the central server's network.**
   Do not expose it to the internet without proper authentication and TLS.
   Consider adding IP allowlisting or VPN-only access.

---

## Quick Reference: Files That Matter

| File | Role | Multi-kiosk impact |
|------|------|--------------------|
| `backend/app/services/camera_service.py` | Camera singleton | REWRITE or BYPASS (agent handles camera) |
| `backend/app/models/session.py` | Session model | ADD kiosk_id FK |
| `backend/app/services/session_service.py` | State machine | SCOPE queries by kiosk |
| `backend/app/services/config_service.py` | Config | ADD per-kiosk resolution |
| `backend/app/api/v1/endpoints/kiosk.py` | Kiosk API | ADD kiosk param, proxy to agent |
| `backend/app/api/v1/endpoints/camera.py` | Camera API | SCOPE by kiosk or remove (agent handles) |
| `frontend/src/stores/kioskStore.ts` | Frontend state | ADD device_id |
| `frontend/src/api/client.ts` | HTTP client | ADD kiosk header |
| `backend/app/main.py` | App factory | ADD WebSocket router |
| `backend/app/core/middleware.py` | Middleware | ADD kiosk resolution |
