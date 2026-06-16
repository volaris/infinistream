"""
Integration tests: real HTTP communication between the Controller and the
display webhook.

Hardware is simulated (MockADS for ADC/GPIO, mock Devantech for relays),
but requests.post uses the real requests library over a live local socket,
so the full network path between the controller and display service is
exercised end-to-end.
"""

import datetime
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import MagicMock

import pytest

import infinistream_controller.controller as controller_module
import infinistream_controller.hw_conf as hw_conf
from infinistream_controller.controller import Controller


# ---------------------------------------------------------------------------
# Fake webhook server
# ---------------------------------------------------------------------------

class _WebhookHandler(BaseHTTPRequestHandler):
    """Records every POST body; always responds 200."""
    log = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        _WebhookHandler.log.append(json.loads(body))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress stdout noise


@pytest.fixture(scope="module")
def live_webhook():
    """Bind a real HTTP server on a random port; keep it alive for the module."""
    server = HTTPServer(("127.0.0.1", 0), _WebhookHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}/shower-update"
    server.shutdown()


# ---------------------------------------------------------------------------
# Controller fixture with simulated hardware
# ---------------------------------------------------------------------------

class MockADS:
    def ADS1263_init_ADC1(self): pass
    ADS1263_SetMode = MagicMock()
    ADS1263_GetChannalValue = MagicMock(side_effect=lambda ch: 0)


@pytest.fixture
def controller(live_webhook, monkeypatch):
    """
    Controller wired to the live webhook server.

    - MockADS simulates the ADC/GPIO board (all channels read zero by default).
    - A MagicMock replaces the Devantech relay driver.
    - MAGICMIRROR_WEBHOOK_URL is redirected to the local test server.
    - requests is NOT mocked — real HTTP calls are made.
    """
    monkeypatch.setattr(controller_module, "MAGICMIRROR_WEBHOOK_URL", live_webhook)

    ads = MockADS()
    ads.ADS1263_GetChannalValue = MagicMock(side_effect=lambda ch: 0)

    mock_gpio = MagicMock()
    mock_gpio.IN = 1
    mock_gpio.PUD_DOWN = 2
    mock_gpio.input.return_value = 0

    with monkeypatch.context() as m:
        m.setattr(controller_module, "eth008", MagicMock())
        ctrl = Controller(ads, mock_gpio)

    ctrl.devantech = MagicMock()

    # Reset shared auto-sanitize state between tests
    Controller.determine_derived_mode.last_flow_detected = datetime.datetime.now()
    Controller.determine_derived_mode.sanitize_off_time = datetime.datetime.now()
    Controller.determine_derived_mode.sani_on = False

    _WebhookHandler.log.clear()
    return ctrl


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_step_delivers_payload_to_webhook(controller):
    """A single controller.step() results in one POST to the webhook."""
    controller.step()
    assert len(_WebhookHandler.log) == 1
    payload = _WebhookHandler.log[0]
    assert "mode" in payload
    assert "turbidity" in payload


def test_webhook_receives_correct_mode_name(controller):
    """Shower-mode GPIOs produce mode='SHOWER' in the webhook payload."""
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 1, 0][pins.index(pin)]
    controller.step()
    assert _WebhookHandler.log[-1]["mode"] == "SHOWER"


def test_webhook_receives_correct_turbidity(controller):
    """Turbidity sensor value is correctly scaled and rounded in the payload."""
    half_raw = hw_conf.TURBIDITY_SENSOR.full_scale_adc // 2
    controller.ads.ADS1263_GetChannalValue.side_effect = (
        lambda ch: half_raw if ch == hw_conf.TURBIDITY_SENSOR.channel else 0
    )
    controller.step()
    expected = round(
        (1.0 - half_raw / hw_conf.TURBIDITY_SENSOR.full_scale_adc)
        * hw_conf.TURBIDITY_SENSOR.full_scale_sensor,
        2,
    )
    assert _WebhookHandler.log[-1]["turbidity"] == expected


def test_throttle_suppresses_duplicate_post(controller):
    """Identical mode and turbidity on the second step produces no second POST."""
    controller.step()
    assert len(_WebhookHandler.log) == 1
    controller.step()
    assert len(_WebhookHandler.log) == 1  # still one — second was throttled


def test_mode_change_overrides_throttle(controller):
    """A mode change on the second step fires a second POST immediately."""
    controller.step()  # DRAIN (all bits 0)
    # Switch to SHOWER
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 1, 0][pins.index(pin)]
    controller.step()
    assert len(_WebhookHandler.log) == 2
    assert _WebhookHandler.log[1]["mode"] == "SHOWER"


def test_relay_actuators_set_for_drain_mode(controller):
    """DRAIN mode de-energizes all valves except the drain valve and drain pump."""
    controller.step()
    calls = {
        call.args[0]: call.args[2]
        for call in controller.devantech.setDigitalState.call_args_list
    }
    assert calls[hw_conf.DRAIN_VALVE.channel] == hw_conf.OPEN
    assert calls[hw_conf.DRAIN_PUMP_POWER.channel] == 1
    assert calls[hw_conf.POST_FILTER_VALVE.channel] == hw_conf.CLOSED
    assert calls[hw_conf.SUPPLY_PUMP_POWER.channel] == 0
    assert calls[hw_conf.UVC_POWER.channel] == 0


def test_relay_actuators_set_for_shower_mode(controller):
    """SHOWER mode opens post-filter valve and enables both pumps and UVC."""
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 1, 0][pins.index(pin)]
    controller.step()
    calls = {
        call.args[0]: call.args[2]
        for call in controller.devantech.setDigitalState.call_args_list
    }
    assert calls[hw_conf.POST_FILTER_VALVE.channel] == hw_conf.OPEN
    assert calls[hw_conf.SUPPLY_PUMP_POWER.channel] == 1
    assert calls[hw_conf.UVC_POWER.channel] == 1
    assert calls[hw_conf.SANI_LOOP_VALVE.channel] == hw_conf.CLOSED
