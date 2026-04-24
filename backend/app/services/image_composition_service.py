"""Image composition service for photobooth strip generation.

Uses PIL/Pillow to compose multiple photos into a themed strip.
Generates high-res output (1200px wide) suitable for digital download
and scales down for thermal printing (384px wide).
"""

from __future__ import annotations

import io
import os
import tempfile
from datetime import datetime, timezone
from uuid import UUID

import structlog
from PIL import Image, ImageDraw, ImageFont

logger = structlog.get_logger(__name__)

# High-res output dimensions
STRIP_WIDTH = 1200
PHOTO_SIZE = 1100  # Each photo slot is square
TOP_BANNER_HEIGHT = 120
BOTTOM_MARGIN = 80
DIVIDER_HEIGHT = 30
PHOTO_GAP = 20

# Thumbnail size for admin previews
THUMBNAIL_WIDTH = 300


def compose_photobooth_strip(
    photo_paths: list[str],
    theme_config: dict,
    layout_rows: int,
    session_id: UUID | None = None,
    watermark_text: str | None = None,
) -> tuple[str, str]:
    """Compose a photobooth strip image from individual photos.

    Args:
        photo_paths: Ordered list of photo file paths (one per slot).
        theme_config: Theme configuration dict (from PhotoboothTheme.config).
        layout_rows: Number of photo rows (1-4).
        session_id: Optional session ID for filename.
        watermark_text: Optional watermark text override.

    Returns:
        Tuple of (composite_path, thumbnail_path).
    """
    bg = theme_config.get('background', {})
    slot_cfg = theme_config.get('photo_slot', {})
    deco_cfg = theme_config.get('decorations', {})
    font_cfg = theme_config.get('font', {})
    wm_cfg = theme_config.get('watermark', {})

    # Calculate canvas dimensions
    total_photo_height = layout_rows * PHOTO_SIZE + (layout_rows - 1) * PHOTO_GAP
    canvas_height = TOP_BANNER_HEIGHT + total_photo_height + BOTTOM_MARGIN

    # Create canvas with background
    canvas = _create_background(STRIP_WIDTH, canvas_height, bg)

    # Draw top banner
    if deco_cfg.get('top_banner', True):
        _draw_banner(
            canvas,
            deco_cfg.get('banner_text', 'VibePrint'),
            font_cfg,
            TOP_BANNER_HEIGHT,
        )

    # Place photos
    padding = slot_cfg.get('padding', 8)
    photo_x = (STRIP_WIDTH - PHOTO_SIZE) // 2

    for i, photo_path in enumerate(photo_paths):
        photo_y = TOP_BANNER_HEIGHT + i * (PHOTO_SIZE + PHOTO_GAP)
        _place_photo(
            canvas,
            photo_path,
            photo_x,
            photo_y,
            PHOTO_SIZE,
            PHOTO_SIZE,
            slot_cfg,
        )

        # Draw divider between photos
        if i < layout_rows - 1 and deco_cfg.get('divider_style', 'line') != 'none':
            divider_y = photo_y + PHOTO_SIZE + PHOTO_GAP // 2
            _draw_divider(canvas, divider_y, deco_cfg)

    # Draw date at bottom
    date_fmt = deco_cfg.get('date_format', '%Y-%m-%d')
    date_text = datetime.now(timezone.utc).strftime(date_fmt)
    _draw_date(canvas, date_text, canvas_height, font_cfg)

    # Apply watermark
    if wm_cfg.get('enabled') or watermark_text:
        _draw_watermark(
            canvas,
            watermark_text or wm_cfg.get('text', ''),
            wm_cfg.get('opacity', 0.3),
            font_cfg,
        )

    # Save composite
    prefix = str(session_id)[:8] if session_id else 'strip'
    composite_path = os.path.join(tempfile.gettempdir(), f'vibeprint_composite_{prefix}.jpg')
    canvas.save(composite_path, 'JPEG', quality=95)

    # Generate thumbnail
    thumb_height = int(THUMBNAIL_WIDTH * canvas_height / STRIP_WIDTH)
    thumbnail = canvas.resize((THUMBNAIL_WIDTH, thumb_height), Image.Resampling.LANCZOS)
    thumbnail_path = os.path.join(tempfile.gettempdir(), f'vibeprint_thumb_{prefix}.jpg')
    thumbnail.save(thumbnail_path, 'JPEG', quality=85)

    logger.info(
        'composite_generated',
        composite_path=composite_path,
        layout_rows=layout_rows,
        canvas_size=f'{STRIP_WIDTH}x{canvas_height}',
    )

    return composite_path, thumbnail_path


def _create_background(
    width: int,
    height: int,
    bg_config: dict,
) -> Image.Image:
    """Create the strip background canvas.

    Args:
        width: Canvas width.
        height: Canvas height.
        bg_config: Background configuration.

    Returns:
        PIL Image with background applied.
    """
    canvas = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(canvas)

    bg_type = bg_config.get('type', 'solid')

    if bg_type == 'gradient':
        start_color = _hex_to_rgb(bg_config.get('gradient_start', '#1a1a2e'))
        end_color = _hex_to_rgb(bg_config.get('gradient_end', '#16213e'))
        for y in range(height):
            ratio = y / max(height - 1, 1)
            r = int(start_color[0] + (end_color[0] - start_color[0]) * ratio)
            g = int(start_color[1] + (end_color[1] - start_color[1]) * ratio)
            b = int(start_color[2] + (end_color[2] - start_color[2]) * ratio)
            draw.line([(0, y), (width, y)], fill=(r, g, b))
    else:
        color = _hex_to_rgb(bg_config.get('color', '#000000'))
        draw.rectangle([(0, 0), (width, height)], fill=color)

    return canvas


