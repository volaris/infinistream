/**
 * Tests for the light e-ink theme defined in display/css/custom.css.
 *
 * jsdom does not compute CSS custom properties from injected <style> tags,
 * so we parse the CSS file directly. These tests act as a regression guard:
 * if the theme is accidentally reverted to the default dark MagicMirror
 * palette the e-ink panel renders white-on-black and the dithered output
 * looks inverted.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(
  path.join(__dirname, "../../display/css/custom.css"),
  "utf8"
);

/** Assert that a CSS custom property is set to the expected value. */
function expectVar(name, value) {
  // Matches "  --color-background: #fff;" with any surrounding whitespace.
  const pattern = new RegExp(`${name}\\s*:\\s*${value.replace("#", "\\#")}\\s*;`);
  expect(css).toMatch(pattern);
}

describe("display/css/custom.css — light theme for e-ink", () => {
  test("background is white (#fff)", () => {
    expectVar("--color-background", "#fff");
  });

  test("primary text is dark grey (#666)", () => {
    expectVar("--color-text", "#666");
  });

  test("dimmed text is darker grey (#333)", () => {
    expectVar("--color-text-dimmed", "#333");
  });

  test("bright text is black (#000)", () => {
    expectVar("--color-text-bright", "#000");
  });

  test("body height is pinned to 6.5in for the e-ink viewport", () => {
    expect(css).toMatch(/body\s*\{[^}]*height\s*:\s*6\.5in/s);
  });

  test("body width is pinned to 10in for the e-ink viewport", () => {
    expect(css).toMatch(/body\s*\{[^}]*width\s*:\s*10in/s);
  });
});
