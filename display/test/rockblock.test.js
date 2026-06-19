"use strict";

// ---------------------------------------------------------------------------
// Globals that MagicMirror provides at runtime — mock them before require
// ---------------------------------------------------------------------------

global.Log = { info: jest.fn(), error: jest.fn() };
global.CurrentWeather = class {};
global.WeatherObject = class {};
global.moment = Object.assign(
    jest.fn((val) => ({ _value: val })),
    { unix: jest.fn((ts) => ({ _unix: ts })) },
);

let provider;
global.WeatherProvider = {
    register: jest.fn((_name, obj) => { provider = obj; }),
};

require("../providers/rockblock.js");

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const OPEN_METEO_CURRENT = {
    current: {
        time: "2026-06-19T12:00",
        temperature_2m: 22.5,
        apparent_temperature: 21.0,
        relative_humidity_2m: 65,
        wind_speed_10m: 5.0,
        wind_direction_10m: 270,
        weather_code: 2,
    },
};

const OPEN_METEO_FORECAST = {
    daily: {
        time: ["2026-06-19", "2026-06-20"],
        temperature_2m_max: [28, 25],
        temperature_2m_min: [15, 14],
        weather_code: [0, 61],
        precipitation_probability_max: [10, 80],
    },
};

const COMMS_CURRENT = {
    updated: 1750000000,
    current: {
        temperature: 22.5,
        feelsLike: 21.0,
        humidity: 65,
        windSpeed: 36,       // km/h — should be converted to 10 m/s
        windDirection: 270,
        weatherCode: 2,
    },
    daily: [],
};

const COMMS_FORECAST = {
    updated: 1750000000,
    current: {},
    daily: [
        { date: "2026-06-19", tempMax: 28, tempMin: 15, weatherCode: 0, precipitationProbability: 10 },
        { date: "2026-06-20", tempMax: 25, tempMin: 14, weatherCode: 61, precipitationProbability: 80 },
    ],
};

// ---------------------------------------------------------------------------
// Reset per test
// ---------------------------------------------------------------------------

beforeEach(() => {
    provider.config = { lat: 40.776676, lon: -73.971321 };
    provider.fetchData = jest.fn();
    global.Log.info.mockClear();
});

// ---------------------------------------------------------------------------

describe("WeatherProvider.register", () => {
    test("registers as 'rockblock'", () => {
        expect(global.WeatherProvider.register).toHaveBeenCalledWith("rockblock", expect.any(Object));
    });
});

describe("openMeteoUrl", () => {
    test("includes lat and lon from config", () => {
        const url = provider.openMeteoUrl();
        expect(url).toContain("latitude=40.776676");
        expect(url).toContain("longitude=-73.971321");
    });

    test("requests wind speed in m/s", () => {
        expect(provider.openMeteoUrl()).toContain("wind_speed_unit=ms");
    });
});

describe("convertWindSpeed", () => {
    test("converts km/h to m/s", () => {
        expect(provider.convertWindSpeed(36)).toBeCloseTo(10);
        expect(provider.convertWindSpeed(72)).toBeCloseTo(20);
        expect(provider.convertWindSpeed(0)).toBe(0);
    });
});

describe("convertWeatherType", () => {
    test.each([
        [0, "day-sunny"],
        [1, "day-cloudy"],
        [2, "day-cloudy"],
        [3, "cloudy"],
        [4, "fog"],
        [49, "fog"],
        [50, "sleet"],
        [57, "sleet"],
        [58, "rain"],
        [67, "rain"],
        [68, "snow"],
        [77, "snow"],
        [78, "rain"],
        [82, "rain"],
        [83, "snow"],
        [86, "snow"],
        [87, "thunderstorm"],
        [99, "thunderstorm"],
        [100, "na"],
    ])("WMO code %d → %s", (code, expected) => {
        expect(provider.convertWeatherType(code)).toBe(expected);
    });
});

describe("currentFromOpenMeteo", () => {
    test("maps temperature, humidity, wind, and weatherType", () => {
        const weather = provider.currentFromOpenMeteo(OPEN_METEO_CURRENT);
        expect(weather.temperature).toBe(22.5);
        expect(weather.feelsLike).toBe(21.0);
        expect(weather.humidity).toBe(65);
        expect(weather.windSpeed).toBe(5.0);      // already m/s
        expect(weather.windDirection).toBe(270);
        expect(weather.weatherType).toBe("day-cloudy");
        expect(weather.date).toBeDefined();
    });
});

