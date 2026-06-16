# Infinistream — Hardware & Interface Specification

## System Components

The system uses two Raspberry Pis on the same LAN. The **controller Pi** handles all
hardware I/O; the **display Pi** runs the UI stack. This separation ensures display
issues cannot affect the control loop.

### Controller Pi

| Component             | Model / Part            | Interface        | Role                                   |
|-----------------------|-------------------------|------------------|----------------------------------------|
| Controller SBC        | Raspberry Pi            | —                | Runs Python control loop               |
| ADC / GPIO board      | Waveshare ADS1263 HAT   | SPI (bus 0)      | 24-bit analog reads                    |
| Relay board           | Devantech ETH008        | TCP/IP           | Controls all valves and pumps          |
| Flow sensor (drain)   | Gredia GR-S403          | Analog (0–5 V)   | Measures shower drain flow rate        |
| Flow sensor (supply)  | Gredia GR-S403          | Analog (0–5 V)   | Measures supply flow to shower head    |
| Flow sensor (return)  | Gredia GR-S403          | Analog (0–5 V)   | Measures return pump output flow       |
| Turbidity sensor      | DFRobot KS0414          | Analog (0–5 V)   | Measures water clarity in NTU          |
| Mode select switch    | 3-position rotary       | RPi GPIO (BCM)   | Operator mode selection                |

### Display Pi

| Component           | Model / Part                  | Interface  | Role                                        |
|---------------------|-------------------------------|------------|---------------------------------------------|
| Display SBC         | Raspberry Pi                  | —          | Runs MagicMirror² and e-ink rendering stack |
| E-ink display       | Waveshare 7.5" e-Paper HAT V2 | SPI (bus 0)| 800×480 B/W display, ~4 s full refresh      |
| Display software    | MagicMirror²                  | HTTP       | Receives webhook, renders browser UI        |
| Screenshot service  | Puppeteer (Node.js)           | localhost  | Screenshots MagicMirror on state change     |
| E-ink driver        | Waveshare epd7in5_V2          | SPI        | Pushes rendered image to display            |

---

## ADC Board — Waveshare ADS1263 HAT

- **Driver:** `ADS1263.py` (Waveshare SDK, adapted)
- **ADC resolution:** 32-bit signed (ADC1 mode), full-scale value = `2^31 - 1 = 2,147,483,647`
- **Interface:** SPI bus 1

### Analog Input Channels

| Channel | Signal          | Sensor         | Units  | Full-Scale Value | Notes                        |
|---------|-----------------|----------------|--------|------------------|------------------------------|
| 0       | Flow in (drain) | Gredia GR-S403 | L/min  | 20.0             | Shower pan → filter          |
| 1       | Flow out (supply)| Gredia GR-S403| L/min  | 20.0             | Supply pump → shower head    |
| 2       | Turbidity       | DFRobot KS0414 | NTU    | 4000.0           | Inverted: high V = clear     |
| 6       | Flow return     | Gredia GR-S403 | L/min  | 20.0             | Drain pump outlet; dry-run protection |

Channels 3–5 are available for future analog use. Channel 6 is used for flow return.

#### Calibration Formula

```python
sensor_value = (raw_adc / full_scale_adc) * full_scale_sensor + offset
```

- `raw_adc`: raw integer from `ADS1263_GetChannalValue(channel)`
- `full_scale_adc`: `2,147,483,647` (2^31 - 1, signed 32-bit max)
- `full_scale_sensor`: sensor-specific (see table above)
- `offset`: `0.0` for all current sensors
- For the turbidity sensor, `inverted = True`: ratio is computed as `1.0 - ratio` before scaling

### Digital Input Channels (Mode Select)

Mode select uses three Raspberry Pi GPIO pins directly, not the ADS1263. Each pin reads
one bit of the rotary switch position. Pins are configured as inputs with internal
pull-down resistors; the rotary switch common wire connects to VCC (3.3 V). The selected
contact pulls its pin high. A disconnected or unpowered line reads 0, which decodes as
DRAIN — the safest fallback mode.

| BCM Pin | Physical Pin | Bit Position | Description       |
|---------|--------------|--------------|-------------------|
| 23      | 16           | Bit 2 (MSB)  | Mode select bit 2 |
| 24      | 18           | Bit 1        | Mode select bit 1 |
| 25      | 22           | Bit 0 (LSB)  | Mode select bit 0 |

**Wiring:** rotary switch common → VCC (3.3 V); each output contact → BCM 23/24/25.
No external resistors required; RPi internal pull-downs (~50 kΩ) hold pins low when open.

Bit assembly: `val = (bcm23 << 2) | (bcm24 << 1) | bcm25`

