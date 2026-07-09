import os
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
    inverted: bool = False  # True when higher voltage means lower sensor value

@dataclass
class DigitalInputConfig():
    pin: int  # RPi BCM pin number

@dataclass
class RelayChannel():
    channel: int

# Devantech endpoint config
DEVANTECH_IP = "192.168.2.3"
DEVANTECH_PORT = 17494

# Analog input configuration (channel, type, units, ADC full scale, sensor full scale, offset)
FLOW_OUT_SENSOR = AnalogInputConfig(
    channel=1,
    sensor_type="flow",
    units="L/min",
    full_scale_adc=2**31 - 1,
    full_scale_sensor=20.0,
    offset=0.0
)
FLOW_IN_SENSOR = AnalogInputConfig(
    channel=6,
    sensor_type="flow",
    units="L/min",
    full_scale_adc=2**31 - 1,
    full_scale_sensor=20.0,
    offset=0.0
)
TURBIDITY_SENSOR = AnalogInputConfig(
    channel=2,
    sensor_type="turbidity",
    units="NTU",
    full_scale_adc=2**31 - 1,
    full_scale_sensor=4000.0,  # KS0414 max NTU
    offset=0.0,
    inverted=True,             # KS0414: high voltage = clear water, low voltage = turbid
)

# Digital input configuration for mode select (rotary switch)
# 5-position 1-of-N: common → VCC; exactly one contact pin pulled high per position.
# Channel index matches mode constant value (e.g. index 0 = MODE_SANI = 0).
MODE_SELECT_CHANNELS: List[DigitalInputConfig] = [
    DigitalInputConfig(pin=23),  # position 0 → MODE_SANI   (BCM 23, physical 16)
    DigitalInputConfig(pin=24),  # position 1 → MODE_FLUSH  (BCM 24, physical 18)
    DigitalInputConfig(pin=25),  # position 2 → MODE_DRAIN  (BCM 25, physical 22)
    DigitalInputConfig(pin=16),  # position 3 → MODE_SHOWER (BCM 16, physical 36)
    DigitalInputConfig(pin=26),  # position 4 → MODE_IDLE   (BCM 26, physical 37)
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
MODE_IDLE   = 4

MODE_NAMES = {
    MODE_IDLE:   "IDLE",
    MODE_DRAIN:  "DRAIN",
    MODE_FLUSH:  "FLUSH",
    MODE_SHOWER: "SHOWER",
    MODE_SANI:   "SANITIZE",
}

OPEN   = 1
CLOSED = 0

# MagicMirror² display webhook
MAGICMIRROR_WEBHOOK_URL = os.environ.get("MAGICMIRROR_WEBHOOK_URL", "http://192.168.2.2:8080/shower-update")

# Turbidity tier thresholds (NTU). Tier 0 = clean, 1 = warning, 2 = unsafe.
# Must match the turbidityLevels config in MMM-Infinistream.
TURBIDITY_TIERS = [0, 50, 100]

# Minimum NTU change from the last sent value to trigger an immediate display
# update. Chosen to be well above sensor noise (~2–5 NTU) and flow turbulence
# (~5–15 NTU) while remaining sensitive to real fouling trends.
TURBIDITY_DELTA_THRESHOLD = 10

# Minimum seconds between display webhook posts when mode and turbidity are
# unchanged beyond the delta threshold. Mode or delta changes always send immediately.
DISPLAY_UPDATE_INTERVAL = 30
