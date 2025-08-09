import datetime
import time

import click

import lib8relind

from .hw_conf import POST_FILTER_VALVE, SANI_LOOP_VALVE, FLUSH_VALVE, DRAIN_VALVE, DRAIN_PUMP_POWER, \
    SUPPLY_PUMP_POWER, UVC_POWER, MODE_DRAIN, MODE_FLUSH, MODE_SHOWER, MODE_SANI, OPEN, CLOSED


def safe():
    lib8relind.set_all(0,0)
    lib8relind.set_all(1,0)

def read_sensors():
    # read turbidity
    # read UV-C flow
    # read out flow
    # read selector switch
    return

def set_drain():
    lib8relind.set(**POST_FILTER_VALVE, CLOSED)
    lib8relind.set(**SANI_LOOP_VALVE, CLOSED)
    lib8relind.set(**FLUSH_VALVE, CLOSED)
    lib8relind.set(**DRAIN_VALVE, OPEN)

def set_flush():
    lib8relind.set(**POST_FILTER_VALVE, CLOSED)
    lib8relind.set(**SANI_LOOP_VALVE, CLOSED)
    lib8relind.set(**FLUSH_VALVE, OPEN)
    lib8relind.set(**DRAIN_VALVE, CLOSED)

def set_shower():
    lib8relind.set(**POST_FILTER_VALVE, OPEN)
    lib8relind.set(**SANI_LOOP_VALVE, CLOSED)
    lib8relind.set(**FLUSH_VALVE, CLOSED)
    lib8relind.set(**DRAIN_VALVE, CLOSED)

def set_sani():
    lib8relind.set(**POST_FILTER_VALVE, CLOSED)
    lib8relind.set(**SANI_LOOP_VALVE, OPEN)
    lib8relind.set(**FLUSH_VALVE, CLOSED)
    lib8relind.set(**DRAIN_VALVE, CLOSED)

def set_mode(mode_select):
    if mode_select == MODE_DRAIN:
        set_drain()
    elif mode_select == MODE_FLUSH:
        set_flush()
    elif mode_select == MODE_SHOWER:
        set_shower()
    elif mode_select == MODE_SANI:
        set_sani()
    else:
        safe()

def display_status():
    pass

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

    if sensors.flow_out > 0:
        determine_derived_mode.last_flow_detected = now
        time_since_flow = now - determine_derived_mode.last_flow_detected

    if sensors.mode_select == MODE_SHOWER:
        if time_since_flow.total_seconds > (12 * seconds_in_hour):
            if determine_derived_mode.sani_on and now > determine_derived_mode.sanitize_off_time:
                time_since_flow = now - determine_derived_mode.last_flow_detected
                determine_derived_mode.sani_on = False
                return MODE_SHOWER
            determine_derived_mode.sani_on = True
            determine_derived_mode.sanitize_off_time = now + (5 * seconds_in_minute)
            return MODE_SANI
        return MODE_SHOWER
    else:
        determine_derived_mode.sani_on = False
        return sensors.mode_select

click.command()
def run():
    safe()
    previous_mode = None

    while True:
        sensors = read_sensors()
        mode = determine_derived_mode(sensors)
        set_mode(mode)
        display_status(mode, sensors)


if __name__ == "__main__":
    run()
