import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EXTENSION_DIR } from "../scripts/build.mjs";
import { createDevHandler } from "../scripts/dev.mjs";

const property = {
  purchase_price: 2_000_000,
  acquisition_costs: 40_000,
  initial_capital_expenditures: 60_000,
  annual_potential_rent: 240_000,
  annual_other_income: 12_000,
  vacancy_rate: 0.08,
  annual_operating_expenses: 72_000,
  annual_capital_expenditures: 12_000,
  loan: {
    principal: 1_200_000,
    annual_interest_rate: 0.055,
    amortization_months: 300,
  },
};
const assumptions = {
  holding_years: 5,
  annual_rent_growth: 0.03,
  annual_other_income_growth: 0.02,
  annual_expense_growth: 0.025,
  annual_capex_growth: 0.025,
  exit_cap_rate: 0.085,
  selling_cost_rate: 0.02,
  discount_rate: 0.10,
};

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `Expected ${expected}, received ${actual}`);
}

// Exercise the static preview's real responses without opening a socket.
function previewFetch(handle) {
  return async (path, method = "GET") => {
    const request = {
      url: path,
      method,
      headers: { host: "127.0.0.1:4173" },
      socket: { localPort: 4173 },
    };
    const headers = new Headers();
    let status;
    let body;
    await handle(request, {
      setHeader: (name, value) => headers.set(name, value),
      writeHead: (code, extra) => {
        status = code;
        for (const [name, value] of Object.entries(extra)) headers.set(name, value);
      },
      end: (output) => { body = output; },
    });
    return new Response(body, { status, headers });
  };
}

test("the build packages Wasm for the extension and the static preview", async () => {
  const manifest = JSON.parse(await readFile(join(EXTENSION_DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  const preview = previewFetch(createDevHandler());
  const page = await preview("/popup.html");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);
  const wasm = await preview("/src/rust_calculator.wasm");
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get("content-type"), "application/wasm");
  const module = await WebAssembly.compile(await wasm.arrayBuffer());
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.equal((await preview("/api/calculate")).status, 404);
  assert.equal((await preview("/api/calculate", "POST")).status, 405);
});

test("the bundled client calculates all seven operations through Rust WebAssembly", async (t) => {
  const api = pathToFileURL(join(EXTENSION_DIR, "src", "api.js"));
  const asset = new URL("rust_calculator.wasm", api);
  const preview = previewFetch(createDevHandler());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url) => {
    assert.equal(String(url), asset.href);
    return preview("/src/rust_calculator.wasm");
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const { calculate } = await import(api);

  const expression = "sin(30) + log(64, 2) + 5!";
  assert.equal((await calculate({ operation: "evaluate", expression, angle_mode: "degrees" })).value, 126.5);
  await assert.rejects(calculate({ operation: "evaluate", expression: "sqrt(-1)" }), { code: "domain" });
  near((await calculate({ operation: "npv", rate: 0.10, cash_flows: [-100, 110] })).value, 0);
  near((await calculate({ operation: "irr", cash_flows: [-100, 110] })).value, 0.10);

  const loan = await calculate({
    operation: "loan",
    terms: { principal: 12_000, annual_interest_rate: 0, amortization_months: 24 },
    elapsed_months: 18,
  });
  assert.equal(loan.monthly_payment, 500);
  assert.equal(loan.remaining_balance, 3_000);
  assert.equal(loan.annual_debt_service, 3_000);

  const underwriting = await calculate({ operation: "underwrite", property });
  near(underwriting.annual_noi, 160_800);
  near(underwriting.cap_rate, 0.0804);

  const projection = await calculate({ operation: "project", property, assumptions });
  assert.equal(projection.years.length, 5);
  near(projection.levered_irr, 0.1113, 0.0001);
  near(projection.gross_sale_price, 2_208_886, 1);

  const grid = await calculate({
    operation: "sensitivity", property, assumptions,
    rent_growth_rates: [0.03, 0.04],
    exit_cap_rates: [0.085, 0],
  });
  assert.equal(grid.scenarios.length, 4);
  near(grid.scenarios[0].result.gross_sale_price, projection.gross_sale_price);
  assert.equal(grid.scenarios[1].ok, false);
  assert.equal(grid.scenarios[1].error.code, "invalid_input");
  assert.match(grid.scenarios[1].error.message, /exit_cap_rate/);
  assert.equal(grid.scenarios[2].annual_rent_growth, 0.04);
});
