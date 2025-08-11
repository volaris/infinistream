import datetime
import time

import click

import devantech_eth

from src.hw_conf import (
    DEVANTECH_IP, DEVANTECH_PORT,
    FLOW_IN_SENSOR, FLOW_OUT_SENSOR, TURBIDITY_SENSOR,
    MODE_SELECT_CHANNELS,
    POST_FILTER_VALVE, SANI_LOOP_VALVE, FLUSH_VALVE, DRAIN_VALVE,
    DRAIN_PUMP_POWER, SUPPLY_PUMP_POWER, UVC_POWER,
    MODE_DRAIN, MODE_FLUSH, MODE_SHOWER, MODE_SANI, OPEN, CLOSED,
    RelayChannel
)


class Controller:
    def __init__(self, ads, gpio_mode):
        self.ads = ads
        self.ads.ADS1263_init_ADC1()
        # Set mode select channels to GPIO digital mode
        for din in MODE_SELECT_CHANNELS:
            self.ads.ADS1263_GPIOChannelMode(din.channel, gpio_mode["MODE_DIGITAL"], 1)
        self.devantech = devantech_eth

    def safe(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, CLOSED)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_PUMP_POWER, 0)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 0)
        self.set_relay_channel(UVC_POWER, 0)

    def read_sensors(self):
        # Read mode select from GPIOs (digital)
        mode_bits = []
        for din in MODE_SELECT_CHANNELS:
            val = self.ads.ADS1263_DigitalRead(din.channel)
            mode_bits.append(val)
        mode_select = self.decode_mode_bits(mode_bits)

        # Read flow sensors and turbidity as analog, apply calibration
        flow_in_raw = self.ads.ADS1263_GetChannalValue(FLOW_IN_SENSOR.channel)
        flow_out_raw = self.ads.ADS1263_GetChannalValue(FLOW_OUT_SENSOR.channel)
        turbidity_raw = self.ads.ADS1263_GetChannalValue(TURBIDITY_SENSOR.channel)

        flow_in = self.decode_analog(flow_in_raw, FLOW_IN_SENSOR)
        flow_out = self.decode_analog(flow_out_raw, FLOW_OUT_SENSOR)
        turbidity = self.decode_analog(turbidity_raw, TURBIDITY_SENSOR)

        return type('Sensors', (), {
            'mode_select': mode_select,
            'flow_in': flow_in,
            'flow_out': flow_out,
            'turbidity': turbidity
        })()

    def decode_mode_bits(self, bits):
        val = (bits[0] << 2) | (bits[1] << 1) | bits[2]
        if val == 0b000:
            return MODE_DRAIN
        elif val == 0b001:
            return MODE_FLUSH
        elif val == 0b010:
            return MODE_SHOWER
        elif val == 0b100:
            return MODE_SANI
        else:
            return MODE_DRAIN  # fallback

    def decode_analog(self, raw, config):
        # Convert ADC value to sensor units using calibration
        value = (raw / config.full_scale_adc) * config.full_scale_sensor + config.offset
        return value

    def set_relay_channel(self, channel: RelayChannel, state):
        self.devantech.setDigitalState(channel.channel, 0, state)

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
        self.set_relay_channel(DRAIN_PUMP_POWER, 1)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 1)
        self.set_relay_channel(UVC_POWER, 1)

    def set_sani(self):
        self.set_relay_channel(POST_FILTER_VALVE, CLOSED)
        self.set_relay_channel(SANI_LOOP_VALVE, OPEN)
        self.set_relay_channel(FLUSH_VALVE, CLOSED)
        self.set_relay_channel(DRAIN_VALVE, CLOSED)
        self.set_relay_channel(SUPPLY_PUMP_POWER, 1)
        self.set_relay_channel(UVC_POWER, 0)
        self.set_relay_channel(DRAIN_PUMP_POWER, 0)

    def set_mode(self, mode_select):
        if mode_select == MODE_DRAIN:
            self.set_drain()
        elif mode_select == MODE_FLUSH:
            self.set_flush()
        elif mode_select == MODE_SHOWER:
            self.set_shower()
        elif mode_select == MODE_SANI:
            self.set_sani()
        else:
            self.safe()

    def display_status(self, mode, sensors):
        print(f"Mode: {mode}, Flow In: {sensors.flow_in:.2f} L/min, Flow Out: {sensors.flow_out:.2f} L/min, Turbidity: {sensors.turbidity:.1f} NTU")

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

    def step(self):
        sensors = self.read_sensors()
        mode = Controller.determine_derived_mode(sensors)
        self.set_mode(mode)
        self.display_status(mode, sensors)

@click.command()
def run():
    from ADS1263 import ADS1263, GPIO_MODE  # Import only here
    controller = Controller(ADS1263(), GPIO_MODE)
    previous_mode = None

    while True:
        controller.step()
        time.sleep(1)

if __name__ == "__main__":
    run()
