"use strict";

/**
 * Renders MMM-Infinistream in each meaningful state and writes PNGs to
 * MMM-Infinistream/screenshots/ for human review.
 *
 * Usage:
 *   npm run screenshots
 *   CHROMIUM_PATH=/usr/bin/chromium npm run screenshots
 */

const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const MODULE_DIR = path.join(__dirname, "..");
const OUT_DIR = path.join(MODULE_DIR, "screenshots");

// One entry per screenshot. turbidity tiers: clean < 50, warning 50–99, unsafe >= 100.
const STATES = [
  { label: "connecting",      mode: "CONNECTING", turbidity: 0   },
  { label: "shower_clean",    mode: "SHOWER",     turbidity: 0   },
  { label: "shower_warning",  mode: "SHOWER",     turbidity: 75  },
  { label: "shower_unsafe",   mode: "SHOWER",     turbidity: 150 },
  { label: "drain",           mode: "DRAIN",      turbidity: 0   },
  { label: "flush",           mode: "FLUSH",      turbidity: 0   },
  { label: "sanitize",        mode: "SANITIZE",   turbidity: 0   },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    // Match the Waveshare 7.5" V2 e-ink panel resolution used in production.
    await page.setViewport({ width: 800, height: 480 });

    // Set up the page once: load Font Awesome and the module JS/CSS a single
    // time, then swap the DOM for each state without reloading any assets.
    await page.goto("about:blank");
    await page.evaluate(() => {
      document.body.style.cssText =
        "background:#000;color:#fff;padding:20px;margin:0;font-family:Roboto,sans-serif";
      document.body.innerHTML = '<div id="root"></div>';
      // Mock MagicMirror² globals before the module script runs.
      window.Module = { register: (_n, def) => { window._mod = def; } };
      window.Log    = { log() {}, info() {}, error() {} };
    });
    await page.addStyleTag({
      url: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    });
    await page.addStyleTag({ path: path.join(MODULE_DIR, "MMM-Infinistream.css") });
    await page.addScriptTag({ path: path.join(MODULE_DIR, "MMM-Infinistream.js") });

    for (const { label, mode, turbidity } of STATES) {
      await page.evaluate((m, t) => {
        document.getElementById("root").innerHTML = "";
        // getDom calls this.getModeIconElement() etc., so ctx must inherit
        // all module methods via the prototype chain.
        const ctx = Object.assign(Object.create(window._mod), {
          mode: m,
          turbidity: t,
          config: { turbidityLevels: [0, 50, 100], slowSpinner: true },
        });
        document.getElementById("root").appendChild(window._mod.getDom.call(ctx));
      }, mode, turbidity);

      const file = path.join(OUT_DIR, `${label}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${label}.png`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nScreenshots written to MMM-Infinistream/screenshots/`);
}

main().catch(err => { console.error(err); process.exit(1); });
