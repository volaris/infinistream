# Infinistream — Behavioral Specification

## Overview

The Infinistream controller is a closed-loop state machine that runs on a Raspberry Pi.
Every second it reads all sensors, determines the current operating mode, and actuates
the appropriate valves and pumps. It also reports its state to the MagicMirror display
over HTTP.

---

## Operating Modes

### Mode Selection

The operator selects a base mode using a physical 3-position rotary switch wired to three
GPIO channels on the ADC board (channels 3, 4, 5). The three bits are read digitally and
decoded as a binary value (bit 2 = channel 3, bit 1 = channel 4, bit 0 = channel 5).

| Bit Pattern | Decoded Mode          |
|-------------|-----------------------|
| `0b000`     | DRAIN                 |
| `0b001`     | FLUSH                 |
| `0b010`     | SHOWER                |
| `0b100`     | SANITIZE              |
| Any other   | DRAIN (safe fallback) |

### Mode Descriptions

#### SHOWER

Normal recirculating operation. Water is drawn from the tank by the supply pump, heated,
delivered to the showerhead, collected in the tank, passed through the filter and UV
sanitizer, and returned to the tank.

Water path: `tank → heater → shower → filter → UV → tank`

#### SANITIZE

UV sanitization loop. Water circulates through the UV sanitizer without passing through
the post-filter valve or the showerhead. Intended to keep the stored water safe when the
shower is idle.

Water path: `tank → UV → tank`

#### FLUSH

Filter backflush. Both pumps run while the flush valve is open, forcing water through the
filter in reverse to clear accumulated debris. Effluent is discharged through the faucet
drain.

Water path: `tank → filter → faucet`

#### DRAIN

Full tank drain. The drain valve is opened and the drain pump runs to empty the tank.
No recirculation occurs.

Water path: `tank → faucet`

---

## Actuator States per Mode

| Actuator            | DRAIN  | FLUSH  | SHOWER | SANITIZE |
|---------------------|--------|--------|--------|----------|
| Post-filter valve   | CLOSED | CLOSED | OPEN   | CLOSED   |
| Sani-loop valve     | CLOSED | CLOSED | CLOSED | OPEN     |
| Flush valve         | CLOSED | OPEN   | CLOSED | CLOSED   |
| Drain valve         | OPEN   | CLOSED | CLOSED | CLOSED   |
| Drain pump          | ON     | ON     | ON     | OFF      |
| Supply pump         | OFF    | ON     | ON     | ON       |
| UV light            | OFF    | OFF    | ON     | ON       |

### Safe / Fault State

If the mode decode produces an unrecognized bit pattern, the controller calls `safe()`,
which closes all valves and cuts power to all pumps and the UV light. This is the
fail-safe state — no water can flow and no devices are energized.

---

## Automatic Sanitization

The controller adds a derived-mode layer on top of the operator-selected mode. When the
operator has selected SHOWER, the controller monitors flow activity and automatically
transitions to SANITIZE if the system appears idle.

### Rules

1. **Idle detection:** The controller continuously tracks the last timestamp at which
   `flow_out > 0.1 L/min`. If the system is in SHOWER mode and no flow has been detected
   for **12 consecutive hours**, the idle threshold is considered exceeded.

2. **Auto-sanitize trigger:** When the idle threshold is exceeded, the controller
   overrides the SHOWER mode and activates SANITIZE mode for **5 minutes**.

3. **Return to SHOWER:** After the 5-minute sanitize window expires, the controller
   returns to SHOWER mode. The idle timer is not reset automatically — if flow does not
   resume, the sanitize cycle will re-trigger after another 12 hours.

4. **Manual override:** If the operator rotates the mode switch away from SHOWER at any
   time (including during an auto-sanitize cycle), the auto-sanitize state is cleared and
   the manually selected mode takes effect immediately.

5. **Flow resets idle timer:** Any `flow_out` reading above the 0.1 L/min threshold
   updates the last-flow timestamp, resetting the idle countdown.

