"""Payment ORM model."""

# Payment model fields:
# - id: UUID primary key
# - session_id: UUID foreign key (KioskSession)
# - provider: String (midtrans, xendit, mock)
# - provider_payment_id: String
# - amount: Integer
# - currency: String (default IDR)
# - status: Enum (pending, paid, expired, failed, refunded)
# - qr_code_url: String
# - qr_string: Text
# - paid_at: DateTime (nullable)
# - created_at: DateTime
# - expires_at: DateTime
