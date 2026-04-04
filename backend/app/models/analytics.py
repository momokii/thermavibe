"""Analytics and print job ORM models."""

# AnalyticsEvent model:
# - id: UUID primary key
# - session_id: UUID foreign key (nullable)
# - event_type: Enum (session_start, payment_initiated, payment_confirmed,
#               capture_complete, ai_request_sent, ai_response_received,
#               print_started, print_complete, print_failed, error, session_timeout)
# - metadata: JSONB
# - timestamp: DateTime

# PrintJob model:
# - id: UUID primary key
# - session_id: UUID foreign key
# - status: Enum (pending, printing, complete, failed)
# - retry_count: Integer
# - error_message: Text
# - created_at, completed_at: DateTime
