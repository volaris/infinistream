"use strict";

/**
 * Renders the full Infinistream display at 800×480 — the same dimensions
 * as the Waveshare 7.5" V2 e-ink panel — with mock weather (current +
 * 7-day forecast) and a sample compliment alongside the live MMM-Infinistream
 * getDom output.
 *
 * Mirrors the MagicMirror² layout from display/config.js:
 *   top_left   → clock + current weather
 *   top_center → MMM-Infinistream
 *   top_right  → forecast
 *   bottom_left → compliments
 *
 * Usage:
 *   npm run screenshots:full
 *   CHROMIUM_PATH=/usr/bin/chromium npm run screenshots:full
 */

const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const MODULE_DIR = path.join(__dirname, "..");
const OUT_DIR = path.join(MODULE_DIR, "screenshots");

const STATES = [
  { label: "full_connecting",     mode: "CONNECTING", turbidity: 0   },
  { label: "full_shower_clean",   mode: "SHOWER",     turbidity: 0   },
  { label: "full_shower_warning", mode: "SHOWER",     turbidity: 75  },
  { label: "full_shower_unsafe",  mode: "SHOWER",     turbidity: 150 },
  { label: "full_drain",          mode: "DRAIN",      turbidity: 0   },
  { label: "full_flush",          mode: "FLUSH",      turbidity: 0   },
  { label: "full_sanitize",       mode: "SANITIZE",   turbidity: 0   },
];

// Static mock weather HTML — approximates what MagicMirror²'s built-in
// weather module renders.  Uses Font Awesome icons (already loaded) since
// Weather Icons font is not available in this context.
const CURRENT_WEATHER_HTML = `
<div class="mock-module">
  <div class="mock-clock">11:42</div>
  <div class="mock-date">Sunday, August 31</div>
  <hr class="mock-divider"/>
  <div class="mock-weather-current">
    <span class="mock-weather-icon"><i class="fa-solid fa-sun"></i></span>
    <span class="mock-temp">38°C</span>
  </div>
  <div class="mock-weather-desc">Clear Sky</div>
  <div class="mock-weather-meta">
    <span><i class="fa-solid fa-wind"></i> 14 km/h</span>
    &nbsp;
    <span><i class="fa-solid fa-droplet"></i> 8%</span>
  </div>
</div>
`;

const FORECAST_HTML = `
<div class="mock-module">
  <div class="mock-header">Weather Forecast</div>
  <table class="mock-forecast">
    <tr><td>Sun</td><td><i class="fa-solid fa-sun"></i></td>        <td>42° / 28°</td></tr>
    <tr><td>Mon</td><td><i class="fa-solid fa-sun"></i></td>        <td>41° / 27°</td></tr>
    <tr><td>Tue</td><td><i class="fa-solid fa-cloud-sun"></i></td>  <td>39° / 26°</td></tr>
    <tr><td>Wed</td><td><i class="fa-solid fa-cloud"></i></td>      <td>35° / 24°</td></tr>
    <tr><td>Thu</td><td><i class="fa-solid fa-cloud-rain"></i></td> <td>32° / 22°</td></tr>
    <tr><td>Fri</td><td><i class="fa-solid fa-cloud-sun"></i></td>  <td>36° / 23°</td></tr>
    <tr><td>Sat</td><td><i class="fa-solid fa-sun"></i></td>        <td>40° / 26°</td></tr>
  </table>
</div>
`;

const COMPLIMENT_HTML = `
<div class="mock-compliment">
  Dust is forever.<br>Your stank doesn't have to be.
</div>
`;

