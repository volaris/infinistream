import datetime
import time
from enum import Enum

import click
import requests

from devantech_eth import eth008

from infinistream_controller.hw_conf import (
    DEVANTECH_IP, DEVANTECH_PORT,
    FLOW_IN_SENSOR, FLOW_OUT_SENSOR, TURBIDITY_SENSOR,
    MODE_SELECT_CHANNELS,
    POST_FILTER_VALVE, SANI_LOOP_VALVE, FLUSH_VALVE, DRAIN_VALVE,
    DRAIN_PUMP_POWER, SUPPLY_PUMP_POWER, UVC_POWER,
    MODE_IDLE, MODE_DRAIN, MODE_FLUSH, MODE_SHOWER, MODE_SANI, OPEN, CLOSED,
    MODE_NAMES, MAGICMIRROR_WEBHOOK_URL,
    TURBIDITY_TIERS, TURBIDITY_DELTA_THRESHOLD, DISPLAY_UPDATE_INTERVAL,
    RelayChannel
)


class DrainPumpState(Enum):
    IDLE    = "idle"
    PRIMING = "priming"
    PUMPING = "pumping"
    WAITING = "waiting"

_FLOW_OUT_THRESHOLD    = 0.1  # L/min — shower considered active above this
_FLOW_IN_THRESHOLD     = 0.1  # L/min — drain return considered active above this
_PRIME_TIMEOUT         = 15   # seconds — safe dry-run limit before aborting prime
_PRIME_RETRY_INTERVAL  = 30   # seconds — wait after failed prime before retrying


