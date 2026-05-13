#!/usr/bin/env python3
import os
import sys
import threading
import time
from io import BytesIO

from flask import Flask
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from PIL import Image

from display import dither_to_bw, send_to_display

MAGICMIRROR_URL   = os.environ.get("MAGICMIRROR_URL",      "http://localhost:8080")
CHROMIUM_PATH     = os.environ.get("CHROMIUM_PATH",        "/usr/bin/chromium")
CHROMEDRIVER_PATH = os.environ.get("CHROMEDRIVER_PATH",    "/usr/bin/chromedriver")
PORT              = int(os.environ.get("PORT",              "3001"))
MM_STARTUP_DELAY  = int(os.environ.get("MM_STARTUP_DELAY", "10"))
DISPLAY_W, DISPLAY_H = 800, 480

app     = Flask(__name__)
_driver = None
_lock   = threading.Lock()


def _init_browser():
    global _driver
    options = webdriver.ChromeOptions()
    options.binary_location = CHROMIUM_PATH
    for arg in (
        "--headless",
        "--no-sandbox",
        "--window-size=820,606",
        "--disable-dev-shm-usage"
    ):
        options.add_argument(arg)
    _driver = webdriver.Chrome(
        service=ChromeService(CHROMEDRIVER_PATH),
        options=options,
    )
    _driver.get(MAGICMIRROR_URL)
    print(f"Browser ready: {MAGICMIRROR_URL}", flush=True)


def _ensure_page_loaded():
    # Chrome lands on chrome-error://chromewebdata when the target isn't ready.
    # Reload so the next screenshot captures live content, not an error page.
    if not _driver.current_url.startswith(MAGICMIRROR_URL):
        print(f"Reloading {MAGICMIRROR_URL} (was: {_driver.current_url})", flush=True)
        _driver.get(MAGICMIRROR_URL)


def _do_refresh():
    try:
        _ensure_page_loaded()
        img = Image.open(BytesIO(_driver.get_screenshot_as_png()))
        w, h = img.size
        vp = _driver.execute_script(
            "return {w: window.innerWidth, h: window.innerHeight,"
            " sw: document.body.scrollWidth, sh: document.body.scrollHeight}"
        )
        print(
            f"screenshot: {w}x{h} | "
            f"viewport: {vp['w']}x{vp['h']} | "
            f"body scroll: {vp['sw']}x{vp['sh']}",
            flush=True,
        )
        send_to_display(dither_to_bw(img))
    except Exception as exc:
        print(f"Refresh failed: {exc}", file=sys.stderr, flush=True)
    finally:
        _lock.release()


@app.post("/trigger")
def trigger():
    if _lock.acquire(blocking=False):
        threading.Thread(target=_do_refresh, daemon=True).start()
    return "", 202


def _startup_refresh():
    print(f"Waiting {MM_STARTUP_DELAY}s for MagicMirror to render...", flush=True)
    time.sleep(MM_STARTUP_DELAY)
    if _lock.acquire(blocking=False):
        _do_refresh()


if __name__ == "__main__":
    _init_browser()
    threading.Thread(target=_startup_refresh, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT)
