# Infinistream

Hardware and software for a recirculating greywater filter. The system captures shower
water in a holding tank, filters and UV-sanitizes it, and pumps it back to the
showerhead — reducing household water consumption at remote off-grid installations.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Display Pi (Docker)                          │
│                                                                     │
│  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │  magicmirror     │   │  eink-service    │   │  comms-service  │  │
│  │  :8080           │◄──│  :3001           │   │  :3002          │  │
│  │                  │   │                  │   │                 │  │
│  │  MagicMirror²    │   │  Puppeteer       │   │  RockBLOCK 9603 │  │
│  │  with rockblock  │   │  screenshots     │   │  L76K GPS HAT   │  │
│  │  weather provider│   │  → e-ink panel   │   │  weather cache  │  │
│  └──────────────────┘   └──────────────────┘   └─────────────────┘  │
│          ▲                                              │           │
└──────────┼───────────────────────────────────────────── │ ──────────┘
           │ POST /shower-update                          │ Iridium SBD
           │                                              ▼
┌──────────────────────┐                   ┌─────────────────────────┐
│  Controller Pi       │                   │  AWS Lambda             │
│                      │                   │  (sbd-gateway)          │
│  - ADC sensors       │                   │                         │
│  - Mode switch       │                   │  MO webhook → weather   │
│  - Relay control     │                   │  fetch → MT response    │
│  - Python state      │                   │  (Open-Meteo → CBOR)    │
│    machine           │                   └─────────────────────────┘
└──────────────────────┘
           │
           │ TCP (Devantech protocol)
           ▼
┌──────────────────────┐
│  Devantech ETH008    │
│  Relay Board         │
│  (192.168.2.3)       │
│                      │
│  R1: Post-filter     │
│  R2: Sani-loop       │
│  R3: Flush valve     │
│  R4: Drain valve     │
│  R5: Drain pump      │
│  R6: Supply pump     │
│  R7: UV-C light      │
└──────────────────────┘
```

Weather data travels over Iridium satellite: the device sends its GPS position via a
Mobile Originated (MO) SBD message → the Lambda fetches weather from Open-Meteo → encodes
a 7-day forecast into a compact CBOR payload → delivers it as a Mobile Terminated (MT) SBD
message. The comms-service caches the last received forecast and exposes it over HTTP for
the MagicMirror weather module.

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
├── src/                        # Python controller (Controller Pi)
│   ├── controller.py           #   Main control loop and state machine
│   ├── hw_conf.py              #   Hardware channel assignments and calibration
│   ├── config.py               #   Platform abstraction (RPi / Jetson / Mock)
│   ├── ADS1263.py              #   Waveshare ADS1263 ADC driver
│   ├── test_controller.py      #   pytest-bdd step implementations
│   └── test_controller.feature #   Gherkin BDD scenarios
├── MMM-Infinistream/           # MagicMirror² display module
│   ├── MMM-Infinistream.js     #   Frontend module
│   ├── MMM-Infinistream.css    #   Styles
│   ├── node_helper.js          #   Webhook receiver (Express POST handler)
│   └── test/                   #   Jest tests (module, theme, integration)
├── display/                    # Display Pi — MagicMirror config and assets
│   ├── config.js               #   MagicMirror config (modules, weather, compliments)
│   ├── css/custom.css          #   Light theme overrides
│   ├── providers/rockblock.js  #   Custom weather provider (reads comms-service)
│   └── Dockerfile              #   Builds MagicMirror + module + config
├── eink-service/               # E-ink rendering service (Display Pi)
│   ├── Dockerfile              #   Puppeteer + Waveshare epd7in5_V2 driver
│   └── ...
├── comms-service/              # Satellite comms service (Display Pi)
│   ├── src/
│   │   ├── rockblock.js        #   RockBLOCK 9603 AT command driver
│   │   ├── gps.js              #   L76K GPS HAT NMEA parser
│   │   ├── sbd-codec.js        #   CBOR encode/decode for SBD payloads
│   │   └── scheduler.js        #   Orchestrates GPS fix → SBD session → cache
│   ├── server.js               #   Express API (:3002 /weather /position /time-status)
│   └── test/                   #   Jest tests (GPS, codec, scheduler)
├── sbd-gateway/                # AWS Lambda — MO webhook handler
│   ├── handler.js              #   Lambda entry point (MO → weather → MT)
│   ├── src/
│   │   ├── weather.js          #   Open-Meteo fetch and field mapping
│   │   └── sbd-codec.js        #   CBOR codec (gateway copy)
│   └── test/                   #   Jest tests (handler, weather, codec)
├── scripts/
│   └── smoke-test.sh           # Pre-deploy integration smoke test
├── docker-compose.yml          # Orchestrates 3 Display Pi services
└── docs/
    ├── spec-behavioral.md      # Behavioral specification
    ├── spec-hardware.md        # Hardware and interface specification
    ├── usage.md                # Deployment and operations guide
    └── development.md          # Developer guide
```

## Documentation

| Document | Purpose |
|---|---|
| [Usage Guide](docs/usage.md) | Deploy and operate the system |
| [Development Guide](docs/development.md) | Run tests, understand the code, add features |
| [Behavioral Specification](docs/spec-behavioral.md) | Mode logic, transitions, auto-sanitize |
| [Hardware Specification](docs/spec-hardware.md) | ADC, relays, sensors, webhook API contract |