class Controller:
    def __init__(self, ads, gpio):
        self.ads = ads
        self.gpio = gpio
        self.ads.ADS1263_init_ADC1()
        self.ads.ADS1263_SetMode(0)  # single-ended: 10 channels (0–9), needed for ch6
        for din in MODE_SELECT_CHANNELS:
            self.gpio.setup(din.pin, self.gpio.IN, pull_up_down=self.gpio.PUD_DOWN)
        self.devantech = eth008.ETH008(ip = DEVANTECH_IP, port = DEVANTECH_PORT, password = "password")
        self.devantech.connect()
        self._last_sent_mode = None
        self._last_sent_turbidity = None
        self._last_sent_turbidity_tier = None
        self._last_sent_time = datetime.datetime.min
        self._drain_pump_state = DrainPumpState.IDLE
        self._drain_pump_state_entered = datetime.datetime.min

    def safe(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, CLOSED)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_PUMP_POWER, 0)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 0)
        self.set_relay_channel(UVC_POWER, 0)
        self._drain_pump_state = DrainPumpState.IDLE
        self._drain_pump_state_entered = datetime.datetime.min

    def read_sensors(self):
        # Read mode select from RPi GPIO pins (active-high, pull-down)
        mode_bits = []
        for din in MODE_SELECT_CHANNELS:
            val = self.gpio.input(din.pin)
            mode_bits.append(val)
        mode_select = self.decode_mode_bits(mode_bits)

        # Read flow sensors and turbidity as analog, apply calibration
        flow_in_raw     = self.ads.ADS1263_GetChannalValue(FLOW_IN_SENSOR.channel)
        flow_out_raw    = self.ads.ADS1263_GetChannalValue(FLOW_OUT_SENSOR.channel)
        turbidity_raw   = self.ads.ADS1263_GetChannalValue(TURBIDITY_SENSOR.channel)

        flow_in   = self.decode_analog(flow_in_raw,   FLOW_IN_SENSOR)
        flow_out  = self.decode_analog(flow_out_raw,  FLOW_OUT_SENSOR)
        turbidity = self.decode_analog(turbidity_raw, TURBIDITY_SENSOR)

        return type('Sensors', (), {
            'mode_select': mode_select,
            'flow_in':     flow_in,
            'flow_out':    flow_out,
            'turbidity':   turbidity
        })()

    def decode_mode_bits(self, bits):
        val = (bits[0] << 2) | (bits[1] << 1) | bits[2]
        if val == 0b000:
            return MODE_IDLE
        elif val == 0b001:
            return MODE_SHOWER
        elif val == 0b010:
            return MODE_SANI
        elif val == 0b011:
            return MODE_DRAIN
        elif val == 0b100:
            return MODE_FLUSH
        else:
            return MODE_IDLE  # fault: unknown pattern → safe

    def decode_analog(self, raw, config):
        ratio = raw / config.full_scale_adc
        if config.inverted:
            ratio = 1.0 - ratio
        return ratio * config.full_scale_sensor + config.offset

    def set_relay_channel(self, channel: RelayChannel, state):
        self.devantech.setDigitalState(channel.channel, 0, state)

    def set_idle(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, CLOSED)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_PUMP_POWER, 0)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 0)
        self.set_relay_channel(UVC_POWER, 0)

    def set_drain(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, CLOSED)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, OPEN)
        self.set_relay_channel(DRAIN_PUMP_POWER, 1)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 0)
        self.set_relay_channel(UVC_POWER, 0)

    def set_flush(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, CLOSED)
        self.set_relay_channel(FLUSH_VALVE, OPEN)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_PUMP_POWER, 1)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 1)
        self.set_relay_channel(UVC_POWER, 0)

    def set_shower(self):
        self.set_relay_channel(POST_FILTER_VALVE, OPEN)
        self.set_relay_channel(SANI_LOOP_VALVE, CLOSED)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 1)
        self.set_relay_channel(UVC_POWER, 1)
        # DRAIN_PUMP_POWER is managed by _step_drain_pump

    def set_sani(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, OPEN)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 1)
        self.set_relay_channel(UVC_POWER, 1)
        self.set_relay_channel(DRAIN_PUMP_POWER, 0)

    def set_mode(self, mode_select):
        if mode_select == MODE_IDLE:
            self.set_idle()
        elif mode_select == MODE_DRAIN:
            self.set_drain()
        elif mode_select == MODE_FLUSH:
            self.set_flush()
        elif mode_select == MODE_SHOWER:
            self.set_shower()
        elif mode_select == MODE_SANI:
            self.set_sani()
        else:
            self.safe()

    @staticmethod
    @staticmethod
    def _turbidity_tier(turbidity):
        for i in range(len(TURBIDITY_TIERS) - 1, 0, -1):
            if turbidity >= TURBIDITY_TIERS[i]:
                return i
        return 0

    def _should_send_display_update(self, mode_name, turbidity):
        if mode_name != self._last_sent_mode:
            return True
        if self._turbidity_tier(turbidity) != self._last_sent_turbidity_tier:
            return True
        if self._last_sent_turbidity is None or abs(turbidity - self._last_sent_turbidity) >= TURBIDITY_DELTA_THRESHOLD:
            return True
        elapsed = (datetime.datetime.now() - self._last_sent_time).total_seconds()
        return elapsed >= DISPLAY_UPDATE_INTERVAL

    def display_status(self, mode, sensors):
        mode_name = MODE_NAMES.get(mode, str(mode))
        print(f"Mode: {mode_name}, Drain Pump: {self._drain_pump_state.value}, Flow In: {sensors.flow_in:.2f} L/min, Flow Out: {sensors.flow_out:.2f} L/min, Turbidity: {sensors.turbidity:.1f} NTU")
        if self._should_send_display_update(mode_name, sensors.turbidity):
            try:
                print(f"Attempting update @ {MAGICMIRROR_WEBHOOK_URL}")
                requests.post(
                    MAGICMIRROR_WEBHOOK_URL,
                    json={
                        "mode": mode_name,
                        "turbidity": round(sensors.turbidity, 2),
                        "flow_in": round(sensors.flow_in, 2),
                        "flow_out": round(sensors.flow_out, 2),
                    },
                    timeout=2,
                )
            except requests.exceptions.RequestException as e:
                print(e)
                pass
            self._last_sent_mode = mode_name
            self._last_sent_turbidity = sensors.turbidity
            self._last_sent_turbidity_tier = self._turbidity_tier(sensors.turbidity)
            self._last_sent_time = datetime.datetime.now()

    @staticmethod
    def static_vars(**kwargs):
        def decorate(func):
            for k in kwargs:
                setattr(func, k, kwargs[k])
            return func
        return decorate

    @static_vars(last_flow_detected = datetime.datetime.now(),
                sanitize_off_time = datetime.datetime.now(),
                sani_on = False)
    def determine_derived_mode(sensors):
        seconds_in_minute = 60
        seconds_in_hour = 60 * seconds_in_minute
        now = datetime.datetime.now()

        if sensors.flow_out > 0.1:
            Controller.determine_derived_mode.last_flow_detected = now

        time_since_flow = now - Controller.determine_derived_mode.last_flow_detected

        if sensors.mode_select == MODE_SHOWER:
            if time_since_flow.total_seconds() > (12 * seconds_in_hour):
                if Controller.determine_derived_mode.sani_on and now > Controller.determine_derived_mode.sanitize_off_time:
                    time_since_flow = now - Controller.determine_derived_mode.last_flow_detected
                    Controller.determine_derived_mode.sani_on = False
                    return MODE_SHOWER
                Controller.determine_derived_mode.sani_on = True
                Controller.determine_derived_mode.sanitize_off_time = now + datetime.timedelta(seconds=5 * seconds_in_minute)
                return MODE_SANI
            return MODE_SHOWER
        else:
            Controller.determine_derived_mode.sani_on = False
            return sensors.mode_select

    def _step_drain_pump(self, sensors, mode):
        now = datetime.datetime.now()
        flow_out    = sensors.flow_out    > _FLOW_OUT_THRESHOLD
        flow_in = sensors.flow_in > _FLOW_IN_THRESHOLD

        if mode != MODE_SHOWER:
            if self._drain_pump_state != DrainPumpState.IDLE:
                self._drain_pump_state = DrainPumpState.IDLE
                self._drain_pump_state_entered = now
            return

        elapsed = (now - self._drain_pump_state_entered).total_seconds()

        # WAITING: resolve to IDLE immediately and fall through so priming can start this step
        if self._drain_pump_state == DrainPumpState.WAITING:
            if not flow_out or elapsed >= _PRIME_RETRY_INTERVAL:
                self._drain_pump_state = DrainPumpState.IDLE
                self._drain_pump_state_entered = now
                elapsed = 0

        if self._drain_pump_state == DrainPumpState.IDLE:
            if flow_out:
                self._drain_pump_state = DrainPumpState.PRIMING
                self._drain_pump_state_entered = now
                self.set_relay_channel(DRAIN_PUMP_POWER, 1)

        elif self._drain_pump_state == DrainPumpState.PRIMING:
            if flow_in:
                self._drain_pump_state = DrainPumpState.PUMPING
                self._drain_pump_state_entered = now
            elif not flow_out:
                self.set_relay_channel(DRAIN_PUMP_POWER, 0)
                self._drain_pump_state = DrainPumpState.IDLE
                self._drain_pump_state_entered = now
            elif elapsed >= _PRIME_TIMEOUT:
                self.set_relay_channel(DRAIN_PUMP_POWER, 0)
                self._drain_pump_state = DrainPumpState.WAITING
                self._drain_pump_state_entered = now

        elif self._drain_pump_state == DrainPumpState.PUMPING:
            if not flow_in:
                self.set_relay_channel(DRAIN_PUMP_POWER, 0)
                self._drain_pump_state = DrainPumpState.IDLE
                self._drain_pump_state_entered = now

    def step(self):
        sensors = self.read_sensors()
        mode = Controller.determine_derived_mode(sensors)
        self.set_mode(mode)
        self._step_drain_pump(sensors, mode)
        self.display_status(mode, sensors)

@click.command()
def run():
    from infinistream_controller.ADS1263 import ADS1263
    import RPi.GPIO as GPIO
    controller = Controller(ADS1263(), GPIO)

    while True:
        controller.step()
        time.sleep(1)

if __name__ == "__main__":
    run()
