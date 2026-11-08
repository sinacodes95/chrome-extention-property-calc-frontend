const ENDPOINT_KEY = "calculatorEndpoint";
const REQUEST_LIMIT = 64 * 1024;
const REQUEST_TIMEOUT = 20_000;

export const isExtension = Boolean(globalThis.chrome?.runtime?.id);

class CalculatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CalculatorError";
    this.code = code;
  }
}

function endpointUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new CalculatorError("invalid_endpoint", "Enter the full HTTPS API Gateway URL.");
  }
  if (url.protocol !== "https:" || url.hostname.includes("*") || url.port || url.username || url.password || url.hash) {
    throw new CalculatorError(
      "invalid_endpoint",
      "Use an HTTPS URL with a specific host and the standard port. Omit credentials and fragments.",
    );
  }
  return url;
}

function hostPermission(url) {
  return { origins: [`${url.origin}/*`] };
}

export async function getEndpoint() {
  if (isExtension) {
    const saved = await chrome.storage.local.get(ENDPOINT_KEY);
    return saved[ENDPOINT_KEY] ?? "";
  }
  const { protocol, hostname } = globalThis.location ?? {};
  return protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(hostname)
    ? "/api/calculate"
    : "";
}

// Call directly from the Settings form submit handler so Chrome sees the user gesture.
export async function saveEndpoint(raw) {
  if (!isExtension) {
    throw new CalculatorError("unsupported", "API settings are available in the installed extension.");
  }
  const input = raw.trim();
  if (!input) {
    await chrome.storage.local.remove(ENDPOINT_KEY);
    return "";
  }
  const url = endpointUrl(input);
  if (!await chrome.permissions.request(hostPermission(url))) {
    throw new CalculatorError("permission_denied", "Chrome did not grant access to this API host.");
  }
  await chrome.storage.local.set({ [ENDPOINT_KEY]: url.href });
  return url.href;
}

function httpError(status) {
  if (status === 429) {
    return "The API is receiving too many requests. Wait a moment and try again.";
  }
  if (status === 401 || status === 403 || status === 404 || status === 405) {
    return `The API rejected the request (HTTP ${status}). Check the POST URL and API access in Settings.`;
  }
  return `The calculator API returned HTTP ${status}. Try again.`;
}

async function readResponse(response) {
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // A gateway or proxy can return non-JSON errors.
  }
  if (payload?.ok === false && typeof payload.error?.message === "string") {
    throw new CalculatorError(payload.error.code ?? "calculation_failed", payload.error.message);
  }
  if (!response.ok) {
    throw new CalculatorError("http_error", httpError(response.status));
  }
  if (payload?.ok !== true || !payload.result || typeof payload.result !== "object" || Array.isArray(payload.result)) {
    throw new CalculatorError("invalid_response", "The API did not return a calculation result in the expected format.");
  }
  return payload.result;
}

export async function calculate(request) {
  const endpoint = await getEndpoint();
  if (!endpoint) {
    throw new CalculatorError("not_configured", "Open Settings and save the API Gateway URL to run calculations.");
  }
  if (isExtension && !await chrome.permissions.contains(hostPermission(endpointUrl(endpoint)))) {
    throw new CalculatorError("permission_denied", "Open Settings and save the API URL again to allow access in Chrome.");
  }

  const body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > REQUEST_LIMIT) {
    throw new CalculatorError("request_too_large", "This calculation exceeds the API’s 64 KiB request limit.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    return await readResponse(response);
  } catch (error) {
    if (error instanceof CalculatorError) throw error;
    if (controller.signal.aborted) {
      throw new CalculatorError("timeout", "The calculator API took too long to respond. Try again.");
    }
    const action = isExtension ? "Check the URL and connection in Settings." : "Check that the local calculator server is running.";
    throw new CalculatorError("network_error", `Could not reach the calculator API. ${action}`);
  } finally {
    clearTimeout(timeout);
  }
}
