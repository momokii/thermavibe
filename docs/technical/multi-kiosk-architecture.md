# Multi-Kiosk Architecture Plan

> **Status:** Future reference — not implemented yet.
> **Last analyzed:** 2026-04-19
> **Current state:** Single-kiosk (one backend, one camera, one display)

## Context

VibePrint OS is currently a single-kiosk application — one machine runs the backend,
camera, printer, and display. The eventual goal is to support **multiple themed rooms**
at a single location, each with its own camera and touchscreen display, all managed
from one centralized admin dashboard.

### Target Setup

```
┌─────────────────────────────────────────────┐
│         Central Server (admin's machine)     │
│                                             │
│  Backend API + DB + AI + Admin Dashboard    │
│  - Configure Room A: camera, printer, theme │
│  - Configure Room B: camera, printer, theme │
│  - Global AI config, analytics, monitoring  │
└──────────┬──────────────┬───────────────────┘
           │  WebSocket    │
    ┌──────▼──────┐ ┌─────▼───────┐
    │  Room A     │ │  Room B     │
    │  Mini PC    │ │  Mini PC    │
    │  + Camera   │ │  + Camera   │
    │  + Display  │ │  + Display  │
    │  + Printer  │ │  + Printer  │
    │             │ │             │
    │  Runs:      │ │  Runs:      │
    │  - Agent    │ │  - Agent    │
    │  - Browser  │ │  - Browser  │
    └─────────────┘ └─────────────┘
```

### What runs where

| Component | Central Server | Each Room |
|-----------|---------------|-----------|
| Backend API (FastAPI) | YES | NO |
| Database (Postgres) | YES | NO |
| Admin Dashboard | YES | NO |
| AI analysis | YES (cloud APIs) | NO |
| Camera capture | NO | YES (agent) |
| Printer output | NO | YES (agent) |
| User display | NO | YES (browser, kiosk mode) |

---

## Current Architecture (single-kiosk)

Understanding what exists today and what needs to change.

### What's already multi-kiosk ready

- **State machine** (`session_service.py`) — Sessions are independent entities,
  concurrent sessions already work. State transitions operate on individual session
  instances, no global state.
- **Session-scoped API** (`kiosk.py`) — Most endpoints operate by `session_id`,
  not global state.
- **Device model** — DB already has a `Device` model with `DeviceType.CAMERA`
  and `DeviceType.PRINTER`.
- **AI provider dispatch** (`ai_service.py`) — Provider-agnostic, config-driven.
  Each kiosk can have its own AI config.
- **Config service** — Category-based config system. Adding per-kiosk scoping
  is an extension, not a rewrite.

### What needs to change

#### 1. Camera Service — HARD (global singleton → per-device instances)

**File:** `backend/app/services/camera_service.py`

**Current problem:**
- Uses module-level globals: `_active_device_index`, `_shared_cap`, `_active_device_name`
- Only ONE camera can be active at a time across the entire application
- `select_device()` changes the global camera for ALL requests

**Needed:**
- Per-device camera instances managed by a `CameraManager` class
- Each registered kiosk device gets its own `cv2.VideoCapture` handle
- Camera operations scoped by `device_id` or `kiosk_id`

**Warning:** This is the hardest part. The current singleton pattern exists because
most webcams break when opened twice. The multi-instance approach needs careful
testing with real hardware — some cheap USB webcams don't support concurrent access
even from separate processes. You may need one agent process per camera.

#### 2. Session Model — MEDIUM (add kiosk/device relationship)

**File:** `backend/app/models/session.py`

**Current problem:**
- `KioskSession` has no field to identify which physical kiosk it belongs to
- `get_active_session()` returns the most recent non-RESET session globally

**Needed:**
- Add `kiosk_id` field to `KioskSession` (FK to new `Kiosk` model)
- Scope all session queries by `kiosk_id`
- Create `Kiosk` model with fields: id, name, location, theme, status

#### 3. Configuration — MEDIUM (global → per-kiosk)

**File:** `backend/app/services/config_service.py`

**Current problem:**
- All config is global — one AI prompt, one camera index, etc.
- `DEFAULT_CONFIGS` is a flat dict with no scoping

**Needed:**
- Add optional `kiosk_id` to `OperatorConfig` model
- Config resolution: kiosk-specific → global fallback → env var fallback
- Admin UI: global defaults + per-room overrides

#### 4. Frontend — MEDIUM (add kiosk awareness)

**Files:** `frontend/src/stores/kioskStore.ts`, kiosk page components

**Current problem:**
- Single Zustand store assumes one active session
- No concept of which kiosk/device this browser represents

**Needed:**
- Kiosk browser identifies itself (device_id stored in localStorage or URL param)
- Backend returns kiosk-specific config when frontend sends its device_id
- Admin dashboard gets a "Rooms" management page

#### 5. API Endpoints — SMALL (add kiosk scoping)

**File:** `backend/app/api/v1/endpoints/kiosk.py`

**Current problem:**
- No kiosk/device identification in API requests
- Hardware status is global

**Needed:**
- Add `X-Kiosk-ID` header or path parameter for kiosk-scoped requests
- Camera/printer commands proxied through WebSocket to room agents

#### 6. Room Agent — NEW (lightweight daemon)

**Needed:** A new component — a lightweight Python script that runs on each
room's mini PC.

**Responsibilities:**
- Connect to central server via WebSocket
- Handle camera capture commands (receive: "capture" → send: JPEG bytes)
- Handle printer commands (receive: "print" + image → execute locally)
- Report device health (camera connected, printer paper level, etc.)
- Auto-reconnect on network interruption

