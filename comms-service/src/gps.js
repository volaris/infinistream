"use strict";

/**
 * L76K GPS HAT reader.
 *
 * Reads NMEA sentences from the GPS module over a serial port and emits
 * "fix" events when a valid position is available.  Parses $GNGGA and
 * $GNRMC (multi-constellation variants); falls back to $GPGGA / $GPRMC.
 *
 * Emitted events:
 *   "fix"   { lat, lon, altitudeM, fixQuality, satellites, timestamp }
 *   "error" Error
 */

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const EventEmitter = require("events");

const DEFAULT_PORT = process.env.GPS_PORT  || "/dev/ttyAMA0";
const DEFAULT_BAUD = parseInt(process.env.GPS_BAUD || "9600", 10);

class GPS extends EventEmitter {
    constructor(portPath = DEFAULT_PORT, baud = DEFAULT_BAUD) {
        super();
        this._portPath   = portPath;
        this._baud       = baud;
        this._port       = null;
        this._lastFix    = null;
    }

    async open() {
        this._port = new SerialPort({ path: this._portPath, baudRate: this._baud, autoOpen: false });
        const parser = this._port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
        parser.on("data", line => this._onSentence(line.trim()));
        this._port.on("error", err => this.emit("error", err));

        await new Promise((res, rej) => this._port.open(err => err ? rej(err) : res()));
    }

    async close() {
        await new Promise((res, rej) =>
            this._port.close(err => err ? rej(err) : res())
        );
    }

    /** Returns the most recent valid fix, or null. */
    get lastFix() { return this._lastFix; }

    // -----------------------------------------------------------------------

    _onSentence(sentence) {
        if (!sentence.startsWith("$")) return;
        if (!this._checksumValid(sentence)) return;

        const fields = sentence.split(",");
        const type   = fields[0].slice(1);  // e.g. "GNGGA"

        if (type === "GNGGA" || type === "GPGGA") {
            this._parseGGA(fields);
        } else if (type === "GNRMC" || type === "GPRMC") {
            this._parseRMC(fields);
        }
    }

    _parseGGA(f) {
        // $GxGGA,hhmmss.ss,lat,N/S,lon,E/W,quality,numSats,HDOP,alt,M,...
        const fixQuality = parseInt(f[6], 10);
        if (!fixQuality) return;  // 0 = no fix

        const lat  = this._nmeaToDecimal(f[2], f[3]);
        const lon  = this._nmeaToDecimal(f[4], f[5]);
        const alt  = parseFloat(f[9]);
        const sats = parseInt(f[7], 10);

        if (isNaN(lat) || isNaN(lon)) return;

        this._lastFix = { lat, lon, altitudeM: alt, fixQuality, satellites: sats, timestamp: new Date() };
        this.emit("fix", this._lastFix);
    }

    _parseRMC(f) {
        // $GxRMC,hhmmss.ss,A/V,lat,N/S,lon,E/W,speed,course,ddmmyy,...
        if (f[2] !== "A") return;  // A = active, V = void

        const lat = this._nmeaToDecimal(f[3], f[4]);
        const lon = this._nmeaToDecimal(f[5], f[6]);
        if (isNaN(lat) || isNaN(lon)) return;

        // Use existing lastFix altitude if available
        const alt  = this._lastFix ? this._lastFix.altitudeM : 0;
        const sats = this._lastFix ? this._lastFix.satellites : 0;

        this._lastFix = { lat, lon, altitudeM: alt, fixQuality: 1, satellites: sats, timestamp: new Date() };
        this.emit("fix", this._lastFix);
    }

    /**
     * Converts NMEA lat/lon (DDDMM.MMMM) to decimal degrees.
     * @param {string} value  e.g. "4807.038"
     * @param {string} hemi   "N", "S", "E", or "W"
     */
    _nmeaToDecimal(value, hemi) {
        if (!value) return NaN;
        const raw = parseFloat(value);
        const deg = Math.floor(raw / 100);
        const min = raw - deg * 100;
        const dec = deg + min / 60;
        return (hemi === "S" || hemi === "W") ? -dec : dec;
    }

    /** Validates NMEA checksum ($...*XX). */
    _checksumValid(sentence) {
        const star = sentence.lastIndexOf("*");
        if (star === -1) return false;
        const expected = parseInt(sentence.slice(star + 1), 16);
        let xor = 0;
        for (let i = 1; i < star; i++) xor ^= sentence.charCodeAt(i);
        return xor === expected;
    }
}

module.exports = GPS;
