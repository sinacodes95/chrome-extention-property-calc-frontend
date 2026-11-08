import assert from "node:assert/strict";
import { test } from "node:test";

test("settings request permission for the exact host before saving the full route", async (t) => {
  const key = "calculatorEndpoint";
  const route = "https://api.example.com/prod/calculate";
  const host = { origins: ["https://api.example.com/*"] };
  const state = {};
  const calls = [];
  let grant = false;
  let fetchCalls = 0;

  globalThis.chrome = {
    runtime: { id: "extension-test" },
    permissions: {
      request: async (permission) => { calls.push(["request", permission]); return grant; },
      contains: async (permission) => { calls.push(["contains", permission]); return grant; },
    },
    storage: { local: {
      get: async () => state,
      set: async (patch) => { calls.push(["set", patch]); Object.assign(state, patch); },
      remove: async () => { delete state[key]; },
    } },
  };
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.chrome;
  });
  const { calculate, getEndpoint, isExtension, saveEndpoint } = await import("../src/api.js");
  assert.equal(isExtension, true);
  await assert.rejects(calculate({}), { code: "not_configured" });

  for (const invalid of [
    "http://api.example.com",
    "https://secret@api.example.com",
    "https://api.example.com:8080",
    "https://api.example.com/#fragment",
    "https://*",
    "https://*.example.com",
  ]) {
    await assert.rejects(saveEndpoint(invalid), { code: "invalid_endpoint" });
  }
  assert.deepEqual(calls, []);
  await assert.rejects(saveEndpoint(route), { code: "permission_denied" });
  assert.equal(await getEndpoint(), "");
  assert.deepEqual(calls, [["request", host]]);

  calls.length = 0;
  grant = true;
  assert.equal(await saveEndpoint(`  ${route}  `), route);
  assert.deepEqual(calls, [["request", host], ["set", { [key]: route }]]);

  const payload = { operation: "evaluate", expression: "0" };
  let response = new Response('{"ok":true,"result":{"value":0}}');
  globalThis.fetch = async (url, options) => {
    fetchCalls += 1;
    assert.equal(url, route);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), payload);
    return response;
  };
  assert.deepEqual(await calculate(payload), { value: 0 });
  assert.deepEqual(calls.at(-1), ["contains", host]);

  response = new Response('{"ok":false,"error":{"code":"domain","message":"Example domain error"}}', { status: 400 });
  await assert.rejects(calculate(payload), { code: "domain", message: "Example domain error" });
  response = new Response("Gateway error", { status: 403 });
  await assert.rejects(calculate(payload), { code: "http_error", message: /Settings/ });
  response = new Response('{"statusCode":200,"body":"{}"}');
  await assert.rejects(calculate(payload), { code: "invalid_response" });
  await assert.rejects(calculate({ expression: "é".repeat(32_768) }), { code: "request_too_large" });

  grant = false;
  await assert.rejects(calculate(payload), { code: "permission_denied" });
  assert.equal(fetchCalls, 4);
  assert.equal(await saveEndpoint(" "), "");
  assert.equal(await getEndpoint(), "");
});
