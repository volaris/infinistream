"use strict";

jest.mock("../src/weather", () => ({
    fetchWeather: jest.fn(),
}));

const { handler, sendMT } = require("../handler");
const { fetchWeather }    = require("../src/weather");
const { decodeMO, encodeMO } = require("../src/sbd-codec");

const SAMPLE_WEATHER = {
    timestamp: 1722470400,
    current: {
        temperature: 25.5, feelsLike: 24.0, humidity: 42,
        windSpeed: 8.5, windDirection: 270, weatherCode: 2, pressure: 1013.0,
    },
    daily: [
        { date: 1722470400, tempMax: 32, tempMin: 15, weatherCode: 3, precipitationProbability: 20 },
    ],
};

const IMEI = "300234010753370";

function makeEvent(imei, lat, lon) {
    const mo  = encodeMO(Math.floor(Date.now() / 1000), lat, lon);
    const hex = mo.toString("hex");
    return {
        isBase64Encoded: false,
        body: new URLSearchParams({ imei, data: hex }).toString(),
    };
}

beforeEach(() => {
    fetchWeather.mockResolvedValue(SAMPLE_WEATHER);
    process.env.ROCK7_USERNAME = "testuser";
    process.env.ROCK7_PASSWORD = "testpass";
    jest.clearAllMocks();
    fetchWeather.mockResolvedValue(SAMPLE_WEATHER);

    // Mock global fetch for Rock7 MT API
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => "OK,12345",
    });
});

// ---------------------------------------------------------------------------

describe("handler", () => {
    test("returns 200 for valid MO event", async () => {
        const res = await handler(makeEvent(IMEI, 40.7766, -73.9713));
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).ok).toBe(true);
    });

    test("calls fetchWeather with the lat/lon from the MO payload", async () => {
        await handler(makeEvent(IMEI, 40.7766, -73.9713));
        expect(fetchWeather).toHaveBeenCalledWith(
            expect.closeTo(40.7766, 2),
            expect.closeTo(-73.9713, 2)
        );
    });

    test("POSTs to Rock7 MT API with correct imei and hex payload", async () => {
        await handler(makeEvent(IMEI, 40.7766, -73.9713));
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("rockblock.rock7.com"),
            expect.objectContaining({ method: "POST" })
        );
        const body = global.fetch.mock.calls[0][1].body;
        expect(body).toContain(`imei=${IMEI}`);
        expect(body).toContain("data=");
    });

    test("returns 400 if imei is missing", async () => {
        const event = { isBase64Encoded: false, body: "data=aabbcc" };
        const res   = await handler(event);
        expect(res.statusCode).toBe(400);
    });

    test("returns 400 if data is missing", async () => {
        const event = { isBase64Encoded: false, body: `imei=${IMEI}` };
        const res   = await handler(event);
        expect(res.statusCode).toBe(400);
    });

    test("returns 500 if weather fetch fails", async () => {
        fetchWeather.mockRejectedValueOnce(new Error("network error"));
        const res = await handler(makeEvent(IMEI, 40.7766, -73.9713));
        expect(res.statusCode).toBe(500);
    });

    test("returns 500 if Rock7 MT API rejects", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            text: async () => "FAILED,10,Invalid login credentials",
        });
        const res = await handler(makeEvent(IMEI, 40.7766, -73.9713));
        expect(res.statusCode).toBe(500);
    });
});

describe("sendMT — missing credentials", () => {
    test("throws if ROCK7_USERNAME is not set", async () => {
        delete process.env.ROCK7_USERNAME;
        await expect(sendMT(IMEI, Buffer.from("aa", "hex"))).rejects.toThrow("ROCK7_USERNAME");
    });
});
