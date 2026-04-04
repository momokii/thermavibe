# Integration Map

> **Document ID:** PRD-06
> **Version:** 1.0
> **Status:** Approved
> **Last Updated:** 2026-04-04

This document provides a comprehensive map of all external system integrations for VibePrint OS. For each integration, it describes the protocol, data format, configuration method, authentication approach, and error handling strategy.

---

## Table of Contents

1. [AI Providers](#1-ai-providers)
2. [Payment Gateways](#2-payment-gateways)
3. [Thermal Printer](#3-thermal-printer)
4. [Camera](#4-camera)
5. [PostgreSQL](#5-postgresql)
6. [Integration Overview Matrix](#6-integration-overview-matrix)

---

## 1. AI Providers

VibePrint OS supports multiple AI providers through a unified adapter interface. The system is designed to be provider-agnostic: the core application code never directly calls a specific AI API. Instead, it interacts with a common `AIProvider` interface, and concrete adapters handle the specifics of each provider's API.

### 1.1 Supported Providers

| Provider          | Model             | Modality          | Self-Hosted | Primary Use Case            |
|-------------------|-------------------|-------------------|-------------|-----------------------------|
| OpenAI            | GPT-4o            | Vision (image + text) | No        | Production (best quality)   |
| Anthropic         | Claude 3.5 Sonnet | Vision (image + text) | No        | Production (alternative)    |
| Google            | Gemini 2.0 Flash  | Vision (image + text) | No        | Production (cost-effective) |
| Ollama            | LLaVA / moondream | Vision (image + text) | Yes       | Offline / development       |
| Mock              | (pre-written)     | N/A (template)    | N/A         | Development / testing       |

### 1.2 API Contract Overview

All AI provider adapters conform to the following interface:

```
Input:
  - image: bytes (JPEG, max 4MB, recommended 1024x1024 or smaller)
  - system_prompt: str (operator-configurable, defines the persona and output format)
  - max_tokens: int (default: 300)
  - timeout: int (seconds, default: 30)

Output:
  - text: str (the generated vibe reading)
  - provider: str (identifier of the provider that generated the response)
  - model: str (identifier of the model used)
  - tokens_used: int (total tokens consumed, for cost tracking)
  - latency_ms: int (round-trip time in milliseconds)
```

### 1.3 OpenAI (GPT-4o)

**Protocol:** HTTPS REST API

**Base URL:** `https://api.openai.com/v1` (production), configurable for custom endpoints

**Authentication:** Bearer token in the `Authorization` header
```
Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Endpoint:** `POST /chat/completions`

**Request format:**
```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a fun, witty vibe reader. Analyze the person in the photo and write a short, entertaining 'vibe reading' in 2-3 sentences. Be positive, creative, and playful."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRgABA..."
          }
        },
        {
          "type": "text",
          "text": "Read my vibe!"
        }
      ]
    }
  ],
  "max_tokens": 300,
  "temperature": 0.8
}
```

**Response format:**
```json
{
  "id": "chatcmpl-abc123",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "You've got main character energy with a side of quiet chaos..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1125,
    "completion_tokens": 85,
    "total_tokens": 1210
  }
}
```

**Rate limits:** Tier-dependent. Default tier: 500 RPM, 200,000 TPM for GPT-4o. The system implements client-side rate limiting and exponential backoff.

**Pricing implications (as of 2026):** GPT-4o Vision input at approximately $2.50/1M tokens, output at $10/1M tokens. Estimated cost per session: $0.003-$0.005 (under 1 Rupiah). The system tracks token usage per session in the `AnalyticsEvent` metadata for cost monitoring.

**Error handling:**
- HTTP 429 (rate limit): Log warning, immediately switch to fallback provider or template
- HTTP 401 (invalid key): Log critical error, alert operator, switch to fallback
- HTTP 500/502/503 (server error): Retry once after 3 seconds with exponential backoff; if still failing, switch to fallback
- Timeout (30s default): Cancel request, switch to fallback
- Invalid JSON response: Log error, switch to fallback

### 1.4 Anthropic (Claude 3.5 Sonnet)

**Protocol:** HTTPS REST API

**Base URL:** `https://api.anthropic.com/v1`

**Authentication:** API key in the `x-api-key` header + Anthropic version header
```
x-api-key: sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
anthropic-version: 2023-06-01
```

**Endpoint:** `POST /messages`

