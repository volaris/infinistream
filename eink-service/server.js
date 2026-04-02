"use strict";

const express = require("express");
const { takeScreenshot } = require("./screenshot");
const { sendToDisplay } = require("./display");

const PORT = parseInt(process.env.PORT || "3001", 10);
const app = express();

// Guard against concurrent refreshes — the e-ink panel cannot handle
// overlapping update cycles (~4 s each on the Waveshare 7.5" V2).
let refreshing = false;

app.post("/trigger", (req, res) => {
    res.sendStatus(202);

    if (refreshing) {
        return;
    }
    refreshing = true;

    takeScreenshot()
        .then(imagePath => sendToDisplay(imagePath))
        .catch(err => console.error("Display refresh failed:", err.message))
        .finally(() => { refreshing = false; });
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`eink-service listening on port ${PORT}`));
}

function resetRefreshing() { refreshing = false; }

module.exports = app;
module.exports.resetRefreshing = resetRefreshing;
