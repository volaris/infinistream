/* MagicMirror² configuration for the Infinistream e-ink display.
 *
 * Targets the Waveshare 7.5" V2 panel (800×480 px).
 * The eink-service takes a Puppeteer screenshot at 800×480 and dithers it
 * for the display; the light theme and fixed body dimensions in custom.css
 * are tuned for that pipeline.
 */
let config = {
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	ipWhitelist: [],

	useHttps: false,
	httpsPrivateKey: "",
	httpsCertificate: "",

	language: "en",
	locale: "en-US",
	logLevel: ["INFO", "LOG", "WARN", "ERROR"],
	timeFormat: 24,
	units: "metric",

	modules: [
		{
			module: "clock",
			position: "top_left"
		},
		{
			module: "MMM-Infinistream",
			position: "top_center"
		},
		{
			module: "weather",
			position: "top_left",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 40.776676,
				lon: -73.971321
			}
		},
		{
			module: "compliments",
			position: "bottom_left",
			config: {
				updateInterval: 30000,
				fadeSpeed: 0,
				classes: "thin large bright pre-line",
				compliments: {
					anytime: [
						"Congratulations,\nyou've become one with the dust.\nNow become one with the water.",
						"That ain't playa sparkle, friend.\nGet in here.",
						"Smelling like\n'radical self-expression'\nisn't a flex. Wash up.",
						"Your aura is glowing… with grime.\nLet's fix that.",
						"Even the porta-potties are judging you.\nScrub up, champ.",
						"Your funk is achieving sentience.\nDo the humane thing.",
						"Less Eau de Playa,\nmore H₂O de Shower.",
						"Dust is forever.\nYour stank doesn't have to be.",
						"Your cuddle puddle is filing complaints.\nGet in the shower.",
						"Consent applies to odors too.\nMake it a 'yes'.",
						"The dust is an art medium.\nYour BO is not.",
						"Hydration starts on the\noutside too. Hop in.",
						"Your outfit is legendary.\nYour musk is not.",
						"The shower is your temple.\nWorship accordingly.",
						"Dust storms are temporary.\nYour stink is eternal (unless you shower).",
						"That's not playa magic.\nThat's funk. Rinse off.",
						"Water is a gift.\nSo is smelling decent.",
						"Do it for your tentmate.\nThey're suffering in silence.",
						"Dirty hippy isn't a compliment."
					]
				}
			}
		},
		{
			module: "weather",
			position: "top_right",
			header: "Weather Forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 40.776676,
				lon: -73.971321
			}
		},
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
