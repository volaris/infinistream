/* MagicMirror² custom weather provider — Open-Meteo with RockBLOCK/Iridium SBD fallback.
 *
 * Fetches live weather from api.open-meteo.com when network is available.
 * On failure, falls back to the comms-service HTTP API, which caches the most
 * recent weather payload received over the Iridium SBD link.
 *
 * Configuration in config.js:
 *   {
 *     module: "weather",
 *     config: {
 *       weatherProvider: "rockblock",
 *       type: "current",            // or "forecast"
 *       lat: 40.776676,
 *       lon: -73.971321,
 *       commsServiceUrl: "http://comms-service:3002",  // default
 *     }
 *   }
 */

WeatherProvider.register("rockblock", {
    providerName: "RockBLOCK (Iridium SBD)",

    fetchCurrentWeather() {
        return this.fetchData(this.openMeteoUrl())
            .then(data => this.currentFromOpenMeteo(data))
            .catch(() => {
                Log.info("rockblock provider: Open-Meteo unreachable, using comms-service cache");
                return this.fetchData(this.commsUrl("/weather"))
                    .then(data => this.currentFromComms(data));
            });
    },

    fetchWeatherForecast() {
        return this.fetchData(this.openMeteoUrl())
            .then(data => this.forecastFromOpenMeteo(data))
            .catch(() => {
                Log.info("rockblock provider: Open-Meteo unreachable, using comms-service cache");
                return this.fetchData(this.commsUrl("/weather"))
                    .then(data => this.forecastFromComms(data));
            });
    },

    fetchWeatherHourly() {
        return Promise.resolve([]);
    },

    // -------------------------------------------------------------------------

    openMeteoUrl() {
        const { lat, lon } = this.config;
        return "https://api.open-meteo.com/v1/forecast"
            + `?latitude=${lat}&longitude=${lon}`
            + "&current=temperature_2m,apparent_temperature,relative_humidity_2m"
            + ",wind_speed_10m,wind_direction_10m,weather_code"
            + "&daily=weather_code,temperature_2m_max,temperature_2m_min"
            + ",precipitation_probability_max"
            + "&wind_speed_unit=ms&timezone=auto";
    },

    commsUrl(path) {
        const base = (this.config.commsServiceUrl || "http://comms-service:3002").replace(/\/$/, "");
        return `${base}${path}`;
    },

    // Open-Meteo raw response format (wind already in m/s via wind_speed_unit=ms)
    currentFromOpenMeteo(data) {
        const c = data.current;
        const weather = new CurrentWeather();
        weather.date          = moment(c.time);
        weather.temperature   = c.temperature_2m;
        weather.feelsLike     = c.apparent_temperature;
        weather.humidity      = c.relative_humidity_2m;
        weather.windSpeed     = c.wind_speed_10m;
        weather.windDirection = c.wind_direction_10m;
        weather.weatherType   = this.convertWeatherType(c.weather_code);
        return weather;
    },

    forecastFromOpenMeteo(data) {
        const d = data.daily;
        return d.time.map((date, i) => {
            const day = new WeatherObject();
            day.date           = moment(date, "YYYY-MM-DD");
            day.maxTemperature = d.temperature_2m_max[i];
            day.minTemperature = d.temperature_2m_min[i];
            day.weatherType    = this.convertWeatherType(d.weather_code[i]);
            day.precipitation  = d.precipitation_probability_max[i];
            return day;
        });
    },

    // comms-service response format (wind in km/h)
    currentFromComms(data) {
        const c = data.current;
        const weather = new CurrentWeather();
        weather.date          = moment.unix(data.updated);
        weather.temperature   = c.temperature;
        weather.feelsLike     = c.feelsLike;
        weather.humidity      = c.humidity;
        weather.windSpeed     = this.convertWindSpeed(c.windSpeed);
        weather.windDirection = c.windDirection;
        weather.weatherType   = this.convertWeatherType(c.weatherCode);
        return weather;
    },

    forecastFromComms(data) {
        return data.daily.map(d => {
            const day = new WeatherObject();
            day.date           = moment(d.date, "YYYY-MM-DD");
            day.maxTemperature = d.tempMax;
            day.minTemperature = d.tempMin;
            day.weatherType    = this.convertWeatherType(d.weatherCode);
            day.precipitation  = d.precipitationProbability;
            return day;
        });
    },

    /**
     * Maps WMO weather interpretation codes to MagicMirror weather type strings.
     * https://open-meteo.com/en/docs#weathervariables
     */
    convertWeatherType(code) {
        if (code === 0)  return "day-sunny";
        if (code <= 2)   return "day-cloudy";
        if (code === 3)  return "cloudy";
        if (code <= 49)  return "fog";
        if (code <= 57)  return "sleet";
        if (code <= 67)  return "rain";
        if (code <= 77)  return "snow";
        if (code <= 82)  return "rain";
        if (code <= 86)  return "snow";
        if (code <= 99)  return "thunderstorm";
        return "na";
    },

    convertWindSpeed(kmh) {
        return kmh / 3.6;
    },
});