describe("forecastFromOpenMeteo", () => {
    test("returns one WeatherObject per day", () => {
        const forecast = provider.forecastFromOpenMeteo(OPEN_METEO_FORECAST);
        expect(forecast).toHaveLength(2);
    });

    test("maps temperatures and weatherType for each day", () => {
        const [d0, d1] = provider.forecastFromOpenMeteo(OPEN_METEO_FORECAST);
        expect(d0.maxTemperature).toBe(28);
        expect(d0.minTemperature).toBe(15);
        expect(d0.weatherType).toBe("day-sunny");
        expect(d1.weatherType).toBe("rain");
        expect(d1.precipitation).toBe(80);
    });
});

describe("currentFromComms", () => {
    test("maps temperature, humidity, and weatherType", () => {
        const weather = provider.currentFromComms(COMMS_CURRENT);
        expect(weather.temperature).toBe(22.5);
        expect(weather.feelsLike).toBe(21.0);
        expect(weather.humidity).toBe(65);
        expect(weather.windDirection).toBe(270);
        expect(weather.weatherType).toBe("day-cloudy");
        expect(weather.date).toBeDefined();
    });

    test("converts wind speed from km/h to m/s", () => {
        const weather = provider.currentFromComms(COMMS_CURRENT);
        expect(weather.windSpeed).toBeCloseTo(10);    // 36 km/h → 10 m/s
    });
});

describe("forecastFromComms", () => {
    test("returns one WeatherObject per day", () => {
        const forecast = provider.forecastFromComms(COMMS_FORECAST);
        expect(forecast).toHaveLength(2);
    });

    test("maps temperatures, weatherType, and precipitation", () => {
        const [d0, d1] = provider.forecastFromComms(COMMS_FORECAST);
        expect(d0.maxTemperature).toBe(28);
        expect(d0.minTemperature).toBe(15);
        expect(d0.weatherType).toBe("day-sunny");
        expect(d0.precipitation).toBe(10);
        expect(d1.weatherType).toBe("rain");
        expect(d1.precipitation).toBe(80);
    });
});

describe("fetchCurrentWeather", () => {
    test("uses Open-Meteo when it resolves", async () => {
        provider.fetchData.mockResolvedValue(OPEN_METEO_CURRENT);
        const weather = await provider.fetchCurrentWeather();
        expect(provider.fetchData).toHaveBeenCalledTimes(1);
        expect(provider.fetchData.mock.calls[0][0]).toContain("open-meteo.com");
        expect(weather.temperature).toBe(22.5);
    });

    test("falls back to comms-service when Open-Meteo rejects", async () => {
        provider.fetchData
            .mockRejectedValueOnce(new Error("network error"))
            .mockResolvedValueOnce(COMMS_CURRENT);
        const weather = await provider.fetchCurrentWeather();
        expect(provider.fetchData).toHaveBeenCalledTimes(2);
        expect(provider.fetchData.mock.calls[1][0]).toContain("comms-service");
        expect(weather.temperature).toBe(22.5);
        expect(Log.info).toHaveBeenCalledWith(expect.stringContaining("Open-Meteo unreachable"));
    });

    test("rejects when both sources fail", async () => {
        provider.fetchData.mockRejectedValue(new Error("all down"));
        await expect(provider.fetchCurrentWeather()).rejects.toThrow("all down");
    });
});

describe("fetchWeatherForecast", () => {
    test("uses Open-Meteo when it resolves", async () => {
        provider.fetchData.mockResolvedValue(OPEN_METEO_FORECAST);
        const forecast = await provider.fetchWeatherForecast();
        expect(provider.fetchData).toHaveBeenCalledTimes(1);
        expect(provider.fetchData.mock.calls[0][0]).toContain("open-meteo.com");
        expect(forecast).toHaveLength(2);
    });

    test("falls back to comms-service when Open-Meteo rejects", async () => {
        provider.fetchData
            .mockRejectedValueOnce(new Error("network error"))
            .mockResolvedValueOnce(COMMS_FORECAST);
        const forecast = await provider.fetchWeatherForecast();
        expect(provider.fetchData).toHaveBeenCalledTimes(2);
        expect(provider.fetchData.mock.calls[1][0]).toContain("comms-service");
        expect(forecast).toHaveLength(2);
    });

    test("rejects when both sources fail", async () => {
        provider.fetchData.mockRejectedValue(new Error("all down"));
        await expect(provider.fetchWeatherForecast()).rejects.toThrow("all down");
    });
});

describe("fetchWeatherHourly", () => {
    test("always resolves to empty array", async () => {
        await expect(provider.fetchWeatherHourly()).resolves.toEqual([]);
    });
});
