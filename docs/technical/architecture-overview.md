# VibePrint OS -- Architecture Overview

> This document provides a comprehensive architectural description of the VibePrint OS system, including component diagrams, data flows, state machines, service layer organization, and deployment topology.

---

## Table of Contents

1. [System Diagram](#1-system-diagram)
2. [Data Flow Diagram](#2-data-flow-diagram)
3. [Kiosk State Machine](#3-kiosk-state-machine)
4. [Service Layer Architecture](#4-service-layer-architecture)
5. [Docker Process Architecture](#5-docker-process-architecture)
6. [Multi-Kiosk Architecture (Future)](multi-kiosk-architecture.md)

> **Note:** VibePrint OS currently operates as a single-kiosk system. For the planned
> multi-room / multi-kiosk architecture, see [multi-kiosk-architecture.md](multi-kiosk-architecture.md).

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
|                          | - Access   |  | Google |  |        | |  |
|                          |   Codes    |  |        |  |        | |  |
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
| **PostgreSQL** | PostgreSQL 16 | Persistent storage for sessions, configurations, payments, access codes, and analytics |
| **AI Provider** | OpenAI / Anthropic / Google / Ollama | Receives captured images and returns AI-generated text analysis |
| **Payment Gateway** | Midtrans / Xendit | Processes QRIS payments via QR code generation and webhook callbacks |
| **Thermal Printer** | USB / ESC/POS | Prints receipts with AI results and optional photo thumbnail |
| **USB Camera** | V4L2 / OpenCV | Captures photos and provides live MJPEG preview stream |
| **Admin Dashboard** | React 19 (same app, /admin route) | Operator interface for configuration, monitoring, analytics, gallery, and hardware testing |

### Communication Protocols

| Connection | Protocol | Direction | Notes |
|-----------|----------|-----------|-------|
| Kiosk UI to Backend | HTTP/REST | Request/Response | JSON payloads, served from localhost:8000 |
| Backend to PostgreSQL | TCP (postgresql wire protocol) | Bidirectional | Connection pooled via SQLAlchemy |
| Backend to AI Provider | HTTPS | Request/Response | Async HTTP via httpx, timeout configurable |
| Backend to Payment Gateway | HTTPS | Request/Response + Webhook | Payment creation outbound, status callback inbound |
| Backend to Thermal Printer | USB (bulk transfer) | Outbound only | ESC/POS binary protocol via python-escpos. Auto-detected on startup via pyusb enumeration (three-tier: USB class, known vendor IDs, keyword matching). Hot-plug scanner runs every 30 seconds. |
| Backend to Camera | V4L2 (USB) | Inbound only | OpenCV captures frames, MJPEG stream served over HTTP. Auto-selects first available camera if configured index is unavailable. |
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

The kiosk supports two features: **Vibe Check** (single photo + AI reading) and **Photobooth** (multi-photo strip with themes). After the payment step (if enabled), users choose a feature. Each feature has its own state flow, but both share common states for idle, payment, and reset.

### Feature Selection

After payment confirmation (or when payment is disabled), the kiosk enters a feature selection screen. If only one feature is enabled, it is selected automatically. The admin can ensure at least one feature remains enabled — the system prevents disabling both.

> **Note: Payment mode and access code mode are mutually exclusive.** When `access_code_mode_enabled` is set to `true` in the `access_code` configuration category, the system automatically disables payment mode. The admin endpoint enforces this: enabling access code mode sets `payment_enabled` to `false`, and vice versa. This ensures a clear entry path: the kiosk transitions to either `PAYMENT` or `ACCESS_CODE`, never both.

### Vibe Check Flow

```
+-------+    payment     +----------+    feature     +---------+
|       |    enabled &   |          |    select      |         |
| IDLE  |--------------> | PAYMENT  | -------------> | CAPTURE |
|       |    user taps   |          |    vibe_check  |         |
|       |    "Start"     |          |                |         |
+---+---+                +----+-----+                +----+----+
    |                          |                           |
    |  payment disabled        |  timeout (15 min)          |  capture
    |  or user skips           |  (auto-cancel)            |  success
    |                          v                           |
    |                     [return to IDLE]                 |
    |                                                      |
    |    access_code      +--------------+                 |
    +-------------------> |              |                 |
    |  mode enabled       | ACCESS_CODE  |                 |
    |                     | - Enter code |                 |
    |                     +------+-------+                 |
    |                            |                         |
    |                            |  valid code             |
    |                            v                         |
    |                     +---------+                      |
    |                     | CAPTURE | <--------------------+
    |                     +----+----+
    |                            |
    |                            |  capture
    |                            |  success
    |                            v
    |                      +----------+
    +--------------------- |          |
                           | PROCESS  |  AI response
                           | ING      |  received
                           +----+-----+
                                |
                                |  analysis complete
                                v
                           +----------+
                           | REVEAL   |
                           | - Show   |
                           |   result |
                           | - Print  |
                           |   btn    |
                           +----+-----+
                                |
                                v
                           +----------+
                           | RESET    |
                           | - Clear  |
                           |   session|
                           +----+-----+
                                |
                                v
                           [return to IDLE]
```

### Photobooth Flow

```
+-------+    payment     +----------+    feature     +---------+
|       |    enabled &   |          |    select      |         |
| IDLE  |--------------> | PAYMENT  | -------------> | CAPTURE |
|       |    user taps   |          |    photobooth  |  (multi |
|       |    "Start"     |          |                |  photos)|
+---+---+                +----+-----+                +----+----+
    |                                                      |
    |  payment disabled                                    |  capture
    |  (auto-select if                                     |  complete
    |   only photobooth)                                   v
    |                                                 +----------+
    |    access_code      +--------------+             | REVIEW   |
    +-------------------> |              |             | - Browse |
    |  mode enabled       | ACCESS_CODE  |   +-------> |   photos |
    |                     | - Enter code |   |         | - Retake |
    |                     +------+-------+   |         |   or Done|
    |                            |           |         +----+-----+
    |                            |  valid    |              |
    |                            |  code     |              |
    |                            v           |              |
    |                     +---------+        |              |
    |                     | CAPTURE | <------+--------------+
    |                     +----+----+
    |                            |
    +----------------------------+
```

The post-REVIEW states (FRAME_SELECT through RESET) follow the same path as the non-access-code flow:

```
REVIEW
  |  user done
  v
FRAME_SELECT
  |  theme chosen
  v
ARRANGE
  |  arrangement confirmed
  v
COMPOSITING
  |  strip generated
  v
PHOTOBOOTH_REVEAL
  |  print / share / timeout
  v
RESET
  |
  v
[return to IDLE]
```

### Complete State Transition Table

| Current State | Event | Next State | Action |
|--------------|-------|------------|--------|
| IDLE | User taps "Start" (payment disabled, access code disabled) | FEATURE_SELECT or CAPTURE | Show feature selection or go directly if only one enabled |
| IDLE | User taps "Start" (payment enabled) | PAYMENT | Generate QRIS QR code, display to user |
| IDLE | User taps "Start" (access code mode enabled) | ACCESS_CODE | Show access code entry screen |
| ACCESS_CODE | User enters valid code | CAPTURE | Validate and redeem code, proceed to capture |
| ACCESS_CODE | User enters invalid code | ACCESS_CODE | Show error message, remain on entry screen |
| ACCESS_CODE | Timeout / user backs out | RESET | Clear session, return to idle |
| PAYMENT | Payment confirmed (webhook) | FEATURE_SELECT or CAPTURE | Stop QR display, show feature selection or start capture |
| PAYMENT | Payment timeout (15 min) | IDLE | Clear payment session, show "Session expired" |
| PAYMENT | User cancels | IDLE | Clear payment session |
| FEATURE_SELECT | User selects Vibe Check | CAPTURE | Start camera preview, begin countdown |
| FEATURE_SELECT | User selects Photobooth | CAPTURE | Start camera preview, begin countdown |
| CAPTURE | Countdown reaches 0 | CAPTURE | Capture frame from camera |
| CAPTURE | Capture successful (Vibe Check) | PROCESSING | Send image to AI provider, show loading animation |
| CAPTURE | Capture successful (Photobooth, more photos needed) | CAPTURE | Store photo, continue capture cycle |
| CAPTURE | Capture successful (Photobooth, min photos met) | REVIEW | Show captured photos for review |
| CAPTURE | Capture fails (3 retries) | IDLE | Show error message, "Please try again" |
| CAPTURE | Camera not available | IDLE | Show error message, log hardware fault |
| REVIEW | User taps "Retake" | CAPTURE | Delete last photo, restart capture |
| REVIEW | User taps "Done" | FRAME_SELECT | Proceed to theme selection |
| FRAME_SELECT | User selects theme | ARRANGE | Apply theme, show photo arrangement |
| ARRANGE | User confirms arrangement | COMPOSITING | Generate composite strip image |
| COMPOSITING | Composite generated | PHOTOBOOTH_REVEAL | Display final strip |
| PROCESSING | AI response received | REVEAL | Display result text, enable print/share buttons |
| PROCESSING | AI timeout (30s total) | REVEAL | Show "Analysis took too long" with fallback text |
| PROCESSING | AI provider error | REVEAL | Show "Analysis unavailable" with fallback text |
| PROCESSING | Network error | PROCESSING | Retry with exponential backoff (up to 3 attempts) |
| REVEAL | User taps "Print" | RESET | Send print job to printer, then reset |
| REVEAL | Print fails | REVEAL | Show "Print error" message, offer retry |
| REVEAL | User taps "Skip" / "Done" | RESET | Skip printing, go to reset |
| REVEAL | Inactivity timer (30s) | RESET | Auto-advance to reset |
| PHOTOBOOTH_REVEAL | User taps "Print" | RESET | Send strip to printer |
| PHOTOBOOTH_REVEAL | User taps "Share" | RESET | Generate share QR code |
| PHOTOBOOTH_REVEAL | Inactivity timer (30s) | RESET | Auto-advance to reset |
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
|  - printer.py      (USB discovery, print test, status check)      |
|  - admin.py        (auth, config, analytics, hardware tests,     |
|                      access code management)                     |
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
|  - analytics_service.py (session aggregation, revenue reports, feature breakdown) |
|  - retention_service.py (automated cleanup of expired files and sessions) |
|  - theme_service.py     (photobooth theme CRUD, enable/disable)  |
|  - access_code_service.py (access code generation, validation, redemption, CRUD) |
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
| - access_code  |               | - ollama.py     |     |                   |
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
| `CameraService` | Enumerate USB cameras, set active device, capture frames, generate MJPEG stream. On startup, auto-selects the first available camera if the configured device index is unavailable. | OpenCV, V4L2 |
| `AIService` | Accept image bytes, select active provider, send to AI API, parse response, handle retries and fallbacks. | AI providers (OpenAI, Anthropic, Google, Ollama) |
| `PaymentService` | Create QRIS payment, verify webhook signatures, update payment status, handle timeout/expiry. | Payment gateways (Midtrans, Xendit), PostgreSQL (Payment model) |
| `PrintService` | Assemble ESC/POS receipt (text + dithered image), manage printer connection, execute print jobs. On startup, auto-detects thermal printers via pyusb enumeration using a three-tier strategy: (1) USB printer class matching, (2) known ESC/POS vendor IDs, (3) keyword matching on device descriptions. Runs a background hot-plug scanner at 30-second intervals to detect newly connected printers and auto-reconnects after printer disconnect. | python-escpos, pyusb, USB device |
| `ConfigService` | Read/write configuration categories (hardware, ai, payment, kiosk, general, photobooth, vibe_check, access_code), validate config values, apply config changes at runtime. | PostgreSQL (Config model) |
| `AnalyticsService` | Aggregate session data, calculate revenue totals across all entry methods (confirmed payments AND access-code redemptions with price), generate time-series reports, per-feature breakdown (Vibe Check vs Photobooth). | PostgreSQL (Session, Payment, AccessCode models) |
| `AccessCodeService` | Generate, validate, redeem, and manage access codes. Codes grant feature access (vibe_check, photobooth, or universal) as an alternative to payment. Supports batch generation, expiration, usage limits, optional pricing per code, and revocation. On redemption, the code's price is copied to the session for revenue tracking. | PostgreSQL (AccessCode model) |
| `RetentionService` | Purge expired session files and data based on configurable retention periods. Runs as a background task on app startup. | PostgreSQL (Config, Session models), filesystem |

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
|  |    - /dev/bus/usb (broad access) -> printer auto-detect  |   |
|  |    - /dev/video* (auto-detected) -> USB cameras           |   |
|  |                                                           |   |
|  |  Environment:                                             |   |
|  |    - DATABASE_URL=postgresql+asyncpg://...               |   |
|  |    - AI_PROVIDER=openai                                  |   |
|  |    - OPENAI_API_KEY=sk-...                               |   |
|  |    - PAYMENT_ENABLED=false                               |   |
|  |    - PRINTER_VENDOR_ID=0x04b8  (optional, auto-detect)   |   |
|  |    - PRINTER_PRODUCT_ID=0x0202 (optional, auto-detect)   |   |
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

USB devices are passed through to the `app` container using Docker Compose's `devices` configuration. Both camera and printer devices are automatically detected by the startup script:

```yaml
# docker-compose.yml (base — no hardcoded device paths)
services:
  app:
    devices: []
    # All devices are added dynamically by scripts/start-docker.sh

# The startup script generates .docker-compose.devices.yml with detected devices:
services:
  app:
    devices:
      - /dev/bus/usb:/dev/bus/usb   # Broad USB bus access (for printer auto-detection)
      - /dev/video0:/dev/video0    # Auto-detected
      - /dev/video1:/dev/video1    # Additional cameras if present
    device_cgroup_rules:
      - 'c 81:* rwm'               # Video devices (for hot-plug)
      - 'c 189:* rwm'              # USB devices
```

Use `./scripts/start-docker.sh prod` or `make prod` to start. The script scans `/dev/video*` at startup and only maps devices that actually exist, avoiding the "no such file or directory" error that occurs with hardcoded paths after a device reconnection or reboot.

No manual VID/PID configuration is needed. The startup script installs a broad udev rule that grants access to all USB devices, and the backend auto-detects thermal printers via pyusb enumeration on startup. No per-device udev rules are required.

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
| `vibeprint_data` | Docker managed | `/tmp/vibeprint` | Persistent image storage (vibe check photos, photobooth composites, thumbnails) |
| Backend source (dev) | `./backend` | `/app` | Development hot reload |
| Frontend build (prod) | Built into image | `/app/static` | Production static files |
