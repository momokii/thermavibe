# VibePrint OS -- REST API Contract

> This document specifies the complete REST API contract for VibePrint OS. All endpoints are versioned under `/api/v1/`. Request and response bodies use JSON. Authentication for admin endpoints uses a Bearer token obtained from the PIN-based login endpoint.
>
> **Future note:** When multi-kiosk is implemented, this API will gain WebSocket endpoints (`/ws/agent`) for room agent communication, kiosk management endpoints (`/admin/kiosks`), and camera/printer operations will be proxied through WebSocket instead of direct hardware access. See [multi-kiosk-architecture.md](multi-kiosk-architecture.md) for details.

---

## Table of Contents

1. [Common Specifications](#1-common-specifications)
2. [Health Check](#2-health-check)
3. [Kiosk Features & Configuration](#3-kiosk-features--configuration)
4. [Kiosk Flow](#4-kiosk-flow)
5. [Camera](#5-camera)
6. [AI](#6-ai)
7. [Payment](#7-payment)
8. [Print](#8-print)
9. [Admin](#9-admin)
10. [Access Codes (Admin)](#10-access-codes-admin)

---

## 1. Common Specifications

### Base URL

```
Production: http://localhost:8000/api/v1
Development (frontend proxy): http://localhost:5173/api/v1
```

### Content Type

All request and response bodies use `Content-Type: application/json` unless otherwise specified.

### Authentication

Admin endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

The token is obtained by calling `POST /api/v1/admin/login` with the admin PIN. Token expiry is configurable via `ADMIN_SESSION_TTL_HOURS` (default: 24 hours). The frontend auto-logouts when the session expires.

Non-admin endpoints (kiosk flow, camera, AI) do not require authentication. They are intended for use by the kiosk UI running on the same machine.

### Common Error Response Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of the error.",
    "request_id": "uuid-v4-correlation-id"
  }
}
```

### HTTP Status Codes

| Status Code | Meaning | When Used |
|------------|---------|-----------|
| `200` | OK | Successful GET, PUT, DELETE |
| `201` | Created | Successful POST that creates a resource |
| `204` | No Content | Successful DELETE with no response body |
| `400` | Bad Request | Invalid request body, missing required fields |
| `401` | Unauthorized | Missing or invalid authentication token |
| `403` | Forbidden | Valid token but insufficient permissions |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | State conflict (e.g., invalid state transition) |
| `422` | Unprocessable Entity | Validation error (Pydantic schema validation failure) |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `502` | Bad Gateway | External service (AI provider, payment gateway) unreachable |
| `503` | Service Unavailable | Hardware not available (printer, camera) |

### Error Codes

| Error Code | HTTP Status | Description |
|-----------|-------------|-------------|
| `VALIDATION_ERROR` | 422 | Request body failed Pydantic schema validation |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `INVALID_STATE` | 409 | State machine transition is not allowed |
| `SESSION_EXPIRED` | 410 | Session has expired and can no longer be used |
| `PAYMENT_REQUIRED` | 402 | Payment step must be completed before this action |
| `PAYMENT_ERROR` | 502 | Payment gateway returned an error |
| `PAYMENT_TIMEOUT` | 408 | Payment not received within the timeout period |
| `PRINTER_ERROR` | 503 | Thermal printer is not available or returned an error |
| `CAMERA_ERROR` | 503 | Camera is not available or capture failed |
| `AI_PROVIDER_ERROR` | 502 | AI provider returned an error or timed out |
| `AUTH_INVALID_PIN` | 401 | The provided PIN is incorrect |
| `AUTH_TOKEN_EXPIRED` | 401 | The authentication token has expired |
| `AUTH_TOKEN_INVALID` | 401 | The authentication token is malformed or invalid |
| `CONFIG_INVALID` | 400 | Configuration value is invalid for the given category |
| `RATE_LIMITED` | 429 | Too many requests in a short time period |

### Pagination

List endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 20 | Items per page (max 100) |

Paginated responses follow this structure:

```json
{
  "items": [],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8
}
```

---

## 2. Health Check

### `GET /api/v1/health`

Returns the health status of the application and its dependencies.

**Authentication:** None

**Query Parameters:** None

**Response (200 OK):**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "production",
  "uptime_seconds": 86400,
  "checks": {
    "database": "ok",
    "printer": "ok",
    "camera": "ok"
  }
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "environment": "production",
  "uptime_seconds": 86400,
  "checks": {
    "database": "ok",
    "printer": "unavailable",
    "camera": "ok"
  }
}
```

---

## 3. Kiosk Features & Configuration

### `GET /api/v1/kiosk/features`

Returns enabled features and photobooth configuration for kiosk initialization. This is the primary endpoint the frontend uses to load runtime settings (all values come from the database, managed via the admin panel).

**Authentication:** None

**Response:**

```json
{
  "vibe_check_enabled": true,
  "photobooth_enabled": true,
  "photobooth_max_photos": 8,
  "photobooth_min_photos": 2,
  "photobooth_capture_time_limit_seconds": 30,
  "photobooth_default_layout_rows": 4,
  "access_code_mode_enabled": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vibe_check_enabled` | boolean | Always true (at least one feature must be on) |
| `photobooth_enabled` | boolean | Whether the photobooth feature is available |
| `photobooth_max_photos` | integer | Maximum photos per session (admin-configurable) |
| `photobooth_min_photos` | integer | Minimum photos before "Done" button appears |
| `photobooth_capture_time_limit_seconds` | integer | Capture timer duration in seconds |
| `photobooth_default_layout_rows` | integer | Default photo slots in strip (1-4) |
| `access_code_mode_enabled` | boolean | Whether access code mode is active. When true, the kiosk requires a valid access code to proceed. Mutually exclusive with payment: setting this to `true` automatically sets `payment_enabled` to `false`, and vice versa. |

> **Mutual exclusivity note:** `access_code_mode_enabled` and payment are mutually exclusive. When `access_code_mode_enabled` is set to `true` via the admin config, `payment_enabled` is automatically forced to `false`. Likewise, enabling payment disables access code mode. This ensures the kiosk only presents one gating mechanism at a time.

---

## 4. Kiosk Flow

### `POST /api/v1/kiosk/session`

Create a new kiosk session. This initializes the state machine in the IDLE state and returns the session object.

**Authentication:** None

**Request Body:**

```json
{
  "payment_enabled": false,
  "access_code_mode": false
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `payment_enabled` | boolean | No | `false` | Whether the payment step is enabled for this session |
| `access_code_mode` | boolean | No | `false` | Whether access code gating is enabled for this session. Mutually exclusive with `payment_enabled`; if both are `true`, the request is rejected with `400 CONFIG_INVALID`. |

**Response (201 Created):**

```json
{
  "id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state": "IDLE",
  "payment_enabled": false,
  "access_code_mode": false,
  "payment_status": null,
  "captured_at": null,
  "analysis_text": null,
  "analysis_provider": null,
  "printed_at": null,
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-15T10:30:00Z",
  "expires_at": "2025-06-15T11:30:00Z"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 422 | `VALIDATION_ERROR` | Request body contains invalid fields |

---

### `GET /api/v1/kiosk/session/{id}`

Get the current state and data for a kiosk session.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Session ID |

**Response (200 OK):**

```json
{
  "id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state": "PROCESSING",
  "payment_enabled": false,
  "payment_status": null,
  "captured_at": "2025-06-15T10:30:15Z",
  "analysis_text": null,
  "analysis_provider": "openai",
  "printed_at": null,
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-15T10:30:15Z",
  "expires_at": "2025-06-15T11:30:00Z"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | No session exists with the given ID |
| 410 | `SESSION_EXPIRED` | Session has expired |

---

### `POST /api/v1/kiosk/session/{id}/capture`

Trigger a photo capture for the given session. The backend opens the camera, captures a frame, and stores the image. The session transitions from CAPTURE to PROCESSING.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Session ID |

**Request Body:** None

**Response (200 OK):**

```json
{
  "id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state": "PROCESSING",
  "payment_enabled": false,
  "payment_status": null,
  "captured_at": "2025-06-15T10:30:15Z",
  "capture_image_url": "/api/v1/kiosk/session/sess_a1b2c3d4/capture.jpg",
  "analysis_text": null,
  "analysis_provider": null,
  "printed_at": null,
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-15T10:30:15Z",
  "expires_at": "2025-06-15T11:30:00Z"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | No session exists with the given ID |
| 409 | `INVALID_STATE` | Session is not in CAPTURE state |
| 503 | `CAMERA_ERROR` | Camera is not available or capture failed after retries |

---

### `POST /api/v1/kiosk/session/{id}/print`

Trigger printing of the session receipt. The backend assembles the ESC/POS receipt (analysis text + dithered photo thumbnail) and sends it to the thermal printer.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Session ID |

**Request Body:**

```json
{
  "include_photo": true
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `include_photo` | boolean | No | `true` | Whether to include the dithered photo thumbnail on the receipt |

**Response (200 OK):**

```json
{
  "id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state": "REVEAL",
  "payment_enabled": false,
  "payment_status": null,
  "captured_at": "2025-06-15T10:30:15Z",
  "analysis_text": "Your energy today radiates confidence and warmth...",
  "analysis_provider": "openai",
  "printed_at": "2025-06-15T10:31:30Z",
  "print_success": true,
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-15T10:31:30Z",
  "expires_at": "2025-06-15T11:30:00Z"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | No session exists with the given ID |
| 409 | `INVALID_STATE` | Session is not in REVEAL state |
| 503 | `PRINTER_ERROR` | Printer is not available or print job failed |

---

### `POST /api/v1/kiosk/session/{id}/finish`

End the kiosk session and clear all session data. The session transitions to RESET, temporary files are deleted, and the camera is released.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Session ID |

**Request Body:** None

**Response (200 OK):**

```json
{
  "id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state": "IDLE",
  "message": "Session completed and data cleared.",
  "duration_seconds": 95
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | No session exists with the given ID |

---

### `POST /api/v1/kiosk/validate-access-code`

Validate an access code without redeeming it. Used by the kiosk UI to check whether a code is valid before proceeding with the session flow.

**Authentication:** None

**Request Body:**

```json
{
  "code": "VC-ABC123",
  "session_type": "vibe_check"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | The access code to validate |
| `session_type` | string | Yes | The session type to validate against (`"vibe_check"` or `"photobooth"`) |

**Response (200 OK):**

```json
{
  "valid": true,
  "message": "Access code is valid.",
  "access_code_id": 42
}
```

```json
{
  "valid": false,
  "message": "Access code has expired.",
  "access_code_id": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | Whether the code is valid for the given session type |
| `message` | string | Human-readable description of the validation result |
| `access_code_id` | integer or null | Internal ID of the access code if found, `null` otherwise |

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 422 | `VALIDATION_ERROR` | Request body is missing required fields |

---

### `POST /api/v1/kiosk/session/{id}/redeem-code`

Validate and redeem an access code against an existing session. On success, the session transitions from `ACCESS_CODE` to `CAPTURE`, consuming one use of the access code.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Session ID |

**Request Body:**

```json
{
  "code": "VC-ABC123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | The access code to redeem |

**Response (200 OK):**

Returns the standard session response (same shape as `GET /api/v1/kiosk/session/{id}`):

```json
{
  "id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state": "CAPTURE",
  "payment_enabled": false,
  "access_code_mode": true,
  "payment_status": null,
  "captured_at": null,
  "analysis_text": null,
  "analysis_provider": null,
  "printed_at": null,
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-15T10:30:15Z",
  "expires_at": "2025-06-15T11:30:00Z"
}
```

> **Note:** On successful redemption, if the access code has a non-null `price`, the value is copied to the session's `payment_amount` field for revenue tracking. If the code's `price` is `null`, the session's `payment_amount` remains `null` (free session).

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Session does not exist |
| 409 | `INVALID_STATE` | Session is not in `ACCESS_CODE` state |
| 409 | `INVALID_STATE` | Access code is invalid, expired, revoked, or has no remaining uses |
| 422 | `VALIDATION_ERROR` | Request body is missing the `code` field |

---

## 5. Camera

### `GET /api/v1/camera/stream`

Returns an MJPEG (Motion JPEG) live stream from the active camera. This endpoint sets `Content-Type: multipart/x-mixed-replace; boundary=frame` and continuously pushes JPEG frames.

**Authentication:** None

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resolution` | string | No | `1280x720` | Requested resolution in `WIDTHxHEIGHT` format |
| `fps` | integer | No | `15` | Target frames per second (5-30) |
| `quality` | integer | No | `85` | JPEG compression quality (1-100) |

**Response:** Continuous MJPEG stream (not JSON).

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 503 | `CAMERA_ERROR` | Camera is not available |

---

### `GET /api/v1/camera/devices`

List all available video capture devices detected on the system.

**Authentication:** None

**Query Parameters:** None

**Response (200 OK):**

```json
{
  "devices": [
    {
      "index": 0,
      "name": "USB Camera (046d:0825)",
      "path": "/dev/video0",
      "resolutions": [
        { "width": 1920, "height": 1080, "format": "MJPEG" },
        { "width": 1280, "height": 720, "format": "MJPEG" },
        { "width": 640, "height": 480, "format": "YUYV" }
      ],
      "is_active": true
    },
    {
      "index": 1,
      "name": "Integrated Webcam",
      "path": "/dev/video1",
      "resolutions": [
        { "width": 1280, "height": 720, "format": "MJPEG" }
      ],
      "is_active": false
    }
  ]
}
```

---

### `POST /api/v1/camera/select`

Set the active camera device for capture and streaming.

**Authentication:** None

**Request Body:**

```json
{
  "device_index": 1
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_index` | integer | Yes | The index of the camera device to activate (from `/camera/devices`) |

**Response (200 OK):**

```json
{
  "message": "Camera switched successfully.",
  "active_device": {
    "index": 1,
    "name": "Integrated Webcam",
    "path": "/dev/video1"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid device index |
| 503 | `CAMERA_ERROR` | Selected camera device could not be opened |

---

## 6. AI

### `POST /api/v1/ai/analyze`

Send an image to the configured AI provider for analysis. This endpoint is typically called internally by the kiosk flow (after capture) but can also be called directly for testing purposes.

**Authentication:** None (internal use; not exposed to end users directly in production)

**Request Body:**

The request body must be `multipart/form-data` (not JSON) because it includes a binary image file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file (binary) | Yes | JPEG image file to analyze |
| `prompt` | string | No | Custom prompt override (uses configured default if not provided) |
| `session_id` | string | No | Session ID to associate the analysis with |

**cURL Example:**

```bash
curl -X POST http://localhost:8000/api/v1/ai/analyze \
  -F "image=@photo.jpg" \
  -F "prompt=Analyze this person's vibe and personality" \
  -F "session_id=sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response (200 OK):**

```json
{
  "analysis_text": "Your energy today radiates confidence and warmth. You carry an approachable aura that draws people in, and your style suggests someone who values both comfort and self-expression.",
  "provider": "openai",
  "model": "gpt-4o",
  "latency_ms": 3200,
  "tokens_used": {
    "input": 1245,
    "output": 87
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Missing image file or invalid format |
| 502 | `AI_PROVIDER_ERROR` | AI provider returned an error or timed out after retries |
| 503 | `AI_PROVIDER_ERROR` | No AI provider is configured |

---

## 7. Payment

### `POST /api/v1/payment/create-qr`

Generate a QRIS QR code for the given session. The QR code URL is returned and displayed to the user. The payment gateway handles the actual QRIS transaction.

**Authentication:** None

**Request Body:**

```json
{
  "session_id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "amount": 10000,
  "currency": "IDR"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string (UUID) | Yes | The session to associate this payment with |
| `amount` | integer | Yes | Payment amount in the smallest currency unit (rupiah) |
| `currency` | string | No | Currency code (always `IDR` for QRIS) |

**Response (201 Created):**

```json
{
  "payment_id": "pay_x1y2z3a4b5c6",
  "session_id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "provider": "midtrans",
  "amount": 10000,
  "currency": "IDR",
  "status": "PENDING",
  "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=qr.midas.id/...",
  "qr_string": "00020101021226610014COM.GO-JEK.WWW011893600914033847725902ID102036035104IDR5204541153033605802ID5915TOKOPEDIA6007JAKARTA6304142B",
  "expires_at": "2025-06-15T10:45:00Z",
  "created_at": "2025-06-15T10:30:00Z"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Session does not exist |
| 409 | `INVALID_STATE` | Session is not in PAYMENT state |
| 502 | `PAYMENT_ERROR` | Payment gateway returned an error |

---

### `POST /api/v1/payment/webhook/{provider}`

Webhook callback from the payment gateway. This endpoint receives payment status updates (payment confirmed, expired, failed) from the payment provider. Authentication is verified via webhook signature, not Bearer token.

**Authentication:** Signature verification (provider-specific). No Bearer token required.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | string | Payment provider name (`midtrans`, `xendit`) |

**Request Body:**

The request body format depends on the payment provider. The backend parses the provider-specific format and normalizes it.

**Midtrans webhook payload (example):**

```json
{
  "transaction_time": "2025-06-15 10:35:00",
  "transaction_status": "settlement",
  "transaction_id": "a1b2c3d4-e5f6-7890",
  "status_message": "Sukses",
  "status_code": "200",
  "signature_key": "abc123...",
  "payment_type": "qris",
  "order_id": "PAY-sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "merchant_id": "M1234567",
  "gross_amount": "10000.00",
  "fraud_status": "accept"
}
```

**Response (200 OK):**

```json
{
  "status": "ok"
}
```

The backend returns `200 OK` regardless of the payment outcome to prevent the payment gateway from retrying the webhook.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid webhook payload or signature verification failed |

---

### `GET /api/v1/payment/status/{session_id}`

Poll the current payment status for a session. Used by the frontend as a fallback if webhook delivery is delayed.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string (UUID) | Session ID |

**Response (200 OK):**

```json
{
  "payment_id": "pay_x1y2z3a4b5c6",
  "session_id": "sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "provider": "midtrans",
  "amount": 10000,
  "currency": "IDR",
  "status": "PAID",
  "paid_at": "2025-06-15T10:35:00Z",
  "expires_at": "2025-06-15T10:45:00Z",
  "created_at": "2025-06-15T10:30:00Z"
}
```

Payment status values: `PENDING`, `PAID`, `EXPIRED`, `FAILED`, `REFUNDED`.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | No payment record exists for the given session |

---

## 8. Print

### `POST /api/v1/print/test`

Print a test receipt to verify the thermal printer is working correctly. The test receipt contains diagnostic information (printer name, timestamp, test pattern).

**Authentication:** Admin (Bearer token required)

**Request Body:** None

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Test receipt printed successfully.",
  "printer_info": {
    "vendor": "Epson",
    "model": "TM-T20II",
    "vendor_id": "0x04b8",
    "product_id": "0x0202"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 503 | `PRINTER_ERROR` | Printer is not connected or print job failed |

---

### `GET /api/v1/print/status`

Check the current status of the thermal printer connection.

**Authentication:** Admin (Bearer token required)

**Query Parameters:** None

**Response (200 OK):**

```json
{
  "connected": true,
  "printer": {
    "vendor": "Epson",
    "model": "TM-T20II",
    "vendor_id": "0x04b8",
    "product_id": "0x0202",
    "usb_path": "/dev/bus/usb/001/004"
  },
  "status": {
    "paper_ok": true,
    "printer_online": true,
    "errors": []
  },
  "last_print_at": "2025-06-15T10:31:30Z",
  "total_prints_today": 47
}
```

**Response (200 OK) -- Printer not connected:**

```json
{
  "connected": false,
  "printer": null,
  "status": {
    "paper_ok": false,
    "printer_online": false,
    "errors": ["Printer USB device not found at configured path"]
  },
  "last_print_at": null,
  "total_prints_today": 0
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |

---

## 9. Admin

### `POST /api/v1/admin/login`

Authenticate with the admin PIN and receive a JWT token for subsequent admin API calls.

**Authentication:** None (this endpoint performs authentication)

**Request Body:**

```json
{
  "pin": "1234"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pin` | string | Yes | Admin PIN code |

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTcxODQ0MDYwMCwiZXhwIjoxNzE4NTI3MDAwfQ.abc123...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "expires_at": "2025-06-16T10:30:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | JWT token for authenticated requests |
| `token_type` | string | Always `"Bearer"` |
| `expires_in` | number | Token lifetime in seconds (`ADMIN_SESSION_TTL_HOURS * 3600`) |
| `expires_at` | string | ISO 8601 timestamp when the token expires |

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_INVALID_PIN` | The provided PIN is incorrect |
| 422 | `VALIDATION_ERROR` | Request body is missing or malformed |
| 429 | `RATE_LIMITED` | Too many failed login attempts (5 max per minute) |

---

### `GET /api/v1/admin/config`

Get all configuration values organized by category.

**Authentication:** Admin (Bearer token required)

**Query Parameters:** None

**Response (200 OK):**

```json
{
  "categories": {
    "general": {
      "kiosk_name": "VibePrint OS",
      "welcome_message": "Strike a pose!",
      "idle_timeout_seconds": 300,
      "language": "en"
    },
    "ai": {
      "provider": "openai",
      "model": "gpt-4o",
      "prompt_template": "Analyze this person's vibe...",
      "max_retries": 3,
      "timeout_seconds": 30,
      "fallback_provider": "mock"
    },
    "payment": {
      "enabled": false,
      "provider": "midtrans",
      "amount": 10000,
      "currency": "IDR",
      "timeout_seconds": 900
    },
    "camera": {
      "device_index": 0,
      "resolution_width": 1280,
      "resolution_height": 720,
      "mjpeg_quality": 85,
      "countdown_seconds": 3
    },
    "printer": {
      "enabled": true,
      "vendor_id": "0x04b8",
      "product_id": "0x0202",
      "paper_width_mm": 80,
      "print_photo": true,
      "print_branding": true
    }
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |

---

### `PUT /api/v1/admin/config/{category}`

Update configuration values for a specific category. Only the provided fields are updated; unspecified fields retain their current values.

**Authentication:** Admin (Bearer token required)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Configuration category (`general`, `ai`, `payment`, `camera`, `printer`) |

**Request Body:**

A JSON object where keys are configuration field names and values are the new values. The valid fields depend on the category.

```json
{
  "kiosk_name": "My Photo Booth",
  "welcome_message": "Ready for your close-up?",
  "idle_timeout_seconds": 120
}
```

**Response (200 OK):**

```json
{
  "category": "general",
  "updated_fields": {
    "kiosk_name": "My Photo Booth",
    "welcome_message": "Ready for your close-up?",
    "idle_timeout_seconds": 120
  },
  "all_values": {
    "kiosk_name": "My Photo Booth",
    "welcome_message": "Ready for your close-up?",
    "idle_timeout_seconds": 120,
    "language": "en"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 400 | `CONFIG_INVALID` | One or more configuration values are invalid |
| 404 | `NOT_FOUND` | Configuration category does not exist |

---

### `GET /api/v1/admin/analytics/features`

Retrieve per-feature analytics breakdown, comparing Vibe Check and Photobooth session performance. Returns total sessions, completion rate, average duration, and revenue for each feature independently.

**Authentication:** Admin (Bearer token required)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_date` | string (ISO 8601 date) | No | 7 days ago | Start of date range |
| `end_date` | string (ISO 8601 date) | No | Today | End of date range |

**Response (200 OK):**

```json
{
  "features": [
    {
      "feature": "vibe_check",
      "total_sessions": 120,
      "completed_sessions": 105,
      "abandoned_sessions": 15,
      "completion_rate": 0.875,
      "avg_duration_seconds": 45.2,
      "revenue": 1050000
    },
    {
      "feature": "photobooth",
      "total_sessions": 85,
      "completed_sessions": 72,
      "abandoned_sessions": 13,
      "completion_rate": 0.847,
      "avg_duration_seconds": 95.8,
      "revenue": 720000
    }
  ]
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 422 | `VALIDATION_ERROR` | Invalid date format or date range |

---

### `GET /api/v1/admin/analytics/sessions`

Retrieve session analytics including session counts, state distribution, and average session durations.

**Authentication:** Admin (Bearer token required)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_date` | string (ISO 8601 date) | No | 7 days ago | Start of date range (inclusive) |
| `end_date` | string (ISO 8601 date) | No | Today | End of date range (inclusive) |
| `group_by` | string | No | `day` | Grouping granularity (`hour`, `day`, `week`, `month`) |

**Example Request:**

```
GET /api/v1/admin/analytics/sessions?start_date=2025-06-01&end_date=2025-06-15&group_by=day
```

**Response (200 OK):**

```json
{
  "summary": {
    "total_sessions": 342,
    "completed_sessions": 310,
    "abandoned_sessions": 32,
    "completion_rate": 0.906,
    "avg_duration_seconds": 85.3
  },
  "state_distribution": {
    "idle": 0,
    "payment": 5,
    "capture": 12,
    "review": 3,
    "processing": 8,
    "reveal": 7,
    "frame_select": 2,
    "arrange": 1,
    "compositing": 1,
    "photobooth_reveal": 4,
    "reset": 0
  },
  "timeseries": [
    {
      "period": "2025-06-01",
      "sessions": 18,
      "completed": 16,
      "abandoned": 2,
      "avg_duration_seconds": 82.1
    },
    {
      "period": "2025-06-02",
      "sessions": 24,
      "completed": 22,
      "abandoned": 2,
      "avg_duration_seconds": 87.5
    }
  ],
  "page": 1,
  "per_page": 15,
  "total_periods": 15
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 422 | `VALIDATION_ERROR` | Invalid date format or date range |

---

### `GET /api/v1/admin/analytics/revenue`

Retrieve revenue analytics from all monetized sessions, including both confirmed payments and access-code redemptions with a non-null price.

**Authentication:** Admin (Bearer token required)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_date` | string (ISO 8601 date) | No | 7 days ago | Start of date range |
| `end_date` | string (ISO 8601 date) | No | Today | End of date range |
| `group_by` | string | No | `day` | Grouping granularity |

**Example Request:**

```
GET /api/v1/admin/analytics/revenue?start_date=2025-06-01&end_date=2025-06-15&group_by=day
```

**Response (200 OK):**

```json
{
  "summary": {
    "total_revenue": 3100000,
    "total_transactions": 310,
    "avg_transaction_amount": 10000,
    "currency": "IDR",
    "refund_count": 2,
    "refund_total": 20000
  },
  "timeseries": [
    {
      "period": "2025-06-01",
      "revenue": 160000,
      "transactions": 16,
      "refunds": 0
    },
    {
      "period": "2025-06-02",
      "revenue": 220000,
      "transactions": 22,
      "refunds": 1
    }
  ],
  "by_provider": {
    "midtrans": {
      "transactions": 250,
      "revenue": 2500000,
      "success_rate": 0.98
    }
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 422 | `VALIDATION_ERROR` | Invalid date format or date range |

---

### `GET /api/v1/admin/hardware/status`

Get the current status of all hardware devices (camera and printer).

**Authentication:** Admin (Bearer token required)

**Query Parameters:** None

**Response (200 OK):**

```json
{
  "camera": {
    "connected": true,
    "active_device": {
      "index": 0,
      "name": "USB Camera (046d:0825)",
      "path": "/dev/video0"
    },
    "status": {
      "streaming": false,
      "last_capture_at": "2025-06-15T10:30:15Z",
      "errors": []
    }
  },
  "printer": {
    "connected": true,
    "device": {
      "vendor": "Epson",
      "model": "TM-T20II",
      "usb_path": "/dev/bus/usb/001/004"
    },
    "status": {
      "paper_ok": true,
      "printer_online": true,
      "last_print_at": "2025-06-15T10:31:30Z",
      "total_prints_today": 47,
      "errors": []
    }
  },
  "system": {
    "cpu_usage_percent": 23.5,
    "memory_usage_mb": 512,
    "disk_usage_percent": 45.2,
    "uptime_seconds": 172800
  }
}
```

---

### `POST /api/v1/admin/hardware/camera/test`

Capture a test frame from the active camera and return it for preview.

**Authentication:** Admin (Bearer token required)

**Request Body:** None

**Response (200 OK):**

The response is a JPEG image (`Content-Type: image/jpeg`), not JSON. The frontend displays this image in the admin hardware test panel.

**Response body:** Binary JPEG image data.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 503 | `CAMERA_ERROR` | Camera not available or capture failed |

---

### `POST /api/v1/admin/hardware/printer/test`

Print a test receipt to verify the thermal printer is working. Identical to `POST /api/v1/print/test` but accessed via the admin hardware route.

**Authentication:** Admin (Bearer token required)

**Request Body:** None

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Test receipt printed successfully.",
  "printer_info": {
    "vendor": "Epson",
    "model": "TM-T20II",
    "vendor_id": "0x04b8",
    "product_id": "0x0202"
  },
  "test_content": {
    "text_lines": 5,
    "image_included": true,
    "paper_cut": true
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 503 | `PRINTER_ERROR` | Printer not available or print job failed |

---

### `GET /api/v1/printer/devices`

List detected USB printer devices via `lsusb`. Scans all USB devices and maps known ESC/POS vendor IDs.

**Authentication:** Admin (Bearer token required)

**Response (200 OK):**

```json
{
  "devices": [
    {
      "vendor_id": "0x04b8",
      "product_id": "0x0202",
      "description": "Epson Seiko Epson Corp."
    }
  ]
}
```

---

### `POST /api/v1/printer/select`

Switch the active USB printer at runtime. Tears down any existing printer connection and connects to the specified device.

**Authentication:** Admin (Bearer token required)

**Request Body:**

```json
{
  "vendor_id": "0x154f",
  "product_id": "0x0522"
}
```

**Response (200 OK):** Returns `PrintStatusResponse` (same as `GET /printer/status`).

---

### `GET /api/v1/admin/photobooth/strips`

List photobooth sessions that have a composite strip image available for viewing. Returns paginated results with thumbnail URLs.

**Authentication:** Admin (Bearer token required)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 24 | Items per page (max 100) |
| `offset` | integer | No | 0 | Number of items to skip |

**Response (200 OK):**

```json
{
  "strips": [
    {
      "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "composite_url": "/api/v1/kiosk/session/{session_id}/photobooth/composite",
      "thumbnail_url": "/api/v1/kiosk/session/{session_id}/photobooth/thumbnail",
      "created_at": "2025-06-15T10:30:00Z",
      "theme_name": "Classic Dark"
    }
  ],
  "total": 150
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |

---

### `GET /api/v1/admin/vibe-check/results`

List completed vibe check sessions with AI analysis results. Returns paginated results with photo and analysis text.

**Authentication:** Admin (Bearer token required)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 24 | Items per page (max 100) |
| `offset` | integer | No | 0 | Number of items to skip |

**Response (200 OK):**

```json
{
  "results": [
    {
      "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "photo_url": "/api/v1/kiosk/session/{session_id}/photo",
      "thumbnail_url": "/api/v1/kiosk/session/{session_id}/photo/thumb",
      "created_at": "2025-06-15T10:30:00Z",
      "analysis_text": "Your energy today radiates confidence and warmth...",
      "analysis_provider": "openai"
    }
  ],
  "total": 200
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |

---

### `GET /api/v1/kiosk/session/{session_id}/photo/thumb`

Retrieve a thumbnail (300px width) of a vibe check session photo. Generated on first request and cached alongside the original image.

**Authentication:** None

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string (UUID) | Session ID |

**Response (200 OK):** JPEG image (`Content-Type: image/jpeg`).

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Session or photo not found |

---

## 10. Access Codes (Admin)

> Access codes provide a free-alternative gating mechanism to payment. They are mutually exclusive with payment: when `access_code_mode_enabled` is `true`, `payment_enabled` is automatically `false`, and vice versa. Codes can be generated in batches, limited by max uses and expiration dates, and revoked at any time.

### Common Schema: `AccessCodeResponse`

All access code endpoints return or accept this shape:

```json
{
  "id": 42,
  "code": "VC-ABC123",
  "code_type": "vibe_check",
  "status": "active",
  "max_uses": 10,
  "current_uses": 3,
  "remaining_uses": 7,
  "expires_at": "2025-07-01T00:00:00Z",
  "revoked_at": null,
  "price": 15000,
  "notes": "Event giveaway codes",
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-15T10:30:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique access code ID |
| `code` | string | Human-readable code string (e.g., `VC-ABC123`) |
| `code_type` | string | Session type the code is valid for (`"vibe_check"` or `"photobooth"`) |
| `status` | string | Current status (`"active"`, `"revoked"`, `"expired"`, `"exhausted"`) |
| `max_uses` | integer | Maximum number of times the code can be redeemed |
| `current_uses` | integer | Number of times the code has been redeemed so far |
| `remaining_uses` | integer | Number of remaining redemptions (`max_uses - current_uses`) |
| `expires_at` | string or null | ISO 8601 expiration timestamp, `null` if no expiration |
| `revoked_at` | string or null | ISO 8601 revocation timestamp, `null` if not revoked |
| `price` | integer or null | Optional price per redemption in IDR. When `null`, the code grants free access. |
| `notes` | string or null | Optional admin notes about this code |
| `created_at` | string | ISO 8601 creation timestamp |
| `updated_at` | string | ISO 8601 last update timestamp |

---

### `GET /api/v1/admin/access-codes`

List access codes with pagination and optional filters by status and code type.

**Authentication:** Admin (Bearer token required)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | All | Filter by status (`"active"`, `"revoked"`, `"expired"`, `"exhausted"`) |
| `code_type` | string | No | All | Filter by session type (`"vibe_check"` or `"photobooth"`) |
| `limit` | integer | No | 20 | Items per page (max 100) |
| `offset` | integer | No | 0 | Number of items to skip |

**Response (200 OK):**

```json
{
  "codes": [
    {
      "id": 42,
      "code": "VC-ABC123",
      "code_type": "vibe_check",
      "status": "active",
      "max_uses": 10,
      "current_uses": 3,
      "remaining_uses": 7,
      "expires_at": "2025-07-01T00:00:00Z",
      "revoked_at": null,
      "notes": "Event giveaway codes",
      "created_at": "2025-06-15T10:30:00Z",
      "updated_at": "2025-06-15T10:30:00Z"
    }
  ],
  "total": 85
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 422 | `VALIDATION_ERROR` | Invalid query parameter values |

---

### `POST /api/v1/admin/access-codes`

Generate access codes (single or batch, up to 100 at once).

**Authentication:** Admin (Bearer token required)

**Request Body:**

```json
{
  "code_type": "vibe_check",
  "count": 10,
  "max_uses": 5,
  "expires_at": "2025-07-01T00:00:00Z",
  "price": 15000,
  "notes": "Weekend event codes"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `code_type` | string | Yes | — | Session type the codes are valid for (`"vibe_check"` or `"photobooth"`) |
| `count` | integer | Yes | — | Number of codes to generate (1-100) |
| `max_uses` | integer | No | 1 | Maximum redemptions per code |
| `expires_at` | string (ISO 8601) | No | `null` (no expiration) | Expiration timestamp |
| `price` | integer | No | `null` | Optional price per redemption in IDR. When `null`, uses the global `payment_amount` setting. |
| `notes` | string | No | `null` | Admin notes applied to all generated codes |

**Response (201 Created):**

Returns an array of `AccessCodeResponse` objects:

```json
[
  {
    "id": 42,
    "code": "VC-ABC123",
    "code_type": "vibe_check",
    "status": "active",
    "max_uses": 5,
    "current_uses": 0,
    "remaining_uses": 5,
    "expires_at": "2025-07-01T00:00:00Z",
    "revoked_at": null,
    "price": 15000,
    "notes": "Weekend event codes",
    "created_at": "2025-06-15T10:30:00Z",
    "updated_at": "2025-06-15T10:30:00Z"
  },
  {
    "id": 43,
    "code": "VC-DEF456",
    "code_type": "vibe_check",
    "status": "active",
    "max_uses": 5,
    "current_uses": 0,
    "remaining_uses": 5,
    "expires_at": "2025-07-01T00:00:00Z",
    "revoked_at": null,
    "price": 15000,
    "notes": "Weekend event codes",
    "created_at": "2025-06-15T10:30:00Z",
    "updated_at": "2025-06-15T10:30:00Z"
  }
]
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 400 | `CONFIG_INVALID` | `count` exceeds 100 or `max_uses` is less than 1 |
| 422 | `VALIDATION_ERROR` | Request body is missing required fields or has invalid values |

---

### `PATCH /api/v1/admin/access-codes/{id}/revoke`

Revoke an access code. A revoked code can no longer be redeemed. This action is reversible only by generating a new code; revoked codes remain in the database for audit purposes.

**Authentication:** Admin (Bearer token required)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Access code ID |

**Request Body:** None

**Response (200 OK):**

Returns the updated `AccessCodeResponse`:

```json
{
  "id": 42,
  "code": "VC-ABC123",
  "code_type": "vibe_check",
  "status": "revoked",
  "max_uses": 10,
  "current_uses": 3,
  "remaining_uses": 0,
  "expires_at": "2025-07-01T00:00:00Z",
  "revoked_at": "2025-06-20T14:00:00Z",
  "notes": "Revoked: event cancelled",
  "created_at": "2025-06-15T10:30:00Z",
  "updated_at": "2025-06-20T14:00:00Z"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 404 | `NOT_FOUND` | Access code does not exist |
| 409 | `INVALID_STATE` | Code is already revoked |

---

### `DELETE /api/v1/admin/access-codes/{id}`

Hard delete an access code. This permanently removes the code and its redemption history. This action is irreversible.

**Authentication:** Admin (Bearer token required)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Access code ID |

**Request Body:** None

**Response (204 No Content):**

No response body.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 404 | `NOT_FOUND` | Access code does not exist |

---

### `GET /api/v1/admin/access-codes/{id}/qr`

Generate a QR code PNG image for the given access code. The QR code encodes the access code string and can be scanned by the kiosk camera or printed on marketing materials.

**Authentication:** Admin (Bearer token required)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Access code ID |

**Query Parameters:** None

**Response (200 OK):**

The response is a PNG image (`Content-Type: image/png`), not JSON.

**Response body:** Binary PNG image data.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `AUTH_TOKEN_INVALID` | Missing or invalid Bearer token |
| 404 | `NOT_FOUND` | Access code does not exist |
