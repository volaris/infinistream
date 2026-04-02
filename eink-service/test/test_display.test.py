import sys
import os
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from display import dither_to_bw, send_to_display


def make_png(tmp_path, color, size=(800, 480)):
    path = str(tmp_path / "test.png")
    Image.new("RGB", size, color).save(path)
    return path


def test_output_is_800x480(tmp_path):
    """Input of any size is resized to the display resolution."""
    path = make_png(tmp_path, (128, 128, 128), size=(1920, 1080))
    assert dither_to_bw(path).size == (800, 480)


def test_output_mode_is_1bit(tmp_path):
    path = make_png(tmp_path, (128, 128, 128))
    assert dither_to_bw(path).mode == "1"


def test_all_white_image_stays_white(tmp_path):
    path = make_png(tmp_path, (255, 255, 255))
    result = dither_to_bw(path)
    assert all(result.getdata())


def test_all_black_image_stays_black(tmp_path):
    path = make_png(tmp_path, (0, 0, 0))
    result = dither_to_bw(path)
    assert not any(result.getdata())


def test_send_to_display_handles_missing_hardware(tmp_path):
    """No exception raised when waveshare_epd is not installed."""
    image = Image.new("1", (800, 480), 1)
    send_to_display(image)  # should not raise
