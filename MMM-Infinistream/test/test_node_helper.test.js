/**
 * Integration tests for node_helper.js webhook endpoint.
 *
 * Tests the POST /shower-update handler directly by capturing the Express
 * route callback and calling it with mock request/response objects.
 */

"use strict";

// node_helper and logger are MagicMirror² runtime modules not available in
// the test environment — use virtual mocks so Jest doesn't try to resolve them.
jest.mock("node_helper", () => ({ create: (def) => def }), { virtual: true });
jest.mock("logger", () => ({ log: jest.fn(), info: jest.fn(), error: jest.fn() }), { virtual: true });

// envsub is a MagicMirror runtime dependency not available locally; the
// import in node_helper is unused dead code, but we still need to satisfy it.
jest.mock("envsub/main.config", () => ({ regex: {} }), { virtual: true });

const helper = require("../node_helper");

/** Set up a fresh mock Express app and call helper.start() before each test. */
let postHandler;

beforeEach(() => {
  const routes = {};
  helper.expressApp = {
    use: jest.fn(),
    post: jest.fn((path, handler) => {
      routes[path] = handler;
    })
  };
  helper.sendSocketNotification = jest.fn();
  helper.name = "MMM-Infinistream";

  helper.start();
  postHandler = routes["/shower-update"];
});

// ---------------------------------------------------------------------------
// Valid payloads
// ---------------------------------------------------------------------------

describe("POST /shower-update — valid payloads", () => {
  test("returns 200 for SHOWER mode", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "SHOWER", turbidity: 42.5 } }, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test("returns 200 for DRAIN mode", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "DRAIN", turbidity: 0 } }, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test("returns 200 for FLUSH mode", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "FLUSH", turbidity: 12 } }, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test("returns 200 for SANITIZE mode", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "SANITIZE", turbidity: 5 } }, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test("accepts turbidity: 0 as valid", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "SHOWER", turbidity: 0 } }, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});

// ---------------------------------------------------------------------------
// Socket notification forwarding
// ---------------------------------------------------------------------------

describe("POST /shower-update — socket notification", () => {
  test("sends SHOWER_UPDATE_EVENT with correct mode and turbidity", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "DRAIN", turbidity: 88.3 } }, res);
    expect(helper.sendSocketNotification).toHaveBeenCalledWith("SHOWER_UPDATE_EVENT", {
      mode: "DRAIN",
      turbidity: 88.3
    });
  });

  test("stores mode and turbidity on helper state", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { mode: "SANITIZE", turbidity: 15 } }, res);
    expect(helper.mode).toBe("SANITIZE");
    expect(helper.turbidity).toBe(15);
  });

  test("does not send notification for invalid payload", () => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body: { turbidity: 10 } }, res);
    expect(helper.sendSocketNotification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invalid / malformed payloads
// ---------------------------------------------------------------------------

describe("POST /shower-update — invalid payloads", () => {
  test.each([
    ["missing mode",      { turbidity: 10 }],
    ["missing turbidity", { mode: "SHOWER" }],
    ["empty body",        {}],
    ["null body",         null],
  ])("%s returns 400", (_desc, body) => {
    const res = { sendStatus: jest.fn() };
    postHandler({ body }, res);
    expect(res.sendStatus).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// Initial state and STARTED notification
// ---------------------------------------------------------------------------

describe("helper initial state", () => {
  test("starts in CONNECTING mode", () => {
    expect(helper.mode).toBe("CONNECTING");
  });

  test("starts with turbidity 0", () => {
    expect(helper.turbidity).toBe(0);
  });

  test("STARTED notification triggers updateModule", () => {
    helper.sendSocketNotification = jest.fn();
    helper.socketNotificationReceived("STARTED", {});
    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SHOWER_UPDATE_EVENT",
      expect.objectContaining({ mode: expect.any(String) })
    );
  });
});