| val    | Rotary position | Mode    |
|--------|-----------------|---------|
| 0b000  | 0 (open)        | IDLE    |
| 0b001  | 1               | SHOWER  |
| 0b010  | 2               | SANITIZE|
| 0b011  | 3               | DRAIN   |
| 0b100  | 4               | FLUSH   |
| other  | fault           | IDLE    |

---

## Relay Board — Devantech ETH008

The relay board is accessed over Ethernet using the `devantech-eth` Python library.

### Network Configuration

| Parameter | Value                           |
|-----------|---------------------------------|
| IP        | `192.168.2.3`                   |
| Port      | `17494`                         |
| Protocol  | TCP (Devantech binary protocol) |

### Relay Channel Assignments

| Relay | Name               | Actuator             | Active state |
|-------|--------------------|----------------------|--------------|
| 1     | POST_FILTER_VALVE  | Post-filter valve    | OPEN = 1     |
| 2     | SANI_LOOP_VALVE    | Sanitize loop valve  | OPEN = 1     |
| 3     | FLUSH_VALVE        | Flush valve          | OPEN = 1     |
| 4     | DRAIN_VALVE        | Drain valve          | OPEN = 1     |
| 5     | DRAIN_PUMP_POWER   | Drain pump           | ON = 1       |
| 6     | SUPPLY_PUMP_POWER  | Supply pump          | ON = 1       |
| 7     | UVC_POWER          | UV-C light           | ON = 1       |
| 8     | (unassigned)       | —                    | —            |

Relay state is set via `devantech_eth.setDigitalState(channel, 0, state)`.

---

## Actuator Truth Table

Full relay state for each mode. `1` = energized (valve open / device on), `0` = de-energized.

| Relay | Actuator           | IDLE | DRAIN | FLUSH | SHOWER        | SANITIZE | SAFE |
|-------|--------------------|------|-------|-------|---------------|----------|------|
| 1     | Post-filter valve  | 0    | 0     | 0     | 1             | 0        | 0    |
| 2     | Sani-loop valve    | 0    | 0     | 0     | 0             | 1        | 0    |
| 3     | Flush valve        | 0    | 0     | 1     | 0             | 0        | 0    |
| 4     | Drain valve        | 0    | 1     | 0     | 0             | 0        | 0    |
| 5     | Drain pump         | 0    | 1     | 1     | state machine | 0        | 0    |
| 6     | Supply pump        | 0    | 0     | 1     | 1             | 1        | 0    |
| 7     | UV-C light         | 0    | 0     | 0     | 1             | 1        | 0    |

In SHOWER mode the drain pump (relay 5) is controlled by the dry-run protection state
machine rather than being held permanently on. See `spec-behavioral.md` for the full
state machine description.

---

## Platform Abstraction

The controller supports multiple SBC platforms via runtime detection in `src/config.py`.
At import time the module reads `/proc/cpuinfo` and injects the appropriate SPI/GPIO
implementation into the module namespace.

| Platform     | Detection string in `/proc/cpuinfo` | Implementation class |
|--------------|-------------------------------------|----------------------|
| Raspberry Pi | `Raspberry Pi`                      | `RaspberryPi`        |
| Jetson Nano  | `NVIDIA Jetson Nano`                | `JetsonNano`         |
| Other / test | (no match)                          | `MockHardware`       |

`MockHardware` provides no-op stubs for all SPI/GPIO calls, allowing the controller
logic to run and be tested on non-embedded hardware.

---

## MagicMirror Webhook API

The controller Pi POSTs status updates to the display Pi's MagicMirror² module. Updates
are throttled — see `spec-behavioral.md` for the throttle rules. The display Pi handles
all rendering independently; a lost or slow POST never stalls the control loop.

### Request

```text
POST /shower-update
Content-Type: application/json
```

```json
{
  "mode": "<string>",
  "turbidity": <number>
}
```

| Field       | Type   | Required | Valid values                                   |
|-------------|--------|----------|------------------------------------------------|
| `mode`      | string | Yes      | `"SHOWER"`, `"DRAIN"`, `"FLUSH"`, `"SANITIZE"` |
| `turbidity` | number | Yes      | Floating-point, units NTU, ≥ 0                 |

### Response

| Status | Meaning                              |
|--------|--------------------------------------|
| `200`  | Update accepted and forwarded to UI  |
| `400`  | Malformed payload (missing fields)   |

### Configuration

```python
# src/hw_conf.py
MAGICMIRROR_WEBHOOK_URL  = "http://<display-pi-ip>:8085/shower-update"
TURBIDITY_TIERS          = [0, 50, 100]   # NTU thresholds: clean / warning / unsafe
DISPLAY_UPDATE_INTERVAL  = 30             # seconds between throttled updates
```

The MagicMirror module listens on port `8085` by default (configurable via the module's
`webhookPort` option). `TURBIDITY_TIERS` must match the `turbidityLevels` array in the
MagicMirror module config.
