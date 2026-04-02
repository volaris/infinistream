"use strict";

const { spawn } = require("child_process");
const path = require("path");

const DISPLAY_SCRIPT = path.join(__dirname, "display.py");

function sendToDisplay(imagePath) {
    return new Promise((resolve, reject) => {
        const proc = spawn("python3", [DISPLAY_SCRIPT, imagePath]);
        proc.stderr.on("data", data => process.stderr.write(data));
        proc.on("close", code => {
            if (code === 0) resolve();
            else reject(new Error(`display.py exited with code ${code}`));
        });
    });
}

module.exports = { sendToDisplay };
