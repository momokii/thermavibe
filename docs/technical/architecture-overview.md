# VibePrint OS -- Architecture Overview

> This document provides a comprehensive architectural description of the VibePrint OS system, including component diagrams, data flows, state machines, service layer organization, and deployment topology.

---

## Table of Contents

1. [System Diagram](#1-system-diagram)
2. [Data Flow Diagram](#2-data-flow-diagram)
3. [Kiosk State Machine](#3-kiosk-state-machine)
4. [Service Layer Architecture](#4-service-layer-architecture)
5. [Docker Process Architecture](#5-docker-process-architecture)

---

## 1. System Diagram

The following diagram shows all major components of VibePrint OS and their connections. Solid lines represent synchronous communication (REST API calls). Dashed lines represent asynchronous communication (webhooks, streams).

```
+-------------------------------------------------------------------+
|                         HOST MACHINE (Linux)                      |
|                                                                   |
|  +-------------------+          +-------------------------------+  |
|  |   END USER        |  touch   |        KIOSK UI              |  |
|  |   (Physical       |------->  |  React 19 SPA in             |  |
|  |    interaction)   |  events  |  Chromium --kiosk mode       |  |
|  +-------------------+          |                               |  |
|                                 |  - Zustand (state machine)    |  |
|                                 |  - React Query (server state) |  |
|                                 |  - Framer Motion (animations) |  |
|                                 |  - shadcn/ui (components)     |  |
|                                 |  - Tailwind CSS 4 (styling)   |  |
|                                 +---------------+---------------+  |
|                                                 |                  |
|                                                 | HTTP (REST API)  |
|                                                 |                  |
|                                 +---------------v---------------+  |
|                                 |        FASTAPI BACKEND        |  |
|                                 |                               |  |
|                                 |  API Routes                  |  |
|                                 |    v                         |  |
|                                 |  Service Layer               |  |
|                                 |    v                         |  |
|                                 |  Models + External Adapters  |  |
|                                 |                               |  |
|                                 +--+--------+--------+--------+-+  |
|                                    |        |        |        |    |
|                    HTTP/HTTPS      |        |        |   USB   |    |
|                    (async)         |        |        |  (ESC/  |    |
|                                   |        |        |   POS)  |    |
|                          +--------v--+  +--v------+  +--v-----+ |  |
|                          | PostgreSQL |  | AI      |  | Thermal| |  |
|                          | 16         |  | Provider|  |Printer | |  |
|                          |            |  | (HTTPS)|  |(USB)   | |  |
|                          | - Sessions |  |        |  |        | |  |
|                          | - Config   |  | OpenAI |  | ESC/   | |  |
|                          | - Payments |  | Anthro-|  | POS    | |  |
|                          | - Analytics|  | pic    |  | Protocol| |  |
|                          |            |  | Google |  |        | |  |
|                          +------------+  | Ollama |  +--------+ |  |
|                                          +---+----+             |  |
|                                              |                  |  |
|                                          HTTPS                  |  |
|                                              |                  |  |
|                                          +---v----+             |  |
|                                          |Payment |             |  |
|                                          |Gateway |<------------+  |
|                                          |        |  HTTPS +        |
|                                          | Midtrans  Webhook      |
|                                          | Xendit |                |
|                                          +--------+                |
|                                                                   |
|                                 +---------------+                 |
|                                 |  USB CAMERA   |                |
|                                 | (V4L2/OpenCV) |                |
|                                 +-------+-------+                |
|                                         |                         |
|                                         | MJPEG stream            |
|                                         | (HTTP multipart)        |
|                                         v                         |
|                                 +-------+-------+                |
|                                 |  KIOSK UI     |                |
|                                 |  <img> tag    |                |
|                                 |  /camera/stream|               |
|                                 +---------------+                |
|                                                                   |
|  +-------------------+                                            |
|  |   OPERATOR        |          +-------------------------------+  |
|  |   (Admin access)  | HTTP     |     ADMIN DASHBOARD           |  |
|  |                   |--------->|  React SPA (same app)         |  |
|  +-------------------+          |  /admin route                 |  |
|                                 |  - Config management          |  |
|                                 |  - Analytics dashboard        |  |
|                                 |  - Hardware testing           |  |
|                                 +-------------------------------+  |
+-------------------------------------------------------------------+
```

### Component Descriptions

| Component | Technology | Role |
|-----------|-----------|------|
| **Kiosk UI** | React 19 / TypeScript / Chromium | Public-facing touchscreen interface that guides users through the photobooth flow |
| **FastAPI Backend** | Python 3.12+ / FastAPI | Serves the frontend static files, provides REST API, orchestrates all business logic |
| **PostgreSQL** | PostgreSQL 16 | Persistent storage for sessions, configurations, payments, and analytics |
| **AI Provider** | OpenAI / Anthropic / Google / Ollama | Receives captured images and returns AI-generated text analysis |
| **Payment Gateway** | Midtrans / Xendit | Processes QRIS payments via QR code generation and webhook callbacks |
| **Thermal Printer** | USB / ESC/POS | Prints receipts with AI results and optional photo thumbnail |
| **USB Camera** | V4L2 / OpenCV | Captures photos and provides live MJPEG preview stream |
| **Admin Dashboard** | React 19 (same app, /admin route) | Operator interface for configuration, monitoring, and hardware testing |

### Communication Protocols

| Connection | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| Kiosk UI to Backend | HTTP/REST | Request/Response | JSON payloads, served from localhost:8000 |
| Backend to PostgreSQL | TCP (postgresql wire protocol) | Bidirectional | Connection pooled via SQLAlchemy |
| Backend to AI Provider | HTTPS | Request/Response | Async HTTP via httpx, timeout configurable |
| Backend to Payment Gateway | HTTPS | Request/Response + Webhook | Payment creation outbound, status callback inbound |
| Backend to Thermal Printer | USB (bulk transfer) | Outbound only | ESC/POS binary protocol via python-escpos |
| Backend to Camera | V4L2 (USB) | Inbound only | OpenCV captures frames, MJPEG stream served over HTTP |
| Payment Gateway to Backend | HTTPS (webhook) | Inbound | POST callback with signature verification |

---

## 2. Data Flow Diagram

The following diagram traces the complete data path from camera capture through AI processing to thermal printer output.

```
STEP 1: CAMERA CAPTURE
=======================
USB Camera (V4L2)
    |
    | Raw frame (BGR, numpy array, e.g., 1920x1080x3)
    v
OpenCV (cv2.VideoCapture)
    |
    | Frame extracted as numpy array
    v
Image Processing Pipeline
    |
    | 1. Resize to target resolution (e.g., 640x480)
    | 2. Convert BGR to RGB
    | 3. Compress to JPEG (quality ~85)
    v
JPEG bytes (~50-150 KB)


STEP 2: AI ANALYSIS
====================
JPEG bytes
    |
    | HTTP POST to AI provider (base64-encoded image in JSON body)
    | Request: { "image": "<base64>", "prompt": "Analyze this photo..." }
    v
AI Provider (OpenAI / Anthropic / Google / Ollama)
    |
    | AI model processes image and generates text response
    | Response: { "analysis": "Based on the energy in this photo..." }
    v
Text response (string, ~100-500 characters)


STEP 3: PRINT PREPARATION
==========================
Text response
    |
    | 1. Format text for thermal printer (word wrap to paper width)
    | 2. Add header/footer (branding, session ID, timestamp)
    | 3. Add QR code for digital copy (optional)
    v
Formatted text lines

JPEG bytes (from Step 1)
    |
    | 1. Resize to printer width (384px or 576px depending on paper)
    | 2. Apply Floyd-Steinberg dithering (convert to 1-bit bitmap)
    | 3. Convert to ESC/POS raster format
    v
Dithered bitmap bytes

Formatted text + Dithered bitmap
    |
    | python-escpos assembles ESC/POS command sequence:
    | - ESC @ (initialize printer)
    | - GS ! (set print style)
    | - Text lines (encoded to printer code page)
    | - GS v 0 (print raster image)
    | - GS V (cut paper)
    v
ESC/POS byte stream (~10-50 KB depending on image)


STEP 4: PRINT OUTPUT
=====================
ESC/POS byte stream
    |
    | USB bulk transfer via pyusb
    v
Thermal Printer
    |
    | Printer hardware interprets ESC/POS commands:
    | - Prints formatted text
    | - Prints dithered photo thumbnail
    | - Cuts paper
    v
Physical receipt
```

### Data Size Estimates

| Stage | Format | Approximate Size | Latency |
|-------|--------|-----------------|---------|
| Raw camera frame | BGR numpy array | ~6 MB (1920x1080x3) | <33ms (30fps) |
| Compressed JPEG | JPEG file | ~80 KB (quality 85) | ~10ms |
| Base64 encoded | JSON string | ~107 KB (33% overhead) | negligible |
| AI request payload | HTTPS POST | ~110 KB | ~100ms (upload) |
| AI response | JSON string | ~500 bytes | 2-15s (model dependent) |
| Dithered bitmap | 1-bit pixel data | ~27 KB (384px width) | ~50ms |
| ESC/POS byte stream | Binary | ~30 KB | ~2-5s (print time) |

### Error Handling in Data Flow

Each step has defined error handling:

1. **Camera capture failure**: Retry up to 3 times with 1-second delay. If still failing, transition to ERROR state with "Camera not available" message.
2. **AI provider timeout/failure**: Retry with exponential backoff (1s, 2s, 4s). If all retries fail, use fallback provider if configured, otherwise show "Analysis unavailable" error.
3. **Image processing failure**: Catch exceptions during resize/dithering, fall back to text-only receipt (no photo thumbnail).
4. **Printer failure**: Detect via USB connection check before printing. If printer is unavailable, offer to display result on screen instead. Retry once after re-initializing the USB connection.

---

## 3. Kiosk State Machine

The kiosk follows a 6-state flow managed by the Zustand store on the frontend, with state transitions validated by the backend.

### Primary Flow (Happy Path)

```
+-------+    payment     +----------+    countdown    +---------+
|       |    enabled &   |          |    complete &   |         |
| IDLE  |--------------> | PAYMENT  | -------------> | CAPTURE |
|       |    user taps   |          |    payment      |         |
|       |    "Start"     |          |    confirmed    |         |
+---+---+                +----+-----+                 +----+----+
    |                          |                           |
    |  payment disabled        |  timeout (15 min)          |  capture
    |  or user skips           |  (auto-cancel)            |  success
    |                          v                           |
    |                     [return to IDLE]                 |
    |                                                      |
    |                      +----------+                    |
    +--------------------- |          | <------------------+
                           | PROCESS  |  AI response
      error/fallback       | ING      |  received
      (show text only)     |          |
                           +----+-----+
                                |
                                |  analysis complete
                                |  (text + optional image)
                                v
                           +----------+
                           |          |
                           | REVEAL   |
                           |          |
                           |  - Show  |
                           |    result|
                           |  - Print |
                           |    btn   |
                           |  - Share |
                           |    btn   |
                           +----+-----+
                                |
                     print btn  |  timer (30s auto-reset)
                     pressed    |
                                v
                           +----------+
                           |          |
                           | RESET    |
                           |          |
                           |  - Clear |
                           |    session|
                           |  - Free  |
                           |    resources
                           +----+-----+
                                |
                                |  cleanup complete
                                v
                           [return to IDLE]
```

### Complete State Transition Table

| Current State | Event | Next State | Action |
|--------------|-------|------------|--------|
| IDLE | User taps "Start" (payment disabled) | CAPTURE | Start camera preview, begin countdown |
| IDLE | User taps "Start" (payment enabled) | PAYMENT | Generate QRIS QR code, display to user |
| PAYMENT | Payment confirmed (webhook) | CAPTURE | Stop QR display, start camera preview, begin countdown |
| PAYMENT | Payment timeout (15 min) | IDLE | Clear payment session, show "Session expired" |
| PAYMENT | User cancels | IDLE | Clear payment session |
| CAPTURE | Countdown reaches 0 | CAPTURE | Capture frame from camera |
| CAPTURE | Capture successful | PROCESSING | Send image to AI provider, show loading animation |
| CAPTURE | Capture fails (3 retries) | IDLE | Show error message, "Please try again" |
| CAPTURE | Camera not available | IDLE | Show error message, log hardware fault |
| PROCESSING | AI response received | REVEAL | Display result text, enable print/share buttons |
| PROCESSING | AI timeout (30s total) | REVEAL | Show "Analysis took too long" with fallback text |
| PROCESSING | AI provider error | REVEAL | Show "Analysis unavailable" with fallback text |
| PROCESSING | Network error | PROCESSING | Retry with exponential backoff (up to 3 attempts) |
| REVEAL | User taps "Print" | RESET | Send print job to printer, then reset |
| REVEAL | Print fails | REVEAL | Show "Print error" message, offer retry |
| REVEAL | User taps "Skip" / "Done" | RESET | Skip printing, go to reset |
| REVEAL | Inactivity timer (30s) | RESET | Auto-advance to reset |
| RESET | Cleanup complete | IDLE | Clear session data, release camera, return to welcome screen |
| RESET | Cleanup fails | IDLE | Force clear (log error), return to welcome screen |
| * (any) | Admin unlocks | ADMIN | Switch to admin dashboard route |

### Error Recovery Strategies

| Error Type | Detection | Recovery |
|-----------|-----------|----------|
| Camera disconnected | USB device monitor / capture exception | Show error on screen, return to IDLE, log for admin |
| AI provider unreachable | HTTP timeout / connection error | Retry up to 3 times, fall back to cached/offline response |
| Printer disconnected | USB device check before print | Offer screen-only result, log for admin |
| Payment webhook not received | Polling fallback (every 5s) | If poll confirms payment, proceed to CAPTURE |
| Session data corruption | Database query exception | Clear session, return to IDLE, log error |

---

## 4. Service Layer Architecture

The backend follows a strict layered architecture to separate concerns and maintain testability.

### Layer Diagram

```
+------------------------------------------------------------------+
|                        API LAYER (Routes)                        |
|                                                                  |
|  backend/app/api/v1/endpoints/                                   |
|  - kiosk.py        (session management, state machine control)   |
|  - camera.py       (MJPEG stream, device listing)                |
|  - ai.py           (image analysis trigger)                      |
|  - payment.py      (QRIS creation, webhook, status polling)      |
|  - print.py        (print test, status check)                    |
|  - admin.py        (auth, config, analytics, hardware tests)     |
+--------------------------------+---------------------------------+
                                 |
                                 | Dependency Injection (FastAPI Depends)
                                 |
+--------------------------------v---------------------------------+
|                      SERVICE LAYER (Business Logic)              |
|                                                                  |
|  backend/app/services/                                           |
|  - kiosk_service.py     (session lifecycle, state transitions)  |
|  - camera_service.py    (camera management, frame capture)       |
|  - ai_service.py        (AI provider orchestration, retry logic) |
|  - payment_service.py   (payment creation, verification, status) |
|  - print_service.py     (print job assembly, printer management) |
|  - config_service.py    (configuration CRUD, validation)         |
|  - analytics_service.py (session aggregation, revenue reports)   |
+--------------------------------+---------------------------------+
                                 |
                                 | Direct instantiation / DI
                                 |
+----------------+---------------+---------------+------------------+
|                |                               |                  |
+-------v--------+               +--------------v--+     +---------v---------+
|   MODELS       |               |  EXTERNAL      |     |  UTILITIES        |
|   (ORM)        |               |  ADAPTERS      |     |  (Pure Functions) |
|                |               |                 |     |                   |
| models/        |               | ai/             |     | utils/            |
| - session.py   |               | - base.py       |     | - dithering.py    |
| - payment.py   |               | - openai.py     |     | - escpos.py       |
| - config.py    |               | - anthropic.py  |     | - image.py        |
| - device.py    |               | - google.py     |     | - validators.py   |
|                |               | - ollama.py     |     |                   |
|                |               |                 |     |                   |
|                |               | payment/        |     |                   |
|                |               | - base.py       |     |                   |
|                |               | - midtrans.py   |     |                   |
|                |               | - xendit.py     |     |                   |
|                |               |                 |     |                   |
|                |               | printer/        |     |                   |
|                |               | - escpos.py     |     |                   |
+----------------+               | - mock.py       |     +-------------------+
                                 +-----------------+
```

### Service Responsibilities

| Service | Primary Responsibility | External Dependencies |
|---------|----------------------|----------------------|
| `KioskService` | Create, update, and transition session states. Enforce valid state transitions. Clean up expired sessions. | PostgreSQL (Session model) |
| `CameraService` | Enumerate USB cameras, set active device, capture frames, generate MJPEG stream. | OpenCV, V4L2 |
| `AIService` | Accept image bytes, select active provider, send to AI API, parse response, handle retries and fallbacks. | AI providers (OpenAI, Anthropic, Google, Ollama) |
| `PaymentService` | Create QRIS payment, verify webhook signatures, update payment status, handle timeout/expiry. | Payment gateways (Midtrans, Xendit), PostgreSQL (Payment model) |
| `PrintService` | Assemble ESC/POS receipt (text + dithered image), manage printer connection, execute print jobs. | python-escpos, USB device |
| `ConfigService` | Read/write configuration categories, validate config values, apply config changes at runtime. | PostgreSQL (Config model) |
| `AnalyticsService` | Aggregate session data, calculate revenue totals, generate time-series reports. | PostgreSQL (Session, Payment models) |

### Orchestration Flow: Complete Kiosk Session

The following shows how services interact during a complete kiosk session:

```
1. KioskService.create_session()
   └── Inserts new Session record (state=IDLE) into PostgreSQL
   └── Returns session with unique ID

2. PaymentService.create_qris(session_id)
   └── Calls Midtrans API to create QRIS transaction
   └── Inserts Payment record (status=PENDING) into PostgreSQL
   └── Returns QR code URL

3. PaymentService.verify_webhook(payload, signature)
   └── Verifies webhook signature using server key
   └── Updates Payment record (status=PAID)
   └── Calls KioskService.transition(session_id, CAPTURE)

4. CameraService.capture_frame()
   └── Opens VideoCapture on active camera device
   └── Reads frame, resizes, compresses to JPEG
   └── Returns JPEG bytes

5. AIService.analyze_image(jpeg_bytes, prompt)
   └── Selects active provider (e.g., OpenAI)
   └── Sends HTTP POST with base64-encoded image
   └── Parses text response from JSON
   └── On failure: retries, then falls back to mock provider
   └── Returns analysis text

6. KioskService.transition(session_id, REVEAL)
   └── Updates Session record (state=REVEAL, analysis_text=...)
   └── Stores analysis text and image reference

7. PrintService.print_receipt(session_id)
   └── Loads session data from KioskService
   └── Formats text (header, analysis, footer)
   └── Loads captured image, applies dithering
   └── Assembles ESC/POS byte stream
   └── Sends to printer via python-escpos
   └── Calls KioskService.transition(session_id, RESET)

8. KioskService.reset_session(session_id)
   └── Updates Session record (state=IDLE)
   └── Removes temporary image files
   └── Releases camera if held
   └── Returns to IDLE state
```

### Dependency Injection Pattern

FastAPI's `Depends()` mechanism is used to inject services into route handlers:

```python
# backend/app/api/v1/endpoints/kiosk.py

from fastapi import APIRouter, Depends
from backend.app.services.kiosk_service import KioskService
from backend.app.services.camera_service import CameraService
from backend.app.services.ai_service import AIService
from backend.app.services.print_service import PrintService

router = APIRouter()

def get_kiosk_service() -> KioskService:
    return KioskService()

def get_camera_service() -> CameraService:
    return CameraService()

def get_ai_service() -> AIService:
    return AIService()

def get_print_service() -> PrintService:
    return PrintService()

@router.post("/session")
async def create_session(
    kiosk_service: KioskService = Depends(get_kiosk_service),
):
    session = await kiosk_service.create_session()
    return session
```

This pattern allows services to be easily mocked in tests by providing alternative dependency overrides.

---

## 5. Docker Process Architecture

### Container Layout

```
+-------------------------------------------------------------------+
|                     Docker Compose Network                        |
|                     (internal bridge: vibeprint-net)              |
|                                                                   |
|  +-----------------------------------------------------------+   |
|  |                    app CONTAINER                           |   |
|  |                                                           |   |
|  |  FastAPI (uvicorn) on port 8000                           |   |
|  |    - Serves React SPA static files via StaticFiles        |   |
|  |    - Exposes REST API at /api/v1/                        |   |
|  |    - Serves MJPEG camera stream at /api/v1/camera/stream |   |
|  |    - OpenAPI docs at /docs                               |   |
|  |                                                           |   |
|  |  USB Device Passthrough:                                  |   |
|  |    - /dev/bus/usb/XXX/YYY -> thermal printer              |   |
|  |    - /dev/video0 -> USB camera                            |   |
|  |                                                           |   |
|  |  Environment:                                             |   |
|  |    - DATABASE_URL=postgresql+asyncpg://...               |   |
|  |    - AI_PROVIDER=openai                                  |   |
|  |    - OPENAI_API_KEY=sk-...                               |   |
|  |    - PAYMENT_ENABLED=false                               |   |
|  |    - PRINTER_VENDOR_ID=0x04b8                            |   |
|  |    - PRINTER_PRODUCT_ID=0x0202                           |   |
|  |    - CAMERA_DEVICE_INDEX=0                               |   |
|  |    - ADMIN_PIN=1234                                      |   |
|  |    - APP_SECRET_KEY=<random>                             |   |
|  |                                                           |   |
|  |  Ports:                                                   |   |
|  |    - 8000:8000 (HTTP, bound to 127.0.0.1 only)           |   |
|  |                                                           |   |
|  |  Volumes:                                                 |   |
|  |    - ./backend:/app (dev only, for HMR and hot reload)   |   |
|  |    - printer_data:/tmp/printer (temp print files)        |   |
|  |                                                           |   |
|  +-----------------------------------------------------------+   |
|                              |                                   |
|                              | TCP :5432                         |
|                              |                                   |
|  +-----------------------------------------------------------+   |
|  |                   postgres CONTAINER                       |   |
|  |                                                           |   |
|  |  PostgreSQL 16 on port 5432 (internal only)               |   |
|  |                                                           |   |
|  |  Environment:                                             |   |
|  |    - POSTGRES_DB=vibeprint                               |   |
|  |    - POSTGRES_USER=vibeprint                             |   |
|  |    - POSTGRES_PASSWORD=<from .env>                       |   |
|  |                                                           |   |
|  |  Volumes:                                                 |   |
|  |    - postgres_data:/var/lib/postgresql/data               |   |
|  |                                                           |   |
|  |  Healthcheck:                                             |   |
|  |    - pg_isready -U vibeprint (every 5s, 3 retries)       |   |
|  |                                                           |   |
|  +-----------------------------------------------------------+   |
|                                                                   |
+-------------------------------------------------------------------+

Host Machine:
  - Chromium launched by scripts/start-kiosk.sh (not in Docker)
  - Chromium connects to http://localhost:8000
  - USB devices physically connected, passed into app container
```

### Network Configuration

- **Internal Docker network**: `vibeprint-net` (bridge driver). Only the `app` and `postgres` containers are on this network. PostgreSQL port 5432 is not exposed to the host, preventing direct database access from outside the container.
- **Host binding**: The `app` container binds port 8000 to `127.0.0.1:8000`, making the application accessible only from the host machine. This is intentional for kiosk deployments where the application should not be reachable from the network.
- **Payment webhooks**: When payment is enabled, the host must expose port 8000 to the public internet (via reverse proxy or ngrok) so that payment gateway webhooks can reach the backend.

### USB Device Passthrough

USB devices are passed through to the `app` container using Docker Compose's `devices` configuration:

```yaml
# docker-compose.yml
services:
  app:
    devices:
      # Thermal printer (identified by USB device path)
      - /dev/bus/usb/001/004:/dev/bus/usb/001/004
      # Camera (video device)
      - /dev/video0:/dev/video0
```

The specific USB device paths are determined by the host system's USB bus topology and may change when devices are unplugged and reconnected. For production deployments, udev rules should be used to create stable symlinks:

```
# /etc/udev/rules.d/99-thermavibe.rules
# Thermal printer (Epson TM-T20X)
SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", ATTR{idProduct}=="0202", SYMLINK+="thermavibe-printer"
# Camera
SUBSYSTEM=="video4linux", ATTR{name}=="*camera*", SYMLINK+="thermavibe-camera"
```

With stable symlinks, the Docker Compose configuration references `/dev/thermavibe-printer` and `/dev/thermavibe-camera` instead of volatile bus paths.

### Host Processes

The following processes run on the host machine outside of Docker:

| Process | Purpose | Managed By |
|---------|---------|------------|
| **Docker Engine** | Runs containers | systemd (docker.service) |
| **Docker Compose** | Manages multi-container stack | Manual / systemd (docker-compose@vibeprint.service) |
| **Chromium** | Kiosk browser | scripts/start-kiosk.sh (launched by systemd user service) |
| **udev** | USB device rule management | systemd (systemd-udevd) |

### Volume Strategy

| Volume | Host Path | Container Path | Purpose |
|--------|-----------|---------------|---------|
| `postgres_data` | Docker managed | `/var/lib/postgresql/data` | Persistent database storage |
| `printer_data` | Docker managed | `/tmp/printer` | Temporary print job files (auto-cleaned) |
| Backend source (dev) | `./backend` | `/app` | Development hot reload |
| Frontend build (prod) | Built into image | `/app/static` | Production static files |