def _draw_banner(
    canvas: Image.Image,
    text: str,
    font_cfg: dict,
    banner_height: int,
) -> None:
    """Draw the top banner text on the canvas."""
    draw = ImageDraw.Draw(canvas)
    font = _get_font(font_cfg, size=40)
    color = _hex_to_rgb(font_cfg.get('color', '#ffffff'))

    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    x = (canvas.width - text_width) // 2
    y = (banner_height - (bbox[3] - bbox[1])) // 2
    draw.text((x, y), text, fill=color, font=font)


def _place_photo(
    canvas: Image.Image,
    photo_path: str,
    x: int,
    y: int,
    width: int,
    height: int,
    slot_cfg: dict,
) -> None:
    """Load, crop, and place a photo into the strip."""
    try:
        img = Image.open(photo_path)
    except Exception:
        logger.warning('photo_load_failed', path=photo_path)
        # Draw placeholder
        draw = ImageDraw.Draw(canvas)
        draw.rectangle([(x, y), (x + width, y + height)], fill='#333333')
        return

    # Center-crop to square
    img = _center_crop(img, width, height)

    border_width = slot_cfg.get('border_width', 4)
    border_color = _hex_to_rgb(slot_cfg.get('border_color', '#ffffff'))
    padding = slot_cfg.get('padding', 8)

    # Draw border
    if border_width > 0:
        draw = ImageDraw.Draw(canvas)
        bx = x - padding - border_width
        by = y - padding - border_width
        bw = width + 2 * (padding + border_width)
        bh = height + 2 * (padding + border_width)
        border_radius = slot_cfg.get('border_radius', 0)
        if border_radius > 0:
            draw.rounded_rectangle(
                [(bx, by), (bx + bw, by + bh)],
                radius=border_radius,
                fill=border_color,
            )
        else:
            draw.rectangle([(bx, by), (bx + bw, by + bh)], fill=border_color)

    # Paste photo
    px = x - padding
    py = y - padding
    canvas.paste(img, (px, py))


def _draw_divider(
    canvas: Image.Image,
    y: int,
    deco_cfg: dict,
) -> None:
    """Draw a divider line between photo rows."""
    draw = ImageDraw.Draw(canvas)
    color = _hex_to_rgb(deco_cfg.get('divider_color', '#ffffff'))
    style = deco_cfg.get('divider_style', 'line')
    margin = 100

    if style == 'line':
        draw.line([(margin, y), (canvas.width - margin, y)], fill=color, width=2)
    elif style == 'dotted':
        for x in range(margin, canvas.width - margin, 12):
            draw.ellipse([(x, y - 2), (x + 4, y + 2)], fill=color)


def _draw_date(
    canvas: Image.Image,
    date_text: str,
    canvas_height: int,
    font_cfg: dict,
) -> None:
    """Draw date text at the bottom of the strip."""
    draw = ImageDraw.Draw(canvas)
    font = _get_font(font_cfg, size=20)
    color = _hex_to_rgb(font_cfg.get('color', '#ffffff'))

    bbox = draw.textbbox((0, 0), date_text, font=font)
    text_width = bbox[2] - bbox[0]
    x = (canvas.width - text_width) // 2
    y = canvas_height - 50
    draw.text((x, y), date_text, fill=color, font=font)


def _draw_watermark(
    canvas: Image.Image,
    text: str,
    opacity: float,
    font_cfg: dict,
) -> None:
    """Draw a semi-transparent watermark on the strip."""
    if not text:
        return

    # Create overlay
    overlay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = _get_font(font_cfg, size=18)
    alpha = int(255 * opacity)

    color = _hex_to_rgb(font_cfg.get('color', '#ffffff'))
    rgba_color = (*color, alpha)

    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    x = canvas.width - text_width - 20
    y = canvas.height - 40
    draw.text((x, y), text, fill=rgba_color, font=font)

    canvas_rgba = canvas.convert('RGBA')
    composite = Image.alpha_composite(canvas_rgba, overlay)
    canvas.paste(composite.convert('RGB'))


def _center_crop(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Center-crop an image to the target dimensions."""
    img_w, img_h = img.size
    target_ratio = target_w / target_h
    img_ratio = img_w / img_h

    if img_ratio > target_ratio:
        new_w = int(img_h * target_ratio)
        left = (img_w - new_w) // 2
        img = img.crop((left, 0, left + new_w, img_h))
    else:
        new_h = int(img_w / target_ratio)
        top = (img_h - new_h) // 2
        img = img.crop((0, top, img_w, top + new_h))

    return img.resize((target_w, target_h), Image.Resampling.LANCZOS)


def _get_font(font_cfg: dict, size: int = 24) -> object:
    """Get a font object, falling back to default.

    Returns PIL ImageFont object.
    """
    family = font_cfg.get('family', 'default')
    try:
        if family != 'default':
            return ImageFont.truetype(family, size)
    except (OSError, IOError):
        pass
    return ImageFont.load_default(size=size)


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color string to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
    )
