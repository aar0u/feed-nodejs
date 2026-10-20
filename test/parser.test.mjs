import assert from "node:assert/strict";
import test from "node:test";
import { fetchDocument } from "../src/utils/parser.mjs";

test("fetchDocument propagates cancellation through redirects", async (t) => {
  const controller = new AbortController();
  const signals = [];
  t.mock.method(globalThis, "fetch", async (_input, { signal }) => {
    signals.push(signal);
    if (signals.length === 1)
      return new Response("", { status: 302, headers: { location: "/next" } });
    controller.abort(new Error("source deadline"));
    signal.throwIfAborted();
  });
  await assert.rejects(
    fetchDocument("https://example.com", undefined, controller.signal),
    /source deadline/,
  );
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, true);
});

test("fetchDocument identifies a Cloudflare challenge from headers without reading its body", async (t) => {
  const response = new Response("private payload", {
    status: 403,
    headers: {
      server: "cloudflare",
      "cf-mitigated": "challenge",
      "content-type": "text/html",
      "x-proxy-via": "content-proxy",
    },
  });
  t.mock.method(response, "text", () => {
    assert.fail("Error response bodies must not be read");
  });
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(fetchDocument("https://example.com"), (error) => {
    assert.match(
      error.message,
      /403.*proxy-worker=content-proxy.*server=cloudflare.*cf-mitigated=challenge/,
    );
    assert.doesNotMatch(error.message, /private payload/);
    return true;
  });
});
