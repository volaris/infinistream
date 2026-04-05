"use strict";

/**
 * Unit tests for GPS NMEA parsing.
 * Exercises _nmeaToDecimal, _checksumValid, and the full sentence parsers
 * by calling private methods directly on a GPS instance that has no open port.
 */

const GPS = require("../src/gps");

function makeGPS() {
    // Don't open a real port — we test parsing logic only.
    return new GPS("/dev/null", 9600);
}

/** Computes the NMEA XOR checksum and returns a complete $...*XX sentence. */
function nmea(body) {
    let xor = 0;
    for (const c of body) xor ^= c.charCodeAt(0);
    return `$${body}*${xor.toString(16).padStart(2, "0").toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Checksum validation
// ---------------------------------------------------------------------------

describe("_checksumValid", () => {
    const gps = makeGPS();

    test("accepts valid GGA sentence", () => {
        const s = nmea("GNGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,");
        expect(gps._checksumValid(s)).toBe(true);
    });

    test("rejects sentence with wrong checksum", () => {
        const s = "$GNGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*FF";
        expect(gps._checksumValid(s)).toBe(false);
    });

    test("rejects sentence with no checksum", () => {
        expect(gps._checksumValid("$GNGGA,123519")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// NMEA coordinate conversion
// ---------------------------------------------------------------------------

describe("_nmeaToDecimal", () => {
    const gps = makeGPS();

    test("converts North latitude correctly", () => {
        // 4807.038 N = 48 + 7.038/60 = 48.1173
        expect(gps._nmeaToDecimal("4807.038", "N")).toBeCloseTo(48.1173, 3);
    });

    test("converts South latitude to negative", () => {
        expect(gps._nmeaToDecimal("4807.038", "S")).toBeCloseTo(-48.1173, 3);
    });

    test("converts East longitude correctly", () => {
        // 01131.000 E = 11 + 31/60 = 11.51667
        expect(gps._nmeaToDecimal("01131.000", "E")).toBeCloseTo(11.5167, 3);
    });

    test("converts West longitude to negative", () => {
        expect(gps._nmeaToDecimal("07358.000", "W")).toBeCloseTo(-73.9667, 3);
    });

    test("returns NaN for empty value", () => {
        expect(gps._nmeaToDecimal("", "N")).toBeNaN();
    });
});

// ---------------------------------------------------------------------------
// Full sentence parsing → fix events
// ---------------------------------------------------------------------------

describe("GGA sentence parsing", () => {
    test("emits fix event with correct lat/lon for valid GGA", done => {
        const gps = makeGPS();
        gps.on("fix", fix => {
            expect(fix.lat).toBeCloseTo(48.1173, 3);
            expect(fix.lon).toBeCloseTo(11.5167, 3);
            expect(fix.fixQuality).toBe(1);
            expect(fix.satellites).toBe(8);
            done();
        });
        gps._onSentence(nmea("GNGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,"));
    });

    test("does not emit fix for quality=0 (no fix)", () => {
        const gps = makeGPS();
        const spy = jest.fn();
        gps.on("fix", spy);
        gps._onSentence("$GNGGA,123519,4807.038,N,01131.000,E,0,00,,,,,,,*78");
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("RMC sentence parsing", () => {
    test("emits fix event for active RMC", done => {
        const gps = makeGPS();
        gps.on("fix", fix => {
            expect(fix.lat).toBeCloseTo(48.1173, 3);
            expect(fix.lon).toBeCloseTo(11.5167, 3);
            done();
        });
        gps._onSentence(nmea("GNRMC,123519,A,4807.038,N,01131.000,E,0.0,0.0,010824,,,A"));
    });

    test("does not emit fix for void (V) RMC", () => {
        const gps = makeGPS();
        const spy = jest.fn();
        gps.on("fix", spy);
        gps._onSentence(nmea("GNRMC,123519,V,4807.038,N,01131.000,E,0.0,0.0,010824,,,N"));
        expect(spy).not.toHaveBeenCalled();
    });
});
