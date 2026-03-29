# MMM-Infinistream

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that displays
the live status of an Infinistream recirculating greywater filter system.

The module receives updates from the Infinistream Raspberry Pi controller over an HTTP
webhook and renders the current operating mode, water turbidity, and an animated flow
diagram of the system.

## Installation

Clone or copy this directory into your MagicMirror `modules/` folder:

```bash
cd ~/MagicMirror/modules
git clone <repo-url> MMM-Infinistream
cd MMM-Infinistream
npm install
```

## MagicMirror Configuration

Add the module to the `modules` array in `config/config.js`:

```js
{
    module: "MMM-Infinistream",
    position: "lower_third"
}
```

With all options:

```js
{
    module: "MMM-Infinistream",
    position: "lower_third",
    config: {
        turbidityLevels: [0, 50, 100],
        webhookPort: 8085,
        slowSpinner: true
    }
}
```

## Configuration Options

| Option            | Type      | Default        | Description                                                                 |
|-------------------|-----------|----------------|-----------------------------------------------------------------------------|
| `turbidityLevels` | `number[]`| `[0, 50, 100]` | NTU thresholds for turbidity icon tiers (clean / warning / unsafe)          |
| `webhookPort`     | `number`  | `8085`         | Port on which the node_helper listens for POST updates from the controller  |
| `slowSpinner`     | `boolean` | `true`         | Use a slower CSS spin animation on the CONNECTING spinner icon              |

### Turbidity Icon Tiers

| NTU                | Icon                        |
|--------------------|-----------------------------|
| Below level[1]     | Thumbs up (clean)           |
| level[1]–level[2]  | Warning triangle            |
| level[2] and above | Skull & crossbones (unsafe) |

## Webhook API

The module exposes a POST endpoint that the Infinistream controller calls after each
control cycle:

```text
POST /shower-update
Content-Type: application/json

{ "mode": "SHOWER", "turbidity": 12.4 }
```

| Field       | Type   | Valid values                              |
|-------------|--------|-------------------------------------------|
| `mode`      | string | `SHOWER`, `DRAIN`, `FLUSH`, `SANITIZE`    |
| `turbidity` | number | Floating-point NTU value, ≥ 0             |

Returns `200` on success, `400` if the payload is missing required fields.

## Display

The module renders three sections:

- **Mode** — a Font Awesome icon and the mode name string. While waiting for the first
  update the module shows a slowly-spinning gear and the label `CONNECTING`.
- **Turbidity** — a tiered icon and the raw NTU reading.
- **Flow diagram** — a schematic of the full system (tank, heater, shower, filter, UV
  sanitizer, faucet). Flow path arrows and junction icons are shown only for the active
  mode; permanent components are always visible.

## Developer Commands

```bash
npm run lint        # Check linting and formatting
npm run lint:fix    # Auto-fix linting issues
```
