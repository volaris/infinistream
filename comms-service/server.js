"use strict";

const express   = require("express");
const RockBLOCK = require("./src/rockblock");
const GPS       = require("./src/gps");
const Scheduler = require("./src/scheduler");

const PORT = parseInt(process.env.PORT || "3002", 10);

const rb        = new RockBLOCK();
const gps       = new GPS();
const scheduler = new Scheduler(rb, gps);

const app = express();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Latest weather decoded from the most recent MT SBD message. */
app.get("/weather", (_req, res) => {
    const w = scheduler.weather;
    if (!w) return res.status(503).json({ error: "No weather data yet" });
    res.json({
        updated:  w.timestamp,
        current:  w.current,
        daily:    w.daily.map(d => ({
            date:                    new Date(d.date * 1000).toISOString().slice(0, 10),
            tempMax:                 d.tempMax,
            tempMin:                 d.tempMin,
            weatherCode:             d.weatherCode,
            precipitationProbability: d.precipitationProbability,
        })),
    });
});

/** Current GPS position. */
app.get("/position", (_req, res) => {
    const fix = gps.lastFix;
    if (!fix) return res.status(503).json({ error: "No GPS fix yet" });
    res.json({
        lat:        fix.lat,
        lon:        fix.lon,
        altitudeM:  fix.altitudeM,
        fixQuality: fix.fixQuality,
        satellites: fix.satellites,
        timestamp:  fix.timestamp,
    });
});

/** Time synchronisation status. */
app.get("/time-status", (_req, res) => {
    res.json(scheduler.timeStatus);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
    try {
        await gps.open();
        console.log("GPS: port open");
    } catch (err) {
        console.error(`GPS: failed to open port — ${err.message}`);
    }

    try {
        await rb.open();
        console.log("RockBLOCK: port open");
    } catch (err) {
        console.error(`RockBLOCK: failed to open port — ${err.message}`);
    }

    // Start scheduler in the background; don't block server startup
    scheduler.start().catch(err =>
        console.error(`Scheduler: fatal error — ${err.message}`)
    );

    app.listen(PORT, () => console.log(`comms-service listening on port ${PORT}`));
}

if (require.main === module) main();

module.exports = app;
