"""Device configuration ORM model.

Tracks USB devices (cameras and printers) connected to the kiosk.
"""

from __future__ import annotations

import enum

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import INTEGER, TIMESTAMP

from app.core.database import Base


class DeviceType(str, enum.Enum):
    """Valid device types."""

    CAMERA = 'camera'
    PRINTER = 'printer'


class Device(Base):
    """USB device configuration ORM model.

    Tracks USB devices (cameras and printers) connected to the kiosk.

    Attributes:
        id: Serial integer primary key.
        device_type: Type of device (camera or printer).
        name: Human-readable device name.
        vendor_id: USB vendor ID in hex.
        product_id: USB product ID in hex.
        capabilities: Device capabilities as JSONB.
        is_active: Whether the device is currently active.
        last_seen_at: Timestamp when the device was last detected.
    """

    __tablename__ = 'devices'

    id: Mapped[int] = mapped_column(
        INTEGER,
        primary_key=True,
        autoincrement=True,
    )
    device_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    capabilities: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_seen_at: Mapped[str | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __mapper_args__ = {'eager_defaults': False}