---

## Implementation Phases

### Phase 1: Data model + kiosk identity

1. Create `Kiosk` model (id, name, location, theme, status, api_key)
2. Add `kiosk_id` FK to `KioskSession`
3. Add `kiosk_id` (nullable) to `OperatorConfig` for per-kiosk overrides
4. Create Alembic migration
5. Add kiosk registration API (register a new room)
6. Scope `get_active_session()` by `kiosk_id`

**Files to modify:**
- `backend/app/models/` — new `kiosk.py` model, update `session.py`, update config
- `backend/app/services/session_service.py` — scope queries
- `backend/app/services/config_service.py` — per-kiosk config resolution
- `backend/app/api/v1/endpoints/` — new kiosk management endpoints

### Phase 2: WebSocket communication layer

1. Add WebSocket endpoint to backend for room agent connections
2. Define message protocol:
   ```
   Server → Agent: { type: "capture", session_id: "..." }
   Agent → Server: { type: "frame", session_id: "...", data: <base64 jpeg> }
   Server → Agent: { type: "print", session_id: "...", data: <base64 image> }
   Agent → Server: { type: "health", camera: true, printer: true, paper_ok: true }
   ```
3. Add connection tracking (which agents are online, per kiosk)
4. Modify kiosk endpoints to proxy camera/printer commands through WebSocket

**Files to add:**
- `backend/app/api/v1/endpoints/ws.py` — WebSocket endpoint
- `backend/app/services/agent_manager.py` — track connected agents

### Phase 3: Room agent daemon

1. Create `scripts/room_agent/` — standalone Python script
2. Connect to central server via WebSocket
3. Camera handler (OpenCV capture, send JPEG over WS)
4. Printer handler (receive image, print via escpos)
5. Health reporting (periodic heartbeat)
6. Systemd service file for auto-start

**Files to add:**
- `scripts/room_agent/agent.py` — main agent script
- `scripts/room_agent/camera.py` — camera capture
- `scripts/room_agent/printer.py` — printer output
- `scripts/room_agent/requirements.txt`

### Phase 4: Admin multi-room dashboard

1. Add "Rooms" page to admin sidebar
2. Room list with status (online/offline, camera ok, printer ok)
3. Per-room configuration (camera, printer, AI theme/prompt)
4. Per-room analytics
5. Global config defaults with room-level overrides

**Files to modify:**
- `frontend/src/components/admin/AdminLayout.tsx` — add Rooms nav item
- New: `frontend/src/pages/AdminRoomsPage.tsx`
- New: `frontend/src/components/admin/RoomCard.tsx`
- `frontend/src/api/adminApi.ts` — room management API calls

### Phase 5: Kiosk frontend kiosk-mode

1. Room browser gets a `device_id` (via URL param or localStorage)
2. Frontend sends `X-Kiosk-ID` header on all API requests
3. Backend returns kiosk-specific config (theme, prompt, etc.)
4. Lock browser into kiosk mode (no admin access, no URL bar)

**Files to modify:**
- `frontend/src/api/client.ts` — add kiosk ID header
- `frontend/src/stores/kioskStore.ts` — store device_id
- `frontend/src/pages/KioskPage.tsx` — read device_id from URL/localStorage

---

## Warnings for future implementation

1. **USB webcam concurrency** — Some cheap webcams don't support being opened
   by multiple processes simultaneously. Test with your actual hardware before
   committing to the multi-instance camera approach. You may need one agent
   process per camera.

2. **Network reliability** — WiFi between rooms and central server can drop.
   The WebSocket protocol must handle reconnection gracefully. The agent should
   queue commands locally if the connection is lost.

3. **Camera latency over network** — Sending raw JPEG frames over WebSocket
   adds latency. For the MJPEG preview stream, consider having the agent serve
   a local MJPEG endpoint that the frontend connects to directly (bypassing the
   central server for video). Only still-capture frames need to go through the
   central server for AI analysis.

4. **This doc reflects the codebase as of 2026-04-19.** Models, services, and
   file paths may have changed by the time you implement this. Re-read the actual
   code before starting — the architectural concepts stay the same but the file
   names and function signatures may not.

5. **Alternative: independent kiosks** — If centralized management is not needed
   yet, the simplest multi-room setup is: each room runs the FULL stack (backend
   + frontend + camera) independently, and you manage them by opening each room's
   admin page from your laptop. Zero code changes needed for this approach.

6. **The camera service refactor is the riskiest change.** Everything else is
   additive (new models, new endpoints, new agent). But changing the camera service
   from singleton to multi-instance affects the core capture flow. Do this last,
   after everything else is working, and test thoroughly with real hardware.

---

## Quick reference: current single-kiosk files that matter

| File | Role | Multi-kiosk impact |
|------|------|--------------------|
| `backend/app/services/camera_service.py` | Camera singleton | REWRITE |
| `backend/app/models/session.py` | Session model | ADD kiosk_id |
| `backend/app/services/session_service.py` | State machine | SCOPE by kiosk |
| `backend/app/services/config_service.py` | Config | ADD per-kiosk |
| `backend/app/api/v1/endpoints/kiosk.py` | Kiosk API | ADD kiosk param |
| `backend/app/api/v1/endpoints/camera.py` | Camera API | SCOPE by kiosk |
| `frontend/src/stores/kioskStore.ts` | Frontend state | ADD device_id |
| `frontend/src/api/client.ts` | HTTP client | ADD kiosk header |
