from typing import NamedTuple, List
from dataclasses import dataclass

@dataclass
class AnalogInputConfig():
    channel: int
    sensor_type: str
    units: str
    full_scale_adc: int
    full_scale_sensor: float
    offset: float = 0.0

@dataclass
class DigitalInputConfig():
    channel: int

@dataclass
class RelayChannel():
    channel: int

# Devantech endpoint config
DEVANTECH_IP = "192.168.1.50"
DEVANTECH_PORT = 17123

# Analog input configuration (channel, type, units, ADC full scale, sensor full scale, offset)
FLOW_IN_SENSOR = AnalogInputConfig(
    channel=0,
    sensor_type="flow",
    units="L/min",
    full_scale_adc=2**24,
    full_scale_sensor=20.0,  # Gredia GR-S403 max flow
    offset=0.0
)
FLOW_OUT_SENSOR = AnalogInputConfig(
    channel=1,
    sensor_type="flow",
    units="L/min",
    full_scale_adc=2**24,
    full_scale_sensor=20.0,
    offset=0.0
)
TURBIDITY_SENSOR = AnalogInputConfig(
    channel=2,
    sensor_type="turbidity",
    units="NTU",
    full_scale_adc=2**24,
    full_scale_sensor=4000.0,  # KS0414 max NTU
    offset=0.0
)

# Digital input configuration for mode select (rotary switch)
MODE_SELECT_CHANNELS: List[DigitalInputConfig] = [
    DigitalInputConfig(channel=3),
    DigitalInputConfig(channel=4),
    DigitalInputConfig(channel=5)
]

# Relay assignments
POST_FILTER_VALVE = RelayChannel(1)
SANI_LOOP_VALVE   = RelayChannel(2)
FLUSH_VALVE       = RelayChannel(3)
DRAIN_VALVE       = RelayChannel(4)
DRAIN_PUMP_POWER  = RelayChannel(5)
SUPPLY_PUMP_POWER = RelayChannel(6)
UVC_POWER         = RelayChannel(7)

# Modes
MODE_SANI   = 0
MODE_FLUSH  = 1
MODE_DRAIN  = 2
MODE_SHOWER = 3

OPEN   = 1
CLOSED = 0
