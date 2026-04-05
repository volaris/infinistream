"use strict";

/**
 * SBD CBOR codec — gateway copy.
 * Schema is identical to comms-service/src/sbd-codec.js.
 * Keep in sync if the protocol version changes.
 */

const { encode, decode } = require("cbor-x");

const PROTOCOL_VERSION = 1;
const MT_MAX_BYTES     = 270;

function encodeMT(weather) {
    const { timestamp, current, daily } = weather;

    const payload = {
        0: PROTOCOL_VERSION,
        1: timestamp,
        2: {
            0: current.temperature,
            1: current.feelsLike,
            2: current.humidity,
            3: current.windSpeed,
            4: current.windDirection,
            5: current.weatherCode,
            6: current.pressure,
        },
        3: (daily || []).slice(0, 7).map(d => [
            d.date,
            d.tempMax,
            d.tempMin,
            d.weatherCode,
            d.precipitationProbability,
        ]),
    };

    const buf = encode(payload, { useFloat16: 2 });
    if (buf.length > MT_MAX_BYTES) {
        throw new Error(`MT payload ${buf.length} B exceeds ${MT_MAX_BYTES} B limit`);
    }
    return buf;
}

function encodeMO(timestampUnix, lat, lon) {
    return encode({ 0: PROTOCOL_VERSION, 1: timestampUnix, 2: lat, 3: lon });
}

function decodeMO(buf) {
    const m = decode(buf);
    return { version: m[0], timestamp: m[1], lat: m[2], lon: m[3] };
}

module.exports = { encodeMO, encodeMT, decodeMO, PROTOCOL_VERSION, MT_MAX_BYTES };