**Request format:**
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 300,
  "system": "You are a fun, witty vibe reader. Analyze the person in the photo and write a short, entertaining 'vibe reading' in 2-3 sentences.",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRgABA..."
          }
        },
        {
          "type": "text",
          "text": "Read my vibe!"
        }
      ]
    }
  ]
}
```

**Response format:**
```json
{
  "id": "msg_abc123",
  "type": "message",
  "content": [
    {
      "type": "text",
      "text": "You've got main character energy with a side of quiet chaos..."
    }
  ],
  "usage": {
    "input_tokens": 1050,
    "output_tokens": 78
  }
}
```

**Rate limits:** 50 RPM, 40,000 input TPM, 8,000 output TPM for Claude 3.5 Sonnet (default tier).

**Pricing implications:** Input at approximately $3/1M tokens, output at $15/1M tokens. Estimated cost per session: $0.004-$0.006.

**Error handling:** Same strategy as OpenAI (retry once, then fallback).

### 1.5 Google (Gemini 2.0 Flash)

**Protocol:** HTTPS REST API

**Base URL:** `https://generativelanguage.googleapis.com/v1beta`

**Authentication:** API key as a query parameter or OAuth2 bearer token
```
?key=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Endpoint:** `POST /models/gemini-2.0-flash:generateContent`

**Request format:**
```json
{
  "contents": [
    {
      "parts": [
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRgABA..."
          }
        },
        {
          "text": "Read my vibe!"
        }
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      {
        "text": "You are a fun, witty vibe reader. Analyze the person in the photo and write a short, entertaining 'vibe reading' in 2-3 sentences."
      }
    ]
  },
  "generationConfig": {
    "maxOutputTokens": 300,
    "temperature": 0.8
  }
}
```

**Response format:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "You've got main character energy with a side of quiet chaos..."
          }
        ],
        "role": "model"
      }
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 1080,
    "candidatesTokenCount": 72,
    "totalTokenCount": 1152
  }
}
```

**Rate limits:** 30 RPM for free tier, 1000 RPM for paid tier.

**Pricing implications:** Flash model is very cost-effective: input at $0.10/1M tokens, output at $0.40/1M tokens. Estimated cost per session: $0.0001-$0.0003 (negligible).

**Error handling:** Same strategy as OpenAI (retry once, then fallback).

### 1.6 Ollama (Local Self-Hosted)

**Protocol:** HTTP REST API (local network, no TLS required)

**Base URL:** `http://localhost:11434` (configurable for Docker networking: `http://ollama:11434`)

**Authentication:** None by default. Ollama can be configured with API keys in its own configuration, but this is not standard.

**Endpoint:** `POST /api/generate`

**Request format:**
```json
{
  "model": "llava",
  "prompt": "Read my vibe!",
  "images": ["/9j/4AAQSkZJRgABA..."],
  "system": "You are a fun, witty vibe reader. Analyze the person in the photo and write a short, entertaining 'vibe reading' in 2-3 sentences.",
  "stream": false,
  "options": {
    "num_predict": 300,
    "temperature": 0.8
  }
}
```

**Response format:**
```json
{
  "model": "llava",
  "response": "You've got main character energy with a side of quiet chaos...",
  "done": true,
  "total_duration": 8500000000,
  "eval_count": 72,
  "prompt_eval_count": 1080
}
```

**Considerations for local deployment:**
- Requires a machine with a GPU (NVIDIA recommended) for acceptable inference speed
- LLaVA 7B requires approximately 4-6 GB VRAM
- Typical latency: 5-15 seconds for a short response (varies greatly with hardware)
- No API cost, but hardware cost and electricity consumption apply
- Quality of responses is generally lower than GPT-4o or Claude, but sufficient for a fun photobooth experience
- The `system` field is not supported by all Ollama models; the adapter handles this by prepending the system prompt to the user message

**Error handling:**
- Connection refused: Ollama service is not running. Log error, alert operator, switch to fallback template.
- Model not found: The configured model is not pulled. Log error with instructions to run `ollama pull llava`, switch to fallback.
- Timeout (60s default for local models): Cancel request, switch to fallback.
- Out of memory (Ollama returns error): Log critical error, switch to fallback.

### 1.7 Mock Provider

The Mock provider is used for development, testing, and demonstrations. It does not call any external API and instead returns a pre-configured response.

**Protocol:** None (in-process)

**Behavior:**
- Accepts the same input interface as other providers
- Returns a fixed response text (configurable via OperatorConfig `ai.mock_response`)
- Simulates a configurable delay (default: 3 seconds) to test the processing UI
- Always succeeds (no error handling needed)
- Logs that the mock provider was used for audit purposes

### 1.8 Provider Adapter Architecture

