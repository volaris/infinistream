"use strict";

/*
 * This version of the MMM-Infinistream module uses a 2D layout for the water flow, so we can place
 * the shower on the left with water coming in from above and draining below.
 * We'll use basic CSS grid or flex columns to arrange the icons.
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

  // Create a 2D layout to show the shower on the left with water in from above, out below
  getWaterFlowDom: function () {
    const container = document.createElement("div");
    container.id = "water-flow-layout";

    // We'll use CSS grid to position each element.
    // The shower is on the left, the tank is above it, and water can flow out below.

    // Elements:
    //  - compTank1 (the main tank on top of the shower)
    //  - arrowTankDown (vertical arrow from tank to shower)
    //  - compShower (the shower itself, on the left column)
    //  - arrowShowerDown (vertical arrow from shower down)
    //  - compHeater, compFilter, compUv, etc. on the right side or below.

    container.innerHTML = `
      <div class="flow-grid">
        <!-- Row 1: Tank above shower -->
        <div class="tank" id="comp-tank1">
          <i class="fa-solid fa-bracket-left"></i>
          <i class="fa-solid fa-water"></i>
          <i class="fa-solid fa-bracket-right"></i>
        </div>
        <div class="arrow-vertical" id="arrow-tank-heater">
          <i class="fa-solid fa-arrow-down"></i>
        </div>
        <div class="heater" id="comp-heater">
          <i class="fa-solid fa-fire"></i>
        </div>
        <div class="arrow-vertical" id="arrow-heater-shower">
          <i class="fa-solid fa-arrow-down"></i>
        </div>
        <div class="shower" id="comp-shower">
          <i class="fa-solid fa-shower"></i>
        </div>
        <div class="arrow-vertical" id="arrow-shower-filter">
          <i class="fa-solid fa-arrow-down"></i>
        </div>
        <!-- We'll place filter/uv to the right, so the arrow from shower leads horizontally to them -->
        <div class="filter" id="comp-filter">
          <i class="fa-solid fa-filter"></i>
        </div>
        <div class="arrow-horizontal" id="arrow-filter-uv">
          <i class="fa-solid fa-arrow-right"></i>
        </div>
        <div class="uv" id="comp-uv">
          <i class="fa-regular fa-sun"></i>
        </div>
        <div class="arrow-horizontal" id="arrow-uv-tank">
          <i class="fa-solid fa-arrow-right"></i>
        </div>
        <div class="tank2" id="comp-tank2">
          <i class="fa-solid fa-bracket-left"></i>
          <i class="fa-solid fa-water"></i>
          <i class="fa-solid fa-bracket-right"></i>
        </div>
        <div class="arrow-horizontal" id="arrow-tank-filter">
          <i class="fa-solid fa-arrow-right"></i>
        </div>
        <div class="arrow-horizontal" id="arrow-tank-uv">
          <i class="fa-solid fa-arrow-right"></i>
        </div>
        <div class="arrow-horizontal" id="arrow-tank-faucet">
          <i class="fa-solid fa-arrow-right"></i>
        </div>
        <div class="faucet" id="comp-faucet">
          <i class="fa-solid fa-faucet"></i>
        </div>
      </div>
    `;

    return container;
  },

  // Show/hide elements based on the current mode
  updateFlowVisibility: function (parent) {
    // Utility function to hide or show an element by ID
    function setHidden(id, hide) {
      const el = parent.querySelector('#' + id);
      if (!el) return;
      el.classList.remove('hidden');
      if (hide) {
        el.classList.add('hidden');
      }
    }

    // Hide everything first
    const allIds = [
      'comp-tank1',
      'arrow-tank-heater',
      'comp-heater',
      'arrow-heater-shower',
      'comp-shower',
      'arrow-shower-filter',
      'comp-filter',
      'arrow-filter-uv',
      'comp-uv',
      'arrow-uv-tank',
      'comp-tank2',
      'arrow-tank-filter',
      'arrow-tank-uv',
      'arrow-tank-faucet',
      'comp-faucet'
    ];

    allIds.forEach((id) => {
      setHidden(id, true);
    });

    switch (this.mode) {
      case 'CONNECTING':
        // Show nothing
        break;

      case 'SHOWER':
        // Show: tank1, arrow-tank-heater, heater, arrow-heater-shower, shower,
        // arrow-shower-filter, filter, arrow-filter-uv, uv, arrow-uv-tank, tank2
        setHidden('comp-tank1', false);
        setHidden('arrow-tank-heater', false);
        setHidden('comp-heater', false);
        setHidden('arrow-heater-shower', false);
        setHidden('comp-shower', false);
        setHidden('arrow-shower-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-filter-uv', false);
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank', false);
        setHidden('comp-tank2', false);
        break;

      case 'FLUSH':
        // Show: tank1, arrow-tank-filter, filter, arrow-tank-faucet, faucet
        setHidden('comp-tank1', false);
        setHidden('arrow-tank-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        break;

      case 'DRAIN':
        // Show: tank1, arrow-tank-faucet, faucet
        setHidden('comp-tank1', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        break;

      case 'SANITIZE':
        // Show: tank1, arrow-tank-uv, uv, arrow-uv-tank, tank2
        setHidden('comp-tank1', false);
        setHidden('arrow-tank-uv', false);
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank', false);
        setHidden('comp-tank2', false);
        break;

      default:
        // If unknown mode, do nothing
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
