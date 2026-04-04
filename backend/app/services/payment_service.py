"""Payment gateway abstraction service — QRIS support."""

# Responsibilities:
# - Dispatch to configured payment provider (Midtrans, Xendit, Mock)
# - Generate QRIS QR code for payment
# - Process payment gateway webhooks
# - Track payment status per session
# - Handle payment timeout
