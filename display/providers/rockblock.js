/* MagicMirror² custom weather provider — comms-service (RockBLOCK / Iridium SBD).
 *
 * Reads weather data from the comms-service HTTP API, which caches the most
 * recent MT SBD payload received from the sbd-gateway via the Iridium network.
 *
 * Configuration in config.js:
 *   {
 *     module: "weather",
 *     config: {
 *       weatherProvider: "rockblock",
 *       commsServiceUrl: "http://comms-service:3002",  // default
 *       type: "current"   // or "forecast"
 *     }
 *   }
 *
 * WMO weather codes are mapped to MagicMirror weather types using the same
 * mapping as the built-in openmeteo provider.
 */

WeatherProvider.register("rockblock", {
    providerName: "RockBLOCK (Iridium SBD)",

    fetchCurrentWeather() {
        return this.fetchData(this.commsUrl("/weather"))
            .then(data => this.currentWeatherFromData(data))
            .catch(err => { Log.error("rockblock provider: " + err.message); throw err; });
    },

    fetchWeatherForecast() {
        return this.fetchData(this.commsUrl("/weather"))
            .then(data => this.forecastFromData(data))
            .catch(err => { Log.error("rockblock provider: " + err.message); throw err; });
    },

    fetchWeatherHourly() {
        // Hourly data is not available over SBD — return empty array.
        return Promise.resolve([]);
    },

    // -----------------------------------------------------------------------

    commsUrl(path) {
        const base = (this.config.commsServiceUrl || "http://comms-service:3002").replace(/\/$/, "");
        return `${base}${path}`;
    },

    currentWeatherFromData(data) {
        const c = data.current;
        const weather = new CurrentWeather();
        weather.date        = moment.unix(data.updated);
        weather.temperature = c.temperature;
        weather.feelsLike   = c.feelsLike;
        weather.humidity    = c.humidity;
        weather.windSpeed   = this.convertWindSpeed(c.windSpeed);
        weather.windDirection = c.windDirection;
        weather.weatherType = this.convertWeatherType(c.weatherCode);
        return weather;
    },

    forecastFromData(data) {
        return data.daily.map(d => {
            const day = new WeatherObject();
            day.date        = moment(d.date, "YYYY-MM-DD");
            day.maxTemperature = d.tempMax;
            day.minTemperature = d.tempMin;
            day.weatherType = this.convertWeatherType(d.weatherCode);
            day.precipitation = d.precipitationProbability;
            return day;
        });
    },

    /**
     * Maps WMO weather interpretation codes to MagicMirror weather type strings.
     * https://open-meteo.com/en/docs#weathervariables
     */
    convertWeatherType(code) {
        if (code === 0)              return "day-sunny";
        if (code <= 2)               return "day-cloudy";
        if (code === 3)              return "cloudy";
        if (code <= 49)              return "fog";
        if (code <= 57)              return "sleet";
        if (code <= 67)              return "rain";
        if (code <= 77)              return "snow";
        if (code <= 82)              return "rain";
        if (code <= 86)              return "snow";
        if (code <= 99)              return "thunderstorm";
        return "na";
    },

    convertWindSpeed(kmh) {
        // MagicMirror expects m/s internally
        return kmh / 3.6;
    },
});
