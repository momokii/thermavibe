# Data Models

> **Document ID:** PRD-05
> **Version:** 1.0
> **Status:** Approved
> **Last Updated:** 2026-04-04

This document defines the data entities, field-level specifications, constraints, indexes, and relationships for the VibePrint OS persistence layer. All data is stored in PostgreSQL 15+ and managed via SQLAlchemy ORM with Alembic migrations.

---

## Table of Contents

1. [Entity Relationship Diagram](#1-entity-relationship-diagram)
2. [KioskSession](#2-kiosksession)
3. [OperatorConfig](#3-operatorconfig)
4. [AnalyticsEvent](#4-analyticsevent)
5. [PrintJob](#5-printjob)
6. [Privacy Model](#6-privacy-model)

---

## 1. Entity Relationship Diagram

```
+---------------------------+         +---------------------------+
|       KioskSession         |         |     AnalyticsEvent        |
+---------------------------+         +---------------------------+
| id           UUID (PK)     |<------>| session_id   UUID (FK)     |
| state        ENUM          |         | id           UUID (PK)     |
| photo_path   VARCHAR(512)  |         | event_type   ENUM          |
| ai_response_text TEXT      |         | metadata     JSONB         |
| ai_provider_used VARCHAR   |         | timestamp    TIMESTAMPTZ   |
| payment_status ENUM        |         +---------------------------+
| payment_provider VARCHAR    |
| payment_amount INTEGER     |         +---------------------------+
| payment_reference VARCHAR   |         |       PrintJob            |
| created_at    TIMESTAMPTZ  |<------>| session_id   UUID (FK)     |
| completed_at  TIMESTAMPTZ  |         +---------------------------+
| cleared_at    TIMESTAMPTZ  |         | id           UUID (PK)     |
+---------------------------+         | status       ENUM          |
                                      | retry_count  INTEGER       |
                                      | error_message TEXT          |
                                      | created_at   TIMESTAMPTZ   |
                                      | completed_at TIMESTAMPTZ   |
                                      +---------------------------+

+---------------------------+
|     OperatorConfig        |
+---------------------------+
| id           SERIAL (PK)  |
| key          VARCHAR(255)  |
| value        TEXT          |
| category     ENUM          |
| description  TEXT          |
| updated_at   TIMESTAMPTZ  |
+---------------------------+

Relationships:
  KioskSession  1 --- 0..* AnalyticsEvent   (one session generates many events)
  KioskSession  1 --- 0..1 PrintJob          (one session has at most one print job)
  OperatorConfig is a standalone key-value store with no foreign key relationships.
```

---

## 2. KioskSession

The `KioskSession` entity represents a single user interaction cycle with the kiosk, from the moment the user touches the screen to start, through payment, capture, AI analysis, printing, and final cleanup.

### 2.1 Table Definition

**Table name:** `kiosk_sessions`

### 2.2 Fields

| Field                | PostgreSQL Type    | Constraints                          | Description                                                                                     |
|----------------------|--------------------|--------------------------------------|-------------------------------------------------------------------------------------------------|
| `id`                 | `UUID`             | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique identifier for the session. Generated server-side on creation.                          |
| `state`              | `VARCHAR(32)`      | NOT NULL, DEFAULT `'idle'`, CHECK constraint | Current state in the state machine. One of: `idle`, `payment`, `capture`, `processing`, `reveal`, `reset`. |
| `photo_path`         | `VARCHAR(512)`     | NULL                                 | Filesystem path to the captured JPEG photo. Set during CAPTURE state. Cleared during RESET.    |
| `ai_response_text`   | `TEXT`             | NULL                                 | The AI-generated vibe reading text. Set during PROCESSING state.                                |
| `ai_provider_used`   | `VARCHAR(64)`      | NULL                                 | Identifier of the AI provider that generated the response. Values: `openai`, `anthropic`, `google`, `ollama`, `fallback`, `mock`. |
| `payment_status`     | `VARCHAR(32)`      | NULL                                 | Current payment status. NULL if payment is disabled. Values: `pending`, `confirmed`, `expired`, `denied`, `refunded`. |
| `payment_provider`   | `VARCHAR(64)`      | NULL                                 | Payment gateway used. Values: `midtrans`, `xendit`, `mock`, NULL.                              |
| `payment_amount`     | `INTEGER`          | NULL                                 | Payment amount in the smallest currency unit (Indonesian Rupiah, no decimals). E.g., 10000 = Rp10,000. |
| `payment_reference`  | `VARCHAR(255)`     | NULL                                 | External reference/transaction ID from the payment gateway for reconciliation.                 |
| `created_at`         | `TIMESTAMPTZ`      | NOT NULL, DEFAULT `NOW()`            | Timestamp when the session was created (user touched the screen).                              |
| `completed_at`       | `TIMESTAMPTZ`      | NULL                                 | Timestamp when the session reached the REVEAL/PRINT state (product delivered to user).         |
| `cleared_at`         | `TIMESTAMPTZ`      | NULL                                 | Timestamp when session data was cleared (photos deleted, session reset).                        |

### 2.3 Constraints

```sql
-- Primary key
CONSTRAINT pk_kiosk_sessions PRIMARY KEY (id),

-- State must be one of the valid state machine values
CONSTRAINT chk_kiosk_sessions_state CHECK (
    state IN ('idle', 'payment', 'capture', 'processing', 'reveal', 'reset')
),

-- Payment status must be a valid value when not null
CONSTRAINT chk_kiosk_sessions_payment_status CHECK (
    payment_status IS NULL
    OR payment_status IN ('pending', 'confirmed', 'expired', 'denied', 'refunded')
),

-- Payment amount must be positive when set
CONSTRAINT chk_kiosk_sessions_payment_amount CHECK (
    payment_amount IS NULL OR payment_amount > 0
),

-- AI provider must be a known value when set
CONSTRAINT chk_kiosk_sessions_ai_provider CHECK (
    ai_provider_used IS NULL
    OR ai_provider_used IN ('openai', 'anthropic', 'google', 'ollama', 'fallback', 'mock')
),

-- Completed and cleared timestamps must be after created_at
CONSTRAINT chk_kiosk_sessions_completed_after_created CHECK (
    completed_at IS NULL OR completed_at >= created_at
),

CONSTRAINT chk_kiosk_sessions_cleared_after_created CHECK (
    cleared_at IS NULL OR cleared_at >= created_at
),

-- If payment is confirmed, payment_reference must be set
CONSTRAINT chk_kiosk_sessions_payment_ref CHECK (
    payment_status != 'confirmed'
    OR payment_reference IS NOT NULL
)
```

### 2.4 Indexes

```sql
-- Index for querying sessions by state (active sessions)
CREATE INDEX idx_kiosk_sessions_state ON kiosk_sessions (state);

-- Index for querying sessions by creation time (analytics, reporting)
CREATE INDEX idx_kiosk_sessions_created_at ON kiosk_sessions (created_at DESC);

-- Index for querying sessions that have not been cleared (cleanup jobs)
CREATE INDEX idx_kiosk_sessions_not_cleared ON kiosk_sessions (id) WHERE cleared_at IS NULL;

-- Index for querying sessions by payment status (reconciliation)
CREATE INDEX idx_kiosk_sessions_payment_status ON kiosk_sessions (payment_status) WHERE payment_status IS NOT NULL;

-- Composite index for finding active paid sessions
CREATE INDEX idx_kiosk_sessions_active_paid ON kiosk_sessions (state, payment_status) WHERE payment_status = 'confirmed';

-- Index for finding stale sessions (created but never completed)
CREATE INDEX idx_kiosk_sessions_stale ON kiosk_sessions (created_at) WHERE completed_at IS NULL AND created_at < NOW() - INTERVAL '10 minutes';
```

### 2.5 SQLAlchemy Model (Reference)

```python
class KioskSession(Base):
    __tablename__ = "kiosk_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    state = Column(String(32), nullable=False, default="idle")
    photo_path = Column(String(512), nullable=True)
    ai_response_text = Column(Text, nullable=True)
    ai_provider_used = Column(String(64), nullable=True)
    payment_status = Column(String(32), nullable=True)
    payment_provider = Column(String(64), nullable=True)
    payment_amount = Column(Integer, nullable=True)
    payment_reference = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cleared_at = Column(DateTime(timezone=True), nullable=True)

    analytics_events = relationship("AnalyticsEvent", back_populates="session")
    print_job = relationship("PrintJob", back_populates="session", uselist=False)
```

---

## 3. OperatorConfig

The `OperatorConfig` entity stores all operator-configurable settings as a key-value store. This approach allows flexible configuration without schema migrations when new settings are added.

### 3.1 Table Definition

**Table name:** `operator_configs`

### 3.2 Fields

| Field         | PostgreSQL Type    | Constraints                        | Description                                                                                   |
|---------------|--------------------|------------------------------------|-----------------------------------------------------------------------------------------------|
| `id`          | `SERIAL`           | PRIMARY KEY, AUTO INCREMENT        | Auto-incrementing integer identifier.                                                         |
| `key`         | `VARCHAR(255)`     | NOT NULL, UNIQUE                   | Configuration key. Unique identifier for this setting. Dot-notation for hierarchy, e.g., `ai.provider`, `printer.paper_width`. |
| `value`       | `TEXT`             | NOT NULL, DEFAULT `''`             | Configuration value stored as a string. Boolean values stored as `"true"`/`"false"`, integers as their string representation. |
| `category`    | `VARCHAR(32)`      | NOT NULL, DEFAULT `'general'`      | Configuration category for grouping in the admin dashboard. Values: `hardware`, `ai`, `payment`, `kiosk`, `general`. |
| `description` | `TEXT`             | NULL                               | Human-readable description of what this configuration key controls. Displayed as a tooltip or help text in the admin dashboard. |
| `updated_at`  | `TIMESTAMPTZ`      | NOT NULL, DEFAULT `NOW()`          | Timestamp of the last update to this configuration value.                                     |

### 3.3 Constraints

```sql
-- Primary key
CONSTRAINT pk_operator_configs PRIMARY KEY (id),

-- Key must be unique (no duplicate configuration keys)
CONSTRAINT uq_operator_configs_key UNIQUE (key),

-- Category must be a known value
CONSTRAINT chk_operator_configs_category CHECK (
    category IN ('hardware', 'ai', 'payment', 'kiosk', 'general')
)
```

### 3.4 Indexes

```sql
-- Unique index on key (also enforces uniqueness)
CREATE UNIQUE INDEX idx_operator_configs_key ON operator_configs (key);

-- Index for querying configs by category
CREATE INDEX idx_operator_configs_category ON operator_configs (category);
```

### 3.5 Standard Configuration Keys

The following configuration keys are used by the system. These are seeded during initial setup and can be modified through the admin dashboard.

| Key                               | Category   | Type     | Default Value              | Description                                                                 |
|-----------------------------------|------------|----------|----------------------------|-----------------------------------------------------------------------------|
| `ai.provider`                     | `ai`       | enum     | `mock`                     | AI provider: `openai`, `anthropic`, `google`, `ollama`, `mock`             |
| `ai.api_key`                      | `ai`       | string   | `''`                       | API key for the configured AI provider (stored encrypted at rest)           |
| `ai.model`                        | `ai`       | string   | `''`                       | Model identifier (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-2.0-flash`) |
| `ai.fallback_provider`            | `ai`       | enum     | `NULL`                     | Secondary AI provider to try if primary fails                              |
| `ai.fallback_api_key`             | `ai`       | string   | `''`                       | API key for the fallback AI provider                                       |
| `ai.system_prompt`                | `ai`       | text     | *(built-in default)*       | System prompt sent to the AI provider with the image                       |
| `ai.timeout_seconds`              | `ai`       | integer  | `30`                       | Timeout for AI API calls in seconds                                        |
| `payment.enabled`                 | `payment`  | boolean  | `false`                    | Whether payment is required before photo capture                            |
| `payment.provider`                | `payment`  | enum     | `mock`                     | Payment provider: `midtrans`, `xendit`, `mock`                             |
| `payment.server_key`              | `payment`  | string   | `''`                       | Server key for the payment gateway (stored encrypted at rest)              |
| `payment.client_key`              | `payment`  | string   | `''`                       | Client key for the payment gateway                                         |
| `payment.amount`                  | `payment`  | integer  | `10000`                    | Payment amount in Rupiah                                                   |
| `payment.timeout_seconds`         | `payment`  | integer  | `120`                      | QR code validity duration in seconds                                       |
| `payment.sandbox`                 | `payment`  | boolean  | `true`                     | Whether to use the sandbox/test environment                                |
| `payment.webhook_secret`          | `payment`  | string   | `''`                       | Webhook signature verification secret                                       |
| `printer.vendor_id`               | `hardware` | string   | `0x0000`                   | USB Vendor ID of the thermal printer (hex, with 0x prefix)                 |
| `printer.product_id`              | `hardware` | string   | `0x0000`                   | USB Product ID of the thermal printer (hex, with 0x prefix)                |
| `printer.paper_width`             | `hardware` | enum     | `58mm`                     | Paper width: `58mm` (384px) or `80mm` (576px)                              |
| `printer.dpi`                     | `hardware` | integer  | `203`                      | Printer resolution in dots per inch                                         |
| `camera.device_path`              | `hardware` | string   | `/dev/video0`              | V4L2 device path for the webcam                                            |
| `camera.resolution_width`         | `hardware` | integer  | `1280`                     | Capture resolution width in pixels                                          |
| `camera.resolution_height`        | `hardware` | integer  | `720`                      | Capture resolution height in pixels                                         |
| `camera.mjpeg`                    | `hardware` | boolean  | `true`                     | Whether to use MJPEG streaming for live preview (lower CPU usage)           |
| `kiosk.admin_pin`                 | `kiosk`    | string   | `0000`                     | Admin PIN for accessing the configuration dashboard (stored as hash)       |
| `kiosk.timezone`                  | `kiosk`    | string   | `Asia/Jakarta`             | Timezone for timestamps displayed on receipts                              |
| `kiosk.brand_name`                | `kiosk`    | string   | `VibePrint OS`             | Brand name displayed on the attract loop and receipt header                 |
| `kiosk.idle_timeout_seconds`      | `kiosk`    | integer  | `0`                        | Idle timeout in seconds (0 = no timeout, runs attract loop indefinitely)    |
| `kiosk.capture_countdown_seconds` | `kiosk`    | integer  | `3`                        | Countdown duration before photo capture                                     |
| `general.version`                 | `general`  | string   | *(auto-set on startup)*    | Current software version                                                   |

### 3.6 SQLAlchemy Model (Reference)

```python
class OperatorConfig(Base):
    __tablename__ = "operator_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(255), nullable=False, unique=True)
    value = Column(Text, nullable=False, default="")
    category = Column(String(32), nullable=False, default="general")
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
```

---

## 4. AnalyticsEvent

The `AnalyticsEvent` entity records discrete events that occur during kiosk sessions. This provides an append-only audit log for debugging, reporting, and operational monitoring. Events are lightweight and are inserted asynchronously to avoid impacting user-facing performance.

### 4.1 Table Definition

**Table name:** `analytics_events`

### 4.2 Fields

| Field        | PostgreSQL Type    | Constraints                          | Description                                                                                     |
|--------------|--------------------|--------------------------------------|-------------------------------------------------------------------------------------------------|
| `id`         | `UUID`             | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique identifier for the event.                                                                |
| `session_id` | `UUID`             | NULL, FOREIGN KEY REFERENCES `kiosk_sessions(id)` ON DELETE SET NULL | The session this event belongs to. NULL for system-level events not associated with a user session (e.g., startup, printer error). |
| `event_type` | `VARCHAR(64)`      | NOT NULL                              | The type of event that occurred. Must be one of the defined enum values.                       |
| `metadata`   | `JSONB`            | NOT NULL, DEFAULT `'{}'`              | Additional structured data about the event. Schema varies by event_type.                        |
| `timestamp`  | `TIMESTAMPTZ`      | NOT NULL, DEFAULT `NOW()`             | When the event occurred.                                                                         |

### 4.3 Event Type Enum Values

| Event Type            | Description                                                                 | Typical Metadata Fields                                                                                          |
|-----------------------|-----------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `session_start`       | User touched the screen, session created                                    | `{}`                                                                                                             |
| `payment_initiated`   | QR code generated and displayed to user                                      | `{ "provider": "midtrans", "amount": 10000, "order_id": "..." }`                                                 |
| `payment_confirmed`   | Payment webhook received, payment successful                                 | `{ "provider": "midtrans", "amount": 10000, "payment_ref": "...", "elapsed_ms": 45000 }`                         |
| `payment_expired`     | QR code timed out without payment                                            | `{ "provider": "midtrans", "amount": 10000, "timeout_seconds": 120 }`                                            |
| `payment_denied`      | Payment was attempted but declined                                           | `{ "provider": "midtrans", "reason": "insufficient_balance" }`                                                    |
| `capture_complete`    | Photo captured and saved to disk                                             | `{ "file_size_bytes": 245000, "resolution": "1280x720", "elapsed_ms": 5000 }`                                    |
| `ai_request_sent`     | AI analysis request sent to provider                                         | `{ "provider": "openai", "model": "gpt-4o", "image_size_bytes": 245000 }`                                         |
| `ai_response_received`| AI analysis response received successfully                                    | `{ "provider": "openai", "model": "gpt-4o", "response_length": 245, "tokens_used": 350, "elapsed_ms": 12000 }`    |
| `ai_request_failed`   | AI request failed (timeout, error, rate limit)                               | `{ "provider": "openai", "error": "timeout", "http_status": null, "elapsed_ms": 35000 }`                         |
| `ai_fallback_used`    | Fallback template used because AI provider failed                             | `{ "primary_provider": "openai", "primary_error": "timeout", "template_index": 7 }`                               |
| `print_started`       | Print job sent to the thermal printer                                        | `{ "paper_width": "58mm", "has_image": true, "has_text": true }`                                                  |
| `print_complete`      | Printer confirmed successful print                                           | `{ "paper_width": "58mm", "elapsed_ms": 8000 }`                                                                   |
| `print_failed`        | Print job failed (printer error, out of paper, disconnect)                   | `{ "error": "paper_out", "retry_count": 0, "printer_status": "offline" }`                                         |
| `error`               | Generic error event for unexpected failures                                  | `{ "source": "camera", "error": "DeviceNotFoundError", "stack_trace": "..." }`                                   |
| `session_timeout`     | Session timed out in a non-idle state without user completion                | `{ "state_at_timeout": "payment", "elapsed_ms": 120000 }`                                                         |
| `session_reset`       | Session data cleared, returning to idle                                      | `{ "had_payment": true, "had_print": true, "cleanup_success": true }`                                             |

### 4.4 Constraints

```sql
-- Primary key
CONSTRAINT pk_analytics_events PRIMARY KEY (id),

-- Foreign key to kiosk_sessions (SET NULL on session deletion)
CONSTRAINT fk_analytics_events_session FOREIGN KEY (session_id)
    REFERENCES kiosk_sessions(id)
    ON DELETE SET NULL,

-- Event type must be a known value
CONSTRAINT chk_analytics_events_type CHECK (
    event_type IN (
        'session_start',
        'payment_initiated',
        'payment_confirmed',
        'payment_expired',
        'payment_denied',
        'capture_complete',
        'ai_request_sent',
        'ai_response_received',
        'ai_request_failed',
        'ai_fallback_used',
        'print_started',
        'print_complete',
        'print_failed',
        'error',
        'session_timeout',
        'session_reset'
    )
)
```

### 4.5 Indexes

```sql
-- Index for querying events by session
CREATE INDEX idx_analytics_events_session_id ON analytics_events (session_id) WHERE session_id IS NOT NULL;

-- Index for querying events by type (e.g., all print failures)
CREATE INDEX idx_analytics_events_event_type ON analytics_events (event_type);

-- Index for time-range queries (reporting, dashboards)
CREATE INDEX idx_analytics_events_timestamp ON analytics_events (timestamp DESC);

-- Composite index for session event timeline (get all events for a session in order)
CREATE INDEX idx_analytics_events_session_timestamp ON analytics_events (session_id, timestamp DESC) WHERE session_id IS NOT NULL;

-- GIN index for JSONB metadata queries (find events with specific metadata)
CREATE INDEX idx_analytics_events_metadata ON analytics_events USING GIN (metadata);

-- Partial index for error events (quick access for monitoring)
CREATE INDEX idx_analytics_events_errors ON analytics_events (timestamp DESC) WHERE event_type IN ('error', 'print_failed', 'ai_request_failed', 'session_timeout');
```

### 4.6 SQLAlchemy Model (Reference)

```python
class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("kiosk_sessions.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(64), nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=False, default=dict)
    timestamp = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    session = relationship("KioskSession", back_populates="analytics_events")
```

---

## 5. PrintJob

The `PrintJob` entity tracks the lifecycle of a single print operation. It records the status, retry attempts, and any errors encountered. Each session has at most one print job.

### 5.1 Table Definition

**Table name:** `print_jobs`

### 5.2 Fields

| Field           | PostgreSQL Type    | Constraints                          | Description                                                                                     |
|-----------------|--------------------|--------------------------------------|-------------------------------------------------------------------------------------------------|
| `id`            | `UUID`             | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique identifier for the print job.                                                            |
| `session_id`    | `UUID`             | NOT NULL, FOREIGN KEY REFERENCES `kiosk_sessions(id)` ON DELETE CASCADE, UNIQUE | The session this print job belongs to. One-to-one relationship with KioskSession.             |
| `status`        | `VARCHAR(32)`      | NOT NULL, DEFAULT `'pending'`        | Current status of the print job. Values: `pending`, `printing`, `complete`, `failed`.          |
| `retry_count`   | `INTEGER`          | NOT NULL, DEFAULT `0`, CHECK `>= 0`  | Number of retry attempts for this print job. Incremented on each retry. Max retries: 2.        |
| `error_message` | `TEXT`             | NULL                                 | Error message if the print job failed. Set on the last retry attempt.                           |
| `created_at`    | `TIMESTAMPTZ`      | NOT NULL, DEFAULT `NOW()`            | When the print job was created.                                                                |
| `completed_at`  | `TIMESTAMPTZ`      | NULL                                 | When the print job reached a terminal state (`complete` or `failed`).                           |

### 5.3 Constraints

```sql
-- Primary key
CONSTRAINT pk_print_jobs PRIMARY KEY (id),

-- Foreign key to kiosk_sessions with cascade delete
CONSTRAINT fk_print_jobs_session FOREIGN KEY (session_id)
    REFERENCES kiosk_sessions(id)
    ON DELETE CASCADE,

-- Each session can have at most one print job
CONSTRAINT uq_print_jobs_session UNIQUE (session_id),

-- Status must be a valid value
CONSTRAINT chk_print_jobs_status CHECK (
    status IN ('pending', 'printing', 'complete', 'failed')
),

-- Retry count must be non-negative
CONSTRAINT chk_print_jobs_retry_count CHECK (retry_count >= 0),

-- Completed timestamp must be after created_at
CONSTRAINT chk_print_jobs_completed_after_created CHECK (
    completed_at IS NULL OR completed_at >= created_at
)
```

### 5.4 Indexes

```sql
-- Index for querying active/recent print jobs
CREATE INDEX idx_print_jobs_status ON print_jobs (status);

-- Index for time-range queries
CREATE INDEX idx_print_jobs_created_at ON print_jobs (created_at DESC);

-- Index for finding failed print jobs (operator alerting)
CREATE INDEX idx_print_jobs_failed ON print_jobs (created_at DESC) WHERE status = 'failed';
```

### 5.5 Print Job Lifecycle

```
    +----------+         +----------+         +----------+
    | PENDING  |-------->| PRINTING |-------->| COMPLETE |
    +----+-----+         +----+-----+         +----------+
         |                    |
         |                    | printer error
         |                    v
         |              +----------+
         |              | FAILED   |
         |              +----+-----+
         |                   |
         | retry < max        | retry >= max
         | (retry_count++)    v
         |              (terminal state)
         |
         | (created, not yet sent to printer)
         v
    (initial state)
```

**Retry logic:**
- When a print job fails, if `retry_count < 2` (max retries configurable via OperatorConfig), the status is set back to `pending` and `retry_count` is incremented.
- Before retry, the system waits 2 seconds and re-checks the printer connection.
- If the printer is still unavailable after max retries, the status is set to `failed` with the error message.
- Failed print jobs are visible in the admin dashboard and trigger an operator alert.

### 5.6 SQLAlchemy Model (Reference)

```python
class PrintJob(Base):
    __tablename__ = "print_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("kiosk_sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(32), nullable=False, default="pending")
    retry_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    session = relationship("KioskSession", back_populates="print_job")
```

---

## 6. Privacy Model

### 6.1 Core Principle

VibePrint OS is designed with privacy as a primary concern. The system captures photographic images of users in public spaces and processes them through AI services. The privacy model ensures that personal data is retained for the minimum time necessary and is not used for any purpose beyond delivering the immediate service.

### 6.2 Data Retention Policy

| Data Type          | Storage Location    | Retention Period          | Deletion Method                          |
|--------------------|---------------------|--------------------------|------------------------------------------|
| Captured photo     | `/tmp/sessions/{session_id}/` | Until session completes (RESET state) | Files deleted from disk during RESET state |
| Dithered bitmap    | `/tmp/sessions/{session_id}/` | Until session completes   | Files deleted from disk during RESET state |
| AI response text   | PostgreSQL `kiosk_sessions.ai_response_text` | 30 days after session creation | Automated cleanup job runs daily, deletes sessions older than 30 days |
| Session metadata   | PostgreSQL `kiosk_sessions` | 30 days after session creation | Automated cleanup job runs daily |
| Analytics events   | PostgreSQL `analytics_events` | 90 days after event creation | Automated cleanup job runs daily |
| Payment records    | PostgreSQL `kiosk_sessions` (payment fields) | 90 days after session creation | Required for reconciliation; retained longer than session data |
| Operator config    | PostgreSQL `operator_configs` | Indefinite (operator-controlled) | Deleted only when operator resets configuration |
| Print job records  | PostgreSQL `print_jobs` | 30 days after session creation | Cascading delete with session |

### 6.3 Photo Handling

1. **Capture:** Photo is saved to a temporary directory on the local filesystem (`/tmp/sessions/{session_id}/photo.jpg`). This directory is created with restrictive permissions (owner-read-write only: `chmod 700`).
2. **Processing:** The photo is read from disk, converted to base64, and sent to the AI provider. The AI provider's own privacy policy governs what happens to the image on their servers.
3. **Printing:** The photo is dithered and sent to the thermal printer as ESC/POS commands. The dithered bitmap is also stored temporarily in `/tmp/sessions/{session_id}/dithered.bmp`.
4. **Cleanup:** During the RESET state, the entire `/tmp/sessions/{session_id}/` directory is recursively deleted. This includes the original photo, any intermediate files, and the dithered bitmap.
5. **Database reference:** The `photo_path` field in the `kiosk_sessions` table records where the photo was stored, but after cleanup, the file no longer exists. The path itself is retained in the database for audit purposes until the session record is purged.

### 6.4 AI Provider Data Transmission

- Photos are transmitted to the AI provider over HTTPS (TLS 1.2+)
- The system does not store AI provider responses beyond what is needed for the current session
- The `ai_provider_used` field in the database records which provider processed the image but does not store any image data sent to the provider
- Operators should review the privacy policy of their chosen AI provider to understand how images are handled on the provider's infrastructure

### 6.5 No Facial Recognition or Biometric Storage

- VibePrint OS does not perform facial recognition, face detection beyond what the AI vision model inherently does, or store any biometric data
- No user identification, tracking, or profiling is performed
- Sessions are anonymous; no personally identifiable information (PII) is collected beyond the photo itself
- The AI prompt is designed to analyze the photo for "vibe reading" purposes only and is not configured to extract or store identifying information

### 6.6 Automated Cleanup Job

A background task runs daily to purge expired data:

```
1. Delete all kiosk_sessions where created_at < NOW() - 30 days
   (cascading delete removes associated analytics_events and print_jobs)

2. Delete all analytics_events where timestamp < NOW() - 90 days
   (catches any orphaned events from already-deleted sessions)

3. Delete any residual files in /tmp/sessions/ where directory mtime < NOW() - 1 hour
   (catches cleanup failures from crashed or interrupted sessions)
```

The retention periods (30 days, 90 days) are configurable via OperatorConfig keys `general.session_retention_days` and `general.analytics_retention_days`.

### 6.7 Compliance Considerations

- The kiosk should display a visible privacy notice on the attract loop or near the physical kiosk, informing users that their photo will be temporarily captured and processed
- The notice should state that photos are not stored permanently and are deleted after the session
- Operators are responsible for complying with local privacy regulations (e.g., Indonesia's PDP Law / UU PDP) regarding the use of cameras in public spaces
- The admin dashboard should provide a way for operators to export or delete all stored data upon request
