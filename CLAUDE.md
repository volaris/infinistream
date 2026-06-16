# Infinistream — Agent Guidelines

## Running tests

Tests live in `infinistream_controller/`. Run both suites after any controller change:

```bash
PYTHONPATH=/workspaces/infinistream \
  infinistream_controller/venv/bin/python -m pytest \
  infinistream_controller/test_controller.py infinistream_controller/test_module_integration.py -v
```

- `test_controller.py` — BDD + unit tests (mocked hardware, mocked HTTP)
- `test_module_integration.py` — integration tests (mocked hardware, real HTTP over a local socket)

## Keeping docs in sync

`docs/spec-hardware.md` is the wiring reference used when physically building the system.
Update it whenever you change:
- Pin assignments (ADC channels, RPi BCM pins, SPI/I2C bus)
- Sensor wiring or full-scale values
- Relay channel assignments
- Any interface type or connector

## Hardware abstraction

- `infinistream_controller/hw_conf.py` — all pin numbers and sensor config live here; no magic numbers elsewhere
- `infinistream_controller/config.py` — platform detection (RPi / Jetson / MockHardware); hardware imports are guarded here so the controller logic runs in test environments without real GPIO/SPI
- Controller tests inject mock hardware via constructor args (`ads`, `gpio`) — keep it that way so tests don't need to patch low-level imports
