import os
import pytest
from pytest_bdd import scenarios, given, when, then, parsers
from unittest.mock import MagicMock, patch
import datetime

from infinistream_controller.controller import Controller, DrainPumpState
from infinistream_controller import hw_conf
import infinistream_controller.controller as controller_module

scenarios(os.path.join(os.path.dirname(__file__), "test_controller.feature"))

@pytest.fixture
def controller():
    with patch("infinistream_controller.controller.eth008") as mock_eth008, \
         patch("infinistream_controller.controller.requests") as mock_requests:
        mock_devantech = mock_eth008.ETH008.return_value
        class MockADS:
            def ADS1263_init_ADC1(self): pass
            ADS1263_GetChannalValue = MagicMock(side_effect=lambda ch: 0)
            ADS1263_SetMode = MagicMock()
        ads = MockADS()
        mock_gpio = MagicMock()
        mock_gpio.IN = 1
        mock_gpio.PUD_DOWN = 2
        mock_gpio.input.return_value = 0
        ctrl = Controller(ads, mock_gpio)
        ctrl.mock_requests = mock_requests
        # Per-channel ADC value dict — Given steps write here; side_effect reads from it.
        # Unit tests may override side_effect directly for custom behaviour.
        ctrl._adc_values = {}
        ctrl.ads.ADS1263_GetChannalValue.side_effect = lambda ch: ctrl._adc_values.get(ch, 0)
        Controller.determine_derived_mode.last_flow_detected = datetime.datetime.now()
        Controller.determine_derived_mode.sanitize_off_time = datetime.datetime.now()
        Controller.determine_derived_mode.sani_on = False
        yield ctrl

@given(parsers.parse('the mode select GPIOs indicate "{mode}"'))
def set_mode_select(controller, mode):
    mode_map = {
        "idle":     [0,0,0],
        "shower":   [0,0,1],
        "sanitize": [0,1,0],
        "drain":    [0,1,1],
        "flush":    [1,0,0],
    }
    bits = mode_map[mode]
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: bits[pins.index(pin)]

@given("flow out sensor reads above threshold")
def set_flow_out_high(controller):
    controller._adc_values[hw_conf.FLOW_OUT_SENSOR.channel] = hw_conf.FLOW_OUT_SENSOR.full_scale_adc

@given("flow out sensor reads below threshold for a long period")
def set_flow_out_low(controller):
    controller._adc_values[hw_conf.FLOW_OUT_SENSOR.channel] = 0

@given("flow return sensor reads above threshold")
def set_flow_return_high(controller):
    controller._adc_values[hw_conf.FLOW_RETURN_SENSOR.channel] = hw_conf.FLOW_RETURN_SENSOR.full_scale_adc

@given("the drain pump is in priming state")
def set_drain_pump_priming(controller):
    controller._drain_pump_state = DrainPumpState.PRIMING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.devantech.setDigitalState.reset_mock()

@given("the drain pump is in priming state with timeout elapsed")
def set_drain_pump_priming_timeout(controller):
    controller._drain_pump_state = DrainPumpState.PRIMING
    controller._drain_pump_state_entered = (
        datetime.datetime.now()
        - datetime.timedelta(seconds=controller_module._PRIME_TIMEOUT + 1)
    )
    controller.devantech.setDigitalState.reset_mock()

@given("the drain pump is in pumping state")
def set_drain_pump_pumping(controller):
    controller._drain_pump_state = DrainPumpState.PUMPING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.devantech.setDigitalState.reset_mock()

