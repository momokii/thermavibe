"""Unit tests for config service -- seeding, reading, and updating configuration."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.configuration import ConfigCategory, OperatorConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_db() -> AsyncMock:
    """Create a mock AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


def _mock_scalar_result(value):
    """Create a mock result that returns value from scalar_one_or_none()."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_mock_config(key: str, value: str, category: str, config_id: int = 1) -> MagicMock:
    """Create a mock OperatorConfig row."""
    config = MagicMock(spec=OperatorConfig)
    config.id = config_id
    config.key = key
    config.value = value
    config.category = category
    config.description = f'Description for {key}'
    return config


# ---------------------------------------------------------------------------
# seed_default_configs
# ---------------------------------------------------------------------------


class TestSeedDefaultConfigs:
    """Tests for seed_default_configs()."""

    async def test_creates_entries(self):
        """seed_default_configs creates entries when none exist."""
        db = _make_mock_db()
        # All lookups return None (no existing configs)
        db.execute.return_value = _mock_scalar_result(None)

        from app.services.config_service import seed_default_configs

        count = await seed_default_configs(db)

        assert count > 0
        assert db.add.call_count > 0
        db.commit.assert_awaited_once()

    async def test_idempotent(self):
        """seed_default_configs returns 0 on second call when all configs exist."""
        db = _make_mock_db()

        # Return existing config for every lookup
        existing = _make_mock_config('any_key', 'any_value', 'hardware')
        db.execute.return_value = _mock_scalar_result(existing)

        from app.services.config_service import seed_default_configs

        count = await seed_default_configs(db)

        assert count == 0
        db.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# get_all_configs
# ---------------------------------------------------------------------------


class TestGetAllConfigs:
    """Tests for get_all_configs()."""

    async def test_returns_empty_dict_when_none(self):
        """get_all_configs returns empty dict when no configs exist."""
        db = _make_mock_db()

        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        db.execute.return_value = result_mock

        from app.services.config_service import get_all_configs

        result = await get_all_configs(db)

        assert result == {}

    async def test_returns_categories_after_seeding(self):
        """get_all_configs returns configs grouped by category."""
        db = _make_mock_db()

        configs = [
            _make_mock_config('printer_vendor_id', '0x04b8', ConfigCategory.HARDWARE),
            _make_mock_config('printer_product_id', '0x0e15', ConfigCategory.HARDWARE),
            _make_mock_config('ai_provider', 'openai', ConfigCategory.AI),
            _make_mock_config('payment_enabled', 'false', ConfigCategory.PAYMENT),
        ]

        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = configs
        db.execute.return_value = result_mock

        from app.services.config_service import get_all_configs

        result = await get_all_configs(db)

        assert ConfigCategory.HARDWARE in result
        assert result[ConfigCategory.HARDWARE]['printer_vendor_id'] == '0x04b8'
        assert ConfigCategory.AI in result
        assert result[ConfigCategory.AI]['ai_provider'] == 'openai'
        assert ConfigCategory.PAYMENT in result


# ---------------------------------------------------------------------------
# get_configs_by_category
# ---------------------------------------------------------------------------


class TestGetConfigsByCategory:
    """Tests for get_configs_by_category()."""

    async def test_returns_specific_category(self):
        """get_configs_by_category returns only configs for the requested category."""
        db = _make_mock_db()

        configs = [
            _make_mock_config('printer_vendor_id', '0x04b8', ConfigCategory.HARDWARE),
            _make_mock_config('camera_device_index', '0', ConfigCategory.HARDWARE),
        ]

        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = configs
        db.execute.return_value = result_mock

        from app.services.config_service import get_configs_by_category

        result = await get_configs_by_category(db, ConfigCategory.HARDWARE)

        assert len(result) == 2
        assert result['printer_vendor_id'] == '0x04b8'
        assert result['camera_device_index'] == '0'

    async def test_returns_empty_for_nonexistent_category(self):
        """get_configs_by_category returns empty dict for category with no configs."""
        db = _make_mock_db()

        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        db.execute.return_value = result_mock

        from app.services.config_service import get_configs_by_category

        result = await get_configs_by_category(db, 'nonexistent')

        assert result == {}


# ---------------------------------------------------------------------------
# update_config
# ---------------------------------------------------------------------------


class TestUpdateConfig:
    """Tests for update_config()."""

    async def test_update_existing_key(self):
        """update_config updates value of an existing config key."""
        db = _make_mock_db()

        # First execute: find existing config
        existing = _make_mock_config('printer_vendor_id', '0x04b8', ConfigCategory.HARDWARE)
        db.execute.return_value = _mock_scalar_result(existing)

        # Second execute (inside get_configs_by_category after commit)
        configs = [_make_mock_config('printer_vendor_id', '0xNEW', ConfigCategory.HARDWARE)]
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = configs

        call_count = 0

        def execute_side_effect(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(existing)
            return result_mock

        db.execute.side_effect = execute_side_effect

        from app.services.config_service import update_config

        result = await update_config(db, ConfigCategory.HARDWARE, {'printer_vendor_id': '0xNEW'})

        assert existing.value == '0xNEW'
        db.commit.assert_awaited()

    async def test_create_new_key(self):
        """update_config creates a new config entry when key does not exist."""
        db = _make_mock_db()

        # Execute returns None for non-existing key
        configs = [_make_mock_config('new_key', 'new_value', ConfigCategory.HARDWARE)]
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = configs

        call_count = 0

        def execute_side_effect(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(None)
            return result_mock

        db.execute.side_effect = execute_side_effect

        from app.services.config_service import update_config

        result = await update_config(db, ConfigCategory.HARDWARE, {'new_key': 'new_value'})

        db.add.assert_called()
        db.commit.assert_awaited()


# ---------------------------------------------------------------------------
# DEFAULT_CONFIGS structure
# ---------------------------------------------------------------------------


class TestDefaultConfigs:
    """Verify DEFAULT_CONFIGS structure."""

    def test_has_five_categories(self):
        """DEFAULT_CONFIGS should have exactly 5 categories."""
        from app.services.config_service import DEFAULT_CONFIGS

        assert len(DEFAULT_CONFIGS) == 5

    def test_has_all_expected_categories(self):
        """DEFAULT_CONFIGS should contain hardware, ai, payment, kiosk, and general."""
        from app.services.config_service import DEFAULT_CONFIGS

        expected = {
            ConfigCategory.HARDWARE,
            ConfigCategory.AI,
            ConfigCategory.PAYMENT,
            ConfigCategory.KIOSK,
            ConfigCategory.GENERAL,
        }
        assert set(DEFAULT_CONFIGS.keys()) == expected

    def test_each_category_has_keys(self):
        """Each category in DEFAULT_CONFIGS should have at least one key."""
        from app.services.config_service import DEFAULT_CONFIGS

        for category, keys in DEFAULT_CONFIGS.items():
            assert len(keys) > 0, f'Category {category} has no keys'
            for key, config in keys.items():
                assert 'value' in config, f'Key {category}.{key} missing value'
                assert 'description' in config, f'Key {category}.{key} missing description'
