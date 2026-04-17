"""Application configuration via Pydantic BaseSettings."""

from pathlib import Path

from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_env: str = "development"
    app_secret_key: str = "change-me-in-production"
    app_debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://thermavibe:thermavibe@localhost:5432/thermavibe"

    # AI Providers
    ai_provider: str = "openai"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ai_model: str = "gpt-4o"
    ai_system_prompt: str = "You are a witty vibe reader."

    # Payment
    payment_enabled: bool = False
    payment_provider: str = "mock"
    midtrans_server_key: str = ""
    midtrans_is_production: bool = False
    xendit_api_key: str = ""
    payment_amount: int = 5000
    payment_currency: str = "IDR"
    payment_timeout_seconds: int = 120

    # Printer
    printer_vendor_id: str = "0x04b8"
    printer_product_id: str = "0x0e15"
    printer_paper_width: int = 384

    # Camera
    camera_device_index: int = 0
    camera_resolution_width: int = 1280
    camera_resolution_height: int = 720

    # Kiosk
    kiosk_idle_timeout_seconds: int = 10
    kiosk_capture_countdown_seconds: int = 3
    kiosk_capture_time_limit_seconds: int = 60
    kiosk_processing_timeout_seconds: int = 60
    kiosk_reveal_display_seconds: int = 10

    # Admin
    admin_pin: str = "1234"

    # CORS
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:8000"

    # Rate Limiting
    rate_limit_max_requests: int = 60
    rate_limit_window_seconds: int = 60

    model_config = {"env_file": str(BACKEND_DIR / ".env"), "env_file_encoding": "utf-8"}


settings = Settings()