```
+------------------+
|     Backend      |
|   (FastAPI)      |
+--------+---------+
         |
         | ai.analyze(image, prompt)
         |
         v
+------------------+
| AIProviderFacade |
+--------+---------+
         |
         | get_provider(config.provider)
         v
+------------------+
| AIProvider       |  <-- Abstract base class
| Interface        |
+--------+---------+
         |
    +----+----+----+----+----+
    |    |    |    |    |    |
    v    v    v    v    v    v
 OpenAI Anthro Goog Olla Mock
                    ma
```

Each adapter implements:
- `analyze(image: bytes, system_prompt: str, **kwargs) -> AIResponse`
- `health_check() -> bool` (verify connectivity and credentials)
- `estimate_cost(tokens: int) -> float` (estimate cost in USD)

---

## 2. Payment Gateways

VibePrint OS integrates with QRIS (Quick Response Code Indonesian Standard) payment providers to allow users to pay via mobile banking apps and e-wallets. Payment is optional and can be disabled entirely.

### 2.1 Supported Providers

| Provider  | Type     | Region     | Sandbox Support | Primary Use          |
|-----------|----------|------------|-----------------|----------------------|
| Midtrans  | Gateway  | Indonesia  | Yes (Sandbox)   | Production (primary) |
| Xendit    | Gateway  | Indonesia  | Yes (Sandbox)   | Production (alt)     |
| Mock      | Built-in | N/A        | N/A             | Development / testing|

### 2.2 QRIS Transaction Flow

```
Kiosk Backend                Payment Gateway               User (Phone)
     |                            |                            |
     |-- 1. Create QRIS order -->|                            |
     |   POST /v2/charge         |                            |
     |   { amount, order_id }    |                            |
     |                            |                            |
     |<-- 2. QR code URL ---------|                            |
     |   { qr_url, expires_at }  |                            |
     |                            |                            |
     | [3. Display QR code on    |                            |
     |  kiosk screen with        |                            |
     |  countdown timer]         |                            |
     |                            |                            |
     |                            |  [4. User scans QR code    |
     |                            |   with mobile banking app] |
     |                            |                            |
     |                            |<-- 5. Payment initiated ---|
     |                            |   (via banking app)        |
     |                            |                            |
     |                            |  [6. Payment processed    |
     |                            |   by acquiring bank]       |
     |                            |                            |
     |<-- 7. Webhook callback ----|                            |
     |   POST /webhook/payment    |                            |
     |   { transaction_status:    |                            |
     |     "settlement",          |                            |
     |     order_id,              |                            |
     |     transaction_id }       |                            |
     |                            |                            |
     | [8. Verify webhook         |                            |
     |  signature, update         |                            |
     |  session, proceed to       |                            |
     |  CAPTURE state]            |                            |
     |                            |                            |
```

Additionally, the backend polls the payment gateway every 3 seconds as a fallback if the webhook is not received within the expected timeframe. This handles scenarios where the webhook endpoint is not reachable from the internet (common in kiosk deployments behind NAT).

### 2.3 Midtrans Integration

**Protocol:** HTTPS REST API

**Base URLs:**
- Sandbox: `https://app.sandbox.midtrans.com/snap/v1`
- Production: `https://app.midtrans.com/snap/v1`
- API: `https://api.midtrans.com/v2`

**Authentication:** Server key encoded as Basic Auth
```
Authorization: Basic base64(server_key + ":")
```
For example, if the server key is `SB-Mid-server-xxx`, the header value is `Basic U0ItTWlkLXNlcnZlci14eHg6`.

**QRIS creation endpoint:** `POST /v2/charge`

**Request format:**
```json
{
  "payment_type": "qris",
  "transaction_details": {
    "order_id": "VP-20260404-abc123",
    "gross_amount": 10000
  },
  "qris": {
    "acquirer": "gopay"
  }
}
```

**Response format:**
```json
{
  "status_code": "201",
  "transaction_id": "abc123-def456",
  "order_id": "VP-20260404-abc123",
  "gross_amount": "10000.00",
  "payment_type": "qris",
  "transaction_status": "pending",
  "transaction_time": "2026-04-04 10:30:00",
  "expiry_time": "2026-04-04 10:32:00",
  "qr_code": "https://api.midtrans.com/v2/qris/abc123/qr",
  "actions": [
    {
      "name": "qr-string",
      "method": "GET",
      "url": "https://api.midtrans.com/v2/abc123/qr-string"
    }
  ]
}
```

**Polling endpoint:** `GET /v2/{order_id}/status`

