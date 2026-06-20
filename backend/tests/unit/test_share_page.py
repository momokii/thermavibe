"""Unit tests for the HTML landing page generator (`app.services.share_page`).

The integration tests in `tests/integration/test_share_endpoints.py` already
exercise the rendered HTML through the live endpoint. These tests focus on
the renderer's string composition directly: brand substitution, image URL
shape, expired-vs-active branching, and the viewport meta required for
mobile rendering.
"""

from __future__ import annotations

from app.core.config import Settings
from app.services.share_page import render_share_page


def _settings(**overrides) -> Settings:
    """Build a Settings instance with share-brand fields overridden."""
    base = {
        'share_brand_name': 'TestBrand',
        'share_brand_handle': '@testhandle',
        'share_brand_color': '#abcdef',
    }
    base.update(overrides)
    return Settings(**base)


def test_active_page_contains_image_download_and_viewport():
    out = render_share_page('tok123', 'session-abc', _settings())
    assert '<meta name="viewport"' in out
    assert '/api/v1/kiosk/share/tok123/image' in out
    assert 'download' in out
    assert 'TestBrand' in out


def test_active_page_includes_brand_handle_when_set():
    out = render_share_page('tok123', 'session-abc', _settings())
    assert '@testhandle' in out


def test_active_page_omits_handle_when_unset():
    out = render_share_page('tok123', 'session-abc', _settings(share_brand_handle=''))
    assert '@testhandle' not in out


def test_expired_page_omits_image_tag():
    out = render_share_page('tok123', None, _settings(), expired=True)
    assert '<img' not in out
    assert 'expired' in out.lower()


def test_invalid_session_renders_expired_variant():
    """When session_id is None (token validation failed), the expired branch is used."""
    out = render_share_page('tok123', None, _settings())
    assert '<img' not in out
    assert 'expired' in out.lower()


def test_brand_color_applied_to_html():
    out = render_share_page('tok123', 'session-abc', _settings(share_brand_color='#ff0000'))
    assert '#ff0000' in out


def test_brand_name_falls_back_to_default_when_unset():
    out = render_share_page('tok123', 'session-abc', _settings(share_brand_name=''))
    assert 'VibePrint' in out


def test_html_escapes_brand_name_with_special_chars():
    out = render_share_page('tok123', 'session-abc', _settings(share_brand_name='<script>x</script>'))
    assert '<script>' not in out  # must be escaped
    assert '&lt;script&gt;' in out
