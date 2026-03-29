import os
import pytest
from pytest_bdd import scenarios, given, when, then, parsers
from unittest.mock import MagicMock, patch
import datetime

from src.controller import Controller
import src.hw_conf
import src.controller as controller_module

scenarios(os.path.join(os.path.dirname(__file__), "test_controller.feature"))

@pytest.fixture
def controller():
    with patch("src.controller.devantech_eth") as mock_devantech, \
         patch("src.controller.requests") as mock_requests:
        class MockADS:
            def ADS1263_init_ADC1(self): pass
            def ADS1263_GPIOChannelMode(self, channel, mode, direction): pass
            ADS1263_DigitalRead = MagicMock(side_effect=lambda ch: 0)
            ADS1263_GetChannalValue = MagicMock(side_effect=lambda ch: 0)
        ads = MockADS()
        gpio_mode = {"MODE_DIGITAL": 1}
        ctrl = Controller(ads, gpio_mode)
        ctrl.devantech = mock_devantech
        ctrl.mock_requests = mock_requests
        # Set static vars on the static method, not the instance
        Controller.determine_derived_mode.last_flow_detected = datetime.datetime.now()
        Controller.determine_derived_mode.sanitize_off_time = datetime.datetime.now()
        Controller.determine_derived_mode.sani_on = False
        yield ctrl

@given(parsers.parse('the mode select GPIOs indicate "{mode}"'))
def set_mode_select(controller, mode):
    mode_map = {
        "drain": [0,0,0],
        "flush": [0,0,1],
        "shower": [0,1,0],
        "sanitize": [1,0,0]
    }
    bits = mode_map[mode]
    controller.ads.ADS1263_DigitalRead.side_effect = lambda ch: bits[ch-3]

@given("flow out sensor reads above threshold")
def set_flow_out_high(controller):
    controller.ads.ADS1263_GetChannalValue.side_effect = lambda ch: src.hw_conf.FLOW_OUT_SENSOR.full_scale_adc if ch == src.hw_conf.FLOW_OUT_SENSOR.channel else 0

@given("flow out sensor reads below threshold for a long period")
def set_flow_out_low(controller):
    # Simulate flow below threshold
    controller.ads.ADS1263_GetChannalValue.side_effect = lambda ch: 0

@when("the controller reads sensors and determines mode")
def read_and_determine_mode(controller):
    controller.sensors = controller.read_sensors()
    controller.step()

@when("the controller reads sensors and determines mode after timeout")
def read_and_determine_mode_timeout(controller):
    # Simulate time passing for sanitize transition
    controller.sensors = controller.read_sensors()
    # Set last_flow_detected far in the past
    Controller.determine_derived_mode.last_flow_detected = datetime.datetime.now() - datetime.timedelta(hours=13)
    controller.step()