**Webhook callback (HTTP POST to configured webhook URL):**
```json
{
  "transaction_time": "2026-04-04 10:30:15",
  "transaction_status": "settlement",
  "transaction_id": "abc123-def456",
  "status_message": "Sukses",
  "status_code": "200",
  "signature_key": "hashed_signature",
  "payment_type": "qris",
  "order_id": "VP-20260404-abc123",
  "merchant_id": "M1234567",
  "gross_amount": "10000.00",
  "fraud_status": "accept",
  "currency": "IDR"
}
```

**Webhook signature verification:**
```
signature_key = SHA512(order_id + status_code + gross_amount + server_key)
```

**QR code expiration:** Midtrans QRIS codes expire after 2 minutes by default (configurable via OperatorConfig).

**Error handling:**
- QR creation fails (HTTP 4xx/5xx): Log error, display "Payment system temporarily unavailable", return to IDLE
- Webhook not received: Polling fallback checks every 3 seconds
- Invalid webhook signature: Reject the callback, log security warning
- Transaction status `deny`: Show "Payment declined" to user, offer retry
- Transaction status `expire`: Session times out, return to IDLE
- Transaction status `cancel`: Session cancelled, return to IDLE

### 2.4 Xendit Integration

**Protocol:** HTTPS REST API

**Base URLs:**
- Sandbox: `https://api.xendit.co`
- Production: `https://api.xendit.co` (same URL, different API key)

**Authentication:** API key as Basic Auth
```
Authorization: Basic base64(secret_key + ":")
```

**QRIS creation endpoint:** `POST /v2/qr_codes`

**Request format:**
```json
{
  "external_id": "VP-20260404-abc123",
  "type": "DYNAMIC",
  "callback_url": "https://kiosk.example.com/webhook/xendit",
  "amount": 10000,
  "currency": "IDR",
  "metadata": {
    "session_id": "abc123"
  }
}
```

**Response format:**
```json
{
  "id": "qrc_abc123",
  "external_id": "VP-20260404-abc123",
  "amount": 10000,
  "currency": "IDR",
  "qr_string": "00020101021226610014COM.GO-JEK.WWW0118936009140330123456789021ID1030005219CO.GO-JEK.WWW0303UMI51440014ID.CO.QRIS.WWW0215ID20200001234565204581353036045802ID5913JAKARTA PUSAT6007JAKARTA61051033062240520YOGYALALA6304153A",
  "callback_url": "https://kiosk.example.com/webhook/xendit",
  "created": "2026-04-04T10:30:00.000Z",
  "updated": "2026-04-04T10:30:00.000Z",
  "status": "ACTIVE",
  "payments": []
}
```

**Webhook callback (HTTP POST to callback_url):**
```json
{
  "event": "qr.payment",
  "business_id": "biz_abc123",
  "created": "2026-04-04T10:30:15.000Z",
  "data": {
    "id": "pay_abc123",
    "amount": 10000,
    "currency": "IDR",
    "business_id": "biz_abc123",
    "external_id": "VP-20260404-abc123",
    "payment_method": "QRIS",
    "status": "SUCCEEDED",
    "created": "2026-04-04T10:30:10.000Z",
    "updated": "2026-04-04T10:30:15.000Z"
  }
}
```

**Webhook signature verification:** Xendit includes an `x-callback-token` header that must match the configured webhook secret.

**Polling endpoint:** `GET /v2/qr_codes/{qr_code_id}/payments`

**Error handling:** Same strategy as Midtrans.

### 2.5 Mock Payment Provider

The Mock provider simulates payment for development and testing purposes. It does not generate a real QR code or process real payments.

**Behavior:**
- Creates a fake QR code URL (a static placeholder image)
- When the developer taps a hidden "Simulate Payment" button (visible only in mock mode), the provider immediately confirms the payment
- Supports configurable simulated delay (default: 5 seconds) before confirmation
- Supports simulated failure scenarios (configurable via OperatorConfig `payment.mock_failure_rate`)

### 2.6 Webhook Configuration for Kiosk Deployments

Since kiosks are typically deployed behind NAT on local networks, receiving webhooks from external payment gateways requires one of the following approaches:

1. **Cloud tunnel (recommended for Phase 1):** Use a service like ngrok, Cloudflare Tunnel, or a similar tunnel to expose the webhook endpoint to the internet. The tunnel URL is configured in the payment gateway's webhook settings.

2. **Polling fallback (always active):** Regardless of webhook availability, the backend polls the payment gateway every 3 seconds to check transaction status. This ensures payment confirmation works even without a publicly accessible webhook endpoint.

3. **Operator-managed reverse proxy:** For advanced setups, the operator can configure their own reverse proxy (nginx, Apache) to forward webhook traffic to the kiosk.

