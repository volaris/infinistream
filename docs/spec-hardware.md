# Infinistream — Hardware & Interface Specification

## System Components

The system uses two Raspberry Pis on the same LAN. The **controller Pi** handles all
hardware I/O; the **display Pi** runs the UI stack. This separation ensures display
issues cannot affect the control loop.

### Controller Pi

| Component             | Model / Part            | Interface        | Role                                   |
|-----------------------|-------------------------|------------------|----------------------------------------|
| Controller SBC        | Raspberry Pi            | —                | Runs Python control loop               |
| ADC / GPIO board      | Waveshare ADS1263 HAT   | SPI (bus 0)      | 24-bit analog reads + GPIO digital I/O |
| Relay board           | Devantech ETH008        | TCP/IP           | Controls all valves and pumps          |
| Flow sensor (inlet)   | Gredia GR-S403          | Analog (0–5 V)   | Measures incoming flow rate            |
| Flow sensor (outlet)  | Gredia GR-S403          | Analog (0–5 V)   | Measures outgoing flow rate            |
| Turbidity sensor      | DFRobot KS0414          | Analog (0–5 V)   | Measures water clarity in NTU          |
| Mode select switch    | 3-position rotary       | Digital GPIO     | Operator mode selection                |

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
- **ADC resolution:** 24-bit (ADC1 mode), full-scale value = `2^24 = 16,777,216`
- **Interface:** SPI bus 1

### Analog Input Channels

| Channel | Signal           | Sensor         | Units  | Full-Scale Value |
|---------|------------------|----------------|--------|------------------|
| 0       | Flow in          | Gredia GR-S403 | L/min  | 20.0             |
| 1       | Flow out         | Gredia GR-S403 | L/min  | 20.0             |
| 2       | Turbidity        | DFRobot KS0414 | NTU    | 4000.0           |

#### Calibration Formula

```python
sensor_value = (raw_adc / full_scale_adc) * full_scale_sensor + offset
```

- `raw_adc`: raw integer from `ADS1263_GetChannalValue(channel)`
- `full_scale_adc`: `16,777,216` (2^24)
- `full_scale_sensor`: sensor-specific (see table above)
- `offset`: `0.0` for all current sensors

### Digital Input Channels (Mode Select)

Channels 3, 4, and 5 are configured as digital GPIO inputs. Each reads a single bit
(0 or 1) from the rotary mode-select switch.

| Channel | Bit Position | Description       |
|---------|--------------|-------------------|
| 3       | Bit 2 (MSB)  | Mode select bit 2 |
| 4       | Bit 1        | Mode select bit 1 |
| 5       | Bit 0 (LSB)  | Mode select bit 0 |

Bit assembly: `val = (ch3 << 2) | (ch4 << 1) | ch5`

---

## Relay Board — Devantech ETH008

The relay board is accessed over Ethernet using the `devantech-eth` Python library.

### Network Configuration

| Parameter | Value                           |
|-----------|---------------------------------|
| IP        | `192.168.1.50`                  |
| Port      | `17123`                         |
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

| Relay | Actuator           | DRAIN | FLUSH | SHOWER | SANITIZE | SAFE |
|-------|--------------------|-------|-------|--------|----------|------|
| 1     | Post-filter valve  | 0     | 0     | 1      | 0        | 0    |
| 2     | Sani-loop valve    | 0     | 0     | 0      | 1        | 0    |
| 3     | Flush valve        | 0     | 1     | 0      | 0        | 0    |
| 4     | Drain valve        | 1     | 0     | 0      | 0        | 0    |
| 5     | Drain pump         | 1     | 1     | 1      | 0        | 0    |
| 6     | Supply pump        | 0     | 1     | 1      | 1        | 0    |
| 7     | UV-C light         | 0     | 0     | 1      | 1        | 0    |

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
