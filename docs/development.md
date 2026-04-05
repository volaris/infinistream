# Infinistream — Development Guide

## Repository Structure

The project is split into several independently testable components. Each has its own
`package.json` / `requirements.txt` and test suite.

```text
infinistream/
├── src/                    # Python — Controller Pi state machine
├── MMM-Infinistream/       # Node.js — MagicMirror² display module
├── display/                # Config and assets baked into the magicmirror Docker image
├── eink-service/           # Node.js — Puppeteer screenshot → e-ink render service
├── comms-service/          # Node.js — RockBLOCK/GPS driver and weather cache API
├── sbd-gateway/            # Node.js — AWS Lambda (MO webhook → weather → MT)
├── scripts/                # Operational scripts (smoke test)
├── docker-compose.yml      # Orchestrates Display Pi services
└── docs/                   # Specifications and guides
```

---

## Running Tests

### Python controller (`src/`)

```bash
# Create a virtualenv (first time)
python -m venv .venv
source .venv/bin/activate
pip install spidev RPi.GPIO devantech-eth click pytest pytest-bdd

# Run tests
pytest src/
```

Tests use `MockHardware` automatically when not running on a Raspberry Pi or Jetson. No
hardware is required for the test suite.

### MagicMirror module (`MMM-Infinistream/`)

```bash
cd MMM-Infinistream
npm install
npm test
```

The test suite covers:

| File | What it tests |
|------|---------------|
| `test/test_module.test.js` | `getDom()` output — wrapper, mode names, turbidity, flow diagram |
| `test/test_theme.test.js` | `display/css/custom.css` — all four color variables, body dimensions |
| `test/test_node_helper_integration.test.js` | POST `/shower-update` → eink-service trigger (real Express, stub server) |

Run a single file:

```bash
npx jest test/test_module.test.js
```

### comms-service (`comms-service/`)

```bash
cd comms-service
npm install
npm test
```

| File | What it tests |
|------|---------------|
| `test/test_gps.test.js` | NMEA checksum validation, decimal conversion, GGA/RMC parsing |
| `test/test_sbd_codec.test.js` | CBOR MO/MT round-trips, size assertions, truncation |
| `test/test_rockblock.test.js` | AT command sequencing, SBDWB checksum, queue serialization |
| `test/test_scheduler.test.js` | Session orchestration, signal gating, interval setup |

### sbd-gateway (`sbd-gateway/`)

```bash
cd sbd-gateway
npm install
npm test
```

| File | What it tests |
|------|---------------|
| `test/test_handler.test.js` | Full Lambda handler flow — valid MO, error cases, Rock7 API mocking |
| `test/test_weather.test.js` | Open-Meteo field mapping, null precipitation handling |
| `test/test_sbd_codec.test.js` | Codec round-trips (gateway copy, same schema as comms-service) |

### Smoke test (Docker integration)

Requires Docker and the full stack buildable:

```bash
bash scripts/smoke-test.sh
```

This verifies the three-service Docker stack starts, MagicMirror responds on port 8080,
a webhook POST reaches `node_helper.js`, and the eink-service receives a render trigger.

---

## Service Architecture

### How the services connect

```
Controller Pi
  └─ POST /shower-update ──────► magicmirror:8085 (node_helper.js)
                                      │
                                      └─ POST /trigger ──► eink-service:3001
                                                               │
                                                               └─ SPI ──► e-ink panel

comms-service:3002
  ├─ GPS serial (/dev/ttyAMA0) ──► GPS fix events
  ├─ RockBLOCK USB (/dev/ttyUSB0) ──► SBD sessions
  └─ GET /weather ◄──────────────── magicmirror (rockblock weather provider)

sbd-gateway (Lambda)
  ├─ ◄── Rock7 MO webhook (POST from Rock7 servers)
  ├─ ──► Open-Meteo API (weather fetch)
  └─ ──► Rock7 MT API (sends CBOR weather back to device)
```

### comms-service startup flow

1. Opens GPS serial port (`/dev/ttyAMA0`) → waits for `fix` event.
2. Issues `AT-MSSTM` to the RockBLOCK → converts Iridium epoch ticks to Unix time →
   sets system clock via `date --set`.
3. Encodes GPS coordinates as an MO CBOR payload (version, timestamp, lat, lon).
4. Opens an SBD session (`AT+SBDIX`) → transmits MO → receives MT if queued.
5. Decodes the MT CBOR payload (7-day weather forecast) → stores in memory cache.
6. Exposes `GET /weather` for the MagicMirror rockblock provider.
7. Repeats weather sessions every `WEATHER_INTERVAL_MS` (default 6 h).
8. Repeats time syncs every `TIME_SYNC_INTERVAL_MS` (default 12 h).

---

## CBOR Protocol

The SBD protocol uses CBOR with integer keys to minimize payload size. The MO payload is
~35 bytes; the MT payload (7-day forecast) is ~75 bytes — both well within Iridium's
limits (340 B MO / 270 B MT).