@given("the drain pump is in waiting state with retry interval elapsed")
def set_drain_pump_waiting_elapsed(controller):
    controller._drain_pump_state = DrainPumpState.WAITING
    controller._drain_pump_state_entered = (
        datetime.datetime.now()
        - datetime.timedelta(seconds=controller_module._PRIME_RETRY_INTERVAL + 1)
    )
    controller.devantech.setDigitalState.reset_mock()

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
        "idle": [
            mock_call(hw_conf.POST_FILTER_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.SANI_LOOP_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.FLUSH_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.DRAIN_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 0),
            mock_call(hw_conf.SUPPLY_PUMP_POWER.channel, 0, 0),
            mock_call(hw_conf.UVC_POWER.channel, 0, 0),
        ],
        "drain": [
            mock_call(hw_conf.POST_FILTER_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.SANI_LOOP_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.FLUSH_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.DRAIN_VALVE.channel, 0, hw_conf.OPEN),
            mock_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 1),
            mock_call(hw_conf.SUPPLY_PUMP_POWER.channel, 0, 0),
            mock_call(hw_conf.UVC_POWER.channel, 0, 0),
        ],
        "flush": [
            mock_call(hw_conf.POST_FILTER_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.SANI_LOOP_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.FLUSH_VALVE.channel, 0, hw_conf.OPEN),
            mock_call(hw_conf.DRAIN_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 1),
            mock_call(hw_conf.SUPPLY_PUMP_POWER.channel, 0, 1),
            mock_call(hw_conf.UVC_POWER.channel, 0, 0),
        ],
        "shower": [
            # Drain pump is managed by the state machine, not checked here.
            # Use the drain pump BDD scenarios or unit tests to verify its behaviour.
            mock_call(hw_conf.POST_FILTER_VALVE.channel, 0, hw_conf.OPEN),
            mock_call(hw_conf.SANI_LOOP_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.FLUSH_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.DRAIN_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.SUPPLY_PUMP_POWER.channel, 0, 1),
            mock_call(hw_conf.UVC_POWER.channel, 0, 1),
        ],
        "sanitize": [
            mock_call(hw_conf.POST_FILTER_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.SANI_LOOP_VALVE.channel, 0, hw_conf.OPEN),
            mock_call(hw_conf.FLUSH_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.DRAIN_VALVE.channel, 0, hw_conf.CLOSED),
            mock_call(hw_conf.SUPPLY_PUMP_POWER.channel, 0, 1),
            mock_call(hw_conf.UVC_POWER.channel, 0, 1),
            mock_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 0),
        ],
    }
    if not hasattr(controller, "mode"):
        controller.mode = {
            "idle":     hw_conf.MODE_IDLE,
            "drain":    hw_conf.MODE_DRAIN,
            "flush":    hw_conf.MODE_FLUSH,
            "shower":   hw_conf.MODE_SHOWER,
            "sanitize": hw_conf.MODE_SANI,
        }[mode]
    controller.devantech.setDigitalState.assert_has_calls(expected_calls[mode], any_order=False)
    # SHOWER allows extra relay calls from the drain pump state machine
    if mode == "shower":
        assert controller.devantech.setDigitalState.call_count >= len(expected_calls[mode])
    else:
        assert controller.devantech.setDigitalState.call_count == len(expected_calls[mode])

@given("the flow in sensor raw value is maximum")
def set_flow_in_max(controller):
    controller._adc_values[hw_conf.FLOW_IN_SENSOR.channel] = hw_conf.FLOW_IN_SENSOR.full_scale_adc

@when("the controller decodes the analog value")
def decode_analog(controller):
    raw = hw_conf.FLOW_IN_SENSOR.full_scale_adc
    controller.analog_value = controller.decode_analog(raw, hw_conf.FLOW_IN_SENSOR)

@then("the result should be the sensor full scale")
def check_calibration(controller):
    assert controller.analog_value == hw_conf.FLOW_IN_SENSOR.full_scale_sensor

@given("the mode select GPIOs indicate an unrecognized pattern")
def set_unrecognized_mode(controller):
    # 0b111 = 7, not a valid pattern; decode_mode_bits falls back to MODE_DRAIN
    controller.gpio.input.side_effect = lambda pin: 1

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

@then(parsers.parse('the drain pump state should be "{state}"'))
def check_drain_pump_state(controller, state):
    assert controller._drain_pump_state == DrainPumpState(state)

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
        mock_call(hw_conf.POST_FILTER_VALVE.channel, 0, hw_conf.CLOSED),
        mock_call(hw_conf.SANI_LOOP_VALVE.channel, 0, hw_conf.CLOSED),
        mock_call(hw_conf.FLUSH_VALVE.channel, 0, hw_conf.CLOSED),
        mock_call(hw_conf.DRAIN_VALVE.channel, 0, hw_conf.CLOSED),
        mock_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 0),
        mock_call(hw_conf.SUPPLY_PUMP_POWER.channel, 0, 0),
        mock_call(hw_conf.UVC_POWER.channel, 0, 0),
    ]
    controller.devantech.setDigitalState.assert_has_calls(expected, any_order=False)
    assert controller.devantech.setDigitalState.call_count == len(expected)

def test_analog_calibration_zero(controller):
    """ADC value of 0 maps to 0.0 in sensor units."""
    assert controller.decode_analog(0, hw_conf.FLOW_IN_SENSOR) == 0.0

def test_analog_calibration_midscale(controller):
    """ADC value at half full scale maps to half sensor full scale."""
    half_raw = hw_conf.FLOW_OUT_SENSOR.full_scale_adc // 2
    result = controller.decode_analog(half_raw, hw_conf.FLOW_OUT_SENSOR)
    assert abs(result - hw_conf.FLOW_OUT_SENSOR.full_scale_sensor / 2) < 0.01

