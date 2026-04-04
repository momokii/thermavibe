"""Payment provider abstract base class."""

# Defines the interface for all payment providers:
# - async create_qr(session_id, amount, currency) -> QRResponse
# - async verify_webhook(payload) -> WebhookResult
# - async check_status(payment_id) -> PaymentStatus
