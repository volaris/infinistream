#!/usr/bin/env python3
"""
Dither a PIL image to 1-bit B/W and push to the Waveshare 7.5" V2
e-ink display (epd7in5_V2, 800x480).

Usage: python3 display.py <image_path>
"""

import sys
from PIL import Image

REFRESH_COUNTER_FILE = "/tmp/infinistream_refresh_count"
# Full refresh (with flash) every N updates to prevent ghosting buildup.
FULL_REFRESH_INTERVAL = 10


DISPLAY_W, DISPLAY_H = 800, 480


def dither_to_bw(img: Image.Image) -> Image.Image:
    """Scale image to fit 800×480 (letterbox with white), return 1-bit dithered image."""
    img = img.convert("RGB")
    scale = min(DISPLAY_W / img.width, DISPLAY_H / img.height)
    scaled_w = round(img.width * scale)
    scaled_h = round(img.height * scale)
    paste_x  = (DISPLAY_W - scaled_w) // 2
    paste_y  = (DISPLAY_H - scaled_h) // 2
    print(
        f"dither: input {img.width}x{img.height} → scaled {scaled_w}x{scaled_h} "
        f"(×{scale:.3f}), paste at ({paste_x},{paste_y})",
        flush=True,
    )
    img = img.resize((scaled_w, scaled_h), Image.LANCZOS)
    canvas = Image.new("RGB", (DISPLAY_W, DISPLAY_H), "white")
    canvas.paste(img, (paste_x, paste_y))
    return canvas.convert("1")


def _read_counter() -> int:
    try:
        with open(REFRESH_COUNTER_FILE) as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return 0


def _write_counter(n: int) -> None:
    with open(REFRESH_COUNTER_FILE, "w") as f:
        f.write(str(n))


def startup_clear() -> None:
    """Full black/white sweep on startup to clear persistent soak artifacts.

    epd.Clear() resets both old and new frame buffers, which is the only way
    to eliminate artifacts that survive regular full refreshes after long soaks.
    """
    try:
        from waveshare_epd import epd7in5_V2

        epd = epd7in5_V2.EPD()
        epd.init()
        epd.Clear()
        epd.sleep()
        print("Startup clear complete.", flush=True)
    except (ImportError, RuntimeError) as exc:
        print(f"Display hardware not available (startup clear skipped): {exc}", file=sys.stderr)


def send_to_display(image: Image.Image) -> None:
    """Push a 1-bit image to the Waveshare 7.5" V2 display.

    Uses partial refresh (no flash) for most updates; falls back to a full
    refresh every FULL_REFRESH_INTERVAL calls to clear accumulated ghosting.

    Silently skips if the waveshare_epd library is not installed or the
    hardware is absent, so this module can be imported in test environments.
    """
    try:
        from waveshare_epd import epd7in5_V2

        count = _read_counter()
        epd = epd7in5_V2.EPD()
        buf = epd.getbuffer(image)

        if count % FULL_REFRESH_INTERVAL == 0:
            # Full refresh every N updates to clear accumulated ghosting.
            # Triggers the visible flash cycle, but only once every
            # FULL_REFRESH_INTERVAL updates.
            epd.init()
            epd.display(buf)
        else:
            # Partial refresh: no flash, ~0.3 s vs ~4 s for full refresh.
            # E-paper retains its image while sleeping (non-volatile), so
            # init_part() re-arms the controller without clearing the screen.
            epd.init_part()
            epd.display_Partial(buf, 0, 0, epd.width, epd.height)

        epd.sleep()
        _write_counter(count + 1)
    except (ImportError, RuntimeError) as exc:
        print(f"Display hardware not available: {exc}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: display.py <image_path>", file=sys.stderr)
        sys.exit(1)
    bw_image = dither_to_bw(Image.open(sys.argv[1]))
    send_to_display(bw_image)
