"use strict";

/**
 * Fetches current + 7-day forecast from the Open-Meteo API and shapes the
 * response into the MT weather payload schema.
 *
 * Open-Meteo is free, requires no API key, and returns data in the same
 * units we need (°C, km/h, hPa, WMO weather codes).
 */

const OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast";

const CURRENT_PARAMS = [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "weather_code",
    "surface_pressure",
].join(",");

const DAILY_PARAMS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "weather_code",
    "precipitation_probability_max",
].join(",");

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<object>}  weather payload ready for encodeMT()
 */
async function fetchWeather(lat, lon) {
    const url = new URL(OPENMETEO_URL);
    url.searchParams.set("latitude",       lat.toFixed(4));
    url.searchParams.set("longitude",      lon.toFixed(4));
    url.searchParams.set("current",        CURRENT_PARAMS);
    url.searchParams.set("daily",          DAILY_PARAMS);
    url.searchParams.set("wind_speed_unit","kmh");
    url.searchParams.set("forecast_days",  "7");
    url.searchParams.set("timezone",       "UTC");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const c = data.current;
    const d = data.daily;
    const now = Math.floor(Date.now() / 1000);

    return {
        timestamp: now,
        current: {
            temperature:   c.temperature_2m,
            feelsLike:     c.apparent_temperature,
            humidity:      c.relative_humidity_2m,
            windSpeed:     c.wind_speed_10m,
            windDirection: c.wind_direction_10m,
            weatherCode:   c.weather_code,
            pressure:      c.surface_pressure,
        },
        daily: d.time.map((isoDate, i) => ({
            date:                    Math.floor(new Date(isoDate).getTime() / 1000),
            tempMax:                 d.temperature_2m_max[i],
            tempMin:                 d.temperature_2m_min[i],
            weatherCode:             d.weather_code[i],
            precipitationProbability: d.precipitation_probability_max[i] ?? 0,
        })),
    };
}

module.exports = { fetchWeather };