The polling fallback is always enabled and serves as the primary confirmation mechanism for kiosk deployments. The webhook is used as an optimization to reduce latency.

### 2.7 Payment Gateway Configuration

All payment configuration is stored in the `operator_configs` table:

| Config Key              | Description                                    |
|-------------------------|------------------------------------------------|
| `payment.enabled`       | Whether payment is required                    |
| `payment.provider`      | `midtrans`, `xendit`, or `mock`               |
| `payment.server_key`    | Server API key (encrypted at rest)             |
| `payment.client_key`    | Client-facing key (for Snap integration)       |
| `payment.amount`        | Amount in Rupiah                               |
| `payment.timeout_seconds`| QR code validity duration                     |
| `payment.sandbox`       | Use sandbox environment                        |
| `payment.webhook_secret`| Webhook signature verification secret          |
| `payment.webhook_url`   | Public URL for webhook callbacks               |

---

## 3. Thermal Printer

VibePrint OS prints photo receipts on USB thermal printers using the ESC/POS command protocol. The `python-escpos` library provides the interface between the application and the printer hardware.

### 3.1 Printer Compatibility

The system targets generic ESC/POS-compatible thermal printers. The following printers are known to work:

| Printer Model    | Paper Width | USB VID    | USB PID    | Notes                         |
|------------------|-------------|------------|------------|-------------------------------|
| Xprinter XP-58IIH | 58mm        | `0x0525`   | `0xa700`   | Widely available, recommended |
| Xprinter XP-80C  | 80mm        | `0x0525`   | `0xa700`   | Wider format                  |
| Epson TM-T20II   | 80mm        | `0x04b8`   | `0x0202`   | Premium quality               |
| Goojprt PT-210   | 58mm        | `0x0525`   | `0xa700`   | Budget option                 |

**Note:** Many generic thermal printers share the same USB VID/PID (`0x0525:0xa700`). The system uses VID/PID for auto-detection but allows manual device path configuration via `printer.device_path` in OperatorConfig.

### 3.2 USB Enumeration

The system detects printers via USB vendor ID and product ID. On Linux, USB devices are enumerated through sysfs:

```
/sys/bus/usb/devices/
  ├── 1-1/
  │   ├── idVendor (e.g., "0525")
  │   ├── idProduct (e.g., "a700")
  │   ├── manufacturer (e.g., "XP")
  │   └── product (e.g., "XP-58IIH")
```

The `python-escpos` library uses `pyusb` for USB device discovery. The system first attempts auto-detection by VID/PID, then falls back to a configurable device path (e.g., `/dev/usb/lp0`).

**Docker USB passthrough:** The Docker container must have access to the USB device. This is configured in `docker-compose.yml`:

```yaml
services:
  backend:
    devices:
      - /dev/bus/usb:/dev/bus/usb
      - /dev/usb/lp0:/dev/usb/lp0
    privileged: true  # Required for USB access in some configurations
```

### 3.3 ESC/POS Command Set Overview

ESC/POS is a command language developed by Epson for thermal printers. The system uses the following commands:

| Command           | Hex Code        | Description                                       |
|-------------------|-----------------|---------------------------------------------------|
| Initialize        | `1B 40`         | Reset printer to default settings                 |
| Print and feed    | `0A`            | Print line and feed one line                      |
| Line spacing      | `1B 33 n`       | Set line spacing to n dots                        |
| Bold on           | `1B 45 01`      | Enable bold text                                  |
| Bold off          | `1B 45 00`      | Disable bold text                                 |
| Align center      | `1B 61 01`      | Center-align text                                 |
| Align left        | `1B 61 00`      | Left-align text                                   |
| Underline on      | `1B 2D 01`      | Enable underline                                  |
| Underline off     | `1B 2D 00`      | Disable underline                                 |
| Cut paper         | `1D 56 01`      | Partial cut (leaves a small tab for easy tearing) |
| Image (raster)    | `1D 76 30 00`   | Print raster bitmap image                         |
| Set image density | `1D 7E 00-3`    | Set print density (0-3)                           |

### 3.4 Image Dithering Pipeline

The photo captured by the webcam must be converted to a 1-bit (black and white) bitmap for thermal printing. The dithering pipeline is:

```
Step 1: Resize
  Input: JPEG (1280x720 or similar)
  Output: Resized image matching printer pixel width
  - 58mm paper at 203 DPI = 384 pixels wide
  - 80mm paper at 203 DPI = 576 pixels wide
  - Height is scaled proportionally (typically 240-360 pixels)

Step 2: Color to Grayscale
  Input: RGB image
  Output: 8-bit grayscale image
  - Weighted conversion: gray = 0.299*R + 0.587*G + 0.114*B
  - (Pillow's .convert('L') uses this formula)

Step 3: Floyd-Steinberg Dithering
  Input: 8-bit grayscale image
  Output: 1-bit (binary) image
  - Error-diffusion algorithm that distributes quantization error
    to neighboring pixels, producing smooth gradients
  - Produces much higher quality results than simple thresholding

Step 4: ESC/POS Raster Encoding
  Input: 1-bit image
  Output: Byte array for ESC/POS raster command
  - Each row is padded to a multiple of 8 pixels
  - Pixels are packed into bytes, MSB first
  - Row format: nL nH d1 d2 ... dk (where nL:nH = bytes per row)
  - Wrapped in: 1D 76 30 03 nL nH [image data]

Step 5: Print Job Composition
  The complete print job consists of:
  1. Initialize printer (1B 40)
  2. Feed 2 lines (0A 0A)
  3. Center-align (1B 61 01)
  4. Print brand header text ("VibePrint OS")
  5. Print separator line ("-" * 32)
  6. Print dithered photo image (1D 76 30 03 ...)
  7. Feed 1 line
  8. Print AI vibe reading text (word-wrapped to paper width)
  9. Print separator line
  10. Print footer ("Thank you! | [date]")
  11. Feed 4 lines
  12. Cut paper (1D 56 01)
```

### 3.5 Paper Width Options

| Paper Width | Print Area (mm) | Pixel Width @203dpi | Pixel Width @300dpi | Characters per line |
|-------------|-----------------|---------------------|---------------------|---------------------|
| 58mm        | 48mm            | 384px               | 576px               | 32 chars             |
| 80mm        | 72mm            | 576px               | 864px               | 48 chars             |

**Configuration:** Set via `printer.paper_width` in OperatorConfig (`"58mm"` or `"80mm"`). The system automatically calculates pixel width based on the configured DPI and paper width.

**Text formatting:** The word-wrapping algorithm uses the characters-per-line value to break the AI response text into lines that fit the receipt width.

### 3.6 Error Handling

| Error Scenario          | Detection Method                       | Response                                      |
|-------------------------|----------------------------------------|-----------------------------------------------|
| Printer not connected   | USB device enumeration failure          | Display result on screen only. Log warning. Alert operator. |
| USB permission error    | `PermissionError` exception            | Log error with fix instructions. Alert operator. |
| Print buffer overflow   | Printer returns error after data sent  | Reduce image quality, retry once              |
| Paper out               | Printer status pin (if supported) or `paper_out` exception | Mark print job as failed. Alert operator. Show on-screen result to user. |
| Printer overheating     | Printer returns error or stops responding | Wait 10 seconds, retry. If still failing, mark as failed. |
| Communication timeout   | USB write/read timeout (default 30s)   | Cancel print job, retry once, then mark failed. |
| Unknown error           | Unhandled exception from python-escpos  | Log full traceback. Mark print job as failed. Alert operator. Show on-screen result. |

**Critical design principle:** A printer failure must never result in the user seeing an error message or being charged without receiving value. The system always shows the AI result on screen, and the print failure is handled as an operator issue.

### 3.7 Configuration

All printer configuration is stored in the `operator_configs` table:

| Config Key             | Description                                    |
|------------------------|------------------------------------------------|
| `printer.vendor_id`    | USB Vendor ID (hex string, e.g., "0x0525")     |
| `printer.product_id`   | USB Product ID (hex string, e.g., "0xa700")    |
| `printer.device_path`  | Manual device path override (e.g., "/dev/usb/lp0") |
| `printer.paper_width`  | Paper width: "58mm" or "80mm"                   |
| `printer.dpi`          | Printer resolution in DPI (default: 203)        |
| `printer.density`      | Print density 0-3 (default: 1)                  |
| `printer.max_retries`  | Maximum print retry attempts (default: 2)       |

---

## 4. Camera

VibePrint OS captures photos from a USB webcam using OpenCV, which interfaces with the Linux V4L2 (Video4Linux2) subsystem.

### 4.1 Camera Compatibility

The system targets standard UVC (USB Video Class) webcams, which are supported natively by the Linux kernel without additional drivers.

| Camera Model           | Resolution  | Interface | Notes                           |
|------------------------|-------------|-----------|---------------------------------|
| Logitech C270          | 1280x720    | USB 2.0   | Budget option, widely available |
| Logitech C920/C922     | 1920x1080   | USB 2.0   | Good quality, autofocus          |
| Microsoft LifeCam HD   | 1280x720    | USB 2.0   | Alternative option              |
| Generic USB webcam     | Varies      | USB 2.0   | Most UVC cameras work           |

