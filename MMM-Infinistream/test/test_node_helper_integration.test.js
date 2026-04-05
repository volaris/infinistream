/**
 * Integration test: node_helper webhook → eink-service trigger.
 *
 * Binds a real Express app (with actual body-parser middleware) to a live
 * port and runs a stub eink-service on a second port, then fires real HTTP
 * requests to exercise the full in-process I/O path without Docker or the
 * MagicMirror framework.
 *
 * SETTLE_MS must match EINK_SETTLE_MS in node_helper.js (currently 500 ms).
 */

"use strict";

jest.mock("node_helper", () => ({ create: (def) => def }), { virtual: true });
jest.mock("logger", () => ({ log: jest.fn(), info: jest.fn(), error: jest.fn() }), { virtual: true });
jest.mock("envsub/main.config", () => ({ regex: {} }), { virtual: true });

const express = require("express");
const http = require("http");

const SETTLE_MS = 500;
const TIMEOUT   = SETTLE_MS + 2000;

let mmServer;
let einkStub;
let triggerCount = 0;

beforeAll(async () => {
  // Start stub eink-service on an OS-assigned port before loading node_helper
  // so the module-level EINK_SERVICE_URL constant picks up the right address.
  await new Promise(resolve => {
    einkStub = http.createServer((_req, res) => {
      triggerCount++;
      res.writeHead(202);
      res.end();
    });
    einkStub.listen(0, resolve);
  });

  process.env.EINK_SERVICE_URL =
    `http://localhost:${einkStub.address().port}/trigger`;

  const helper = require("../node_helper");
  const app = express();
  helper.expressApp = app;
  helper.sendSocketNotification = jest.fn();
  helper.name = "MMM-Infinistream";
  helper.start();

  await new Promise(resolve => {
    mmServer = app.listen(0, resolve);
  });
});

afterAll(async () => {
  await new Promise(resolve => mmServer.close(resolve));
  await new Promise(resolve => einkStub.close(resolve));
  delete process.env.EINK_SERVICE_URL;
});

beforeEach(() => {
  triggerCount = 0;
});

function webhookUrl() {
  return `http://localhost:${mmServer.address().port}/shower-update`;
}

function post(body) {
  return fetch(webhookUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function settle() {
  return new Promise(resolve => setTimeout(resolve, SETTLE_MS + 100));
}

// ---------------------------------------------------------------------------

describe("webhook → eink-service trigger (live HTTP)", () => {
  test("valid payload returns 200 and triggers eink-service after settle delay", async () => {
    const res = await post({ mode: "SHOWER", turbidity: 25 });
    expect(res.status).toBe(200);
    await settle();
    expect(triggerCount).toBe(1);
  }, TIMEOUT);

  test("each valid update fires exactly one trigger", async () => {
    await post({ mode: "DRAIN", turbidity: 0 });
    await settle();
    expect(triggerCount).toBe(1);
  }, TIMEOUT);

  test("invalid payload returns 400 and does not trigger eink-service", async () => {
    const res = await post({ turbidity: 10 }); // missing mode
    expect(res.status).toBe(400);
    await settle();
    expect(triggerCount).toBe(0);
  }, TIMEOUT);
});
