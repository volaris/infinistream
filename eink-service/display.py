#!/usr/bin/env python3
"""
Prepare a PIL image for the Waveshare 7.5" V2 e-ink display (epd7in5_V2, 800x480)
and push it using the native 4-gray mode.

Usage: python3 display.py <image_path>
"""

import sys
from PIL import Image

DISPLAY_W, DISPLAY_H = 800, 480


def prepare_image(img: Image.Image) -> Image.Image:
    """Resize image to 800×480 and convert to grayscale for the 4-gray display."""
    img = img.convert("L")
    print(f"prepare: input {img.width}x{img.height} → {DISPLAY_W}x{DISPLAY_H}", flush=True)
    return img.resize((DISPLAY_W, DISPLAY_H), Image.LANCZOS)


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
    """Push a grayscale image to the Waveshare 7.5" V2 display using 4-gray mode.

    Silently skips if the waveshare_epd library is not installed or the
    hardware is absent, so this module can be imported in test environments.
    """
    try:
        from waveshare_epd import epd7in5_V2

        epd = epd7in5_V2.EPD()
        epd.init_4Gray()
        epd.display_4Gray(epd.getbuffer_4Gray(image))
        epd.sleep()
    except (ImportError, RuntimeError) as exc:
        print(f"Display hardware not available: {exc}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: display.py <image_path>", file=sys.stderr)
        sys.exit(1)
    send_to_display(prepare_image(Image.open(sys.argv[1])))