@then(parsers.parse('the controller should set actuators for "{mode}"'))
def check_actuators(controller, mode):
    from unittest.mock import call as mock_call
    expected_calls = {
        "drain": [
            mock_call(src.hw_conf.POST_FILTER_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.SANI_LOOP_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.FLUSH_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.DRAIN_VALVE.channel, 0, src.hw_conf.OPEN),
            mock_call(src.hw_conf.DRAIN_PUMP_POWER.channel, 0, 1),
            mock_call(src.hw_conf.SUPPLY_PUMP_POWER.channel, 0, 0),
            mock_call(src.hw_conf.UVC_POWER.channel, 0, 0),
        ],
        "flush": [
            mock_call(src.hw_conf.POST_FILTER_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.SANI_LOOP_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.FLUSH_VALVE.channel, 0, src.hw_conf.OPEN),
            mock_call(src.hw_conf.DRAIN_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.DRAIN_PUMP_POWER.channel, 0, 1),
            mock_call(src.hw_conf.SUPPLY_PUMP_POWER.channel, 0, 1),
            mock_call(src.hw_conf.UVC_POWER.channel, 0, 0),
        ],
        "shower": [
            mock_call(src.hw_conf.POST_FILTER_VALVE.channel, 0, src.hw_conf.OPEN),
            mock_call(src.hw_conf.SANI_LOOP_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.FLUSH_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.DRAIN_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.DRAIN_PUMP_POWER.channel, 0, 1),
            mock_call(src.hw_conf.SUPPLY_PUMP_POWER.channel, 0, 1),
            mock_call(src.hw_conf.UVC_POWER.channel, 0, 1),
        ],
        "sanitize": [
            mock_call(src.hw_conf.POST_FILTER_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.SANI_LOOP_VALVE.channel, 0, src.hw_conf.OPEN),
            mock_call(src.hw_conf.FLUSH_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.DRAIN_VALVE.channel, 0, src.hw_conf.CLOSED),
            mock_call(src.hw_conf.SUPPLY_PUMP_POWER.channel, 0, 1),
            mock_call(src.hw_conf.UVC_POWER.channel, 0, 1),
            mock_call(src.hw_conf.DRAIN_PUMP_POWER.channel, 0, 0),
        ],
    }
    if not hasattr(controller, "mode"):
        controller.mode = {
            "drain": src.hw_conf.MODE_DRAIN,
            "flush": src.hw_conf.MODE_FLUSH,
            "shower": src.hw_conf.MODE_SHOWER,
            "sanitize": src.hw_conf.MODE_SANI,
        }[mode]
    controller.devantech.setDigitalState.assert_has_calls(expected_calls[mode], any_order=False)
    assert controller.devantech.setDigitalState.call_count == len(expected_calls[mode])

@given("the flow in sensor raw value is maximum")
def set_flow_in_max(controller):
    controller.ads.ADS1263_GetChannalValue.side_effect = lambda ch: src.hw_conf.FLOW_IN_SENSOR.full_scale_adc if ch == src.hw_conf.FLOW_IN_SENSOR.channel else 0

@when("the controller decodes the analog value")
def decode_analog(controller):
    raw = src.hw_conf.FLOW_IN_SENSOR.full_scale_adc
    controller.analog_value = controller.decode_analog(raw, src.hw_conf.FLOW_IN_SENSOR)

@then("the result should be the sensor full scale")
def check_calibration(controller):
    assert controller.analog_value == src.hw_conf.FLOW_IN_SENSOR.full_scale_sensor

@given("the mode select GPIOs indicate an unrecognized pattern")
def set_unrecognized_mode(controller):
    # 0b111 = 7, not a valid pattern; decode_mode_bits falls back to MODE_DRAIN
    controller.ads.ADS1263_DigitalRead.side_effect = lambda ch: 1

@when("the controller steps")
def controller_step(controller):
    controller.step()

@given("the sanitize cycle is active and has expired")
def set_sanitize_expired(controller):
    Controller.determine_derived_mode.last_flow_detected = (
        datetime.datetime.now() - datetime.timedelta(hours=13)
    )
    Controller.determine_derived_mode.sani_on = True
    Controller.determine_derived_mode.sanitize_off_time = (
        datetime.datetime.now() - datetime.timedelta(seconds=1)
    )

@then(parsers.parse('the display webhook should receive mode "{mode}" and the current turbidity'))
def check_webhook_mode_and_turbidity(controller, mode):
    call_args = controller.mock_requests.post.call_args
    assert call_args is not None, "requests.post was not called"
    payload = call_args.kwargs["json"]
    assert payload["mode"] == mode
    assert "turbidity" in payload

@then(parsers.parse('the display webhook should receive mode "{mode}"'))
def check_webhook_mode(controller, mode):
    call_args = controller.mock_requests.post.call_args
    assert call_args is not None, "requests.post was not called"
    payload = call_args.kwargs["json"]
    assert payload["mode"] == mode

# --- Direct unit tests (non-BDD) ---

