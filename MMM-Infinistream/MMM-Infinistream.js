"use strict";

/*
 * This version of the MMM-Infinistream module uses the Document API (createElement, etc.)
 * instead of inserting HTML strings via innerHTML.
 *
 * The flows are:
 *  CONNECTING: default mode until an update is received.
 *  SHOWER:     tank -> heater -> shower -> filter -> UV -> tank
 *  FLUSH:      tank -> filter -> dripping faucet
 *  DRAIN:      tank -> dripping faucet
 *  SANITIZE:   tank -> UV -> tank
 */

Module.register("MMM-Infinistream", {
  defaults: {
    turbidityLevels: [0, 50, 100], // Configurable turbidity thresholds
    webhookPort: 8085             // Port for receiving web hook updates
  },

  start: function () {
    // Set default mode to CONNECTING until we receive a webhook update
    this.mode = "CONNECTING";
    this.turbidity = 0;
    this.sendSocketNotification("STARTED",{message:"test1"});
  },

  socketNotificationReceived: function(notification, payload) {
    Log.log(this.name + " received a socket notification: " + notification + " - Payload: " + payload);
    this.turbidity = payload.turbidity
    this.mode = payload.mode
    this.updateDom()
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

    // Water Flow Representation (static layout using document API)
    const flowDiv = this.getWaterFlowDom();
    wrapper.appendChild(flowDiv);

    // After layout is added, we selectively hide/show elements based on this.mode
    this.updateFlowVisibility(flowDiv);

    return wrapper;
  },

  // Return an <i> element for the current mode icon
  getModeIconElement: function () {
    const modeIcons = {
      CONNECTING: ["fa-solid", "fa-spinner", "fa-spin"],
      SHOWER: ["fa-solid", "fa-shower"],
      DRAIN: ["fa-solid", "fa-faucet-drip"],
      FLUSH: ["fa-solid", "fa-faucet"],
      SANITIZE: ["fa-solid", "fa-filter"] // If you want a different icon for sanitize, update here
    };

    const iconClasses = modeIcons[this.mode] || ["fa-solid", "fa-question"];
    const iEl = document.createElement("i");
    iconClasses.forEach(c => iEl.classList.add(c));
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
    iconClasses.forEach(c => iEl.classList.add(c));
    return iEl;
  },

  // Create the water-flow schematic using document.createElement
  getWaterFlowDom: function () {
    const flowLayout = document.createElement("div");
    flowLayout.id = "water-flow-layout";
    flowLayout.style.whiteSpace = "nowrap";

    // Helper to create an icon <i> with classList
    function createIcon(classes) {
      const iEl = document.createElement("i");
      classes.forEach(c => iEl.classList.add(c));
      return iEl;
    }

    // Helper to create a <span> container with an optional id
    function createSpan(id, children = []) {
      const spanEl = document.createElement("span");
      if (id) {
        spanEl.id = id;
      }
      children.forEach(child => spanEl.appendChild(child));
      return spanEl;
    }

    // Tank #1
    const compTank1 = createSpan("comp-tank1", [
      createIcon(["fa-solid", "fa-bracket-left"]),
      createIcon(["fa-solid", "fa-water"]),
      createIcon(["fa-solid", "fa-bracket-right"])
    ]);
    flowLayout.appendChild(compTank1);

    // arrow-tank-heater
    const arrowTankHeater = createSpan("arrow-tank-heater", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowTankHeater);

    // comp-heater
    const compHeater = createSpan("comp-heater", [
      createIcon(["fa-solid", "fa-fire"])
    ]);
    flowLayout.appendChild(compHeater);

    // arrow-heater-shower
    const arrowHeaterShower = createSpan("arrow-heater-shower", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowHeaterShower);

    // comp-shower
    const compShower = createSpan("comp-shower", [
      createIcon(["fa-solid", "fa-shower"])
    ]);
    flowLayout.appendChild(compShower);

    // arrow-shower-filter
    const arrowShowerFilter = createSpan("arrow-shower-filter", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowShowerFilter);

    // comp-filter
    const compFilter = createSpan("comp-filter", [
      createIcon(["fa-solid", "fa-filter"])
    ]);
    flowLayout.appendChild(compFilter);

    // arrow-filter-uv
    const arrowFilterUv = createSpan("arrow-filter-uv", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowFilterUv);

    // comp-uv
    const compUv = createSpan("comp-uv", [
      createIcon(["fa-regular", "fa-sun"])
    ]);
    flowLayout.appendChild(compUv);

    // arrow-uv-tank
    const arrowUvTank = createSpan("arrow-uv-tank", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowUvTank);

    // comp-tank2
    const compTank2 = createSpan("comp-tank2", [
      createIcon(["fa-solid", "fa-bracket-left"]),
      createIcon(["fa-solid", "fa-water"]),
      createIcon(["fa-solid", "fa-bracket-right"])
    ]);
    flowLayout.appendChild(compTank2);

    // arrow-tank-filter
    const arrowTankFilter = createSpan("arrow-tank-filter", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowTankFilter);

    // arrow-tank-uv
    const arrowTankUv = createSpan("arrow-tank-uv", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowTankUv);

    // arrow-tank-faucet
    const arrowTankFaucet = createSpan("arrow-tank-faucet", [
      createIcon(["fa-solid", "fa-angle-right"])
    ]);
    flowLayout.appendChild(arrowTankFaucet);

    // comp-faucet
    const compFaucet = createSpan("comp-faucet", [
      createIcon(["fa-solid", "fa-faucet-drip"])
    ]);
    flowLayout.appendChild(compFaucet);

    return flowLayout;
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

    allIds.forEach(id => {
      setHidden(id, true);
    });

    // The tank1 always visible

    switch (this.mode) {
      case 'CONNECTING':
        // Show minimal or no flow when connecting
        break;

      case 'SHOWER':
        // tank1 -> heater -> shower -> filter -> uv -> tank2
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
        // tank1 -> filter -> faucet
        setHidden('arrow-tank-filter', false);
        setHidden('comp-filter', false);
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        break;

      case 'DRAIN':
        // tank1 -> faucet
        setHidden('arrow-tank-faucet', false);
        setHidden('comp-faucet', false);
        break;

      case 'SANITIZE':
        // tank1 -> uv -> tank2
        setHidden('arrow-tank-uv', false);
        setHidden('comp-uv', false);
        setHidden('arrow-uv-tank', false);
        setHidden('comp-tank2', false);
        break;

      default:
        // If unknown mode, do nothing or hide everything
        break;
    }
  },

  // CSS files to load
  getStyles: function () {
    return [
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
      this.file('MMM-Infinistream.css') // See below for .hidden styling
    ];
  }
});