### State Variables (persistent across control loop iterations)

| Variable            | Initial value    | Meaning                                    |
|---------------------|------------------|--------------------------------------------|
| `last_flow_detected`| startup time     | Timestamp of most recent flow detection    |
| `sanitize_off_time` | startup time     | Timestamp when current auto-sani ends      |
| `sani_on`           | `False`          | Whether auto-sani is currently active      |

---

## Control Loop

The main loop executes the following steps once per second:

1. Read all sensors (`read_sensors`)
2. Determine the effective mode, applying auto-sanitize logic (`determine_derived_mode`)
3. Actuate relays to match the effective mode (`set_mode`)
4. Log status to stdout (`display_status`)
5. If the display update throttle allows it, POST current mode and turbidity to the
   MagicMirror webhook (`display_status`)

---

## Display Integration

The system uses two Raspberry Pis. The **controller Pi** manages hardware and POSTs
state updates over HTTP. The **display Pi** runs MagicMirror² and drives the e-ink
screen independently, so display issues can never affect core controller operation.

```text
Controller Pi  --POST /shower-update-->  Display Pi
                                           MagicMirror² (browser)
                                           Puppeteer screenshot service
                                           Waveshare 7.5" e-ink display
```

### Webhook

- **Endpoint:** `POST /shower-update` on the MagicMirror host
- **Default port:** `8085`
- **Request body:**

  ```json
  { "mode": "SHOWER", "turbidity": 42.5 }
  ```

- **`mode`** must be one of: `SHOWER`, `DRAIN`, `FLUSH`, `SANITIZE`
- **`turbidity`** is a floating-point value in NTU
- Connection failures are silently swallowed — the control loop never blocks on display

### Display Update Throttle

The controller runs at 1 Hz but does not POST to the webhook every second. A POST is
sent only when at least one of the following is true:

1. **Mode changed** — any transition between SHOWER / DRAIN / FLUSH / SANITIZE
2. **Turbidity tier changed** — turbidity crossed one of the tier thresholds
3. **Interval elapsed** — `DISPLAY_UPDATE_INTERVAL` seconds (default 30) have passed
   since the last POST, regardless of state

This keeps the MagicMirror DOM and e-ink refresh cycle from thrashing on small
floating-point turbidity variations while still reflecting meaningful changes promptly.

Tier thresholds are defined canonically in `hw_conf.TURBIDITY_TIERS` and must match
the `turbidityLevels` config in the MagicMirror module.

### Display Behavior

The MagicMirror module renders:

- **Mode indicator** — icon + mode name string
- **Turbidity indicator** — tiered icon based on NTU thresholds (configurable)
- **Flow diagram** — a schematic of the full system with active flow paths highlighted

#### Mode Icons

| Mode       | Icon                      |
|------------|---------------------------|
| CONNECTING | Slow-spinning gear        |
| SHOWER     | Shower head               |
| DRAIN      | Dripping faucet           |
| FLUSH      | Dripping faucet           |
| SANITIZE   | Sun                       |

#### Turbidity Thresholds (default)

| NTU Range       | Icon                  | Meaning          |
|-----------------|-----------------------|------------------|
| 0 – 49          | Thumbs up             | Clean            |
| 50 – 99         | Warning triangle      | Moderate         |
| 100+            | Skull and crossbones  | Unsafe           |

These thresholds are configurable in the MagicMirror module config as `turbidityLevels`.

#### Flow Diagram Visibility

Each flow element in the diagram carries CSS class names corresponding to the mode(s) in
which it should be visible (e.g., `class="shower flush"`). The module's
`updateFlowVisibility()` function shows only elements whose class list includes the
current mode (case-insensitive). Permanent components (tank, heater, shower head, filter,
UV, faucet) are always visible.

In CONNECTING state, the flow diagram is hidden entirely until a real update is received.