def test_webhook_posts_correct_url(controller):
    """display_status posts to MAGICMIRROR_WEBHOOK_URL."""
    controller.step()
    call_args = controller.mock_requests.post.call_args
    assert call_args.args[0] == hw_conf.MAGICMIRROR_WEBHOOK_URL

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
        (0.1 / hw_conf.FLOW_OUT_SENSOR.full_scale_sensor)
        * hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    )
    controller.ads.ADS1263_GetChannalValue.side_effect = (
        lambda ch: threshold_raw if ch == hw_conf.FLOW_OUT_SENSOR.channel else 0
    )
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 0, 1][pins.index(pin)]  # shower
    before = Controller.determine_derived_mode.last_flow_detected
    Controller.determine_derived_mode(controller.read_sensors())
    assert Controller.determine_derived_mode.last_flow_detected > before

def test_flow_threshold_below_boundary_does_not_update_timestamp(controller):
    """ADC values that decode at or below 0.1 L/min do not update last_flow_detected."""
    import math
    # One count below the above-threshold value decodes to <= 0.1 L/min
    below_raw = math.ceil(
        (0.1 / hw_conf.FLOW_OUT_SENSOR.full_scale_sensor)
        * hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    ) - 1
    controller.ads.ADS1263_GetChannalValue.side_effect = (
        lambda ch: below_raw if ch == hw_conf.FLOW_OUT_SENSOR.channel else 0
    )
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 0, 1][pins.index(pin)]  # shower
    before = Controller.determine_derived_mode.last_flow_detected
    Controller.determine_derived_mode(controller.read_sensors())
    assert Controller.determine_derived_mode.last_flow_detected == before

# --- Display throttle unit tests ---

def test_throttle_sends_on_first_step(controller):
    """First step always sends (last_sent_mode is None)."""
    controller.step()
    assert controller.mock_requests.post.call_count == 1

def test_throttle_suppresses_repeat_update(controller):
    """Second step with identical mode and turbidity tier does not send again."""
    controller.step()
    controller.mock_requests.post.reset_mock()
    controller.step()
    assert controller.mock_requests.post.call_count == 0

def test_throttle_sends_on_mode_change(controller):
    """Mode change immediately overrides the throttle."""
    controller.step()  # DRAIN (all bits 0)
    controller.mock_requests.post.reset_mock()
    # Switch to SHOWER (bits 0,0,1)
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 0, 1][pins.index(pin)]
    controller.step()
    assert controller.mock_requests.post.call_count == 1
    payload = controller.mock_requests.post.call_args.kwargs["json"]
    assert payload["mode"] == "SHOWER"

def test_throttle_sends_on_turbidity_tier_change(controller):
    """Turbidity crossing a tier boundary immediately overrides the throttle."""
    # Start with clean water: ADC at full scale → 0 NTU (tier 0) via inverted sensor
    controller.ads.ADS1263_GetChannalValue.side_effect = (
        lambda ch: hw_conf.TURBIDITY_SENSOR.full_scale_adc if ch == hw_conf.TURBIDITY_SENSOR.channel else 0
    )
    controller.step()
    controller.mock_requests.post.reset_mock()
    # Drop to dirty water: ADC at 0 → 4000 NTU (tier 2) via inverted sensor
    controller.ads.ADS1263_GetChannalValue.side_effect = lambda ch: 0
    controller.step()
    assert controller.mock_requests.post.call_count == 1

def test_throttle_sends_after_interval_elapsed(controller):
    """Update is sent after DISPLAY_UPDATE_INTERVAL seconds even with no state change."""
    controller.step()
    controller.mock_requests.post.reset_mock()
    # Backdate last_sent_time beyond the interval
    controller._last_sent_time = (
        datetime.datetime.now()
        - datetime.timedelta(seconds=hw_conf.DISPLAY_UPDATE_INTERVAL + 1)
    )
    controller.step()
    assert controller.mock_requests.post.call_count == 1

def test_turbidity_tier_boundaries(controller):
    """_turbidity_tier returns correct tier at each threshold boundary."""
    assert Controller._turbidity_tier(0)   == 0
    assert Controller._turbidity_tier(49)  == 0
    assert Controller._turbidity_tier(50)  == 1
    assert Controller._turbidity_tier(99)  == 1
    assert Controller._turbidity_tier(100) == 2
    assert Controller._turbidity_tier(500) == 2

# --- Drain pump state machine unit tests ---

def _shower_bits(controller):
    pins = [din.pin for din in hw_conf.MODE_SELECT_CHANNELS]
    controller.gpio.input.side_effect = lambda pin: [0, 0, 1][pins.index(pin)]

def test_drain_pump_starts_priming_when_shower_active(controller):
    """Drain pump turns on and enters PRIMING when shower drain flow is detected."""
    _shower_bits(controller)
    controller._adc_values[hw_conf.FLOW_OUT_SENSOR.channel] = hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.PRIMING
    controller.devantech.setDigitalState.assert_any_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 1)

