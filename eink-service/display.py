#!/usr/bin/env python3
"""
Dither a PNG screenshot to 1-bit B/W and push to the Waveshare 7.5" V2
e-ink display (epd7in5_V2, 800x480).

Usage: python3 display.py <image_path>

Install the Waveshare driver from GitHub (not on PyPI):
  git clone https://github.com/waveshareteam/e-Paper.git
  pip install -r e-Paper/RaspberryPi_JetsonNano/python/requirements.txt
"""

import sys
from PIL import Image

REFRESH_COUNTER_FILE = "/tmp/infinistream_refresh_count"
# Full refresh (with flash) every N updates to prevent ghosting buildup.
FULL_REFRESH_INTERVAL = 10


def dither_to_bw(image_path: str) -> Image.Image:
    """Load image, resize to 800x480, return 1-bit Floyd-Steinberg dithered image."""
    img = Image.open(image_path).convert("RGB")
    img = img.resize((800, 480), Image.LANCZOS)
    return img.convert("1")  # PIL applies Floyd-Steinberg dithering by default


def _read_counter() -> int:
    try:
        with open(REFRESH_COUNTER_FILE) as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return 0


def _write_counter(n: int) -> None:
    with open(REFRESH_COUNTER_FILE, "w") as f:
        f.write(str(n))


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
        epd.init()
        buf = epd.getbuffer(image)

        if count % FULL_REFRESH_INTERVAL == 0:
            # Full refresh: sets the base image and clears any ghosting.
            # This triggers the visible flash cycle, but only once every
            # FULL_REFRESH_INTERVAL updates.
            epd.displayPartBaseImage(buf)
        else:
            # Partial refresh: no flash, ~0.3 s vs ~4 s for full refresh.
            epd.displayPartial(buf)

        epd.sleep()
        _write_counter(count + 1)
    except (ImportError, RuntimeError) as exc:
        print(f"Display hardware not available: {exc}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: display.py <image_path>", file=sys.stderr)
        sys.exit(1)
    bw_image = dither_to_bw(sys.argv[1])
    send_to_display(bw_image)
