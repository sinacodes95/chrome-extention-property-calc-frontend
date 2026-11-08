import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculate } from "../dist/property-desk-calc/src/api.js";

test("the local engine is shared and retries after a failed load", async t => {
  const wasmUrl = new URL("../dist/property-desk-calc/src/rust_calculator.wasm", import.meta.url);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetches = [];
  globalThis.fetch = async url => {
    fetches.push(String(url));
    if (fetches.length === 1) return new Response(null, { status: 503 });
    return new Response(await readFile(wasmUrl));
  };

  const request = { operation: "evaluate", expression: "2 + 3" };
  await assert.rejects(
    calculate({ ...request, expression: "é".repeat(32_768) }),
    { code: "request_too_large" },
  );
  assert.equal(fetches.length, 0);

  await assert.rejects(calculate(request), { code: "engine_unavailable" });
  const responses = await Promise.all([
    calculate(request),
    calculate({ ...request, expression: "2 ^ 3" }),
  ]);
  assert.deepEqual(responses, [{ value: 5 }, { value: 8 }]);
  assert.deepEqual(await calculate(request), { value: 5 });
  assert.deepEqual(fetches, [wasmUrl.href, wasmUrl.href]);
});