def test_drain_pump_prime_timeout_transitions_to_waiting(controller):
    """After PRIME_TIMEOUT with no return flow, drain pump turns off and enters WAITING."""
    _shower_bits(controller)
    controller._adc_values[hw_conf.FLOW_OUT_SENSOR.channel] = hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    controller._drain_pump_state = DrainPumpState.PRIMING
    controller._drain_pump_state_entered = (
        datetime.datetime.now()
        - datetime.timedelta(seconds=controller_module._PRIME_TIMEOUT + 1)
    )
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.WAITING
    controller.devantech.setDigitalState.assert_any_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 0)

def test_drain_pump_transitions_to_pumping_on_return_flow(controller):
    """Return flow during priming transitions drain pump to PUMPING without relay change."""
    _shower_bits(controller)
    controller._adc_values[hw_conf.FLOW_OUT_SENSOR.channel]    = hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    controller._adc_values[hw_conf.FLOW_RETURN_SENSOR.channel] = hw_conf.FLOW_RETURN_SENSOR.full_scale_adc
    controller._drain_pump_state = DrainPumpState.PRIMING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.PUMPING

def test_drain_pump_stops_when_return_flow_drops(controller):
    """Loss of return flow while pumping turns off the drain pump and returns to IDLE."""
    _shower_bits(controller)
    # No flow anywhere
    controller._drain_pump_state = DrainPumpState.PUMPING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.IDLE
    controller.devantech.setDigitalState.assert_any_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 0)

def test_drain_pump_continues_pumping_when_shower_drain_stops(controller):
    """Drain pump stays in PUMPING if return flow persists even after shower drain flow stops."""
    _shower_bits(controller)
    controller._adc_values[hw_conf.FLOW_RETURN_SENSOR.channel] = hw_conf.FLOW_RETURN_SENSOR.full_scale_adc
    # flow_out = 0 (not set)
    controller._drain_pump_state = DrainPumpState.PUMPING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.PUMPING

def test_drain_pump_stops_when_return_flow_stops_after_shower_ends(controller):
    """Drain pump stops (IDLE) when return flow stops, even if shower drain also stopped."""
    _shower_bits(controller)
    # Both flows = 0
    controller._drain_pump_state = DrainPumpState.PUMPING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.IDLE

def test_drain_pump_stops_priming_when_shower_drain_flow_stops(controller):
    """If shower drain flow drops during priming, drain pump turns off and returns to IDLE."""
    _shower_bits(controller)
    # flow_out = 0 (not set)
    controller._drain_pump_state = DrainPumpState.PRIMING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.IDLE
    controller.devantech.setDigitalState.assert_any_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 0)

def test_drain_pump_retries_priming_in_same_step_after_waiting_interval(controller):
    """After PRIME_RETRY_INTERVAL with active drain flow, drain pump starts priming in the same step."""
    _shower_bits(controller)
    controller._adc_values[hw_conf.FLOW_OUT_SENSOR.channel] = hw_conf.FLOW_OUT_SENSOR.full_scale_adc
    controller._drain_pump_state = DrainPumpState.WAITING
    controller._drain_pump_state_entered = (
        datetime.datetime.now()
        - datetime.timedelta(seconds=controller_module._PRIME_RETRY_INTERVAL + 1)
    )
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.PRIMING
    controller.devantech.setDigitalState.assert_any_call(hw_conf.DRAIN_PUMP_POWER.channel, 0, 1)

def test_drain_pump_waiting_stays_if_drain_flow_stops(controller):
    """WAITING clears to IDLE (pump stays off) when shower drain flow stops."""
    _shower_bits(controller)
    # flow_out = 0: WAITING + no flow_out → IDLE → no priming (still no flow_out)
    controller._drain_pump_state = DrainPumpState.WAITING
    controller._drain_pump_state_entered = datetime.datetime.now()
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.IDLE

def test_drain_pump_state_resets_to_idle_on_non_shower_mode(controller):
    """Drain pump state resets to IDLE when mode changes away from SHOWER."""
    # mode bits = drain (0,0,0)
    controller._drain_pump_state = DrainPumpState.PUMPING
    controller.step()
    assert controller._drain_pump_state == DrainPumpState.IDLE

def test_safe_resets_drain_pump_state(controller):
    """safe() resets drain pump state to IDLE in addition to de-energizing all relays."""
    controller._drain_pump_state = DrainPumpState.PUMPING
    controller.safe()
    assert controller._drain_pump_state == DrainPumpState.IDLE

def test_ads1263_initialized_in_single_ended_mode(controller):
    """Controller.__init__ sets ScanMode=0 (single-ended, 10 channels) so channel 6 is reachable."""
    controller.ads.ADS1263_SetMode.assert_called_once_with(0)