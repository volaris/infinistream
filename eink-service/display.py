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


def dither_to_bw(image_path: str) -> Image.Image:
    """Load image, resize to 800x480, return 1-bit Floyd-Steinberg dithered image."""
    img = Image.open(image_path).convert("RGB")
    img = img.resize((800, 480), Image.LANCZOS)
    return img.convert("1")  # PIL applies Floyd-Steinberg dithering by default


def send_to_display(image: Image.Image) -> None:
    """Push a 1-bit image to the Waveshare 7.5" V2 display.

    Silently skips if the waveshare_epd library is not installed or the
    hardware is absent, so this module can be imported in test environments.
    """
    try:
        from waveshare_epd import epd7in5_V2
        epd = epd7in5_V2.EPD()
        epd.init()
        epd.display(epd.getbuffer(image))
        epd.sleep()
    except (ImportError, RuntimeError) as exc:
        print(f"Display hardware not available: {exc}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: display.py <image_path>", file=sys.stderr)
        sys.exit(1)
    bw_image = dither_to_bw(sys.argv[1])
    send_to_display(bw_image)
