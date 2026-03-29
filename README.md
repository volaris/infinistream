# Infinistream

Hardware and software for a recirculating greywater filter. The system captures shower
water in a holding tank, filters and UV-sanitizes it, and pumps it back to the
showerhead — reducing household water consumption.

## Architecture

```text
┌─────────────────────────────┐        HTTP POST        ┌──────────────────────────┐
│   Raspberry Pi Controller   │ ──────────────────────► │  MagicMirror² Display    │
│                             │   /shower-update        │                          │
│  - Reads sensors (ADC/SPI)  │   { mode, turbidity }   │  - Mode icon + name      │
│  - Decodes operator mode    │                         │  - Turbidity indicator   │
│  - Actuates relays via LAN  │                         │  - Live flow diagram     │
└─────────────────────────────┘                         └──────────────────────────┘
           │
           │ TCP (Devantech protocol)
           ▼
┌─────────────────────────────┐
│   Devantech ETH008          │
│   Relay Board (192.168.1.50)│
│                             │
│  R1: Post-filter valve      │
│  R2: Sani-loop valve        │
│  R3: Flush valve            │
│  R4: Drain valve            │
│  R5: Drain pump             │
│  R6: Supply pump            │
│  R7: UV-C light             │
└─────────────────────────────┘
```

## Operating Modes

The operator selects a base mode via a 3-position rotary switch. An automatic
sanitization cycle can override SHOWER mode when the system has been idle.

| Mode     | Description                                                           |
|----------|-----------------------------------------------------------------------|
| SHOWER   | Recirculates water: tank → heater → shower → filter → UV → tank       |
| SANITIZE | UV sanitation loop: tank → UV → tank (auto-triggered after 12 h idle) |
| FLUSH    | Filter backflush: tank → filter → faucet                              |
| DRAIN    | Empty the tank: tank → faucet                                         |

See [`docs/spec-behavioral.md`](docs/spec-behavioral.md) for full mode logic, actuator
states, and the automatic sanitization specification.

## Repository Layout

```text
infinistream/
├── src/
│   ├── controller.py          # Main control loop and state machine
│   ├── hw_conf.py             # Hardware channel assignments and calibration
│   ├── config.py              # Platform abstraction (RPi / Jetson / Mock)
│   ├── ADS1263.py             # Waveshare ADS1263 ADC driver
│   ├── ad_probe.py            # Diagnostic: read all ADC channels
│   ├── relay_probe.py         # Diagnostic: toggle all relays
│   ├── test_controller.py     # pytest-bdd step implementations
│   └── test_controller.feature  # Gherkin BDD scenarios
├── MMM-Infinistream/          # MagicMirror² display module
│   ├── MMM-Infinistream.js    # Frontend module
│   ├── MMM-Infinistream.css   # Styles
│   └── node_helper.js         # Webhook receiver (Express POST handler)
└── docs/
    ├── spec-behavioral.md     # Behavioral specification (modes, logic, display)
    └── spec-hardware.md       # Hardware and interface specification
```

## Setup

### Python Controller (Raspberry Pi)

**Dependencies:**

```bash
pip install spidev RPi.GPIO devantech-eth click pytest pytest-bdd
```

**Run:**

```bash
python -m src.controller
```

**Run tests:**

```bash
pytest src/
```

### MagicMirror² Display Module

Copy or symlink the `MMM-Infinistream/` directory into your MagicMirror `modules/`
folder, then add the module to your `config/config.js`:

```js
{
    module: "MMM-Infinistream",
    position: "lower_third"
}
```

Install Node dependencies and lint tools:

```bash
cd MMM-Infinistream
npm install
```

See [`MMM-Infinistream/README.md`](MMM-Infinistream/README.md) for full configuration
options.

## Documentation

- [Behavioral Specification](docs/spec-behavioral.md) — modes, transitions, sensor
  thresholds, auto-sanitize logic, display behavior
- [Hardware & Interface Specification](docs/spec-hardware.md) — ADC setup, sensor
  calibration, relay assignments, webhook API contract
