"""Pydantic schemas for configuration API endpoints.

Covers individual config read/update operations used by the admin dashboard.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ConfigEntry(BaseModel):
    """A single configuration key-value entry."""

    key: str = Field(..., description='Configuration key (dot-notation)')
    value: str = Field(..., description='Configuration value as string')
    category: str = Field(..., description='Category grouping')
    description: str | None = Field(None, description='Human-readable description')
    updated_at: datetime | None = None

    model_config = {'from_attributes': True}
