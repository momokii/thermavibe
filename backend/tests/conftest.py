"""Pytest fixtures for backend testing."""

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
