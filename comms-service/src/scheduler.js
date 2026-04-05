"use strict";

/**
 * Comms scheduler.
 *
 * Startup sequence:
 *   1. Await first GPS fix.
 *   2. Sync system clock from Iridium system time (AT-MSSTM).
 *   3. Initiate first SBD session (send position, receive weather).
 *
 * Recurring:
 *   - SBD session every WEATHER_INTERVAL_MS (default 6 h).
 *   - Time sync every TIME_SYNC_INTERVAL_MS (default 12 h).
 *
 * Weather and time-status state is stored here and exposed via getters so
 * the HTTP server can serve cached data without touching hardware.
 */

const { execFile } = require("child_process");
const { encodeMO, decodeMT } = require("./sbd-codec");

const WEATHER_INTERVAL_MS   = parseInt(process.env.WEATHER_INTERVAL_MS   || String(6  * 60 * 60 * 1000), 10);
const TIME_SYNC_INTERVAL_MS = parseInt(process.env.TIME_SYNC_INTERVAL_MS || String(12 * 60 * 60 * 1000), 10);
const GPS_FIX_POLL_MS       = 5_000;
const GPS_FIX_TIMEOUT_MS    = parseInt(process.env.GPS_FIX_TIMEOUT_MS    || String(10 * 60 * 1000), 10);
const SIGNAL_MIN            = 2;  // minimum bars before attempting a session

class Scheduler {
    /**
     * @param {import('./rockblock')} rockblock
     * @param {import('./gps')}       gps
     * @param {object}                log  logger with .info/.warn/.error
     */
    constructor(rockblock, gps, log = console) {
        this._rb      = rockblock;
        this._gps     = gps;
        this._log     = log;

        this._weather       = null;  // last decoded MT weather payload
        this._timeStatus    = { synced: false, syncedAt: null, source: null };
        this._weatherTimer  = null;
        this._timeSyncTimer = null;
    }

    get weather()    { return this._weather; }
    get timeStatus() { return this._timeStatus; }

    // -----------------------------------------------------------------------

    async start() {
        this._log.info("Scheduler: waiting for GPS fix…");
        const fix = await this._awaitFix();
        this._log.info(`Scheduler: GPS fix acquired (${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)})`);

        await this._syncTime();

        await this._runSession();

        this._weatherTimer  = setInterval(() => this._runSession(),  WEATHER_INTERVAL_MS);
        this._timeSyncTimer = setInterval(() => this._syncTime(),     TIME_SYNC_INTERVAL_MS);
    }

    stop() {
        clearInterval(this._weatherTimer);
        clearInterval(this._timeSyncTimer);
    }

    // -----------------------------------------------------------------------

    async _awaitFix() {
        if (this._gps.lastFix) return this._gps.lastFix;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error("GPS fix timeout")),
                GPS_FIX_TIMEOUT_MS
            );
            const poll = setInterval(() => {
                if (this._gps.lastFix) {
                    clearInterval(poll);
                    clearTimeout(timeout);
                    resolve(this._gps.lastFix);
                }
            }, GPS_FIX_POLL_MS);
        });
    }

    async _syncTime() {
        try {
            const t = await this._rb.systemTime();
            if (!t) {
                this._log.warn("Scheduler: Iridium time not available");
                return;
            }
            // Set system clock: date --set="@<unix>"
            await new Promise((res, rej) =>
                execFile("date", [`--set=@${Math.floor(t.getTime() / 1000)}`],
                    err => err ? rej(err) : res())
            );
            this._timeStatus = { synced: true, syncedAt: new Date(), source: "iridium" };
            this._log.info(`Scheduler: system clock synced to ${t.toISOString()}`);
        } catch (err) {
            this._log.error(`Scheduler: time sync failed — ${err.message}`);
        }
    }

    async _runSession() {
        const fix = this._gps.lastFix;
        if (!fix) {
            this._log.warn("Scheduler: skipping SBD session — no GPS fix");
            return;
        }

        try {
            const signal = await this._rb.signalQuality();
            if (signal < SIGNAL_MIN) {
                this._log.warn(`Scheduler: signal too low (${signal}/5), skipping session`);
                return;
            }

            const mo  = encodeMO(Math.floor(Date.now() / 1000), fix.lat, fix.lon);
            const result = await this._rb.sbdSession(mo);

            this._log.info(
                `Scheduler: SBD session complete — MO status ${result.moStatus}, ` +
                `MT status ${result.mtStatus}, MT length ${result.mtLength}`
            );

            if (result.mtStatus === 1 && result.mtLength > 0) {
                const mtBuf = await this._rb.readMT();
                this._weather = decodeMT(mtBuf);
                this._log.info("Scheduler: MT weather payload received and decoded");
            }

            await this._rb.clearBuffers();
        } catch (err) {
            this._log.error(`Scheduler: SBD session failed — ${err.message}`);
        }
    }
}

module.exports = Scheduler;
