"use strict";

/*
 *
 * The flows are:
 *  CONNECTING: default mode until an update is received.
 *  SHOWER:     tank -> heater -> shower -> filter -> UV -> tank
 *  FLUSH:      tank -> filter -> faucet
 *  DRAIN:      tank -> faucet
 *  SANITIZE:   tank -> UV -> tank
 */

Module.register("MMM-Infinistream", {
  defaults: {
    turbidityLevels: [0, 50, 100], // Configurable turbidity thresholds
    webhookPort: 8085,            // Port for receiving web hook updates
    slowSpinner: true             // If true, use a slower spinner animation for e-ink
  },

  start: function () {
    // Set default mode to CONNECTING until we receive a webhook update
    this.mode = "CONNECTING";
    this.turbidity = 0;
    this.sendSocketNotification("STARTED", { message: "test1" });
  },

  socketNotificationReceived: function(notification, payload) {
    Log.log(this.name + " received a socket notification: " + notification + " - Payload: " + payload);
    this.turbidity = payload.turbidity;
    this.mode = payload.mode;
    this.updateDom();
  },

  // Return the main DOM structure
  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "infinistream";

    // Mode display
    const modeDiv = document.createElement("div");
    const modeLabel = document.createTextNode("Mode: ");
    modeDiv.appendChild(modeLabel);
    const modeIconEl = this.getModeIconElement();
    modeDiv.appendChild(modeIconEl);
    // Add a space and the actual mode text
    modeDiv.appendChild(document.createTextNode(" " + this.mode));
    wrapper.appendChild(modeDiv);

    // Turbidity display
    const turbidityDiv = document.createElement("div");
    const turbidityLabel = document.createTextNode("Turbidity: " + this.turbidity + " ");
    turbidityDiv.appendChild(turbidityLabel);
    const turbidityIconEl = this.getTurbidityIconElement();
    turbidityDiv.appendChild(turbidityIconEl);
    wrapper.appendChild(turbidityDiv);

    // Water Flow Representation
    const flowDiv = this.getWaterFlowDom();
    wrapper.appendChild(flowDiv);

    // After layout is added, we selectively hide/show elements based on this.mode
    this.updateFlowVisibility(flowDiv);

    return wrapper;
  },

  // Return an <i> element for the current mode icon
  getModeIconElement: function () {
    const modeIcons = {
      CONNECTING: ["fa-solid", "fa-spinner"],
      SHOWER: ["fa-solid", "fa-shower"],
      DRAIN: ["fa-solid", "fa-faucet-drip"],
      FLUSH: ["fa-solid", "fa-faucet-drip"],
      SANITIZE: ["fa-solid", "fa-sun"]
    };

    const iconClasses = modeIcons[this.mode] || ["fa-solid", "fa-question"];
    const iEl = document.createElement("i");
    iconClasses.forEach((c) => iEl.classList.add(c));

    // If we're in CONNECTING mode, add spin (slow or default)
    if (this.mode === "CONNECTING") {
      iEl.classList.add("fa-spin");
      if (this.config.slowSpinner) {
        iEl.classList.add("spin-slow");
      }
    }

    return iEl;
  },

  // Return an <i> element for the current turbidity icon
  getTurbidityIconElement: function () {
    let iconClasses = ["fa-solid", "fa-water"];
    if (this.turbidity >= this.config.turbidityLevels[1]) {
      iconClasses = ["fa-solid", "fa-cloud"];
    }
    if (this.turbidity >= this.config.turbidityLevels[2]) {
      iconClasses = ["fa-solid", "fa-smog"];
    }

    const iEl = document.createElement("i");
    iconClasses.forEach((c) => iEl.classList.add(c));
    return iEl;
  },

  // Create a 2D layout with a single tank (shown as [ water ]), a loop back to the tank from UV, etc.
  getWaterFlowDom: function () {
    const container = document.createElement("div");
    container.id = "water-flow-layout";

    // We'll define a grid or flex layout.
    // Single tank at the top, arrows leading down to heater -> shower -> filter -> arrow to UV -> arrow up to tank.
    // Also arrows from tank to filter/faucet for flush/drain, etc.

    container.innerHTML = `
      <div class="flow-grid">
        <!-- Single tank -->
        <div class="tank" id="comp-tank">
          [ <i class="fa-solid fa-water" font-size=".5em"></i> ]
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

        <!-- Tank-Flame Mixer -->
        <div class="shower flush" id="tank-flame-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <!-- Shower-Filter Mixer -->
        <div class="shower" id="shower-filter-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <!-- Tank-Filter Mixer -->
        <div class="shower flush" id="tank-filter-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <!-- Filter-Faucet Mixer -->
        <div class="shower flush" id="filter-faucet-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <!-- Tank-Faucet Mixer -->
        <div class="shower flush" id="tank-faucet-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>
        <!-- Faucet Mixer -->
        <div class="shower flush" id="faucet-mix">
          <i class="fa-brands fa-mixer" font-weight="300"></i>
        </div>

        <div class="shower flush drain" id="tank-out">
          <i class="fa-solid fa-angles-left" font-weight="300"></i>
        </div>
        <div class="shower" id="pre-heat">
          <i class="fa-solid fa-angles-left" font-weight="300"></i>
        </div>
        <div class="shower" id="pre-shower">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower" id="post-shower-1">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower" id="post-shower-2">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="shower" id="pre-filter">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="shower" id="filter-faucet-1">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="shower" id="filter-faucet-2">
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
        </div>
        <div class="shower" id="tank-filter-1">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower" id="tank-filter-2">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower" id="tank-filter-3">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower" id="pre-uv">
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
        </div>
        <div class="shower" id="post-uv">
          <i class="fa-solid fa-angles-up" font-weight="300"></i>
        </div>
        <div class="shower" id="tank-faucet-1">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
        <div class="shower" id="tank-faucet-2">
          <i class="fa-solid fa-angles-down" font-weight="300"></i>
        </div>
        <div class="shower" id="pre-faucet">
          <i class="fa-solid fa-angles-right" font-weight="300"></i>
        </div>
      </div>
    `;

    return container;
  },

  // Show/hide elements based on the current mode
  updateFlowVisibility: function (parent) {
    function setHidden(id, hide) {
      const el = parent.querySelector('#' + id);
      if (!el) return;
      el.classList.remove('hidden');
      if (hide) {
        el.classList.add('hidden');
      }
    }

    // List of all element IDs in the schematic.
    const allIds = [
      'comp-tank',
      'arrow-tank-heater',
      'comp-heater',
      'arrow-heater-shower',
      'comp-shower',
      'arrow-shower-filter',
      'comp-filter',
      'arrow-filter-uv',
      'comp-uv',
      'arrow-uv-tank-up',
      'arrow-tank-filter',
      'arrow-tank-faucet',
      'comp-faucet'
    ];

    // Hide everything by default
    allIds.forEach(id => setHidden(id, true));

    switch (this.mode) {
      case 'CONNECTING':
        // Show nothing
        // tank -> heater -> shower -> filter -> uv -> arrow-uv-tank-up (loop)
        setHidden('comp-tank', false);
        setHidden('arrow-tank-heater', false);
        setHidden('comp-heater', false);
        setHidden('arrow-heater-shower', false);
        setHidden('comp-shower', false);
        setHidden('arrow-shower-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-filter-uv', false);
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank-up', false);
        // tank -> filter -> faucet
        setHidden('comp-tank', false);
        setHidden('arrow-tank-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        // tank -> faucet
        setHidden('comp-tank', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        // tank -> faucet
        setHidden('comp-tank', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false)
        // tank -> uv -> arrow-uv-tank-up
        setHidden('comp-tank', false);
        setHidden('arrow-filter-uv', false); // optional if you want a direct path from tank to uv
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank-up', false);;
        break;

      case 'SHOWER':
        // tank -> heater -> shower -> filter -> uv -> arrow-uv-tank-up (loop)
        setHidden('comp-tank', false);
        setHidden('arrow-tank-heater', false);
        setHidden('comp-heater', false);
        setHidden('arrow-heater-shower', false);
        setHidden('comp-shower', false);
        setHidden('arrow-shower-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-filter-uv', false);
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank-up', false);
        break;

      case 'FLUSH':
        // tank -> filter -> faucet
        setHidden('comp-tank', false);
        setHidden('arrow-tank-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        break;

      case 'DRAIN':
        // tank -> faucet
        setHidden('comp-tank', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        break;

      case 'SANITIZE':
        // tank -> uv -> arrow-uv-tank-up
        setHidden('comp-tank', false);
        setHidden('arrow-filter-uv', false); // optional if you want a direct path from tank to uv
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank-up', false);
        break;

      default:
        // Show nothing if unknown
        break;
    }
  },

  getStyles: function () {
    return [
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
      this.file('MMM-Infinistream.css')
    ];
  }
});
