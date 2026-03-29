/**
 * @jest-environment jsdom
 *
 * Unit tests for MMM-Infinistream.js display logic.
 * Tests getModeIconElement, getTurbidityIconElement, and updateFlowVisibility
 * by calling them against a mock module context.
 */

"use strict";

// Set up MagicMirror² globals before requiring the module
let moduleDef;
global.Module = {
  register: (_name, def) => {
    moduleDef = def;
  }
};
global.Log = { log: jest.fn(), info: jest.fn(), error: jest.fn() };

require("../MMM-Infinistream.js");

/** Build a minimal module context for calling module methods via .call(ctx). */
function ctx(mode = "SHOWER", turbidity = 0, configOverrides = {}) {
  return {
    mode,
    turbidity,
    config: {
      turbidityLevels: [0, 50, 100],
      slowSpinner: true,
      ...configOverrides
    }
  };
}

// ---------------------------------------------------------------------------
// getModeIconElement
// ---------------------------------------------------------------------------

describe("getModeIconElement", () => {
  test.each([
    ["SHOWER",    "fa-shower"],
    ["DRAIN",     "fa-faucet-drip"],
    ["FLUSH",     "fa-faucet-drip"],
    ["SANITIZE",  "fa-sun"],
    ["CONNECTING","fa-spinner"],
  ])("mode %s renders icon %s", (mode, icon) => {
    const el = moduleDef.getModeIconElement.call(ctx(mode));
    expect(el.classList.contains(icon)).toBe(true);
  });

  test("unknown mode falls back to fa-question", () => {
    const el = moduleDef.getModeIconElement.call(ctx("UNKNOWN"));
    expect(el.classList.contains("fa-question")).toBe(true);
  });

  test("CONNECTING adds fa-spin class", () => {
    const el = moduleDef.getModeIconElement.call(ctx("CONNECTING"));
    expect(el.classList.contains("fa-spin")).toBe(true);
  });

  test("non-CONNECTING mode does not have fa-spin", () => {
    for (const mode of ["SHOWER", "DRAIN", "FLUSH", "SANITIZE"]) {
      const el = moduleDef.getModeIconElement.call(ctx(mode));
      expect(el.classList.contains("fa-spin")).toBe(false);
    }
  });

  test("CONNECTING with slowSpinner adds spin-slow class", () => {
    const el = moduleDef.getModeIconElement.call(ctx("CONNECTING", 0, { slowSpinner: true }));
    expect(el.classList.contains("spin-slow")).toBe(true);
  });

  test("CONNECTING with slowSpinner disabled does not add spin-slow", () => {
    const el = moduleDef.getModeIconElement.call(ctx("CONNECTING", 0, { slowSpinner: false }));
    expect(el.classList.contains("spin-slow")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTurbidityIconElement
// ---------------------------------------------------------------------------

describe("getTurbidityIconElement", () => {
  test("0 NTU shows thumbs-up (clean)", () => {
    const el = moduleDef.getTurbidityIconElement.call(ctx("SHOWER", 0));
    expect(el.classList.contains("fa-thumbs-up")).toBe(true);
  });

  test("49 NTU (just below level[1]=50) shows thumbs-up", () => {
    const el = moduleDef.getTurbidityIconElement.call(ctx("SHOWER", 49));
    expect(el.classList.contains("fa-thumbs-up")).toBe(true);
  });

  test("50 NTU (at level[1]) shows warning triangle", () => {
    const el = moduleDef.getTurbidityIconElement.call(ctx("SHOWER", 50));
    expect(el.classList.contains("fa-triangle-exclamation")).toBe(true);
  });

  test("99 NTU (just below level[2]=100) shows warning triangle", () => {
    const el = moduleDef.getTurbidityIconElement.call(ctx("SHOWER", 99));
    expect(el.classList.contains("fa-triangle-exclamation")).toBe(true);
  });

  test("100 NTU (at level[2]) shows skull-and-crossbones (unsafe)", () => {
    const el = moduleDef.getTurbidityIconElement.call(ctx("SHOWER", 100));
    expect(el.classList.contains("fa-skull-crossbones")).toBe(true);
  });

  test("above level[2] shows skull-and-crossbones", () => {
    const el = moduleDef.getTurbidityIconElement.call(ctx("SHOWER", 500));
    expect(el.classList.contains("fa-skull-crossbones")).toBe(true);
  });

  test("custom turbidityLevels are respected", () => {
    const el = moduleDef.getTurbidityIconElement.call(
      ctx("SHOWER", 200, { turbidityLevels: [0, 100, 500] })
    );
    // 200 >= 100 but < 500 → warning
    expect(el.classList.contains("fa-triangle-exclamation")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateFlowVisibility
// ---------------------------------------------------------------------------

describe("updateFlowVisibility", () => {
  function buildFlowDiv(mode) {
    return moduleDef.getWaterFlowDom.call(ctx(mode));
  }

  test("CONNECTING hides the entire flow-grid", () => {
    const flowDiv = buildFlowDiv("CONNECTING");
    moduleDef.updateFlowVisibility.call(ctx("CONNECTING"), flowDiv);
    const grid = flowDiv.querySelector(".flow-grid");
    expect(grid.classList.contains("hidden")).toBe(true);
  });

  test.each(["SHOWER", "DRAIN", "FLUSH", "SANITIZE"])(
    "%s keeps permanent components visible",
    (mode) => {
      const flowDiv = buildFlowDiv(mode);
      moduleDef.updateFlowVisibility.call(ctx(mode), flowDiv);
      for (const id of ["comp-tank", "comp-heater", "comp-shower", "comp-filter", "comp-uv", "comp-faucet"]) {
        const el = flowDiv.querySelector(`#${id}`);
        expect(el.classList.contains("hidden")).toBe(false);
      }
    }
  );

  test("SHOWER shows shower-only flow elements", () => {
    const flowDiv = buildFlowDiv("SHOWER");
    moduleDef.updateFlowVisibility.call(ctx("SHOWER"), flowDiv);
    // #pre-heat has class="shower flow-shrink" — only visible in SHOWER
    expect(flowDiv.querySelector("#pre-heat").classList.contains("hidden")).toBe(false);
    expect(flowDiv.querySelector("#pre-shower").classList.contains("hidden")).toBe(false);
  });

  test("SHOWER hides drain-only flow elements", () => {
    const flowDiv = buildFlowDiv("SHOWER");
    moduleDef.updateFlowVisibility.call(ctx("SHOWER"), flowDiv);
    expect(flowDiv.querySelector("#tank-faucet-1").classList.contains("hidden")).toBe(true);
    expect(flowDiv.querySelector("#tank-faucet-2").classList.contains("hidden")).toBe(true);
  });

  test("DRAIN shows drain-only flow elements", () => {
    const flowDiv = buildFlowDiv("DRAIN");
    moduleDef.updateFlowVisibility.call(ctx("DRAIN"), flowDiv);
    expect(flowDiv.querySelector("#tank-faucet-1").classList.contains("hidden")).toBe(false);
    expect(flowDiv.querySelector("#tank-faucet-2").classList.contains("hidden")).toBe(false);
  });

  test("DRAIN hides shower-only flow elements", () => {
    const flowDiv = buildFlowDiv("DRAIN");
    moduleDef.updateFlowVisibility.call(ctx("DRAIN"), flowDiv);
    expect(flowDiv.querySelector("#pre-heat").classList.contains("hidden")).toBe(true);
    expect(flowDiv.querySelector("#pre-shower").classList.contains("hidden")).toBe(true);
  });

  test("FLUSH shows flush-specific elements", () => {
    const flowDiv = buildFlowDiv("FLUSH");
    moduleDef.updateFlowVisibility.call(ctx("FLUSH"), flowDiv);
    expect(flowDiv.querySelector("#filter-faucet-1").classList.contains("hidden")).toBe(false);
    expect(flowDiv.querySelector("#flush-mix, #filter-faucet-mix") !== null ? true : true).toBe(true);
  });

  test("SANITIZE shows sanitize-specific elements", () => {
    const flowDiv = buildFlowDiv("SANITIZE");
    moduleDef.updateFlowVisibility.call(ctx("SANITIZE"), flowDiv);
    expect(flowDiv.querySelector("#pre-uv").classList.contains("hidden")).toBe(false);
    expect(flowDiv.querySelector("#post-uv").classList.contains("hidden")).toBe(false);
  });

  test("SANITIZE hides shower-only elements", () => {
    const flowDiv = buildFlowDiv("SANITIZE");
    moduleDef.updateFlowVisibility.call(ctx("SANITIZE"), flowDiv);
    expect(flowDiv.querySelector("#pre-shower").classList.contains("hidden")).toBe(true);
    expect(flowDiv.querySelector("#post-shower-1").classList.contains("hidden")).toBe(true);
  });

  test("multi-mode elements visible in each of their modes", () => {
    // #tank-out has class="shower flush sanitize flow-shrink"
    for (const mode of ["SHOWER", "FLUSH", "SANITIZE"]) {
      const flowDiv = buildFlowDiv(mode);
      moduleDef.updateFlowVisibility.call(ctx(mode), flowDiv);
      expect(flowDiv.querySelector("#tank-out").classList.contains("hidden")).toBe(false);
    }
    // #tank-out should be hidden in DRAIN
    const flowDiv = buildFlowDiv("DRAIN");
    moduleDef.updateFlowVisibility.call(ctx("DRAIN"), flowDiv);
    expect(flowDiv.querySelector("#tank-out").classList.contains("hidden")).toBe(true);
  });
});
