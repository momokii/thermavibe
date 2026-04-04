# User Flows

> **Document ID:** PRD-04
> **Version:** 1.0
> **Status:** Approved
> **Last Updated:** 2026-04-04

This document describes all primary user flows for VibePrint OS, including the end-user kiosk interaction, operator setup, and error recovery paths. Each flow includes ASCII sequence diagrams, timing constraints, timeout behavior, and error handling.

---

## Table of Contents

1. [End-User Kiosk Flow](#1-end-user-kiosk-flow)
2. [Operator Setup Flow](#2-operator-setup-flow)
3. [Payment Failure Flow](#3-payment-failure-flow)
4. [AI Failure Flow](#4-ai-failure-flow)

---

## 1. End-User Kiosk Flow

The end-user flow describes the complete journey from a person approaching the kiosk to receiving a printed thermal receipt with their AI-generated vibe reading. This is the primary product flow and covers all six states of the VibePrint OS state machine.

### 1.1 State Overview

The kiosk operates as a finite state machine with six distinct states. Only specific transitions are valid between states.

```
                    +-------+
                    | IDLE  |<-----------------------------------+
                    +---+---+                                      |
                        |                                          |
                        | User touches screen                      |
                        v                                          |
                    +---+---+                                      |
                +---|PAYMENT|                                      |
                |   +---+---+                                      |
                |       |                                          |
                |       | Payment confirmed                        |
                |       | (or payment disabled)                    |
                |       v                                          |
                |   +---+-------+                                  |
                |   | CAPTURE   |                                  |
                |   +---+-------+                                  |
                |       |                                          |
                |       | Photo captured                           |
                |       v                                          |
                |   +---+----------+                               |
                |   | PROCESSING  |                               |
                |   +---+----------+                               |
                |       |                                          |
                |       | AI response received                     |
                |       v                                          |
                |   +---+-------+                                  |
                |   | REVEAL/   |                                  |
                |   | PRINT     |                                  |
                |   +---+-------+                                  |
                |       |                                          |
                |       | Print complete / Reset timeout           |
                |       v                                          |
                |   +---+---+                                      |
                +-->| RESET |                                      |
                    +---+---+                                      |
                        |                                          |
                        +------------------------------------------+

    * If payment is disabled: IDLE -> CAPTURE -> PROCESSING -> REVEAL/PRINT -> RESET -> IDLE
    * If payment is enabled: IDLE -> PAYMENT -> CAPTURE -> PROCESSING -> REVEAL/PRINT -> RESET -> IDLE
```

### 1.2 State Timing and Timeout Values

| State        | Timeout  | Timeout Behavior                                    |
|--------------|----------|-----------------------------------------------------|
| IDLE         | None     | Runs attract loop indefinitely until user interaction |
| PAYMENT      | 120s     | Returns to IDLE, session discarded                  |
| CAPTURE      | 30s      | Returns to IDLE, session discarded                  |
| PROCESSING   | 45s      | Falls back to template response, continues to REVEAL |
| REVEAL/PRINT | 15s      | Automatically transitions to RESET                  |
| RESET        | 5s       | Forced transition to IDLE (non-blocking cleanup)    |

### 1.3 End-User Kiosk Flow Sequence Diagram

```
User               KioskScreen          BackendAPI           Camera          Printer        AIProvider        PaymentGateway
 |                     |                     |                   |               |              |                   |
 | [Approaches kiosk]  |                     |                   |               |              |                   |
 |                     | [Attract loop:      |                   |               |              |                   |
 |                     |  animated graphics, |                   |               |              |                   |
 |                     |  "Touch to Start"]  |                   |               |              |                   |
 |                     |                     |                   |               |              |                   |
 |====================>|                     |                   |               |              |                   |
 | Touches screen      |                     |                   |               |              |                   |
 |                     |                     |                   |               |              |                   |
 |                     |-- POST /session --->|                   |               |              |                   |
 |                     |   start             |                   |               |              |                   |
 |                     |                     |                   |               |              |                   |
 |                     |<-- session_id ------|                   |               |              |                   |
 |                     |   state=payment     |                   |               |              |                   |
 |                     |   (if enabled)      |                   |               |              |                   |
 |                     |                     |                   |               |              |                   |
 |                     |                     |                   |               |              |                   |
 |  [If payment is ENABLED]                  |                   |               |              |                   |
 |                     |                     |                   |               |              |                   |
 |                     |-- POST /payment --->|                   |               |              |                   |
 |                     |   initiate          |                   |               |              |                   |
 |                     |                     |-- create QRIS -->|              |              |                   |
 |                     |                     |   order           |              |              |                   |
 |                     |                     |                   |              |              |   PaymentGateway    |
 |                     |                     |                   |              |              |   (Midtrans/Xendit)|
 |                     |                     |<-- qr_url --------|              |              |                   |
 |                     |<-- qr_url ----------|                   |              |              |                   |
 |                     |   expires_in=120s   |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | [Displays QR code   |                   |              |              |                   |
 |                     |  with amount and    |                   |              |              |                   |
 |                     |  "Scan to Pay"      |                   |              |              |                   |
 |                     |  timer countdown]   |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 | [Opens phone,       |                     |                   |              |              |                   |
 |  scans QR code,     |                     |                   |              |              |                   |
 |  completes payment] |                     |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |                   |              |   webhook:   |                   |
 |                     |                     |<-- payment_ok ----|--------------|--------------|                   |
 |                     |                     |   callback        |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |<-- state=capture ---|                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |  [PAYMENT DISABLED:                     ]|                   |              |              |                   |
 |  [Skips directly to CAPTURE             ]|                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |====================>|                   |              |              |                   |
 |                     | CAPTURE STATE       |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |-- GET /camera ----->|                   |              |              |                   |
 |                     |   stream            |                   |              |              |                   |
 |                     |                     |-- open stream --->|              |              |                   |
 |                     |                     |   MJPEG           |              |              |                   |
 |                     |<-- MJPEG stream ----|<-- frames --------|              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | [Displays live      |                   |              |              |                   |
 |                     |  camera preview]    |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | [3-2-1 countdown    |                   |              |              |                   |
 |                     |  overlay on video]  |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |-- POST /capture --->|                   |              |              |                   |
 |                     |                     |-- capture_frame ->|              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |<-- JPEG bytes ----|              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     | [Save to          |              |              |                   |
 |                     |                     |  /tmp/sessions/   |              |              |                   |
 |                     |                     |  {session_id}/    |              |              |                   |
 |                     |                     |  photo.jpg]       |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |<-- state=processing |                   |              |              |                   |
 |                     |   photo_saved=true  |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | PROCESSING STATE    |                   |              |              |                   |
 |                     | [Engaging loading   |                   |              |              |                   |
 |                     |  animation:         |                   |              |              |                   |
 |                     |  "Reading your      |                   |              |              |                   |
 |                     |  vibe..."           |                   |              |              |                   |
 |                     |  + spinner + fun    |                   |              |              |                   |
 |                     |  loading messages]  |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |-- POST /ai ------->|              |              |                   |
 |                     |                     |   analyze          |              |              |                   |
 |                     |                     |   image=JPEG      |              |              |                   |
 |                     |                     |   prompt=system   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |                   |              |   Analyze    |                   |
 |                     |                     |                   |              |   image +    |                   |
 |                     |                     |                   |              |   generate   |                   |
 |                     |                     |                   |              |   vibe text  |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |<-- vibe_text -----|--------------|--------------|                   |
 |                     |                     |   provider=gpt4o   |              |              |                   |
 |                     |                     |   tokens=xxx       |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     | [Store ai_response|              |              |                   |
 |                     |                     |  in session]      |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |<-- state=reveal ----|                   |              |              |                   |
 |                     |   vibe_text=...     |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | REVEAL/PRINT STATE  |                   |              |              |                   |
 |                     | [Shows full photo   |                   |              |              |                   |
 |                     |  + AI vibe text     |                   |              |              |                   |
 |                     |  on screen          |                   |              |              |                   |
 |                     |  "Your Vibe Reading"|                   |              |              |                   |
 |                     |  + receipt preview] |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |-- POST /print ----->|                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     | [Dither image:    |              |              |                   |
 |                     |                     |  color -> gray -> |              |              |                   |
 |                     |                     |  Floyd-Steinberg  |              |              |                   |
 |                     |                     |  -> 1-bit bitmap] |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |-- ESC/POS cmds -->|              |              |                   |
 |                     |                     |   feed + image +  |              |              |                   |
 |                     |                     |   text + cut      |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     |<-- print_ok ------|--------------|              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | [Displays "Your     |                   |              |              |                   |
 |                     |  receipt is ready!" |                   |              |              |                   |
 |                     |  + paper tears off] |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | [15-second auto-    |                   |              |              |                   |
 |                     |  advance or user    |                   |              |              |                   |
 |                     |  touches to proceed]|                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |-- POST /session --->|                   |              |              |                   |
 |                     |   reset             |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | RESET STATE         |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     | [Delete session   |                   |              |                   |
 |                     |                     |  photo files from |                   |              |                   |
 |                     |                     |  /tmp/sessions/   |                   |              |                   |
 |                     |                     |  {session_id}/]   |                   |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |                     | [Mark session     |                   |              |                   |
 |                     |                     |  as cleared in DB]|                   |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     |<-- state=idle ------|                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
 |                     | [Returns to         |                   |              |              |                   |
 |                     |  attract loop]      |                   |              |              |                   |
 |                     |                     |                   |              |              |                   |
```

### 1.4 Idle State Detail

The Idle state is the default resting state of the kiosk. It displays an attract loop designed to draw in passersby.

**Behavior:**
- Full-screen animated display with the VibePrint OS branding
- Rotating visual content (abstract graphics, sample receipt previews, taglines)
- Prominent "Touch to Start" call-to-action
- Subtle ambient animation to indicate the screen is active and responsive
- Touching anywhere on the screen transitions to Payment (if enabled) or Capture

**Timeout:** None. The attract loop runs indefinitely until interrupted by user input.

**Technical notes:**
- The attract loop is implemented as a React component with CSS animations, not video playback, to minimize resource usage
- The idle screen listens for a single touch event anywhere on the viewport
- No session data is created until the user touches the screen

### 1.5 Payment State Detail

The Payment state is only active when payment is enabled in operator configuration. When payment is disabled, this state is skipped entirely and the flow proceeds directly to Capture.

**Behavior:**
- A QRIS QR code is generated by the configured payment provider (Midtrans, Xendit, or Mock)
- The QR code is displayed prominently with the payment amount in Indonesian Rupiah
- A visible countdown timer shows the remaining time (120 seconds)
- The screen displays instructions: "Scan with your mobile banking app or e-wallet"
- Beneath the QR code, accepted payment methods are listed (GoPay, OVO, DANA, bank apps, etc.)

**Timeout:** 120 seconds from QR code generation
- On timeout: session is discarded, screen returns to IDLE, no charge is incurred
- The backend polls the payment provider every 3 seconds or listens for a webhook callback

**Error paths:**
- QR code generation fails: Display error message "Payment system unavailable, please try again", return to IDLE after 5 seconds
- Payment webhook not received: Polling fallback checks every 3 seconds; after 120s, assume no payment

### 1.6 Capture State Detail

The Capture state handles the live camera preview and photo capture with a countdown.

**Behavior:**
1. Camera stream opens and displays a live video preview on the full screen
2. A semi-transparent overlay shows "Get Ready!" for 1 second
3. A 3-2-1 countdown is displayed with visual emphasis (large numbers, color changes)
4. At "1", a flash effect simulates a camera flash (screen goes white briefly)
5. The frame is captured and stored as a JPEG
6. A brief confirmation screen shows "Got it!" for 1 second
7. Automatically transitions to Processing

**Timeout:** 30 seconds total
- If the camera cannot be opened within 5 seconds, display "Camera Error" and return to IDLE
- The user cannot cancel during the countdown once it starts (3-second window)
- Before the countdown starts (during preview), the user can wait indefinitely; the 30s timeout applies to the overall capture state

**Error paths:**
- Camera not detected: Display "Camera not available" message, return to IDLE after 3 seconds
- Camera permissions error: Same as above
- Capture frame is corrupted/black: Retry once; if still corrupted, return to IDLE with error message

### 1.7 Processing State Detail

The Processing state sends the captured photo to the configured AI provider and waits for the vibe reading response. This is the state with the longest variable duration.

**Behavior:**
- An engaging loading screen is displayed to keep the user entertained
- The loading screen includes:
  - An animated "Reading your vibe..." headline
  - A visual processing indicator (e.g., scanning animation over a silhouette)
  - Rotating fun messages: "Analyzing your aura...", "Consulting the vibe oracle...", "Decoding your energy...", "Almost there..."
- The screen updates every 2-3 seconds with a new loading message

**Timeout:** 45 seconds
- On timeout: the system falls back to a pre-written template response (see Section 4: AI Failure Flow)
- The user never sees an explicit error message; they always receive a result

**Error paths:**
- AI provider returns HTTP 429 (rate limited): Immediately switch to fallback template
- AI provider returns HTTP 5xx: Retry once after 5 seconds; if still failing, use fallback template
- AI provider returns HTTP 401/403 (auth error): Log critical error, use fallback template, alert operator via admin dashboard
- Network unreachable: Use fallback template after 10 seconds

### 1.8 Reveal/Print State Detail

The Reveal/Print state displays the final result and prints the physical receipt.

**Behavior:**
1. The captured photo is displayed alongside the AI-generated vibe text
2. A receipt preview is shown (simulated thermal receipt layout)
3. The printer receives ESC/POS commands and begins printing
4. The screen displays "Your receipt is printing..."
5. Once printing is confirmed complete, the screen shows "Tear off your receipt! Enjoy your vibe."
6. After 15 seconds (or user touch), transitions to Reset

**Timeout:** 15 seconds for the display. Printing has its own timeout handled internally.

**Error paths:**
- Printer not connected: Display result on screen without printing. Show message "Your vibe: [text]" (the user still sees their reading but gets no physical receipt)
- Printer out of paper: Session marked as partially complete. Operator is alerted. User sees the on-screen result.
- Print job stuck: Cancel after 30 seconds, show on-screen result, alert operator

### 1.9 Reset State Detail

The Reset state handles cleanup of all session data and prepares the kiosk for the next user.

**Behavior:**
- All temporary files for the session (photo JPEG, dithered bitmap, etc.) are deleted from disk
- The session record in the database is updated with `cleared_at` timestamp
- Camera stream is fully released
- Any in-memory session state is cleared
- The screen displays a brief "Thank you!" or transitions directly to the attract loop

**Timeout:** 5 seconds maximum (non-blocking)
- Cleanup runs asynchronously; the kiosk transitions to IDLE even if cleanup is still in progress
- If cleanup fails (file deletion error), the error is logged but does not block the IDLE transition
- A background cleanup task handles any residual files

---

## 2. Operator Setup Flow

The operator setup flow describes the first-time configuration experience for a kiosk operator. This includes hardware connection, software startup, AI configuration, payment setup, testing, and going live.

### 2.1 Prerequisites

Before starting the setup flow, the operator must have:
- A machine running Linux (Ubuntu 22.04 LTS or Debian 12 recommended)
- Docker Engine and Docker Compose installed
- A USB thermal receipt printer (58mm or 80mm, ESC/POS compatible)
- A USB webcam (UVC compatible)
- Internet access (for AI API calls and payment gateway; optional for offline/local AI)
- API keys for at least one AI provider
- (Optional) A Midtrans or Xendit merchant account with API keys

### 2.2 Operator Setup Sequence Diagram

```
Operator              KioskScreen           BackendAPI          AdminDashboard       Camera       Printer      AIProvider   PaymentGW
  |                      |                     |                     |                  |             |            |             |
  | [Physically connects |                     |                     |                  |             |            |             |
  |  USB camera and      |                     |                     |                  |             |            |             |
  |  USB printer]        |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  | [Runs docker compose |                     |                     |                  |             |            |             |
  |  up -d]              |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Startup screen:    |                     |                  |             |            |             |
  |                      |  "VibePrint OS"     |                     |                  |             |            |             |
  |                      |  "First-time setup  |                     |                  |             |            |             |
  |                      |   required"         |                     |                  |             |            |             |
  |                      |  "Enter admin PIN   |                     |                  |             |            |             |
  |                      |   to continue"]     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Enters default PIN   |                     |                     |                  |             |            |             |
  | (0000 on first run)  |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- POST /admin/ --->|                     |                  |             |            |             |
  |                      |   auth              |                     |                  |             |            |             |
  |                      |   pin=0000          |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |<-- admin_token -----|                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Setup Wizard       |                     |                  |             |            |             |
  |                      |  Step 1: Hardware   |                     |                  |             |            |             |
  |                      |  Detection]         |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- GET /admin/ ---->|                     |                  |             |            |             |
  |                      |   hardware/detect   |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |                     |-- detect USB ----->|                  |             |            |             |
  |                      |                     |   devices           |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |                     |<-- camera:          |                  |             |            |             |
  |                      |                     |   /dev/video0       |                  |             |            |             |
  |                      |                     |   printer:          |                  |             |            |             |
  |                      |                     |   usb:04b8:0202     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |<-- devices found ---|                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Shows: Camera:     |                     |                  |             |            |             |
  |                      |  Detected (/dev/    |                     |                  |             |            |             |
  |                      |  video0)            |                     |                  |             |            |             |
  |                      |  Printer: Detected  |                     |                  |             |            |             |
  |                      |  (USB thermal)]     |                     |                  |             |            |             |
  |                      |  [Continue] button  |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  | [If camera not       |                     |                     |                  |             |            |             |
  |  detected: "Please  |                     |                     |                  |             |            |             |
  |  connect a USB       |                     |                     |                  |             |            |             |
  |  camera and retry"]  |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Taps [Continue]      |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Setup Wizard       |                     |                  |             |            |             |
  |                      |  Step 2: AI         |                     |                  |             |            |             |
  |                      |  Provider Config]   |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Dropdown:          |                     |                  |             |            |             |
  |                      |  - OpenAI           |                     |                  |             |            |             |
  |                      |  - Anthropic        |                     |                  |             |            |             |
  |                      |  - Google Gemini    |                     |                  |             |            |             |
  |                      |  - Ollama (local)   |                     |                  |             |            |             |
  |                      |  API Key field      |                     |                  |             |            |             |
  |                      |  Model field        |                     |                  |             |            |             |
  |                      |  [Test Connection]  |                     |                  |             |            |             |
  |                      |  [Save] button]     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  | Selects "OpenAI",    |                     |                     |                  |             |            |             |
  | enters API key,      |                     |                     |                  |             |            |             |
  | selects model        |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Taps [Test]          |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- POST /admin/ ---->|                     |                  |             |            |             |
  |                      |   ai/test           |                     |                  |             |            |             |
  |                      |   provider=openai   |                     |                  |             |            |             |
  |                      |   api_key=sk-...    |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |                     |-- test call ------->|--------------|-------------|            |             |
  |                      |                     |   sample image      |             |            |             |
  |                      |                     |   + prompt          |             |            |             |
  |                      |                     |                     |             |            |             |
  |                      |                     |<-- 200 OK ---------|--------------|-------------|            |             |
  |                      |                     |   response="Your    |             |            |             |
  |                      |                     |   test vibe is..."  |             |            |             |
  |                      |                     |                     |             |            |             |
  |                      | [Green checkmark:   |                     |                  |             |            |             |
  |                      |  "Connection         |                     |                  |             |            |             |
  |                      |  successful!"]      |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Taps [Save]          |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- PUT /admin/ ----->|                     |                  |             |            |             |
  |                      |   config            |                     |                  |             |            |             |
  |                      |   ai.provider=openai|                     |                  |             |            |             |
  |                      |   ai.api_key=sk-... |                     |                  |             |            |             |
  |                      |   ai.model=gpt-4o   |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |<-- 200 OK ----------|                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Setup Wizard       |                     |                  |             |            |             |
  |                      |  Step 3: Payment    |                     |                  |             |            |             |
  |                      |  Configuration      |                     |                  |             |            |             |
  |                      |  (Optional)]        |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Toggle: Enable     |                     |                  |             |            |             |
  |                      |  Payment: ON/OFF    |                     |                  |             |            |             |
  |                      |  Provider dropdown  |                     |                  |             |            |             |
  |                      |  Amount field (Rp)  |                     |                  |             |            |             |
  |                      |  Server Key field   |                     |                  |             |            |             |
  |                      |  Sandbox toggle     |                     |                  |             |            |             |
  |                      |  [Test] [Save]      |                     |                  |             |            |             |
  |                      |  [Skip for now]]    |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  | Selects "Skip"       |                     |                     |                  |             |            |             |
  | (or configures       |                     |                     |                  |             |            |             |
  |  payment details)    |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Setup Wizard       |                     |                  |             |            |             |
  |                      |  Step 4: Test Print]|                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Taps [Print Test]    |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- POST /admin/ ---->|                     |                  |             |            |             |
  |                      |   printer/test      |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |                     |-- ESC/POS test ---->|-------------|            |             |
  |                      |                     |   pattern + text    |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |                     |<-- print success ---|-------------|            |             |
  |                      |                     |                     |                  |             |            |             |
  | [Physical test       |                     |                     |                  |             |            |             |
  |  receipt prints      |                     |                     |                  |             |            |             |
  |  from printer]       |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Confirms print looks |                     |                     |                  |             |            |             |
  | correct              |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Setup Wizard       |                     |                  |             |            |             |
  |                      |  Step 5: Set Admin  |                     |                  |             |            |             |
  |                      |  PIN]               |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Enter new PIN (4-8 |                     |                  |             |            |             |
  |                      |  digits)             |                     |                  |             |            |             |
  |                      |  Confirm new PIN     |                     |                  |             |            |             |
  |                      |  [Set PIN] button]  |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  | Enters new PIN       |                     |                     |                  |             |            |             |
  | (e.g., 1234) and     |                     |                     |                  |             |            |             |
  | confirms             |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- PUT /admin/ ----->|                     |                  |             |            |             |
  |                      |   pin               |                     |                  |             |            |             |
  |                      |   pin=1234          |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |<-- 200 OK ----------|                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Setup Wizard       |                     |                  |             |            |             |
  |                      |  Complete!          |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |  "Your VibePrint OS |                     |                  |             |            |             |
  |                      |   kiosk is ready!"  |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |  Summary:           |                     |                  |             |            |             |
  |                      |  - Camera: OK       |                     |                  |             |            |             |
  |                      |  - Printer: OK      |                     |                  |             |            |             |
  |                      |  - AI: OpenAI       |                     |                  |             |            |             |
  |                      |  - Payment: Disabled |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |  [Go Live!] button  |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |=====================>|                     |                     |                  |             |            |             |
  | Taps [Go Live!]      |                     |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |-- POST /admin/ ---->|                     |                  |             |            |             |
  |                      |   go-live           |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |                     | [Set kiosk status   |                  |             |            |             |
  |                      |                     |  = 'live' in config]|                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      |<-- 200 OK ----------|                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
  |                      | [Transitions to     |                     |                  |             |            |             |
  |                      |  IDLE state         |                     |                  |             |            |             |
  |                      |  Attract loop       |                     |                  |             |            |             |
  |                      |  begins]            |                     |                  |             |            |             |
  |                      |                     |                     |                  |             |            |             |
```

### 2.3 Admin PIN Access Method

The admin dashboard is accessible through two methods:

**Method 1: Hidden Gesture on Kiosk Screen**
- From the IDLE state (attract loop), the operator performs a long-press (hold for 3 seconds) on the bottom-left corner of the screen
- A PIN entry keypad appears (numeric, 4-8 digits)
- The default PIN is `0000` on first run and must be changed during setup
- After 3 failed attempts, the gesture is disabled for 60 seconds
- Successful PIN entry opens the admin dashboard in a full-screen overlay

**Method 2: Separate Admin URL**
- The admin dashboard is accessible at `/admin` on the kiosk's local network address
- For example: `http://192.168.1.100:8000/admin`
- This route requires PIN authentication (same PIN as the kiosk screen)
- The admin dashboard at this URL is a full web application optimized for laptop/tablet use
- It provides the same configuration options as the on-screen setup wizard, plus analytics and session history

### 2.4 Returning to Admin After Initial Setup

After the initial setup is complete, the operator can return to the admin dashboard at any time by:
1. Using the hidden gesture from the idle screen
2. Navigating to the `/admin` URL from a browser on the same network
3. The admin dashboard shows the current configuration status and allows changes to AI provider, payment settings, printer settings, and PIN

---

## 3. Payment Failure Flow

The payment failure flow handles scenarios where the user does not complete payment within the allowed time, or where the payment system encounters an error. The design ensures that users are never charged without receiving a product, and that sessions are cleanly terminated.

### 3.1 Payment Failure Scenarios

| Scenario                     | Detection Method               | User Impact                    |
|------------------------------|--------------------------------|--------------------------------|
| QR code expires              | 120s server-side timer         | Session discarded, no charge   |
| Payment declined by bank     | Payment gateway callback       | Show "Payment declined" message|
| Network error during payment | Connection timeout or 5xx      | Retry option or return to idle |
| Payment gateway down         | Health check failure           | "Service unavailable" message  |
| Duplicate payment detected   | Idempotency key check         | Original session proceeds      |

### 3.2 Payment Failure Sequence Diagram

```
User               KioskScreen          BackendAPI           PaymentGW         Database
 |                     |                     |                   |               |
 | [Sees QR code with |                     |                   |               |
 |  countdown timer   |                     |                   |               |
 |  showing 90s        |                     |                   |               |
 |  remaining]         |                     |                   |               |
 |                     |                     |                   |               |
 | [Does not scan QR   |                     |                   |               |
 |  code. Timer        |                     |                   |               |
 |  continues          |                     |                   |               |
 |  counting down...]  |                     |                   |               |
 |                     |                     |                   |               |
 | [Timer reaches 0]   |                     |                   |               |
 |                     |                     |                   |               |
 |                     |                     | [120s timeout     |               |
 |                     |                     |  fires on backend]|               |
 |                     |                     |                   |               |
 |                     |                     |-- check payment ->|               |
 |                     |                     |   status          |               |
 |                     |                     |   order_id=xxx    |               |
 |                     |                     |                   |               |
 |                     |                     |<-- status=pending |               |
 |                     |                     |   (not paid)      |               |
 |                     |                     |                   |               |
 |                     |                     |-- UPDATE session ->|              |
 |                     |                     |   SET             |               |
 |                     |                     |   payment_status   |               |
 |                     |                     |   = 'expired'     |               |
 |                     |                     |   state = 'idle'  |               |
 |                     |                     |                   |               |
 |                     |                     |-- INSERT analytic->|              |
 |                     |                     |   event_type=     |               |
 |                     |                     |   payment_expired |               |
 |                     |                     |                   |               |
 |                     |                     |-- CANCEL order -->|               |
 |                     |                     |   order_id=xxx    |               |
 |                     |                     |   (prevent late   |               |
 |                     |                     |    payment)       |               |
 |                     |                     |                   |               |
 |                     |<-- state=idle ------|                   |               |
 |                     |   (via WebSocket or |                   |               |
 |                     |    polling)          |                   |               |
 |                     |                     |                   |               |
 |                     | [Attract loop       |                   |               |
 |                     |  resumes. No error  |                   |               |
 |                     |  message shown to   |                   |               |
 |                     |  user (clean        |                   |               |
 |                     |  transition).]      |                   |               |
 |                     |                     |                   |               |
```

### 3.3 Payment Declined Flow (User Scans But Payment Fails)

```
User               KioskScreen          BackendAPI           PaymentGW         Database
 |                     |                     |                   |               |
 | [Scans QR code with |                     |                   |               |
 |  mobile banking app] |                     |                   |               |
 |                     |                     |                   |               |
 |                     |                     |                   |               |
 | [Bank app shows     |                     |                   |               |
 |  "Payment Failed"    |                     |                   |               |
 |  or "Insufficient    |                     |                   |               |
 |  balance"]           |                     |                   |               |
 |                     |                     |                   |               |
 |                     |                     |<-- webhook -------|               |
 |                     |                     |   payment_status= |               |
 |                     |                     |   deny             |               |
 |                     |                     |   order_id=xxx    |               |
 |                     |                     |                   |               |
 |                     |                     |-- UPDATE session ->|              |
 |                     |                     |   SET             |               |
 |                     |                     |   payment_status   |               |
 |                     |                     |   = 'denied'      |               |
 |                     |                     |                   |               |
 |                     |                     |-- INSERT analytic->|              |
 |                     |                     |   event_type=     |               |
 |                     |                     |   payment_denied  |               |
 |                     |                     |                   |               |
 |                     |<-- payment_failed --|                   |               |
 |                     |   reason=denied     |                   |               |
 |                     |                     |                   |               |
 |                     | [Shows: "Payment    |                   |               |
 |                     |  could not be       |                   |               |
 |                     |  processed. Please  |                   |               |
 |                     |  try again."       |                   |               |
 |                     |                     |                   |               |
 |                     | [Two buttons:       |                   |               |
 |                     |  "Try Again"        |                   |               |
 |                     |  "Back to Home"]    |                   |               |
 |                     |                     |                   |               |
 |====================>|                     |                   |               |
 | Taps "Try Again"    |                     |                   |               |
 |                     |                     |                   |               |
 |                     |-- POST /payment --->|                   |               |
 |                     |   retry             |                   |               |
 |                     |                     |                   |               |
 |                     |                     |-- create new QR -->|              |
 |                     |                     |   (new order_id)  |               |
 |                     |                     |<-- new qr_url ----|               |
 |                     |                     |                   |               |
 |                     | [Displays new QR    |                   |               |
 |                     |  code with fresh   |                   |               |
 |                     |  120s timer]        |                   |               |
 |                     |                     |                   |               |
 |---                   |                     |                   |               |
 |  OR                  |                     |                   |               |
 |---                   |                     |                   |               |
 |                      |                     |                   |               |
 |====================>|                     |                   |               |
 | Taps "Back to Home" |                     |                   |               |
 |                     |                     |                   |               |
 |                     |-- POST /session --->|                   |               |
 |                     |   cancel            |                   |               |
 |                     |                     |                   |               |
 |                     |                     |-- UPDATE session ->|              |
 |                     |                     |   state = 'idle'  |               |
 |                     |                     |                   |               |
 |                     |<-- state=idle ------|                   |               |
 |                     |                     |                   |               |
 |                     | [Attract loop       |                   |               |
 |                     |  resumes]           |                   |               |
```

### 3.4 Refund and Compensation Logic

**No refund needed:** Since payment is collected via QRIS (user-initiated push payment), if the payment fails or the QR code expires before the user pays, no money has been collected. There is nothing to refund.

**Partial completion refund:** If the user has paid but the system fails after payment confirmation (e.g., camera fails, AI fails AND fallback fails, printer fails), the operator is responsible for issuing a manual refund through the payment gateway dashboard. The system logs the failure and the session details (including payment reference) for the operator to process the refund.

**Automatic compensation:** There is no automatic refund mechanism within the kiosk software. The operator handles refunds manually. However, the system provides:
- A clear audit trail in the database linking session_id to payment_reference
- Admin dashboard alerts for failed sessions where payment was confirmed
- Exportable session logs for reconciliation

**Key principle:** The user should never be in a state where they have paid but received nothing. The AI fallback mechanism (Section 4) ensures that even if the AI provider fails, the user still receives a printed receipt with a generic positive message.

---

## 4. AI Failure Flow

The AI failure flow handles scenarios where the configured AI provider is unavailable, returns an error, or times out. The system is designed to ensure that the user always receives a physical product, even if the AI component fails. This is a critical reliability requirement because the user may have already paid.

### 4.1 AI Failure Scenarios

| Scenario                  | Detection Method              | User Impact                         |
|---------------------------|-------------------------------|-------------------------------------|
| Provider API timeout      | 45s total timeout             | Fallback template used, print proceeds |
| Rate limit (HTTP 429)     | Response status code          | Fallback template used immediately   |
| Authentication error      | HTTP 401/403                  | Fallback + operator alert            |
| Server error (HTTP 5xx)   | Response status code          | One retry, then fallback             |
| Network unreachable       | Connection error              | Fallback after 10s wait              |
| Invalid response format   | JSON parsing error            | Fallback template used               |
| Response too short/long   | Content validation            | Fallback template used               |
| All providers exhausted   | Cascading failure             | Fallback template used (last resort) |

### 4.2 AI Failure Sequence Diagram

```
User               KioskScreen          BackendAPI           AIProvider         Database        Printer
 |                     |                     |                   |                  |               |
 |                     | [Processing screen: |                   |                  |               |
 |                     |  "Reading your      |                   |                  |               |
 |                     |  vibe..."           |                   |                  |               |
 |                     |  Loading animation] |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- POST /v1/ ----->|                  |               |
 |                     |                     |   chat/completions |                  |               |
 |                     |                     |   model=gpt-4o     |                  |               |
 |                     |                     |   image=base64     |                  |               |
 |                     |                     |   prompt="Analyze  |                  |               |
 |                     |                     |    this person's   |                  |               |
 |                     |                     |    vibe and write  |                  |               |
 |                     |                     |    a witty reading"|                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |  [No response...   |                  |               |
 |                     |                     |   10s elapsed]     |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |  [No response...   |                  |               |
 |                     |                     |   20s elapsed]     |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |  [No response...   |                  |               |
 |                     |                     |   30s elapsed]     |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |  [Timeout at 35s - |                  |               |
 |                     |                     |   primary provider]|                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |<-- timeout/error --|                  |               |
 |                     |                     |   (or 429/5xx)     |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- LOG error ------->|                 |               |
 |                     |                     |   provider=openai  |                  |               |
 |                     |                     |   error=timeout    |                  |               |
 |                     |                     |   session_id=xxx   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- INSERT analytic->|                 |               |
 |                     |                     |   event_type=      |                  |               |
 |                     |                     |   ai_request_failed|                  |               |
 |                     |                     |   metadata={       |                  |               |
 |                     |                     |     provider:      |                  |               |
 |                     |                     |     "openai",      |                  |               |
 |                     |                     |     error:         |                  |               |
 |                     |                     |     "timeout",     |                  |               |
 |                     |                     |     elapsed_ms:    |                  |               |
 |                     |                     |     35000          |                  |               |
 |                     |                     |   }                |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     | [Check for fallback|                  |               |
 |                     |                     |  provider config]  |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |  [No fallback      |                  |               |
 |                     |                     |   provider          |                  |               |
 |                     |                     |   configured]      |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     | [Select fallback   |                  |               |
 |                     |                     |  template from     |                  |               |
 |                     |                     |  local pool]       |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     | [Fallback template |                  |               |
 |                     |                     |  selection logic:  |                  |               |
 |                     |                     |  - Pool of 20+     |                  |               |
 |                     |                     |    pre-written      |                  |               |
 |                     |                     |    generic positive |                  |               |
 |                     |                     |    vibe readings    |                  |               |
 |                     |                     |  - Selected based   |                  |               |
 |                     |                     |    on hash of       |                  |               |
 |                     |                     |    session_id to    |                  |               |
 |                     |                     |    avoid repetition |                  |               |
 |                     |                     |  - Examples:        |                  |               |
 |                     |                     |    "You radiate a   |                  |               |
 |                     |                     |     warm, approach- |                  |               |
 |                     |                     |     able energy.    |                  |               |
 |                     |                     |     People are      |                  |               |
 |                     |                     |     drawn to your   |                  |               |
 |                     |                     |     calm presence." |                  |               |
 |                     |                     |    "Your vibe says  |                  |               |
 |                     |                     |     creative soul   |                  |               |
 |                     |                     |     with a dash of  |                  |               |
 |                     |                     |     adventure."     |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- UPDATE session ->|                  |               |
 |                     |                     |   SET              |                  |               |
 |                     |                     |   ai_response_text  |                  |               |
 |                     |                     |   = fallback_text  |                  |               |
 |                     |                     |   ai_provider_used  |                  |               |
 |                     |                     |   = 'fallback'     |                  |               |
 |                     |                     |   state = 'reveal' |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- INSERT analytic->|                  |               |
 |                     |                     |   event_type=      |                  |               |
 |                     |                     |   ai_fallback_used |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |<-- state=reveal ----|                   |                  |               |
 |                     |   vibe_text=        |                   |                  |               |
 |                     |   [fallback text]   |                   |                  |               |
 |                     |   source=fallback   |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     | [REVEAL/PRINT STATE |                   |                  |               |
 |                     |  - User sees photo  |                   |                  |               |
 |                     |  + vibe text        |                   |                  |               |
 |                     |  (identical UX to   |                   |                  |               |
 |                     |  normal flow)]      |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- Dither image --->|                  |               |
 |                     |                     |   + compose        |                  |               |
 |                     |                     |   receipt          |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |-- ESC/POS print -->|----------------->|               |
 |                     |                     |   photo + text     |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |<-- print_ok -------|------------------|               |
 |                     |                     |                   |                  |               |
 |                     | [Receipt prints     |                   |                  |               |
 |                     |  successfully]      |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     | [User receives      |                   |                  |               |
 |                     |  physical product   |                   |                  |               |
 |                     |  despite AI failure] |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     |                   |                  |               |
 |                     |                     | [Background: if    |                  |               |
 |                     |                     |  payment was        |                  |               |
 |                     |                     |  confirmed and AI  |                  |               |
 |                     |                     |  failed, log alert  |                  |               |
 |                     |                     |  for operator to    |                  |               |
 |                     |                     |  review]            |                  |               |
 |                     |                     |                   |                  |               |
```

### 4.3 Fallback Template System

The fallback template system is a critical component that ensures the kiosk always delivers a physical product to the user, regardless of AI provider status.

**Template Pool:**
- A set of 20+ pre-written generic positive vibe readings stored as plain text in the application configuration
- Each template is a short paragraph (2-3 sentences) written in a fun, engaging tone consistent with the AI-generated output
- Templates are varied in tone: some are humorous, some are uplifting, some are mysterious
- All templates are positive and appropriate for all audiences

**Selection Algorithm:**
1. Compute `hash(session_id) % template_pool_size` to select a template
2. This ensures deterministic selection per session (the same session always gets the same template)
3. Consecutive sessions get different templates (because session IDs are unique UUIDs)
4. If the template pool is exhausted (extremely unlikely with 20+ templates and sequential usage), the pool wraps around

**Template Examples:**
- "You radiate a warm, approachable energy. People are naturally drawn to your calm presence. Today is a good day to trust your instincts."
- "Creative soul with a dash of adventure -- that is your vibe in a nutshell. The universe has been taking notes on your unique energy."
- "Your vibe says: quietly confident, unexpectedly funny, and always the person someone else needed today. Keep being you."

**Display Behavior:**
- The user sees the exact same Reveal/Print screen as they would with a real AI response
- The `ai_provider_used` field in the database is set to `'fallback'` instead of the provider name
- This allows operators to track fallback frequency and identify AI reliability issues

### 4.4 Cascading Provider Fallback (Optional Enhancement)

If multiple AI providers are configured, the system can attempt them in order before falling back to the local template pool:

```
Primary provider (e.g., OpenAI)
    |
    +-- fails --> Secondary provider (e.g., Anthropic)
                     |
                     +-- fails --> Tertiary provider (e.g., Ollama local)
                                      |
                                      +-- fails --> Local template pool (guaranteed)
```

Each provider attempt has a shorter timeout than the previous to prevent excessive waiting:
- Primary: 30 seconds
- Secondary: 15 seconds
- Tertiary: 10 seconds
- Local template: instant (0 seconds)

The total maximum wait is 55 seconds, which is within the Processing state timeout of 45 seconds when using a single provider (the cascading behavior extends the effective timeout).

### 4.5 Operator Notification on AI Failure

When the AI system falls back to a template, the operator is notified through the admin dashboard:
- A warning indicator appears on the admin dashboard
- The analytics event log records the failure with full context (provider, error type, response time)
- If the failure rate exceeds a configurable threshold (default: 3 consecutive failures or 20% failure rate over the last 50 sessions), the dashboard shows a prominent alert recommending the operator check their AI provider configuration and API key
- The operator can switch to a different AI provider or to the mock provider through the admin dashboard without restarting the kiosk

---

## Appendix: State Transition Matrix

The following table defines all valid state transitions and the triggers that cause them:

| From State   | To State     | Trigger                              | Condition            |
|-------------|--------------|--------------------------------------|----------------------|
| IDLE        | PAYMENT      | User touches screen                  | Payment enabled      |
| IDLE        | CAPTURE      | User touches screen                  | Payment disabled     |
| PAYMENT     | CAPTURE      | Payment confirmed (webhook/poll)     | Payment succeeded    |
| PAYMENT     | IDLE         | Payment timeout (120s)               | No payment received  |
| PAYMENT     | IDLE         | User cancels                        | User taps "Back"     |
| PAYMENT     | PAYMENT      | Payment declined, retry requested   | User taps "Try Again"|
| CAPTURE     | PROCESSING   | Photo captured successfully           | JPEG saved to disk   |
| CAPTURE     | IDLE         | Camera error                        | Hardware failure     |
| CAPTURE     | IDLE         | Capture timeout (30s)               | No photo taken       |
| PROCESSING  | REVEAL/PRINT | AI response received                  | Valid text response  |
| PROCESSING  | REVEAL/PRINT | AI timeout / fallback template used   | Fallback activated   |
| REVEAL/PRINT| RESET        | Print complete + 15s display timeout | Normal flow          |
| REVEAL/PRINT| RESET        | User taps to proceed                 | Early exit           |
| REVEAL/PRINT| RESET        | Print failed but display shown       | Graceful degradation |
| RESET       | IDLE         | Cleanup complete (or 5s timeout)     | Always               |

Invalid transitions (e.g., IDLE directly to PROCESSING) are rejected by the state machine and logged as potential bugs.
