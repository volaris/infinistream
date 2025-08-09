from typing import NamedTuple

class RelayChannel(NamedTuple):
    layer: int
    relay: int

class HWInputs(NamedTuple):
    mode_select: int
    turbidity: float
    flow_in: float
    flow_out: float

POST_FILTER_VALVE = NamedTuple(
    layer = 0,
    relay = 0
)
SANI_LOOP_VALVE = NamedTuple(
    layer = 0,
    relay = 0
)
FLUSH_VALVE = NamedTuple(
    layer = 0,
    relay = 0
)
DRAIN_VALVE = NamedTuple(
    layer = 0,
    relay = 0
)

DRAIN_PUMP_POWER = NamedTuple(
    layer = 0,
    relay = 0
)
SUPPLY_PUMP_POWER = NamedTuple(
    layer = 0,
    relay = 0
)
UVC_POWER = NamedTuple(
    layer = 0,
    relay = 0
)

MODE_SANI = 0
MODE_FLUSH = 1
MODE_DRAIN = 2
MODE_SHOWER = 3

OPEN = 1
CLOSED = 0
