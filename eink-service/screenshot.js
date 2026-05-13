"use strict";

const puppeteer = require("puppeteer-core");
const os = require("os");
const path = require("path");

const MAGICMIRROR_URL  = process.env.MAGICMIRROR_URL  || "http://localhost:8080";
const CHROMIUM_PATH    = process.env.CHROMIUM_PATH    || "/usr/bin/chromium-browser";
const SCREENSHOT_PATH  = process.env.SCREENSHOT_PATH  || path.join(os.tmpdir(), "infinistream_eink.png");

async function takeScreenshot() {
    const browser = await puppeteer.launch({
        executablePath: CHROMIUM_PATH,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 480 });
        await page.goto(MAGICMIRROR_URL, { waitUntil: "networkidle2", timeout: 30000 });
        await page.screenshot({ path: SCREENSHOT_PATH });
    } finally {
        await browser.close();
    }
    return SCREENSHOT_PATH;
}

module.exports = { takeScreenshot, SCREENSHOT_PATH, MAGICMIRROR_URL };