### 4.2 Device Detection and Enumeration

On Linux, video devices appear as `/dev/video0`, `/dev/video1`, etc. The system enumerates available devices using OpenCV:

```python
import cv2

# Enumerate available cameras
# OpenCV assigns indices 0, 1, 2... to available V4L2 devices
for index in range(10):  # Check up to 10 devices
    cap = cv2.VideoCapture(index, cv2.CAP_V4L2)
    if cap.isOpened():
        backend_name = cap.getBackendName()
        width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        cap.release()
        # Device index {index} is available
```

**Docker configuration:** The container needs access to the video device:

```yaml
services:
  backend:
    devices:
      - /dev/video0:/dev/video0
```

### 4.3 MJPEG Streaming for Live Preview

During the CAPTURE state, the system streams live video from the camera to the kiosk screen as a live preview. MJPEG (Motion JPEG) is used for the preview stream because:

- Lower CPU usage compared to H.264/H.265 decoding (each frame is independently decoded)
- Lower latency (no inter-frame dependencies)
- Broad support across webcams and browsers
- Sufficient quality for a preview window

**Streaming implementation:**
1. The backend opens the camera using OpenCV with MJPEG preferred mode
2. Frames are captured in a loop and encoded as JPEG
3. Frames are streamed to the frontend via a WebSocket connection or Server-Sent Events (SSE)
4. The frontend renders the JPEG frames in an `<img>` element, updating at approximately 15-20 FPS

**OpenCV camera configuration for MJPEG:**
```python
cap = cv2.VideoCapture(device_path, cv2.CAP_V4L2)
cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS, 30)
```

### 4.4 Still Capture

When the countdown reaches zero, the system captures a single frame from the camera stream:

```python
ret, frame = cap.read()
if ret:
    # frame is a numpy array (BGR format)
    # Convert to RGB for storage
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    # Encode as JPEG with quality setting
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 90]
    success, jpeg_buffer = cv2.imencode('.jpg', frame_rgb, encode_param)
    if success:
        jpeg_bytes = jpeg_buffer.tobytes()
        # Save to temporary file
        with open(photo_path, 'wb') as f:
            f.write(jpeg_bytes)
```

**Capture parameters:**
- Resolution: Configurable via `camera.resolution_width` and `camera.resolution_height` (default: 1280x720)
- JPEG quality: 90 (out of 100) -- balances file size and quality
- AI submission resolution: The image is resized to a maximum of 1024px on the longest side before sending to the AI provider (reduces token count and latency)
- Dithering resolution: The image is resized to the printer's pixel width (384px or 576px) for thermal printing

### 4.5 Error Handling

| Error Scenario             | Detection Method                   | Response                                       |
|----------------------------|------------------------------------|------------------------------------------------|
| No camera detected         | `cv2.VideoCapture()` returns false | Display "Camera not available" on kiosk screen, return to IDLE |
| Camera in use by another   | `cv2.VideoCapture()` returns false | Log error, check for other processes using the device, retry |
| USB disconnect mid-session | `cap.read()` returns false         | Display error, return to IDLE, alert operator   |
| Corrupted frame            | Frame is None or all-black         | Retry capture once; if still corrupted, return to IDLE with error message |
| Low light (very dark frame)| Luminance analysis of captured frame | Inform user "Lighting is low, but let's try anyway!" and proceed (do not block the user) |

### 4.6 Configuration

All camera configuration is stored in the `operator_configs` table:

| Config Key                | Description                                         |
|---------------------------|-----------------------------------------------------|
| `camera.device_path`      | V4L2 device path (default: "/dev/video0")           |
| `camera.resolution_width` | Capture resolution width in pixels (default: 1280)  |
| `camera.resolution_height`| Capture resolution height in pixels (default: 720)  |
| `camera.mjpeg`            | Use MJPEG streaming for preview (default: true)      |
| `camera.brightness`       | Camera brightness adjustment, 0-100 (default: 50)   |
| `camera.contrast`         | Camera contrast adjustment, 0-100 (default: 50)     |

---

## 5. PostgreSQL

VibePrint OS uses PostgreSQL as its primary data store for session data, configuration, analytics, and print job tracking.

### 5.1 Connection

**Protocol:** TCP/IP over localhost (or Docker network)

**Connection string format:**
```
postgresql+asyncpg://vp_user:vp_password@db:5432/vibeprint
```

