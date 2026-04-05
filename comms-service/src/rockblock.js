"use strict";

/**
 * RockBLOCK 9603 AT command interface.
 *
 * Communicates with the modem over a serial port using the Iridium SBD
 * AT command set.  All operations are serialised through an async queue so
 * concurrent callers never interleave commands on the wire.
 *
 * Iridium system time (AT-MSSTM) is returned in 90 ms ticks from the
 * Iridium epoch.  Verify IRIDIUM_EPOCH_MS against the Iridium ISU AT
 * Command Reference before relying on it for time sync.
 */

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const EventEmitter = require("events");

// Iridium epoch: March 8 2007 00:10:51.524 UTC.
// *** Verify against Iridium ISU AT Command Reference. ***
const IRIDIUM_EPOCH_MS = 1173312651524;
const TICK_MS          = 90;

const DEFAULT_PORT     = process.env.ROCKBLOCK_PORT || "/dev/ttyUSB0";
const DEFAULT_BAUD     = 19200;
const CMD_TIMEOUT_MS   = 10_000;
const SESSION_TIMEOUT_MS = 60_000;

class RockBLOCK extends EventEmitter {
    constructor(portPath = DEFAULT_PORT, baud = DEFAULT_BAUD) {
        super();
        this._portPath = portPath;
        this._baud     = baud;
        this._port     = null;
        this._parser   = null;
        this._queue    = Promise.resolve();  // serialise commands
        this._responseResolve = null;
        this._responseReject  = null;
        this._responseBuffer  = [];
    }

    // -----------------------------------------------------------------------
    // Connection management
    // -----------------------------------------------------------------------

    async open() {
        this._port = new SerialPort({ path: this._portPath, baudRate: this._baud, autoOpen: false });
        this._parser = this._port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
        this._parser.on("data", line => this._onLine(line.trim()));
        this._port.on("error", err => this.emit("error", err));
        this._port.on("close", () => this.emit("close"));

        await new Promise((res, rej) => this._port.open(err => err ? rej(err) : res()));
        await this._cmd("AT");  // sanity check
    }

    async close() {
        await new Promise((res, rej) =>
            this._port.close(err => err ? rej(err) : res())
        );
    }

    // -----------------------------------------------------------------------
    // Public operations
    // -----------------------------------------------------------------------

    /** Returns signal quality 0–5 (5 = best). */
    signalQuality() {
        return this._enqueue(async () => {
            const lines = await this._cmd("AT+CSQ", CMD_TIMEOUT_MS);
            const m = lines.join("").match(/\+CSQ:(\d)/);
            if (!m) throw new Error("Unexpected CSQ response");
            return parseInt(m[1], 10);
        });
    }

    /**
     * Returns the Iridium system time as a JS Date (UTC).
     * Returns null if the network time is not available.
     */
    systemTime() {
        return this._enqueue(async () => {
            const lines = await this._cmd("AT-MSSTM", CMD_TIMEOUT_MS);
            const m = lines.join("").match(/-MSSTM:\s*([0-9a-fA-F]+)/);
            if (!m) return null;
            const ticks = parseInt(m[1], 16);
            return new Date(IRIDIUM_EPOCH_MS + ticks * TICK_MS);
        });
    }

    /**
     * Initiates an SBD session, optionally sending a binary MO payload.
     * Returns the parsed SBDIX response.
     *
     * @param {Buffer|null} moPayload
     * @returns {{ moStatus, momsn, mtStatus, mtmsn, mtLength, mtQueued }}
     */
    sbdSession(moPayload = null) {
        return this._enqueue(async () => {
            if (moPayload) {
                await this._writeMO(moPayload);
            }

            const lines = await this._cmd("AT+SBDIX", SESSION_TIMEOUT_MS);
            const m = lines.join("").match(
                /\+SBDIX:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/
            );
            if (!m) throw new Error("Unexpected SBDIX response");

            return {
                moStatus:  parseInt(m[1], 10),
                momsn:     parseInt(m[2], 10),
                mtStatus:  parseInt(m[3], 10),
                mtmsn:     parseInt(m[4], 10),
                mtLength:  parseInt(m[5], 10),
                mtQueued:  parseInt(m[6], 10),
            };
        });
    }

    /**
     * Reads the MT binary message from the modem buffer.
     * Call after sbdSession() reports mtStatus === 1.
     * @returns {Buffer}
     */
    readMT() {
        return this._enqueue(async () => {
            this._port.write("AT+SBDRB\r");
            // SBDRB response is binary: 2-byte big-endian length, data, 2-byte checksum
            return new Promise((resolve, reject) => {
                const chunks = [];
                const onData = chunk => { chunks.push(chunk); tryParse(); };
                const tryParse = () => {
                    const buf = Buffer.concat(chunks);
                    if (buf.length < 2) return;
                    const len = buf.readUInt16BE(0);
                    if (buf.length < 2 + len + 2) return;
                    this._port.removeListener("data", onData);
                    clearTimeout(timer);
                    resolve(buf.slice(2, 2 + len));
                };
                const timer = setTimeout(() => {
                    this._port.removeListener("data", onData);
                    reject(new Error("SBDRB timeout"));
                }, CMD_TIMEOUT_MS);
                this._port.on("data", onData);
            });
        });
    }

    /** Clears MO (0), MT (1), or both (2) SBD buffers. */
    clearBuffers(which = 2) {
        return this._enqueue(() => this._cmd(`AT+SBDD${which}`));
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    _enqueue(fn) {
        this._queue = this._queue.then(fn, fn);
        return this._queue;
    }

    _onLine(line) {
        if (!this._responseResolve) return;
        this._responseBuffer.push(line);
        if (line === "OK" || line === "ERROR" || line.startsWith("+CME ERROR")) {
            const lines = this._responseBuffer.slice();
            this._responseBuffer = [];
            if (line === "OK" || !line.startsWith("ERROR")) {
                this._responseResolve(lines);
            } else {
                this._responseReject(new Error(`AT error: ${lines.join(" | ")}`));
            }
            this._responseResolve = null;
            this._responseReject  = null;
        }
    }

    _cmd(command, timeoutMs = CMD_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._responseResolve = null;
                this._responseReject  = null;
                this._responseBuffer  = [];
                reject(new Error(`Timeout waiting for response to: ${command}`));
            }, timeoutMs);

            this._responseResolve = lines => { clearTimeout(timer); resolve(lines); };
            this._responseReject  = err  => { clearTimeout(timer); reject(err); };
            this._responseBuffer  = [];
            this._port.write(`${command}\r`);
        });
    }

    /** Writes a binary MO payload using AT+SBDWB. */
    async _writeMO(payload) {
        await this._cmd(`AT+SBDWB=${payload.length}`);
        // Compute 2-byte checksum (sum of all bytes, big-endian uint16)
        let sum = 0;
        for (const b of payload) sum += b;
        const checksum = Buffer.alloc(2);
        checksum.writeUInt16BE(sum & 0xffff, 0);
        this._port.write(Buffer.concat([payload, checksum]));
        await this._cmd("", CMD_TIMEOUT_MS);  // wait for "0\r\n" success response
    }
}

module.exports = RockBLOCK;
