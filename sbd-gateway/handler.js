"use strict";

/**
 * AWS Lambda handler for the Infinistream SBD gateway.
 *
 * Rock7 delivers MO messages as a POST with a multipart/form-data or
 * application/x-www-form-urlencoded body containing:
 *   imei, momsn, transmit_time, iridium_latitude, iridium_longitude,
 *   iridium_cep, data (hex-encoded MO payload)
 *
 * The handler:
 *   1. Decodes the hex MO payload (CBOR position).
 *   2. Fetches weather from Open-Meteo for that position.
 *   3. CBOR-encodes the MT response.
 *   4. POSTs to the Rock7 MT API to queue the message for the device.
 *
 * Required environment variables:
 *   ROCK7_USERNAME   — Rock7 account username
 *   ROCK7_PASSWORD   — Rock7 account password (or API key)
 *
 * The IMEI of the target device is taken from the incoming MO message.
 */

const { decodeMO, encodeMT } = require("./src/sbd-codec");
const { fetchWeather }        = require("./src/weather");

const ROCK7_MT_URL = "https://rockblock.rock7.com/rockblock/MT";

/**
 * Lambda entry point.
 * Accepts both API Gateway proxy events and raw Function URL events.
 */
async function handler(event) {
    try {
        const params = parseBody(event);
        const imei   = params.get("imei");
        const hex    = params.get("data");

        if (!imei || !hex) {
            return response(400, { error: "Missing imei or data" });
        }

        const mo = decodeMO(Buffer.from(hex, "hex"));
        console.log(`MO from ${imei}: lat=${mo.lat} lon=${mo.lon} ts=${mo.timestamp}`);

        const weather = await fetchWeather(mo.lat, mo.lon);
        const mtBuf   = encodeMT(weather);

        await sendMT(imei, mtBuf);
        console.log(`MT sent to ${imei}: ${mtBuf.length} bytes`);

        return response(200, { ok: true, mtBytes: mtBuf.length });
    } catch (err) {
        console.error("Gateway error:", err);
        return response(500, { error: err.message });
    }
}

// ---------------------------------------------------------------------------

function parseBody(event) {
    const body        = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString()
        : (event.body || "");
    return new URLSearchParams(body);
}

async function sendMT(imei, payload) {
    const username = process.env.ROCK7_USERNAME;
    const password = process.env.ROCK7_PASSWORD;
    if (!username || !password) throw new Error("ROCK7_USERNAME / ROCK7_PASSWORD not set");

    const form = new URLSearchParams();
    form.set("imei",     imei);
    form.set("username", username);
    form.set("password", password);
    form.set("data",     payload.toString("hex"));

    const res = await fetch(ROCK7_MT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    form.toString(),
    });

    const text = await res.text();
    if (!text.startsWith("OK")) {
        throw new Error(`Rock7 MT API rejected message: ${text}`);
    }
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
}

module.exports = { handler, sendMT };
