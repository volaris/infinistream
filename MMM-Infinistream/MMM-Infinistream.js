"use strict";

/*
 * The flows are:
 *  CONNECTING: default mode until an update is received.
 *  SHOWER:     tank -> heater -> shower -> filter -> UV -> tank
 *  FLUSH:      tank -> filter -> faucet
 *  DRAIN:      tank -> faucet
 *  SANITIZE:   tank -> UV -> tank
 *
 * - Each flow arrow/indicator and mixer has classes for the modes in which it should be displayed (e.g., "shower", "flush", "drain").
 * - Main components (tank, heater, shower, filter, uv, faucet) remain visible in all modes.
 * - CONNECTING mode shows everything for debugging.
 */

Module.register("MMM-Infinistream", {
  defaults: {
    turbidityLevels: [0, 50, 100],
    webhookPort: 8085,
    slowSpinner: true
  },

  start: function () {
    // Set default mode to CONNECTING until we receive a webhook update
    this.mode = "CONNECTING";
    this.turbidity = 0;
    this.sendSocketNotification("STARTED", { message: "test1" });
  },

  socketNotificationReceived: function (notification, payload) {
    Log.log(
      this.name +
        " received a socket notification: " +
        notification +
        " - Payload: " +
        JSON.stringify(payload)
    );
    this.turbidity = payload.turbidity;
    this.mode = payload.mode;
    this.updateDom();
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "infinistream";

    // Mode display
    const modeDiv = document.createElement("div");
    const modeIconEl = this.getModeIconElement();
    modeDiv.appendChild(modeIconEl);
    modeDiv.appendChild(document.createTextNode(" " + this.mode));
    wrapper.appendChild(modeDiv);

    // Turbidity display
    const turbidityDiv = document.createElement("div");
    const turbidityLabel = document.createTextNode("Turbidity: ");
    turbidityDiv.appendChild(turbidityLabel);
    const turbidityIconEl = this.getTurbidityIconElement();
    turbidityDiv.appendChild(turbidityIconEl);
    const turbidityLevel = document.createTextNode(" (" + this.turbidity + " NTU)");
    turbidityDiv.appendChild(turbidityLevel);
    wrapper.appendChild(turbidityDiv);

    // space
    const lineSpace = document.createElement("br");
    wrapper.appendChild(lineSpace);

    // Water Flow Representation
    const flowDiv = this.getWaterFlowDom();
    wrapper.appendChild(flowDiv);

    // Toggle visibility based on mode
    this.updateFlowVisibility(flowDiv);

    return wrapper;
  },

  getModeIconElement: function () {
    const modeIcons = {
      CONNECTING: ["fa-solid", "fa-spinner"],
      SHOWER: ["fa-solid", "fa-shower"],
      DRAIN: ["fa-solid", "fa-faucet-drip"],
      FLUSH: ["fa-solid", "fa-faucet-drip"],
      SANITIZE: ["fa-solid", "fa-sun"]
    };

    const chosen = modeIcons[this.mode] || ["fa-solid", "fa-question"];
    const iEl = document.createElement("i");
    chosen.forEach((c) => iEl.classList.add(c));

    // Slower spin if CONNECTING
    if (this.mode === "CONNECTING") {
      iEl.classList.add("fa-spin");
      if (this.config.slowSpinner) {
        iEl.classList.add("spin-slow");
      }
    }

    return iEl;
  },

  getTurbidityIconElement: function () {
    let iconClasses = ["fa-regular", "fa-thumbs-up"];
    if (this.turbidity >= this.config.turbidityLevels[1]) {
      iconClasses = ["fa-solid", "fa-triangle-exclamation"];
    }
    if (this.turbidity >= this.config.turbidityLevels[2]) {
      iconClasses = ["fa-solid", "fa-skull-crossbones"];
    }

    const iEl = document.createElement("i");
    iconClasses.forEach((c) => iEl.classList.add(c));
    return iEl;
  },

  getWaterFlowDom: function () {
    const container = document.createElement("div");
    container.id = "water-flow-layout";

    container.innerHTML = `
      <div class="flow-grid"">
        <!-- Single tank -->
        <div class="tank" id="comp-tank" style="font-size:.9em; letter-spacing: -1px;">
          [ <i class="fa-solid fa-water"></i> ]
        </div>
        <!-- Heater -->
        <div class="heater" id="comp-heater">
          <i class="fa-solid fa-fire"></i>
        </div>
        <!-- Shower -->
        <div class="shower" id="comp-shower">
          <i class="fa-solid fa-shower"></i>
        </div>
        <!-- Filter -->
        <div class="filter" id="comp-filter">
          <i class="fa-solid fa-filter"></i>
        </div>
        <!-- UV -->
        <div class="uv" id="comp-uv">
          <i class="fa-regular fa-sun"></i>
        </div>
        <!-- Faucet -->
        <div class="faucet" id="comp-faucet">
          <i class="fa-solid fa-faucet"></i>
        </div>

        <!-- Mixers with mode classes to hide them if flow is inactive -->
        <div class="shower sanitize flush flow-shrink" id="tank-flame-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <div class="shower flow-shrink" id="shower-filter-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <div class="shower flush sanitize flow-shrink" id="tank-filter-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <div class="flush flow-shrink" id="filter-faucet-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <div class="drain flow-shrink" id="tank-faucet-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <div class="flush drain flow-shrink" id="faucet-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>

        <!-- Flow arrows with classes for modes -->
        <div class="shower flush sanitize flow-shrink" id="tank-out">
          <i class="fa-solid fa-angles-left" font-weight="300"></i>
          <i class="fa-solid fa-angles-left" font-weight="300"></i>
        </div>
        <div class="shower flow-shrink" id="pre-heat">
          <i class="fa-solid fa-angles-left" font-weight="300"></i>
          <i class="fa-solid fa-angles-left" font-weight="300"></i>
        </div>
        <div class="shower flow-shrink" id="pre-shower">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower flow-shrink" id="post-shower-1">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower flow-shrink" id="post-shower-2">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="shower flush sanitize flow-shrink" id="pre-filter">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="flush flow-shrink" id="filter-faucet-1">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="flush flow-shrink" id="filter-faucet-2">
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
        </div>
        <div class="sanitize flush flow-shrink" id="tank-filter-1">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="sanitize flush flow-shrink" id="tank-filter-2">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="sanitize flush flow-shrink" id="tank-filter-3">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower sanitize flow-shrink" id="pre-uv">
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
        </div>
        <div class="shower sanitize flow-shrink" id="post-uv">
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
        </div>
        <div class="drain flow-shrink" id="tank-faucet-1">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="drain flow-shrink" id="tank-faucet-2">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
          <br />
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="flush drain flow-shrink" id="pre-faucet">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
      </div>
    `;
    return container;
  },

  updateFlowVisibility: function (parent) {
    // If CONNECTING, show everything for debug
    if (this.mode === "CONNECTING") {
      const allItems = parent.querySelectorAll(".flow-grid");
      allItems.forEach((item) => {
        item.classList.add("hidden");
      });
      return;
    }

    // Otherwise hide or show items by checking classes
    const allItems = parent.querySelectorAll(".flow-grid > div");
    allItems.forEach((item) => {
      // If it's a main component (id starts with comp-), always show
      if (item.id.startsWith("comp-")) {
        item.classList.remove("hidden");
      } else {
        // It's a flow arrow or mixer
        // If it has no recognized mode classes, we used to show it always,
        // but now mixers have classes too, so we hide them if they're not used.
        const modeClasses = ["shower", "flush", "drain", "sanitize"];
        const classes = item.className.split(/\s+/);
        const hasModeClass = classes.some((c) => modeClasses.includes(c));

        if (!hasModeClass) {
          // no mode classes => always visible (if you prefer)
          item.classList.remove("hidden");
        } else {
          // show only if it has the current mode in lowercase
          if (classes.includes(this.mode.toLowerCase())) {
            item.classList.remove("hidden");
          } else {
            item.classList.add("hidden");
          }
        }
      }
    });
  },

  getStyles: function () {
    return [
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      this.file("MMM-Infinistream.css")
    ];
  }
});