### MO payload (device → gateway)

| Key | Field | Type | Notes |
|-----|-------|------|-------|
| 0 | version | uint | Always 1 |
| 1 | timestamp | uint | Unix seconds |
| 2 | lat | float | Decimal degrees |
| 3 | lon | float | Decimal degrees |

### MT payload (gateway → device)

| Key | Field | Type | Notes |
|-----|-------|------|-------|
| 0 | version | uint | Always 1 |
| 1 | timestamp | uint | Unix seconds (forecast reference time) |
| 2 | current | map | Current conditions (keys 0–6) |
| 3 | daily | array | Up to 7 daily forecasts, each a 5-element array |

Current conditions map:

| Key | Field | Units |
|-----|-------|-------|
| 0 | temperature | °C |
| 1 | feelsLike | °C |
| 2 | humidity | % |
| 3 | windSpeed | km/h |
| 4 | windDirection | degrees |
| 5 | weatherCode | WMO code |
| 6 | pressure | hPa |

Daily forecast array order: `[date, tempMax, tempMin, weatherCode, precipitationProbability]`

### Bumping the protocol version

1. Increment `PROTOCOL_VERSION` in both `comms-service/src/sbd-codec.js` and
   `sbd-gateway/src/sbd-codec.js` (they must stay identical).
2. Update `encodeMT` / `decodeMT` in both files.
3. Bump the version check in `comms-service/src/scheduler.js` if you want to reject
   stale MT payloads.
4. Run `npm test` in both packages to confirm round-trip tests pass.

---

## Docker Builds

Each service has its own Dockerfile. The `docker-compose.yml` at the repo root builds
and orchestrates all three Display Pi services.

```bash
# Build all services
docker compose build

# Build a single service
docker compose build magicmirror

# Start everything (rebuild if needed)
docker compose up --build
```

### magicmirror image

`display/Dockerfile` clones MagicMirror v2.30.0, installs the MMM-Infinistream module,
copies `display/config.js`, `display/css/custom.css`, and `display/providers/rockblock.js`
into the correct MagicMirror paths.

If you change the module code in `MMM-Infinistream/`, rebuild:

```bash
docker compose build magicmirror
docker compose up -d magicmirror
```

### Adding a new MagicMirror module

1. Add the module directory under `MMM-Infinistream/` or create a new directory at the
   repo root.
2. Add a `COPY` step in `display/Dockerfile` to place it in `/opt/magic_mirror/modules/`.
3. Add an `npm install` step if the module has dependencies.
4. Add the module config to `display/config.js`.

---

## Environment Variables Reference

### comms-service

| Variable | Default | Description |
|---|---|---|
| `GPS_PORT` | `/dev/ttyAMA0` | Serial port for L76K GPS HAT |
| `GPS_BAUD` | `9600` | Baud rate for GPS serial port |
| `ROCKBLOCK_PORT` | `/dev/ttyUSB0` | Serial port for RockBLOCK 9603 |
| `WEATHER_INTERVAL_MS` | `21600000` | Milliseconds between weather SBD sessions (6 h) |
| `TIME_SYNC_INTERVAL_MS` | `43200000` | Milliseconds between time sync sessions (12 h) |
| `PORT` | `3002` | HTTP API port |

### sbd-gateway (Lambda)

| Variable | Required | Description |
|---|---|---|
| `ROCK7_USERNAME` | Yes | Rock7 account username |
| `ROCK7_PASSWORD` | Yes | Rock7 account password |

### MMM-Infinistream node_helper

| Variable | Default | Description |
|---|---|---|
| `EINK_SERVICE_URL` | `http://eink-service:3001` | URL of the eink-service |

---

## Code Style and Conventions

- All Node.js files use `"use strict"` and CommonJS (`require`/`module.exports`).
- Tests use Jest. Run `npx jest` from a package directory.
- NMEA test helpers compute checksums dynamically — never hardcode `*XX` values.
- AT command responses in RockBLOCK tests use mock serial ports; no hardware needed.
- The controller Pi tests use `MockHardware` via `src/config.py`'s platform detection.

---

## Hardware Notes

### RockBLOCK 9603 — SBDWB checksum

The SBDWB (write binary) command requires a 2-byte big-endian checksum appended to the
payload. It is the 16-bit sum (mod 65536) of all payload bytes — not CRC, not XOR.

### L76K GPS HAT — NMEA sentences

The GPS driver parses `$GNGGA` and `$GNRMC` sentences (and their `$GP` variants).
Coordinate format is `DDDMM.MMMM` — degrees followed by decimal minutes. The
`_nmeaToDecimal` helper converts to decimal degrees: `degrees + (minutes / 60)`.
South and West hemispheres are returned as negative values.

### Iridium system time

`AT-MSSTM` returns the time as a hexadecimal count of 90 ms ticks since the Iridium
epoch (~March 8, 2007). The exact epoch value (`IRIDIUM_EPOCH_MS` in `rockblock.js`)
should be verified against a known-good time source on first deployment with hardware.
