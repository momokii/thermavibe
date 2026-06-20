"""HTML landing page generator for digital sharing.

Renders the mobile-friendly page that wraps the composite image with a
download button and operator branding. Pure string composition — no Jinja2,
no external assets — so the page renders even when the kiosk is offline.
"""

from __future__ import annotations

from html import escape

from app.core.config import Settings


def render_share_page(
    token: str,
    session_id: str | None,
    settings: Settings,
    expired: bool = False,
) -> str:
    """Return the HTML string for the share landing page.

    Args:
        token: Share token (used to build the image URL).
        session_id: Validated session id, or None when the token is invalid/expired.
        settings: App settings (provides branding fields).
        expired: When True, render the expired-link variant with no image.

    Returns:
        Complete HTML document as a string.
    """
    brand = settings.share_brand_name or 'VibePrint'
    handle = settings.share_brand_handle
    color = settings.share_brand_color or '#000000'
    image_url = f'/api/v1/kiosk/share/{token}/image'

    title = f'{brand} — Your Photo'
    handle_line = (
        f'<div class="handle">Tag {escape(handle)} — we&apos;d love to see it!</div>'
        if handle
        else ''
    )

    if expired or session_id is None:
        body = (
            '<div class="card">'
            '<div class="expired-icon">🔗</div>'
            '<h1>This link has expired</h1>'
            '<p>Share links expire a few minutes after the photo is printed.</p>'
            '<p class="hint">Ask the kiosk attendant to reprint your photo to get a fresh link.</p>'
            '</div>'
        )
    else:
        body = (
            '<div class="card">'
            f'<h1>{escape(brand)}</h1>'
            f'<img src="{escape(image_url)}" alt="Your photobooth strip" />'
            '<a class="download" href="{url}" download>Download photo</a>'
            '<p class="hint">If Download doesn&apos;t work, long-press the image and tap Save Image.</p>'
            '{handle}'
            '</div>'
        ).format(url=escape(image_url, quote=True), handle=handle_line)

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>{escape(title)}</title>
<style>
  * {{ box-sizing: border-box; }}
  html, body {{
    margin: 0;
    padding: 0;
    background: #f5f5f5;
    color: #111;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }}
  body {{
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }}
  .card {{
    background: #fff;
    border-radius: 16px;
    padding: 24px;
    margin: 16px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    text-align: center;
  }}
  h1 {{
    font-size: 1.25rem;
    margin: 0 0 16px;
    color: {escape(color, quote=True)};
  }}
  img {{
    width: 100%;
    height: auto;
    border-radius: 8px;
    display: block;
    margin: 0 0 16px;
  }}
  .download {{
    display: block;
    background: {escape(color, quote=True)};
    color: #fff;
    text-decoration: none;
    padding: 14px 16px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 1rem;
    margin-bottom: 12px;
    -webkit-tap-highlight-color: transparent;
  }}
  .hint {{
    font-size: 0.85rem;
    color: #666;
    margin: 0 0 8px;
    line-height: 1.4;
  }}
  .handle {{
    font-size: 0.9rem;
    color: #444;
    margin-top: 12px;
  }}
  .expired-icon {{
    font-size: 2.5rem;
    margin-bottom: 8px;
  }}
</style>
</head>
<body>
{body}
</body>
</html>"""
