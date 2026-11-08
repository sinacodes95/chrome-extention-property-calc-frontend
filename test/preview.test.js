import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { calculatorBinary, createDevHandler } from "../scripts/dev.mjs";
import { calculate, getEndpoint, isExtension } from "../src/api.js";

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

// Use the real HTTP handler in-process so this also runs in network-restricted environments.
function handlerFetch(address, handle) {
  return async (url, options) => {
    const request = Object.assign(Readable.from([Buffer.from(options.body ?? "")]), {
      url: new URL(url, address).pathname,
      method: options.method ?? "GET",
      headers: { host: address.host, ...Object.fromEntries(new Headers(options.headers)) },
      socket: { localPort: Number(address.port) },
    });
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

const binary = calculatorBinary();
test("preview calculates all seven operations through the real Rust executable", {
  skip: binary ? false : "Build the sibling Rust backend or set CALCULATOR_BIN.",
}, async (t) => {
  const address = new URL("http://127.0.0.1:4173");
  const originalFetch = globalThis.fetch;
  globalThis.location = address;
  globalThis.fetch = handlerFetch(address, createDevHandler(binary));
  t.after(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.location;
  });

  assert.equal(isExtension, false);
  assert.equal(await getEndpoint(), "/api/calculate");

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

  const offOrigin = await fetch("/api/calculate", {
    method: "POST",
    headers: { Origin: "https://example.com", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(offOrigin.status, 403);
});
