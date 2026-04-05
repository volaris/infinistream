"use strict";

/**
 * CBOR codec for Short Burst Data (SBD) payloads.
 *
 * Integer map keys are used throughout to minimise encoded size.
 * MT messages (gateway → device) must fit within Iridium's 270-byte ceiling.
 * MO messages (device → gateway) must fit within 340 bytes (in practice ~20 B).
 *
 * MT schema:
 *   { 0: version, 1: timestamp_unix, 2: current{}, 3: daily[] }
 *   current: { 0:temp, 1:feelsLike, 2:humidity, 3:windSpeed, 4:windDir, 5:weatherCode, 6:pressure }
 *   daily item: [dateUnix, tempMax, tempMin, weatherCode, precipProb]
 *
 * MO schema:
 *   { 0: version, 1: timestamp_unix, 2: lat, 3: lon }
 */

const { encode, decode } = require("cbor-x");

const PROTOCOL_VERSION = 1;
const MT_MAX_BYTES     = 270;
const MO_MAX_BYTES     = 340;

// ---------------------------------------------------------------------------
// MO — device → gateway (position request)
// ---------------------------------------------------------------------------

/**
 * @param {number} timestampUnix
 * @param {number} lat  decimal degrees
 * @param {number} lon  decimal degrees
 * @returns {Buffer}
 */
function encodeMO(timestampUnix, lat, lon) {
    const buf = encode({
        0: PROTOCOL_VERSION,
        1: timestampUnix,
        2: lat,
        3: lon,
    });
    if (buf.length > MO_MAX_BYTES) {
        throw new Error(`MO payload ${buf.length} B exceeds ${MO_MAX_BYTES} B limit`);
    }
    return buf;
}

/**
 * @param {Buffer} buf
 * @returns {{ version, timestamp, lat, lon }}
 */
function decodeMO(buf) {
    const m = decode(buf);
    return {
        version:   m[0],
        timestamp: m[1],
        lat:       m[2],
        lon:       m[3],
    };
}

// ---------------------------------------------------------------------------
// MT — gateway → device (weather response)
// ---------------------------------------------------------------------------

/**
 * @param {object} weather
 * @param {number} weather.timestamp  unix timestamp of the weather data
 * @param {object} weather.current
 * @param {number} weather.current.temperature      °C
 * @param {number} weather.current.feelsLike        °C
 * @param {number} weather.current.humidity         0-100 %
 * @param {number} weather.current.windSpeed        km/h
 * @param {number} weather.current.windDirection    degrees 0-359
 * @param {number} weather.current.weatherCode      WMO code
 * @param {number} weather.current.pressure         hPa
 * @param {Array}  weather.daily  up to 7 entries:
 *   { date (unix), tempMax, tempMin, weatherCode, precipitationProbability }
 * @returns {Buffer}
 */
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

/**
 * @param {Buffer} buf
 * @returns {{ version, timestamp, current, daily }}
 */
function decodeMT(buf) {
    const m = decode(buf);
    const cur = m[2];
    return {
        version:   m[0],
        timestamp: m[1],
        current: {
            temperature:  cur[0],
            feelsLike:    cur[1],
            humidity:     cur[2],
            windSpeed:    cur[3],
            windDirection: cur[4],
            weatherCode:  cur[5],
            pressure:     cur[6],
        },
        daily: (m[3] || []).map(d => ({
            date:                    d[0],
            tempMax:                 d[1],
            tempMin:                 d[2],
            weatherCode:             d[3],
            precipitationProbability: d[4],
        })),
    };
}

module.exports = { encodeMO, decodeMO, encodeMT, decodeMT, PROTOCOL_VERSION, MT_MAX_BYTES };
