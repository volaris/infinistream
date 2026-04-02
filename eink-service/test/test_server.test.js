"use strict";

jest.mock("../screenshot", () => ({
    takeScreenshot: jest.fn(() => Promise.resolve("/tmp/test.png"))
}));
jest.mock("../display", () => ({
    sendToDisplay: jest.fn(() => Promise.resolve())
}));

const request = require("supertest");
const app = require("../server");
const { resetRefreshing } = require("../server");
const { takeScreenshot } = require("../screenshot");
const { sendToDisplay } = require("../display");

// Flush all pending microtasks and resolved promises
const flushAsync = () => new Promise(resolve => setImmediate(resolve));

beforeEach(async () => {
    await flushAsync();
    resetRefreshing();
    jest.clearAllMocks();
});

describe("POST /trigger", () => {
    test("returns 202 immediately", async () => {
        const res = await request(app).post("/trigger");
        expect(res.status).toBe(202);
    });

    test("calls takeScreenshot then sendToDisplay with the image path", async () => {
        await request(app).post("/trigger");
        await flushAsync();
        expect(takeScreenshot).toHaveBeenCalledTimes(1);
        expect(sendToDisplay).toHaveBeenCalledWith("/tmp/test.png");
    });

    test("screenshot failure is caught and does not crash the server", async () => {
        takeScreenshot.mockRejectedValueOnce(new Error("Chromium not found"));
        const res = await request(app).post("/trigger");
        expect(res.status).toBe(202);
        await flushAsync();
        // Server stays alive — next request still works
        takeScreenshot.mockResolvedValueOnce("/tmp/test.png");
        const res2 = await request(app).post("/trigger");
        expect(res2.status).toBe(202);
    });

    test("display failure is caught and does not crash the server", async () => {
        sendToDisplay.mockRejectedValueOnce(new Error("display.py exited with code 1"));
        const res = await request(app).post("/trigger");
        expect(res.status).toBe(202);
        await flushAsync();
    });

    test("concurrent trigger is dropped while a refresh is in progress", async () => {
        let unblockFirst;
        // Resolves as soon as takeScreenshot is actually invoked, so we know
        // refreshing = true before we fire the second request.
        const firstCallStarted = new Promise(resolveStarted => {
            takeScreenshot.mockImplementationOnce(() => {
                resolveStarted();
                return new Promise(resolve => { unblockFirst = resolve; });
            });
        });

        const eager = path => new Promise((res, rej) =>
            request(app).post(path).end((err, r) => err ? rej(err) : res(r))
        );

        // p1 holds the refreshing lock
        const p1 = eager("/trigger");
        await firstCallStarted;  // refreshing = true

        // p2 arrives while p1 is still running; await its response so we know
        // its handler has already checked and seen refreshing = true
        const p2res = await eager("/trigger");
        expect(p2res.status).toBe(202);

        // Now we can confirm takeScreenshot was only called once before releasing p1
        expect(takeScreenshot).toHaveBeenCalledTimes(1);

        unblockFirst("/tmp/test.png");
        await p1;
        await flushAsync();
    });
});
