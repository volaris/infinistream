# Sensor Input Diagnostics

Flow sensors (FLOW_IN on AIN6, FLOW_OUT on AIN1) were reading pegged at 20 L/min (full scale)
with the sensor freshly connected. This is a guide for diagnosing that and similar analog input issues.

## Background

- ADC: ADS1263 (Waveshare HAT), SPI, single-ended mode (AINx vs AINCOM)
- Reference: AVDD/AVSS (5V from Pi's 5V rail) — correct for 0–5V sensors
- Full-scale raw value: `0x7FFFFFFF` (2³¹ − 1)
- Calibration: `value = (raw / 0x7FFFFFFF) * full_scale_sensor + offset` (`hw_conf.py`)
- Flow sensors: 0–20 L/min full scale
- "Pegged at max" means raw ≈ `0x7FFFFFFF`, i.e. the ADC input is sitting near 5V — typical of a floating input

## Step 1 — Verify AINCOM is grounded

In single-ended mode the negative input for every channel is AINCOM. If AINCOM is floating, all
readings are meaningless. Confirm AINCOM is shorted to AGND on the HAT before doing anything else.

## Step 2 — Read raw ADC values with ad_probe.py

Edit `infinistream_controller/ad_probe.py`:

```python
channelList = [1, 6]   # FLOW_OUT = ch1, FLOW_IN = ch6
```

Run on the Pi:

```bash
sudo python infinistream_controller/ad_probe.py
```

Expected: ~0 V with no flow, proportional voltage with flow running.

## Step 3 — Short-to-GND test

With ad_probe.py running, briefly touch the sensor signal wire to GND.

- Reading drops to 0 V → ADC and reference are healthy; problem is on the sensor side
- Reading stays pegged → AINCOM is likely floating (return to Step 1)

## Step 4 — Confirm channel assignments match physical wiring

Cross-check wiring against `hw_conf.py`:

| Sensor    | ADC channel | `hw_conf.py` constant |
|-----------|-------------|----------------------|
| FLOW_OUT  | AIN1        | `FLOW_OUT_SENSOR`    |
| FLOW_IN   | AIN6        | `FLOW_IN_SENSOR`     |
| Turbidity | AIN2        | `TURBIDITY_SENSOR`   |

If the physical wires are on different channels, update `hw_conf.py` to match rather than rewiring.

## Step 5 — Confirm sensor output type and range

Check the flow meter datasheet:

- **0–5V voltage output** — wire directly to AIN; no shunt needed
- **4–20 mA current loop** — requires a shunt resistor across AIN and GND (e.g. 250Ω → 1–5V); without it the input floats open and reads full scale
- **0.5–4.5V ratiometric** — update `full_scale_sensor` and `offset` in `hw_conf.py` accordingly

## Step 6 — Update calibration if range is correct but value is off

If voltage is proportional to flow but the L/min number is wrong, adjust in `hw_conf.py`:

```python
FLOW_OUT_SENSOR = AnalogInputConfig(
    channel=1,
    sensor_type="flow",
    units="L/min",
    full_scale_adc=2**31 - 1,
    full_scale_sensor=20.0,   # adjust to match sensor datasheet max
    offset=0.0                # adjust for any zero offset (e.g. 4mA = 0 L/min)
)
```

## Reference

- ADS1263 driver: `infinistream_controller/ADS1263.py`
- REFMUX = `0x24` (AVDD/AVSS as reference) set in `ADS1263_ConfigADC()`
- Single-ended channel mux: `INPMUX = (channel << 4) | 0x0A` (negative = AINCOM)
- Hardware pin assignments: `docs/spec-hardware.md`