def test_safe_state_deenergizes_all_actuators(controller):
    """safe() closes all valves and cuts power to all devices."""
    from unittest.mock import call as mock_call
    controller.safe()
    expected = [
        mock_call(src.hw_conf.POST_FILTER_VALVE.channel, 0, src.hw_conf.CLOSED),
        mock_call(src.hw_conf.SANI_LOOP_VALVE.channel, 0, src.hw_conf.CLOSED),
        mock_call(src.hw_conf.FLUSH_VALVE.channel, 0, src.hw_conf.CLOSED),
        mock_call(src.hw_conf.DRAIN_VALVE.channel, 0, src.hw_conf.CLOSED),
        mock_call(src.hw_conf.DRAIN_PUMP_POWER.channel, 0, 0),
        mock_call(src.hw_conf.SUPPLY_PUMP_POWER.channel, 0, 0),
        mock_call(src.hw_conf.UVC_POWER.channel, 0, 0),
    ]
    controller.devantech.setDigitalState.assert_has_calls(expected, any_order=False)
    assert controller.devantech.setDigitalState.call_count == len(expected)

def test_analog_calibration_zero(controller):
    """ADC value of 0 maps to 0.0 in sensor units."""
    assert controller.decode_analog(0, src.hw_conf.FLOW_IN_SENSOR) == 0.0

def test_analog_calibration_midscale(controller):
    """ADC value at half full scale maps to half sensor full scale."""
    half_raw = src.hw_conf.FLOW_OUT_SENSOR.full_scale_adc // 2
    result = controller.decode_analog(half_raw, src.hw_conf.FLOW_OUT_SENSOR)
    assert abs(result - src.hw_conf.FLOW_OUT_SENSOR.full_scale_sensor / 2) < 0.01

def test_webhook_posts_correct_url(controller):
    """display_status posts to MAGICMIRROR_WEBHOOK_URL."""
    controller.step()
    call_args = controller.mock_requests.post.call_args
    assert call_args.args[0] == src.hw_conf.MAGICMIRROR_WEBHOOK_URL

def test_webhook_connection_failure_does_not_crash_controller(controller):
    """A failed webhook POST is swallowed so the control loop continues."""
    import requests as real_requests
    controller.mock_requests.post.side_effect = real_requests.exceptions.ConnectionError
    controller.mock_requests.exceptions = real_requests.exceptions
    controller.step()  # should not raise

def test_flow_threshold_above_boundary_updates_timestamp(controller):
    """The first ADC count that decodes above 0.1 L/min updates last_flow_detected."""
    import math
    # Compute the smallest raw value that decodes strictly above 0.1 L/min
    threshold_raw = math.ceil(
        (0.1 / src.hw_conf.FLOW_OUT_SENSOR.full_scale_sensor)
        * src.hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    )
    controller.ads.ADS1263_GetChannalValue.side_effect = (
        lambda ch: threshold_raw if ch == src.hw_conf.FLOW_OUT_SENSOR.channel else 0
    )
    controller.ads.ADS1263_DigitalRead.side_effect = lambda ch: [0, 1, 0][ch - 3]  # shower
    before = Controller.determine_derived_mode.last_flow_detected
    Controller.determine_derived_mode(controller.read_sensors())
    assert Controller.determine_derived_mode.last_flow_detected > before

def test_flow_threshold_below_boundary_does_not_update_timestamp(controller):
    """ADC values that decode at or below 0.1 L/min do not update last_flow_detected."""
    import math
    # One count below the above-threshold value decodes to <= 0.1 L/min
    below_raw = math.ceil(
        (0.1 / src.hw_conf.FLOW_OUT_SENSOR.full_scale_sensor)
        * src.hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    ) - 1
    controller.ads.ADS1263_GetChannalValue.side_effect = (
        lambda ch: below_raw if ch == src.hw_conf.FLOW_OUT_SENSOR.channel else 0
    )
    controller.ads.ADS1263_DigitalRead.side_effect = lambda ch: [0, 1, 0][ch - 3]  # shower
    before = Controller.determine_derived_mode.last_flow_detected
    Controller.determine_derived_mode(controller.read_sensors())
    assert Controller.determine_derived_mode.last_flow_detected == before