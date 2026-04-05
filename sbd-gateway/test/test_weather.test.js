"use strict";

const { fetchWeather } = require("../src/weather");

const MOCK_RESPONSE = {
    current: {
        temperature_2m:       25.5,
        apparent_temperature:  24.0,
        relative_humidity_2m:  42,
        wind_speed_10m:        8.5,
        wind_direction_10m:    270,
        weather_code:          2,
        surface_pressure:      1013.0,
    },
    daily: {
        time:                          ["2024-08-01", "2024-08-02", "2024-08-03"],
        temperature_2m_max:            [32.0, 30.0, 28.0],
        temperature_2m_min:            [15.0, 14.0, 13.0],
        weather_code:                  [3, 1, 0],
        precipitation_probability_max: [20, 5, null],
    },
};

beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
        ok:   true,
        json: async () => MOCK_RESPONSE,
        text: async () => "",
    });
});

describe("fetchWeather", () => {
    test("calls Open-Meteo with the supplied lat/lon", async () => {
        await fetchWeather(40.7766, -73.9713);
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain("latitude=40.7766");
        expect(url).toContain("longitude=-73.9713");
    });

    test("maps current weather fields correctly", async () => {
        const w = await fetchWeather(40.7766, -73.9713);
        expect(w.current.temperature).toBe(25.5);
        expect(w.current.feelsLike).toBe(24.0);
        expect(w.current.humidity).toBe(42);
        expect(w.current.windSpeed).toBe(8.5);
        expect(w.current.windDirection).toBe(270);
        expect(w.current.weatherCode).toBe(2);
        expect(w.current.pressure).toBe(1013.0);
    });

    test("maps daily forecast correctly", async () => {
        const w = await fetchWeather(40.7766, -73.9713);
        expect(w.daily).toHaveLength(3);
        expect(w.daily[0].tempMax).toBe(32.0);
        expect(w.daily[0].weatherCode).toBe(3);
        expect(w.daily[0].precipitationProbability).toBe(20);
    });

    test("replaces null precipitation probability with 0", async () => {
        const w = await fetchWeather(40.7766, -73.9713);
        expect(w.daily[2].precipitationProbability).toBe(0);
    });

    test("includes unix timestamps for daily dates", async () => {
        const w = await fetchWeather(40.7766, -73.9713);
        expect(w.daily[0].date).toBe(Math.floor(new Date("2024-08-01").getTime() / 1000));
    });

    test("throws on non-OK response", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false, status: 429, text: async () => "rate limited",
        });
        await expect(fetchWeather(0, 0)).rejects.toThrow("429");
    });
});
