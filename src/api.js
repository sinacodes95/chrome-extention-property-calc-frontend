const REQUEST_LIMIT = 64 * 1024;
const encoder = new TextEncoder();
let engine;

class CalculatorError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "CalculatorError";
    this.code = code;
  }
}

async function loadEngine() {
  try {
    const [{ loadCalculator }, response] = await Promise.all([
      import("./calculator-wasm.js"),
      fetch(new URL("./rust_calculator.wasm", import.meta.url), { redirect: "error" }),
    ]);
    if (!response.ok) throw new Error(`Could not read calculator binary (HTTP ${response.status}).`);
    return await loadCalculator(await response.arrayBuffer());
  } catch (cause) {
    throw new CalculatorError(
      "engine_unavailable",
      "Could not load the local calculator. Reload the calculator page and try again.",
      cause,
    );
  }
}

function getEngine() {
  engine ??= loadEngine().catch(error => {
    engine = undefined;
    throw error;
  });
  return engine;
}

export async function calculate(request) {
  const body = JSON.stringify(request);
  if (typeof body !== "string") {
    throw new CalculatorError("invalid_input", "The calculator needs a request.");
  }
  if (encoder.encode(body).length > REQUEST_LIMIT) {
    throw new CalculatorError("request_too_large", "This calculation exceeds the 64 KiB request limit.");
  }

  const calculateJson = await getEngine();
  let payload;
  try {
    payload = JSON.parse(calculateJson(body));
  } catch (cause) {
    throw new CalculatorError("calculation_failed", "The local calculator could not finish this calculation.", cause);
  }
  if (payload?.ok === false && typeof payload.error?.message === "string") {
    throw new CalculatorError(payload.error.code ?? "calculation_failed", payload.error.message);
  }
  if (payload?.ok !== true || !payload.result || typeof payload.result !== "object" || Array.isArray(payload.result)) {
    throw new CalculatorError("invalid_response", "The local calculator did not return the expected result.");
  }
  return payload.result;
}