// Inline CSS for the full-display layout.  Approximates MagicMirror²'s
// region-based positioning without requiring the MM runtime.
const LAYOUT_CSS = `
  * { box-sizing: border-box; }
  body {
    background: #fff;
    color: #333;
    margin: 0;
    padding: 0;
    font-family: Roboto, 'Helvetica Neue', sans-serif;
    width: 800px;
    height: 480px;
    overflow: hidden;
    position: relative;
  }

  /* Regions — mirror MagicMirror²'s absolute positioning */
  .region { position: absolute; }
  .region.top.left    { top: 0;   left: 0;   width: 220px; padding: 12px; }
  .region.top.center  { top: 0;   left: 220px; right: 200px; padding: 8px; }
  .region.top.right   { top: 0;   right: 0;  width: 200px; padding: 12px; }
  .region.bottom.left { bottom: 0; left: 0;  width: 380px; padding: 14px; }

  /* Mock module chrome */
  .mock-module { font-size: 13px; line-height: 1.5; }
  .mock-clock  { font-size: 36px; font-weight: 300; color: #000; line-height: 1; }
  .mock-date   { font-size: 13px; color: #555; margin-bottom: 6px; }
  .mock-divider { border: none; border-top: 1px solid #ccc; margin: 6px 0; }
  .mock-header { font-size: 13px; font-weight: 600; color: #000; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }

  .mock-weather-current { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .mock-weather-icon    { font-size: 28px; color: #444; }
  .mock-temp            { font-size: 32px; font-weight: 300; color: #000; }
  .mock-weather-desc    { font-size: 13px; color: #555; }
  .mock-weather-meta    { font-size: 12px; color: #666; margin-top: 4px; }

  .mock-forecast        { width: 100%; border-collapse: collapse; font-size: 13px; }
  .mock-forecast td     { padding: 2px 4px; }
  .mock-forecast td:first-child { color: #555; width: 36px; }
  .mock-forecast td:nth-child(2){ color: #444; width: 24px; text-align: center; }
  .mock-forecast td:last-child  { color: #000; text-align: right; }

  .mock-compliment {
    font-size: 20px;
    font-weight: 300;
    color: #000;
    line-height: 1.4;
    font-style: italic;
  }
`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 480 });

    await page.goto("about:blank");
    await page.evaluate((layoutCss) => {
      const style = document.createElement("style");
      style.textContent = layoutCss;
      document.head.appendChild(style);
      document.body.innerHTML = `
        <div class="region top left"  id="top-left"></div>
        <div class="region top center" id="top-center"></div>
        <div class="region top right"  id="top-right"></div>
        <div class="region bottom left" id="bottom-left"></div>
      `;
      window.Module = { register: (_n, def) => { window._mod = def; } };
      window.Log    = { log() {}, info() {}, error() {} };
    }, LAYOUT_CSS);

    await page.addStyleTag({
      url: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.0/css/all.min.css",
    });
    await page.addStyleTag({ path: path.join(MODULE_DIR, "MMM-Infinistream.css") });
    await page.addScriptTag({ path: path.join(MODULE_DIR, "MMM-Infinistream.js") });
    // Wait for Font Awesome webfonts to finish loading before capturing any frame.
    await page.waitForFunction(() =>
      document.fonts.check("1em FontAwesome") || document.fonts.check("1em \"Font Awesome 6 Free\"") || document.fonts.check("1em \"Font Awesome 7 Free\"")
    , { timeout: 10000 }).catch(() => {});

    // Inject static regions once (they don't change between states)
    await page.evaluate((leftHtml, rightHtml, complimentHtml) => {
      document.getElementById("top-left").innerHTML   = leftHtml;
      document.getElementById("top-right").innerHTML  = rightHtml;
      document.getElementById("bottom-left").innerHTML = complimentHtml;
    }, CURRENT_WEATHER_HTML, FORECAST_HTML, COMPLIMENT_HTML);

    for (const { label, mode, turbidity } of STATES) {
      await page.evaluate((m, t) => {
        const center = document.getElementById("top-center");
        center.innerHTML = "";
        const ctx = Object.assign(Object.create(window._mod), {
          mode: m,
          turbidity: t,
          config: { turbidityLevels: [0, 50, 100], slowSpinner: true },
        });
        center.appendChild(window._mod.getDom.call(ctx));
      }, mode, turbidity);

      const file = path.join(OUT_DIR, `${label}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${label}.png`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nFull-display screenshots written to MMM-Infinistream/screenshots/`);
}

main().catch(err => { console.error(err); process.exit(1); });