**Connection pooling:** Managed by SQLAlchemy's built-in async engine pool:
- Pool size: 5 connections (sufficient for single-kiosk workload)
- Max overflow: 10 connections
- Pool timeout: 30 seconds
- Pool recycle: 3600 seconds (recycle connections after 1 hour to prevent stale connections)
- Pool pre-ping: Enabled (verify connection health before use)

**Environment variables:**
```
DATABASE_HOST=db
DATABASE_PORT=5432
DATABASE_USER=vp_user
DATABASE_PASSWORD=vp_password
DATABASE_NAME=vibeprint
```

### 5.2 Database Service Configuration

**Docker Compose service:**
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vp_user
      POSTGRES_PASSWORD: vp_password
      POSTGRES_DB: vibeprint
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vp_user -d vibeprint"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
    driver: local
```

### 5.3 Migration Management via Alembic

All database schema changes are managed through Alembic, which provides version-controlled, reversible migrations.

**Migration workflow:**
```
1. Developer modifies SQLAlchemy model in the backend code
2. Run: alembic revision --autogenerate -m "description of change"
3. Review the generated migration script
4. Run: alembic upgrade head
5. Commit both the model change and the migration script
```

**Migration file location:** `backend/alembic/versions/`

**Migration naming convention:** `{revision}_{description}.py`

**Startup behavior:** The backend application automatically runs `alembic upgrade head` on startup to ensure the database schema is up to date. This is handled by a startup event in FastAPI:

```python
@app.on_event("startup")
async def run_migrations():
    alembic_cfg = AlembicConfig("alembic.ini")
    command.upgrade(alembic_cfg, "head")
```

### 5.4 Backup Strategy

For a single-kiosk deployment, the backup strategy is simple:

- **PostgreSQL data volume:** The `pgdata` Docker volume persists data across container restarts. The operator is responsible for backing up this volume periodically.
- **pg_dump automation (recommended):** A cron job inside the container or on the host system runs `pg_dump` daily:
  ```bash
  pg_dump -U vp_user -d vibeprint -F c -f /backups/vibeprint_$(date +%Y%m%d).dump
  ```
- **Backup retention:** Keep the last 7 daily backups, 4 weekly backups.
- **Restore procedure:** Stop the application, restore from dump, restart:
  ```bash
  pg_restore -U vp_user -d vibeprint -c /backups/vibeprint_20260404.dump
  ```

### 5.5 Error Handling

| Error Scenario            | Detection Method                     | Response                                             |
|---------------------------|--------------------------------------|------------------------------------------------------|
| Connection refused        | `asyncpg` connection error           | Retry with exponential backoff (1s, 2s, 4s, 8s). Alert operator if unrecoverable. |
| Authentication failure    | `asyncpg` auth error                 | Log critical error. Do not retry (configuration issue). Alert operator. |
| Migration failure         | Alembic exit code non-zero           | Log error with migration details. Application does not start. Alert operator. |
| Query timeout             | SQLAlchemy statement timeout         | Log warning. Retry once. If still failing, return error to caller. |
| Disk full                 | PostgreSQL write error               | Log critical error. Application enters degraded mode (photos stored in memory only, lost on restart). Alert operator. |
| Data corruption           | PostgreSQL checksum or constraint violation | Log critical error. Operator must restore from backup. |

---

## 6. Integration Overview Matrix

| Integration     | Protocol          | Direction          | Data Format        | Auth Method             | Failure Impact        |
|-----------------|-------------------|--------------------|--------------------|-------------------------|-----------------------|
| OpenAI          | HTTPS REST        | Outbound           | JSON               | Bearer token            | Fallback template used |
| Anthropic       | HTTPS REST        | Outbound           | JSON               | x-api-key header        | Fallback template used |
| Google Gemini   | HTTPS REST        | Outbound           | JSON               | API key (query param)   | Fallback template used |
| Ollama          | HTTP REST         | Outbound (local)   | JSON               | None                    | Fallback template used |
| Midtrans        | HTTPS REST + WS   | Bidirectional      | JSON               | Basic Auth              | Payment disabled       |
| Xendit          | HTTPS REST + WS   | Bidirectional      | JSON               | Basic Auth              | Payment disabled       |
| Thermal Printer | USB (libusb)      | Outbound           | ESC/POS binary     | None                    | Print skipped          |
| Camera          | V4L2 (USB)        | Inbound            | Raw frames (MJPEG) | None                    | Capture fails          |
| PostgreSQL      | TCP/IP            | Bidirectional      | SQL / relational   | Username + password     | Application halt       |

**Key design principle:** Every external integration has a graceful degradation path. The kiosk should never show an unrecoverable error to the end user. AI failures fall back to templates, printer failures show results on screen, camera failures return to idle, and payment failures allow retry or skip.
