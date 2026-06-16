import sys
import os
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from display import prepare_image, send_to_display


def test_output_is_800x480():
    """Input of any size is resized to the display resolution."""
    assert prepare_image(Image.new("RGB", (1920, 1080), (128, 128, 128))).size == (800, 480)


def test_output_mode_is_grayscale():
    assert prepare_image(Image.new("RGB", (800, 480), (128, 128, 128))).mode == "L"


def test_all_white_image_stays_white():
    result = prepare_image(Image.new("RGB", (800, 480), (255, 255, 255)))
    assert all(p == 255 for p in result.getdata())


def test_all_black_image_stays_black():
    result = prepare_image(Image.new("RGB", (800, 480), (0, 0, 0)))
    assert all(p == 0 for p in result.getdata())


def test_send_to_display_handles_missing_hardware():
    """No exception raised when waveshare_epd is not installed."""
    send_to_display(Image.new("L", (800, 480), 128))  # should not raise
