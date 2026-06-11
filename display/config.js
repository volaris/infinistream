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
	units: "imperial",

	modules: [
		{
			module: "clock",
			position: "top_left",
			config: {
				displaySeconds: false
			}
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
						"You've survived the dust.\nYou've survived the heat.\nThe shower is the reward.",
						"Your playa perfume has evolved\nbeyond its original design.\nTime to recalibrate.",
						"Less Eau de Playa,\nmore H₂O de Shower.",
						"Dust is forever.\nYour stank doesn't have to be.",
						"Your cuddle puddle is filing complaints.\nGet in the shower.",
						"Camp love is unconditional.\nYour musk needn't test it.",
						"The dust is an art medium.\nYour BO is not.",
						"Hydration starts on the\noutside too. Hop in.",
						"Your outfit is legendary.\nYour musk is not.",
						"The shower is your temple.\nWorship accordingly.",
						"Dust storms are temporary.\nYour stink is eternal (unless you shower).",
						"That's not playa magic.\nThat's funk. Rinse off.",
						"Water is a gift.\nSo is smelling decent.",
						"Your camp shows up for you.\nThey'd never say it.\nBut they'd appreciate it.",
						"Radical self-care\nshould be a principle.\nHop in."
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
