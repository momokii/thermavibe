"""Kiosk session ORM model."""

# KioskSession model:
# - id: UUID primary key
# - state: Enum (idle, payment, capture, processing, reveal, reset)
# - photo_path: String (temporary file path)
# - ai_response_text: Text
# - ai_provider_used: String
# - payment_status: Enum (none, pending, confirmed, failed)
# - payment_provider: String
# - payment_amount: Integer
# - payment_reference: String
# - created_at, completed_at, cleared_at: DateTime
